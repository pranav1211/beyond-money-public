<script setup>
import { onMounted, onUnmounted, watch } from 'vue'
import { useAuthStore } from './stores/auth'
import { useCurrenciesStore } from './stores/currencies'
import { useCurrencyStore } from './stores/currency'
import { useBiometricLock } from './composables/useBiometricLock'
import { serviceDegraded } from './composables/useServiceStatus'
import { getAdapter } from './lib/storage'
import LockScreen from './components/shared/LockScreen.vue'
import ServiceBanner from './components/shared/ServiceBanner.vue'

const auth = useAuthStore()
const currenciesStore = useCurrenciesStore()
const currencyStore = useCurrencyStore()
const { isLocked, initLock } = useBiometricLock()

// Auto-recovery: while the backend is flagged degraded, poll a cheap health
// endpoint so the banner clears itself once the service comes back, even if the
// user is sitting idle and not triggering fetches. A successful ping reports
// through the fetch wrapper → serviceDegraded flips false → this watcher stops.
let recoveryTimer = null
watch(serviceDegraded, (degraded) => {
  if (degraded && !recoveryTimer) {
    recoveryTimer = setInterval(() => { getAdapter().health?.() }, 20000)
  } else if (!degraded && recoveryTimer) {
    clearInterval(recoveryTimer)
    recoveryTimer = null
  }
})
onUnmounted(() => { if (recoveryTimer) clearInterval(recoveryTimer) })

async function bootstrapRates() {
  if (!auth.session) return
  await currenciesStore.fetchCurrencies()
  await currencyStore.fetchRate(currenciesStore.codes.length ? currenciesStore.codes : ['INR', 'USD'])
}

onMounted(() => {
  // Session-based lock: we lock ONCE on a cold start (the lock state is
  // resolved synchronously from localStorage inside useBiometricLock, so the
  // lock screen paints on the first frame). We deliberately do NOT re-lock on
  // visibilitychange/backgrounding — switching to another app and coming back
  // keeps the in-memory session unlocked. The app only re-locks when it's
  // fully closed and relaunched (which reloads the page → fresh lock state).
  initLock()
  // Don't await — router guard waits via auth.waitForInit(), and the watch
  // below kicks off rate bootstrapping once the session resolves. Awaiting
  // here was forcing the lock screen / first paint to wait on a network
  // roundtrip on cold launches.
  auth.initAuth()
})

watch(() => auth.session, (s) => { if (s) bootstrapRates() })
</script>

<template>
  <ServiceBanner />
  <LockScreen v-if="isLocked" />
  <router-view v-else />
</template>
