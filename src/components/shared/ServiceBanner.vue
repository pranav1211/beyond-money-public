<script setup>
import { ref } from 'vue'
import { useServiceStatus } from '../../composables/useServiceStatus'
import { pingBackend } from '../../lib/supabase'

const { serviceDegraded } = useServiceStatus()
const checking = ref(false)

async function retry() {
  if (checking.value) return
  checking.value = true
  // A successful ping reports through the fetch wrapper, which clears
  // serviceDegraded and hides the banner. No need to inspect the result.
  await pingBackend()
  checking.value = false
}
</script>

<template>
  <transition name="bm-banner">
    <div v-if="serviceDegraded" class="service-banner" role="status" aria-live="polite">
      <span class="dot" aria-hidden="true"></span>
      <span class="msg">Trouble reaching the server. Your data is safe and shown from this device.</span>
      <button class="retry" :disabled="checking" @click="retry">
        {{ checking ? 'Checking…' : 'Retry' }}
      </button>
    </div>
  </transition>
</template>

<style scoped>
/* Floating soft-warning card pinned to the top, clear of the notch. */
.service-banner {
  position: fixed;
  top: calc(env(safe-area-inset-top) + 10px);
  left: 12px;
  right: 12px;
  z-index: 1000;
  max-width: 600px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 10px 12px;
  padding: 10px 10px 10px 16px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--warning) 9%, var(--bg-secondary));
  border: 1px solid color-mix(in srgb, var(--warning) 26%, transparent);
  box-shadow: var(--shadow-lg);
  color: var(--text-primary);
  font-size: 0.85rem;
  line-height: 1.35;
}

.dot {
  flex: 0 0 auto;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--warning);
  box-shadow: 0 0 0 0 var(--warning);
  animation: bm-pulse 1.8s ease-out infinite;
}

@keyframes bm-pulse {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--warning) 60%, transparent); }
  70% { box-shadow: 0 0 0 7px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}

.msg {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--text-secondary);
}

.retry {
  flex: 0 0 auto;
  padding: 7px 14px;
  border: 0;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--warning) 16%, transparent);
  color: var(--warning);
  font-size: 0.8rem;
  font-weight: 700;
}

.retry:hover {
  background: color-mix(in srgb, var(--warning) 24%, transparent);
}

.retry:disabled {
  opacity: 0.6;
  cursor: default;
}

.bm-banner-enter-active,
.bm-banner-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}

.bm-banner-enter-from,
.bm-banner-leave-to {
  transform: translateY(calc(-100% - 16px));
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .dot {
    animation: none;
  }

  .bm-banner-enter-active,
  .bm-banner-leave-active {
    transition: opacity var(--transition);
  }

  .bm-banner-enter-from,
  .bm-banner-leave-to {
    transform: none;
  }
}
</style>
