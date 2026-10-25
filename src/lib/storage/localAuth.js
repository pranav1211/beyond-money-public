import { newId } from './ids'

// Sign-in stand-in for storage that has no accounts (local-only storage, a
// JSON file, a personal server without login). It gives this browser one
// stable local user, and implements the same small slice of Supabase's auth
// API that the app uses, so the login screen and session handling work
// unchanged. "Sign in" creates the local user; "Sign out" forgets it (and the
// app clears local data, as with any sign-out).
const STORAGE_KEY = 'bm_local_user'

export function createLocalAuth() {
  const listeners = new Set()

  function readUser() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) } catch { return null }
  }

  function currentSession() {
    const user = readUser()
    if (!user) return null
    return { access_token: 'local', refresh_token: 'local', expires_at: 4102444800, user }
  }

  function emit(event, session) {
    for (const cb of listeners) {
      try { cb(event, session) } catch { /* listener errors are the listener's */ }
    }
  }

  return {
    local: true,
    async getSession() {
      return { data: { session: currentSession() }, error: null }
    },
    onAuthStateChange(cb) {
      listeners.add(cb)
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }
    },
    async signInWithOAuth() {
      if (!readUser()) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          id: newId(),
          email: 'you@this-device',
          user_metadata: { full_name: 'You' },
        }))
      }
      emit('SIGNED_IN', currentSession())
      return { data: {}, error: null }
    },
    async signOut() {
      localStorage.removeItem(STORAGE_KEY)
      emit('SIGNED_OUT', null)
      return { error: null }
    },
    async setSession() {
      const session = currentSession()
      return { data: { session }, error: session ? null : new Error('No local session') }
    },
  }
}
