import { createClient } from '@supabase/supabase-js'
import { reportRequestSuccess, reportRequestFailure } from '../composables/useServiceStatus'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Bound EVERY Supabase network call so a slow/hung backend can't leave the UI
// spinning forever. The 2026-08-28 Supabase incident (API latency + JWT
// rejections) hung requests with no timeout, so auth init and every fetch just
// waited indefinitely. Wrapping the client's fetch here covers auth, PostgREST,
// storage and functions in one place. On timeout/network-error/5xx we flag the
// service as degraded (banner + fall back to cached data); a completed non-5xx
// response clears it. Offline is filtered out inside the reporter — that's a
// separate, already-handled state.
const REQUEST_TIMEOUT_MS = 15000

async function fetchWithTimeout(input, init = {}) {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, REQUEST_TIMEOUT_MS)

  // Respect a caller-provided signal (e.g. supabase's own aborts) too — don't
  // clobber it. Either our timeout or the caller can abort the request.
  if (init.signal) {
    if (init.signal.aborted) controller.abort()
    else init.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  try {
    const res = await fetch(input, { ...init, signal: controller.signal })
    if (res.status >= 500) reportRequestFailure()
    else reportRequestSuccess()
    return res
  } catch (e) {
    // Don't flag a degraded backend when the caller (not our timeout) aborted.
    const callerAborted = init.signal?.aborted && !timedOut
    if (!callerAborted) reportRequestFailure()
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithTimeout },
})

// Cheap liveness probe to auto-clear the degraded banner once the backend
// recovers. Runs through fetchWithTimeout so a success reports through the same
// path that clears `serviceDegraded`. /auth/v1/health needs only the apikey
// (no user session), so it works even while the user's JWT is being rejected.
export async function pingBackend() {
  try {
    const res = await fetchWithTimeout(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: supabaseAnonKey },
    })
    return res.ok
  } catch {
    return false
  }
}
