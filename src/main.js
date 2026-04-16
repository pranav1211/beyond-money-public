import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './assets/main.css'
import { initTheme } from './lib/theme'

initTheme()

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('[App] Service worker registered:', reg.scope)

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              console.log('[App] New service worker activated')
            }
          })
        }
      })
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
