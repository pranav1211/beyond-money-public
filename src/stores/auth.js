import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useCategoriesStore } from './categories'
import { useSyncStore } from './sync'
import { idbClearAll } from '../lib/idb'

let initPromiseResolve
const initPromise = new Promise((resolve) => {
  initPromiseResolve = resolve
})

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const session = ref(null)
  const loading = ref(true)
  const initialized = ref(false)
  let intentionalLogout = false

  async function syncDefaults(currentUser) {
    if (!currentUser) return
    const categoriesStore = useCategoriesStore()
    await categoriesStore.seedDefaultCategories(currentUser.id)
  }

  async function initAuth() {
    loading.value = true
    try {
      const { data } = await supabase.auth.getSession()
      session.value = data.session
      user.value = data.session?.user ?? null
      // Cache session for offline access
      if (data.session) {
        try { localStorage.setItem('bm_cached_session', JSON.stringify({ session: data.session, user: data.session.user })) } catch {}
      }
    } catch {
      // Offline or network error — restore from cached session if available
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

    // Non-blocking: sync defaults and load sync queue in background
    if (user.value) {
      syncDefaults(user.value).catch(() => {})
    }
    const syncStore = useSyncStore()
    syncStore.loadState().then(() => syncStore.processQueue()).catch(() => {})

    supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (event === 'SIGNED_OUT' && !intentionalLogout) {
        // Token refresh failed (common on mobile/background) — keep cached session
        // so user isn't kicked to login, especially when offline
        return
      }

      session.value = currentSession
      user.value = currentSession?.user ?? null

      if (currentSession) {
        try { localStorage.setItem('bm_cached_session', JSON.stringify({ session: currentSession, user: currentSession.user })) } catch {}
      }

      if (event === 'SIGNED_IN' && user.value) {
        syncDefaults(user.value).catch(() => {})
      }
    })
  }

  async function waitForInit() {
    return initPromise
  }

  async function login() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
      },
    })
  }

  async function logout() {
    intentionalLogout = true
    await supabase.auth.signOut()
    user.value = null
    session.value = null

    // Clear all local data for security
    // Use dynamic imports to avoid circular dependency issues at init time
    const [
      { useAccountsStore },
      { useTransactionsStore },
      { useCreditCardsStore },
      { useAssetsStore },
      { useSubscriptionsStore },
      { useLabelsStore },
      { useCcExpensesStore },
    ] = await Promise.all([
      import('./accounts'),
      import('./transactions'),
      import('./creditCards'),
      import('./assets'),
      import('./subscriptions'),
      import('./labels'),
      import('./ccExpenses'),
    ])

    useAccountsStore().$reset()
    useTransactionsStore().$reset()
    useCreditCardsStore().$reset()
    useAssetsStore().$reset()
    useCcExpensesStore().$reset()
    useSubscriptionsStore().$reset()
    useCategoriesStore().$reset()
    useLabelsStore().$reset()
    useSyncStore().clearQueue()

    await idbClearAll()
    localStorage.removeItem('defaultCurrency')
    localStorage.removeItem('bm_cached_session')
    localStorage.removeItem('bm_biometric_credential')
    localStorage.removeItem('bm_biometric_enabled')
  }

  return { user, session, loading, initialized, initAuth, waitForInit, login, logout }
})
