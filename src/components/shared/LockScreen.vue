<script setup>
import { ref } from 'vue'
import { useBiometricLock } from '../../composables/useBiometricLock'

const { verify } = useBiometricLock()
const verifying = ref(false)
const failed = ref(false)

async function unlock() {
  verifying.value = true
  failed.value = false
  const ok = await verify()
  verifying.value = false
  if (!ok) failed.value = true
}
</script>

<template>
  <div class="lock-screen">
    <div class="lock-content">
      <svg class="lock-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      <h2 class="lock-title">Beyond Money</h2>
      <p class="lock-subtitle">Verify your identity to continue</p>
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
  background: var(--bg-primary);
}

.lock-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px;
}

.lock-icon {
  color: var(--accent);
  margin-bottom: 8px;
}

.lock-title {
  font-size: 1.8rem;
  font-weight: 900;
  color: var(--text-primary);
}

.lock-subtitle {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.unlock-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 12px 32px;
  background: var(--accent);
  color: #0d1117;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
}

.unlock-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.unlock-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.lock-error {
  color: var(--expense);
  font-size: 0.85rem;
  font-weight: 600;
}
</style>
