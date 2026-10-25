<script setup>
import { ref, onMounted } from 'vue'
import { useBiometricLock } from '../../composables/useBiometricLock'

const { verify } = useBiometricLock()
const verifying = ref(false)
const failed = ref(false)

async function unlock() {
  if (verifying.value) return
  verifying.value = true
  failed.value = false
  const ok = await verify()
  verifying.value = false
  if (!ok) failed.value = true
}

// Auto-prompt the platform authenticator the moment the lock screen mounts
// so the user doesn't have to tap "Unlock" first. If they cancel, the button
// stays available for a manual retry.
onMounted(() => {
  unlock()
})
</script>

<template>
  <div class="lock-screen">
    <div class="lock-glow" aria-hidden="true"></div>
    <div class="lock-content">
      <span class="lock-badge" aria-hidden="true">
        <svg class="lock-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </span>
      <div class="lock-copy">
        <h2 class="lock-title">Beyond Money</h2>
        <p class="lock-subtitle">Verify your identity to continue</p>
      </div>
      <button class="unlock-btn" @click="unlock" :disabled="verifying">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 11c0-1.1.9-2 2-2s2 .9 2 2m-8 0c0-1.1.9-2 2-2s2 .9 2 2"/>
          <path d="M6 11v-1a6 6 0 0 1 12 0v1"/>
          <path d="M12 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>
          <rect x="2" y="11" width="20" height="11" rx="3"/>
        </svg>
        {{ verifying ? 'Verifying...' : 'Unlock' }}
      </button>
      <p v-if="failed" class="lock-error">Verification failed. Try again.</p>
    </div>
  </div>
</template>

<style scoped>
.lock-screen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--bg-primary);
  overflow: hidden;
}

/* One soft accent glow behind the card, for atmosphere. */
.lock-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(680px, 150vw);
  aspect-ratio: 1;
  transform: translate(-50%, -54%);
  border-radius: 50%;
  background: radial-gradient(closest-side, var(--bg-soft), transparent);
  pointer-events: none;
}

.lock-content {
  position: relative;
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 36px 28px 28px;
  text-align: center;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.lock-badge {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--accent);
  background: var(--accent-dim);
}

.lock-icon {
  width: 30px;
  height: 30px;
}

.lock-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lock-title {
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 1.15;
  color: var(--text-primary);
}

.lock-subtitle {
  font-size: 0.92rem;
  color: var(--text-muted);
}

.unlock-btn {
  width: 100%;
  min-height: 52px;
  gap: 10px;
  padding: 12px 28px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: var(--accent-ink);
  box-shadow: var(--shadow-accent);
  font-size: 0.98rem;
  font-weight: 800;
}

.unlock-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.unlock-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.lock-error {
  margin-top: -6px;
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  color: var(--expense);
  background: color-mix(in srgb, var(--expense) 12%, transparent);
  font-size: 0.84rem;
  font-weight: 600;
}

@media (max-width: 768px) {
  .lock-content {
    padding: 32px 22px 24px;
  }
}
</style>
