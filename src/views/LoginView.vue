<script setup>
import { onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import CandleLoader from '../components/shared/CandleLoader.vue'

// Bundled in public/ (see Sidebar.vue).
const logoSrc = `${import.meta.env.BASE_URL}logo.png`

const auth = useAuthStore()
const router = useRouter()

async function redirectIfAuthenticated() {
  await auth.waitForInit()
  if (auth.session) router.replace('/')
}

onMounted(redirectIfAuthenticated)
watch(() => auth.session, (session) => { if (session) router.replace('/') })
</script>

<template>
  <div class="login-view">
    <div class="login-glow" aria-hidden="true"></div>

    <main class="login-card">
      <div class="brand-mark">
        <img :src="logoSrc" alt="Beyond Money logo" />
      </div>

      <div class="hero">
        <h1 class="title">Beyond Money</h1>
        <p class="tagline">Track your finances beyond just numbers</p>
      </div>

      <div class="login-motif" aria-hidden="true">
        <CandleLoader size="sm" />
      </div>

      <button class="google-btn" @click="auth.login()">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.26c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
          <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
        </svg>
        Sign in with Google
      </button>
    </main>
  </div>
</template>

<style scoped>
.login-view {
  position: relative;
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 24px 16px;
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* One soft accent glow behind the card, for atmosphere. */
.login-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(760px, 160vw);
  aspect-ratio: 1;
  transform: translate(-50%, -54%);
  border-radius: 50%;
  background: radial-gradient(closest-side, var(--bg-soft), transparent);
  pointer-events: none;
}

.login-card {
  position: relative;
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 40px 32px 32px;
  text-align: center;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.brand-mark {
  width: 68px;
  height: 68px;
  border-radius: 22px;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: var(--bg-elevated);
  box-shadow: var(--shadow-sm);
}

.brand-mark img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.title {
  font-family: var(--font-display);
  font-size: 2.1rem;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.tagline {
  max-width: 30ch;
  font-size: 0.98rem;
  color: var(--text-muted);
}

.login-motif {
  opacity: 0.55;
  margin: -14px 0 -10px;
}

/* Google sign-in, following Google's brand fills for each theme. */
.google-btn {
  width: 100%;
  min-height: 54px;
  padding: 12px 24px;
  gap: 12px;
  border-radius: var(--radius-pill);
  font-size: 0.98rem;
  font-weight: 600;
  background: #131314;
  color: #e3e3e3;
  border: 1px solid #8e918f;
}

.google-btn:hover {
  background: color-mix(in srgb, #e3e3e3 8%, #131314);
}

:root[data-theme='light'] .google-btn {
  background: #ffffff;
  color: #1f1f1f;
  border-color: #747775;
}

:root[data-theme='light'] .google-btn:hover {
  background: color-mix(in srgb, #1f1f1f 8%, #ffffff);
}

.google-btn svg {
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .login-card {
    padding: 32px 22px 24px;
    gap: 18px;
  }

  .brand-mark {
    width: 60px;
    height: 60px;
    border-radius: 19px;
  }

  .title {
    font-size: 1.8rem;
  }

  .tagline {
    font-size: 0.92rem;
  }
}
</style>
