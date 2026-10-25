import { ref } from 'vue'

// "Service degraded" = the browser believes it's online, but Supabase requests
// are timing out / erroring (the 2026-08-28 Supabase incident: API latency +
// JWT rejections left the app spinning forever because nothing bounded the
// request). This is DISTINCT from useOnlineStatus (browser offline), which the
// offline-first layer already handles silently by serving IndexedDB data. Here
// the user IS online but the backend is unreachable, so we surface a
// non-blocking banner and let the timeout wrapper in lib/supabase.js fail fast.
//
// Module-scoped (like useBiometricLock) so the fetch wrapper — which lives
// outside Vue/Pinia — can report into the same reactive state the banner reads.
// Deliberately imports nothing but `vue` so lib/supabase.js can import it
// without a circular dependency.

// Ignore a single blip; only flip the banner on after this many straight
// failures. A single successful response resets the streak and hides it.
const REQUIRED_FAILURES = 2

export const serviceDegraded = ref(false)
let failureStreak = 0

// A completed Supabase round-trip (2xx/3xx/4xx that isn't 5xx) means the
// backend is reachable — clear the degraded state.
export function reportRequestSuccess() {
  failureStreak = 0
  if (serviceDegraded.value) serviceDegraded.value = false
}

// A timeout, network error, or 5xx while supposedly online.
export function reportRequestFailure() {
  // Browser-offline is an expected, separately-handled state — never show the
  // "server trouble" banner for it (offline-first serves cached data instead).
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  failureStreak += 1
  if (failureStreak >= REQUIRED_FAILURES) serviceDegraded.value = true
}

export function useServiceStatus() {
  return { serviceDegraded }
}
