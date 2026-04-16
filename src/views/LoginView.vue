<script setup>
import { useAuthStore } from '../stores/auth'
import CandleLoader from '../components/shared/CandleLoader.vue'

const auth = useAuthStore()
</script>

<template>
  <div class="login-view">
    <button class="google-btn" @click="auth.login()">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.26c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
      </svg>
      Sign in with Google
    </button>

    <div class="hero">
      <h1 class="title">Beyond Money</h1>
      <p class="tagline">Track your finances beyond just numbers</p>
      <CandleLoader size="lg" />
    </div>
  </div>
</template>

<style scoped>
.login-view {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.google-btn {
  position: fixed;
  top: 28px;
  right: 32px;
  z-index: 10;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 24px;
  background: var(--accent);
  color: #0d1117;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 12px rgba(93, 226, 163, 0.25);
}

.google-btn:hover {
  background: var(--accent-hover);
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.title {
  font-size: 6rem;
  font-weight: 900;
  color: var(--text-primary);
  letter-spacing: -2px;
  line-height: 1;
  text-align: center;
}

.tagline {
  font-size: 1.2rem;
  color: var(--text-muted);
  font-weight: 400;
  letter-spacing: 0.5px;
  text-align: center;
}

@media (max-width: 768px) {
  .title {
    font-size: 3.2rem;
  }

  .tagline {
    font-size: 1rem;
  }

  .google-btn {
    top: 16px;
    right: 16px;
    padding: 8px 16px;
    font-size: 0.8rem;
  }
}
</style>
