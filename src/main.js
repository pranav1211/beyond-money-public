import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
// Fonts are bundled (not loaded from Google) so they render offline and don't
// block first paint on a third-party request. vite.config.js adds the Latin
// .woff2 files to the service worker's precache list.
import '@fontsource-variable/manrope'
import '@fontsource-variable/sora'
import './assets/main.css'
import { initTheme } from './lib/theme'
import { initPwaInstall } from './composables/usePwaInstall'
import { BUILD_ID } from './version'

initTheme()

// Capture `beforeinstallprompt` at the earliest possible point — this
// event fires very soon after page load and was previously being missed
// because the Sidebar's onMounted listener wasn't attached in time, which
// is why the install button on Android was always falling back to the
// "use your browser menu" message.
initPwaInstall()

// Register service worker + auto-update flow.
//
// Strategy: the SW already calls skipWaiting()/clients.claim(), so a
// freshly-installed SW takes control of existing clients automatically,
// firing `controllerchange` on the page. We listen for that and reload
// once — this picks up the new JS bundle without the user having to do
// anything. We deliberately skip the FIRST controllerchange (which is
// the initial install on a brand-new visitor) so the page doesn't
// reload itself out from under them on first load.
if ('serviceWorker' in navigator) {
  let refreshing = false
  // True if there's already an SW controlling this page when we boot —
  // i.e. a returning user. Only in that case is a future controller
  // change actually an "update".
  let hadController = !!navigator.serviceWorker.controller

  function applyUpdateReload() {
    if (refreshing) return
    refreshing = true
    console.log('[App] Applying SW update — reloading for fresh build')
    window.location.reload()
  }

  // If a new SW activates while the user is actively using the app,
  // wait until they background it before reloading — this avoids the
  // page yanking out from under a half-typed form. If they're already
  // backgrounded (or the page is hidden), reload immediately.
  function scheduleUpdateReload() {
    if (refreshing) return
    if (document.visibilityState !== 'visible') {
      applyUpdateReload()
      return
    }
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        document.removeEventListener('visibilitychange', onHidden)
        applyUpdateReload()
      }
    }
    document.addEventListener('visibilitychange', onHidden)
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    if (!hadController) {
      // First-time install — adopt the new controller silently.
      hadController = true
      return
    }
    scheduleUpdateReload()
  })

  // Ask the active SW for its build ID. If it doesn't match our bundle's
  // build ID, the SW has already updated past us and we should reload.
  // This is a belt-and-suspenders check for the rare case where the
  // controllerchange listener was registered too late.
  function checkBuildIdAgainstSw() {
    const ctrl = navigator.serviceWorker.controller
    if (!ctrl) return
    const handler = (event) => {
      if (event.data?.type !== 'VERSION') return
      navigator.serviceWorker.removeEventListener('message', handler)
      const swBuildId = event.data.buildId
      if (swBuildId && swBuildId !== BUILD_ID && !refreshing) {
        console.log('[App] Build ID mismatch (app:', BUILD_ID, 'sw:', swBuildId, ') — scheduling reload')
        scheduleUpdateReload()
      }
    }
    navigator.serviceWorker.addEventListener('message', handler)
    try { ctrl.postMessage({ type: 'GET_VERSION' }) } catch {}
    setTimeout(() => navigator.serviceWorker.removeEventListener('message', handler), 3000)
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('[App] Service worker registered:', reg.scope, 'buildId:', BUILD_ID)

      // Check immediately on load
      checkBuildIdAgainstSw()

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          // If a new SW finished installing while a controller already
          // exists, ask it to skipWaiting so it activates and triggers
          // controllerchange → reload above. (Our SW also calls
          // skipWaiting in its install handler, so this is defensive.)
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            try { newWorker.postMessage({ type: 'SKIP_WAITING' }) } catch {}
          }
        })
      })

      // Foregrounding the PWA after a while is the natural moment to
      // re-check for updates — Chrome/Edge will refetch /sw.js, hit a
      // byte difference if a new build was deployed, and run the update
      // flow above.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          reg.update().catch(() => {})
          checkBuildIdAgainstSw()
        }
      })

      // Hourly background refresh for long-foregrounded sessions.
      setInterval(() => { reg.update().catch(() => {}) }, 60 * 60 * 1000)
    }).catch((err) => {
      console.warn('[App] Service worker registration failed:', err)
    })
  })
}

// Auto-sync when coming back online
window.addEventListener('online', async () => {
  console.log('[App] Back online — syncing pending operations')
  try {
    const { useSyncStore } = await import('./stores/sync')
    const syncStore = useSyncStore()
    await syncStore.forceSyncAll()
  } catch (err) {
    console.warn('[App] Auto-sync on reconnect failed:', err)
  }
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
