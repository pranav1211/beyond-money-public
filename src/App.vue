<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useAuthStore } from './stores/auth'
import { useBiometricLock } from './composables/useBiometricLock'
import LockScreen from './components/shared/LockScreen.vue'

const auth = useAuthStore()
const { isLocked, isEnabled, initLock, lock } = useBiometricLock()

function onVisibilityChange() {
  if (document.visibilityState === 'hidden' && isEnabled.value) {
    lock()
  }
}

onMounted(async () => {
  await auth.initAuth()
  initLock()
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <LockScreen v-if="isLocked" />
  <router-view v-else />
</template>
