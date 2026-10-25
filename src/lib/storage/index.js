// The storage socket. Everything that reads or writes remote data goes through
// getAdapter(); nothing else imports a backend directly (INV-67).
//
// Adapters live in ./adapters/<name>.js and default-export a factory. Pick one
// with VITE_STORAGE=<name> (default: supabase). Adding a backend is: drop a
// file in ./adapters, set the env var, run `npm run test:adapter`. See
// docs/ADAPTERS.md.
import { createLocalAuth } from './localAuth'

const modules = import.meta.glob('./adapters/*.js', { eager: true })

const factories = {}
for (const [path, mod] of Object.entries(modules)) {
  const name = path.match(/\/([^/]+)\.js$/)[1]
  factories[name] = mod.default
}

let current = null

export function getAdapter() {
  if (!current) {
    const name = import.meta.env.VITE_STORAGE || 'supabase'
    const factory = factories[name]
    if (typeof factory !== 'function') {
      throw new Error(`Unknown storage adapter "${name}". Available: ${Object.keys(factories).join(', ') || 'none'}.`)
    }
    current = factory()
  }
  return current
}

// Swap the adapter at runtime (tests, or an app that lets the user choose).
export function setAdapter(adapter) {
  current = adapter
  localAuth = null
}

// Sign-in: the adapter's own auth when it has one (Supabase: Google OAuth),
// otherwise a one-local-user stand-in so the app works without accounts.
let localAuth = null
export function getAuth() {
  const auth = getAdapter().auth
  if (auth) return auth
  if (!localAuth) localAuth = createLocalAuth()
  return localAuth
}
