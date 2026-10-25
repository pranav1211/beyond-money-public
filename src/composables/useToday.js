import { ref, computed } from 'vue'
import { localISODate } from '../lib/dateFormat'

// Reactive local "today" that rolls over on its own. A PWA left open
// overnight is never reloaded (resume doesn't re-mount anything), so a date
// captured once at component setup goes stale — the dashboard kept showing
// last month's numbers after midnight. Module-scoped so every consumer shares
// one timer; refreshed at local midnight and whenever the app is foregrounded
// (mobile browsers suspend timers in the background, so the midnight timeout
// alone can fire late).
const today = ref(localISODate())
let timer = null

function refresh() {
  const now = localISODate()
  if (now !== today.value) today.value = now
}

function scheduleMidnight() {
  clearTimeout(timer)
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
  timer = setTimeout(() => { refresh(); scheduleMidnight() }, next - now)
}

if (typeof window !== 'undefined') {
  scheduleMidnight()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { refresh(); scheduleMidnight() }
  })
  window.addEventListener('focus', refresh)
}

export function useToday() {
  return {
    today,
    currentMonth: computed(() => today.value.slice(0, 7)),
  }
}
