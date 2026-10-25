import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getAuth } from '../lib/storage'
import { useCategoriesStore } from './categories'
import { useCurrenciesStore } from './currencies'
import { useSyncStore } from './sync'
import { idbClearAll } from '../lib/idb'
import { upsertAccount } from '../lib/accountRoster'

// Cache the current session for fast/offline boot AND record it in the demo
// account roster so it can be switched back to later.
function cacheSession(currentSession) {
  if (!currentSession) return
  try { localStorage.setItem('bm_cached_session', JSON.stringify({ session: currentSession, user: currentSession.user })) } catch {}
  try { upsertAccount(currentSession) } catch {}
}

let initPromiseResolve
const initPromise = new Promise((resolve) => {
  initPromiseResolve = resolve
})

// True when we've landed back from an OAuth provider / magic link / recovery,
// with the token still in the URL (implicit flow → hash, PKCE → query). gotrue
// parses this URL, but only after acquiring an async lock — i.e. a few turns
// later. If we let the router guard run before then, it sees no session,
// redirects to /login, and history.replaceState wipes the token out of the URL
// before gotrue ever reads it. So on these callbacks we must block init until
// the session is established (see initAuth).
function isAuthRedirectCallback() {
  if (typeof window === 'undefined') return false
  const { hash, search } = window.location
  return (
    /[#&](access_token|error|error_description|provider_token)=/.test(hash) ||
    /[?&](code|error|error_description)=/.test(search)
  )
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const session = ref(null)
  const loading = ref(true)
  const initialized = ref(false)
  let intentionalLogout = false

  async function syncDefaults(currentUser) {
    if (!currentUser) return
    const categoriesStore = useCategoriesStore()
    const currenciesStore = useCurrenciesStore()
    await categoriesStore.seedDefaultCategories(currentUser.id)
    await currenciesStore.seedDefaults(currentUser.id)
  }

  async function initAuth() {
    loading.value = true

    const isRedirectCallback = isAuthRedirectCallback()

    if (isRedirectCallback) {
      // OAuth / magic-link / recovery redirect: the token is in the URL right
      // now. Block init until gotrue has parsed it into a session BEFORE the
      // router guard runs — otherwise the guard redirects to /login and
      // history.replaceState strips the token before gotrue's (lock-deferred)
      // URL detection reads it, silently dropping the login.
      try {
        const { data } = await getAuth().getSession()
        session.value = data.session
        user.value = data.session?.user ?? null
        cacheSession(data.session)
      } catch { /* network failure mid-callback — fall through, watcher recovers */ }
    } else {
      // Normal launch: synchronously seed from cached session so the router
      // guard unblocks WITHOUT waiting on the network. getAuth().getSession()
      // does a token-refresh roundtrip when the access token is expired (default
      // 1h life), which on a cold PWA launch blocks first paint even though all
      // assets are served from cache. We trust the cached session for the
      // initial render and validate/refresh it in the background below.
      try {
        const cached = JSON.parse(localStorage.getItem('bm_cached_session'))
        if (cached?.session && cached?.user) {
          session.value = cached.session
          user.value = cached.user
        }
      } catch {}
    }

    // Mark as initialized immediately so router guard unblocks
    initialized.value = true
    loading.value = false
    initPromiseResolve()

    // Background: validate/refresh the real session. onAuthStateChange (set
    // up below) keeps session.value in sync with whatever this resolves to,
    // so a stale/invalid cached session self-corrects without blocking boot.
    // Skipped on a redirect callback — we already awaited getSession() above.
    if (!isRedirectCallback) {
      getAuth().getSession().then(({ data }) => {
        session.value = data.session
        user.value = data.session?.user ?? null
        cacheSession(data.session)
      }).catch(() => { /* offline — keep cached session */ })
    }

    // Non-blocking: sync defaults and load sync queue in background
    if (user.value) {
      syncDefaults(user.value).catch(() => {})
    }
    const syncStore = useSyncStore()
    syncStore.loadState().then(() => syncStore.processQueue()).catch(() => {})

    getAuth().onAuthStateChange(async (event, currentSession) => {
      if (event === 'SIGNED_OUT' && !intentionalLogout) {
        // Token refresh failed (common on mobile/background) — keep cached session
        // so user isn't kicked to login, especially when offline
        return
      }

      session.value = currentSession
      user.value = currentSession?.user ?? null

      cacheSession(currentSession)

      if (event === 'SIGNED_IN' && user.value) {
        syncDefaults(user.value).catch(() => {})
      }
    })
  }

  async function waitForInit() {
    return initPromise
  }

  async function login() {
    await getAuth().signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
      },
    })
  }

  // Wipe every per-user store + IndexedDB + per-user localStorage. Shared by
  // logout() and switchAccount() — the account roster (bm_accounts) is
  // deliberately preserved so demo accounts survive a switch.
  async function resetLocalData() {
    // Use dynamic imports to avoid circular dependency issues at init time
    const [
      { useAccountsStore },
      { useTransactionsStore },
      { useCreditCardsStore },
      { useAssetsStore },
      { useSubscriptionsStore },
      { useLabelsStore },
      { useCcExpensesStore },
      { useNetWorthSnapshotsStore },
    ] = await Promise.all([
      import('./accounts'),
      import('./transactions'),
      import('./creditCards'),
      import('./assets'),
      import('./subscriptions'),
      import('./labels'),
      import('./ccExpenses'),
      import('./netWorthSnapshots'),
    ])

    useAccountsStore().$reset()
    useTransactionsStore().$reset()
    useCreditCardsStore().$reset()
    useAssetsStore().$reset()
    useCcExpensesStore().$reset()
    useSubscriptionsStore().$reset()
    useCategoriesStore().$reset()
    useCurrenciesStore().$reset()
    useLabelsStore().$reset()
    useNetWorthSnapshotsStore().$reset()
    useSyncStore().clearQueue()

    await idbClearAll()
    localStorage.removeItem('defaultCurrency')
    localStorage.removeItem('bm_biometric_credential')
    localStorage.removeItem('bm_biometric_enabled')
  }

  async function logout() {
    intentionalLogout = true
    await getAuth().signOut()
    user.value = null
    session.value = null

    await resetLocalData()
    localStorage.removeItem('bm_cached_session')
  }

  // Switch to another stored account WITHOUT signing out (signOut would trip
  // intentionalLogout and there's no reason to invalidate the current session).
  // Drains pending writes for the current account first, wipes local data, then
  // installs the target session via setSession — which fires onAuthStateChange
  // and re-caches everything. Returns true on success.
  async function switchAccount(entry) {
    if (!entry?.access_token || !entry?.refresh_token) return false

    // Push any queued writes for the current account before we clear them.
    try { await useSyncStore().flushPending() } catch { /* offline — best effort */ }

    await resetLocalData()

    const { data, error } = await getAuth().setSession({
      access_token: entry.access_token,
      refresh_token: entry.refresh_token,
    })
    if (error || !data?.session) return false

    session.value = data.session
    user.value = data.session.user ?? null
    cacheSession(data.session)
    if (user.value) syncDefaults(user.value).catch(() => {})
    return true
  }

  return { user, session, loading, initialized, initAuth, waitForInit, login, logout, switchAccount }
})
