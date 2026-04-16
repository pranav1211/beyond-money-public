import { ref, onMounted, onUnmounted } from 'vue'

const online = ref(navigator.onLine)
let listenerCount = 0

function handleOnline() { online.value = true }
function handleOffline() { online.value = false }

export function useOnlineStatus() {
  onMounted(() => {
    if (listenerCount === 0) {
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
    }
    listenerCount++
    online.value = navigator.onLine
  })

  onUnmounted(() => {
    listenerCount--
    if (listenerCount === 0) {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  })

  return { online }
}

// Non-reactive check for use in stores (outside component lifecycle)
export function isOnline() {
  return navigator.onLine
}
