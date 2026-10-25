import { ref } from 'vue'

// Singleton state — listeners are attached once at module load (kicked off
// from main.js) so we don't miss the `beforeinstallprompt` event, which
// fires very early in the page lifecycle and was previously being missed
// by the Sidebar's onMounted listener.

const deferredPrompt = ref(null)
const canInstall = ref(false)

function detectStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

const isInstalled = ref(detectStandalone())

const ua = navigator.userAgent || ''
const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream
const isIOSSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)

let initialized = false

export function initPwaInstall() {
  if (initialized) return
  initialized = true

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt.value = e
    canInstall.value = true
    isInstalled.value = false
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt.value = null
    canInstall.value = false
    isInstalled.value = true
  })

  // Re-check standalone mode on display-mode changes (some browsers
  // switch modes without firing `appinstalled`).
  try {
    window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
      if (e.matches) {
        isInstalled.value = true
        canInstall.value = false
        deferredPrompt.value = null
      }
    })
  } catch {
    // Older browsers — ignore
  }
}

export function usePwaInstall() {
  initPwaInstall()

  async function install() {
    // Already installed — nothing to do
    if (detectStandalone()) {
      isInstalled.value = true
      canInstall.value = false
      deferredPrompt.value = null
      return { status: 'already-installed' }
    }

    if (deferredPrompt.value) {
      try {
        deferredPrompt.value.prompt()
        const { outcome } = await deferredPrompt.value.userChoice
        deferredPrompt.value = null
        if (outcome === 'accepted') {
          canInstall.value = false
          return { status: 'accepted' }
        }
        return { status: 'dismissed' }
      } catch {
        deferredPrompt.value = null
        return { status: 'error' }
      }
    }

    if (isIOSSafari) return { status: 'ios-guidance' }
    return { status: 'manual-guidance' }
  }

  return {
    deferredPrompt,
    canInstall,
    isInstalled,
    isIOS,
    isIOSSafari,
    install,
  }
}
