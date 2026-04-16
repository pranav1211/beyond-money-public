<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { getStoredTheme, applyTheme } from '../../lib/theme'
import { APP_VERSION } from '../../version'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const mobileOpen = ref(false)
const isDark = ref(getStoredTheme() === 'dark')

// PWA install prompt
const deferredPrompt = ref(null)
const canInstall = ref(false)
const isInstalled = ref(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true)

function onBeforeInstallPrompt(e) {
  e.preventDefault()
  deferredPrompt.value = e
  canInstall.value = true
  isInstalled.value = false
}

function onAppInstalled() {
  canInstall.value = false
  deferredPrompt.value = null
  isInstalled.value = true
}

async function installApp() {
  if (!deferredPrompt.value) return
  deferredPrompt.value.prompt()
  const { outcome } = await deferredPrompt.value.userChoice
  if (outcome === 'accepted') {
    canInstall.value = false
  }
  deferredPrompt.value = null
}

onMounted(() => {
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.addEventListener('appinstalled', onAppInstalled)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.removeEventListener('appinstalled', onAppInstalled)
})

const links = [
  { to: '/', label: 'Dashboard', icon: '◫' },
  { to: '/transactions', label: 'Transactions', icon: '↹' },
  { to: '/accounts', label: 'Accounts', icon: '◎' },
  { to: '/credit-cards', label: 'Credit Cards', icon: '▣' },
  { to: '/assets', label: 'Assets', icon: '◇' },
  { to: '/subscriptions', label: 'Subscriptions', icon: '◌' },
  { to: '/net-worth', label: 'Net Worth', icon: '△' },
  { to: '/organize', label: 'Labels & Categories', icon: '☷' },
  { to: '/converter', label: 'Converter', icon: '↻' },
  { to: '/sync', label: 'Sync', icon: '⇅' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

function isActive(path) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

function navigateTo(path) {
  router.push(path)
  mobileOpen.value = false
}

function toggleTheme() {
  isDark.value = !isDark.value
  applyTheme(isDark.value ? 'dark' : 'light')
}

async function handleLogout() {
  await auth.logout()
  mobileOpen.value = false
  router.push('/login')
}

defineExpose({ mobileOpen })
</script>

<template>
  <!-- Mobile hamburger button -->
  <button class="hamburger" @click="mobileOpen = !mobileOpen" :class="{ open: mobileOpen }">
    <span></span><span></span><span></span>
  </button>

  <!-- Overlay -->
  <div class="sidebar-overlay" :class="{ visible: mobileOpen }" @click="mobileOpen = false"></div>

  <aside class="sidebar" :class="{ 'sidebar--open': mobileOpen }">
    <div class="sidebar-header">
      <div class="brand-mark"><img src="https://content.beyondmebtw.com/assets/bmb_logos/bmbmoney.png" alt="BeyondMoney Logo" /></div>
      <div class="brand-copy">
        <div class="brand-title">Beyond Money</div>
        <div class="brand-version">v{{ APP_VERSION }}</div>
      </div>
    </div>

    <!-- User info shown only on mobile sidebar -->
    <div v-if="auth.user" class="mobile-user-info">
      <div class="mobile-user-name">{{ auth.user?.user_metadata?.full_name || auth.user?.email?.split('@')[0] }}</div>
      <div class="mobile-user-email">{{ auth.user.email }}</div>
    </div>

    <nav class="nav-list">
      <a
        v-for="link in links"
        :key="link.to"
        class="nav-link"
        :class="{ active: isActive(link.to) }"
        @click.prevent="navigateTo(link.to)"
        href="#"
      >
        <span class="nav-icon">{{ link.icon }}</span>
        <span class="nav-label">{{ link.label }}</span>
      </a>
    </nav>

    <div class="sidebar-bottom">
      <div class="theme-row">
        <span class="nav-label theme-label">Theme</span>
        <label class="switch" @click.prevent="toggleTheme">
          <input type="checkbox" :checked="!isDark" />
          <span class="slider">
            <div class="star star_1"></div>
            <div class="star star_2"></div>
            <div class="star star_3"></div>
            <svg viewBox="0 0 16 16" class="cloud_1 cloud">
              <path transform="matrix(.77976 0 0 .78395-299.99-418.63)" fill="#fff" d="m391.84 540.91c-.421-.329-.949-.524-1.523-.524-1.351 0-2.451 1.084-2.485 2.435-1.395.526-2.388 1.88-2.388 3.466 0 1.874 1.385 3.423 3.182 3.667v.034h12.73v-.006c1.775-.104 3.182-1.584 3.182-3.395 0-1.747-1.309-3.186-2.994-3.379.007-.106.011-.214.011-.322 0-2.707-2.271-4.901-5.072-4.901-2.073 0-3.856 1.202-4.643 2.925"></path>
            </svg>
          </span>
        </label>
      </div>
      <button class="install-btn" @click="installApp" :disabled="!canInstall && isInstalled">
        <span class="nav-icon">{{ isInstalled ? '✓' : '⤓' }}</span>
        <span class="nav-label">{{ isInstalled ? 'Installed' : 'Install App' }}</span>
      </button>
      <button class="logout-btn" @click="handleLogout">
        <span class="nav-icon">→</span>
        <span class="nav-label">Sign out</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  min-height: 100vh;
  padding: 18px 14px;
  background: rgba(8, 16, 30, 0.82);
  border-right: 1px solid var(--border-color);
  backdrop-filter: blur(18px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  z-index: 100;
}

:root[data-theme='light'] .sidebar {
  background: rgba(250, 246, 240, 0.9);
}

.sidebar-header,
.nav-link,
.logout-btn {
  border-radius: 18px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-accent);
  border: 1px solid var(--border-color);
}

.brand-mark {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: grid;
  place-items: center;
}

.brand-mark img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.brand-title {
  font-weight: 800;
  color: var(--text-primary);
}

.brand-version {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-muted);
  opacity: 0.7;
  letter-spacing: 0.5px;
}

/* Mobile user info */
.mobile-user-info {
  display: none;
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
}

.mobile-user-name {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.mobile-user-email {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-top: 2px;
}

.nav-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
  overflow-y: auto;
  flex: 1;
}

.nav-link,
.logout-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid transparent;
  color: var(--text-secondary);
  background: transparent;
  text-decoration: none;
  cursor: pointer;
}

.nav-link:hover,
.logout-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--border-color);
  transform: none;
}

.nav-link.active {
  background: linear-gradient(135deg, rgba(111, 228, 201, 0.2), rgba(117, 184, 255, 0.18));
  border-color: rgba(111, 228, 201, 0.25);
  color: var(--text-primary);
}

.nav-icon {
  width: 20px;
  text-align: center;
  font-size: 1rem;
  flex-shrink: 0;
}

.nav-label {
  font-size: 0.92rem;
  font-weight: 700;
  line-height: 1.3;
}

.sidebar-bottom {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: auto;
}

.theme-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-radius: 18px;
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
}

.theme-label {
  font-size: 0.85rem;
}

.install-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px solid rgba(111, 228, 201, 0.3);
  background: linear-gradient(135deg, rgba(111, 228, 201, 0.12), rgba(117, 184, 255, 0.1));
  color: var(--text-primary);
  cursor: pointer;
}

.install-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(111, 228, 201, 0.25), rgba(117, 184, 255, 0.2));
  border-color: rgba(111, 228, 201, 0.45);
}

.install-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.logout-btn {
  width: 100%;
  border: 1px solid var(--border-color);
}

/* Theme toggle */
.switch {
  font-size: 14px;
  position: relative;
  display: inline-block;
  width: 4em;
  height: 2.2em;
  border-radius: 30px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
  cursor: pointer;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #2a2a2a;
  border-radius: 30px;
  overflow: hidden;
}

.slider:before {
  position: absolute;
  content: "";
  height: 1.2em;
  width: 1.2em;
  border-radius: 20px;
  left: 0.5em;
  bottom: 0.5em;
  box-shadow: inset 8px -4px 0px 0px #fff;
}

.switch input:checked + .slider {
  background-color: #00a6ff;
}

.switch input:checked + .slider:before {
  transform: translateX(1.8em);
  box-shadow: inset 15px -4px 0px 15px #ffcf48;
}

.star {
  background-color: #fff;
  border-radius: 50%;
  position: absolute;
  width: 5px;
  height: 5px;
}

.star_1 { left: 2.5em; top: 0.5em; }
.star_2 { left: 2.2em; top: 1.2em; }
.star_3 { left: 3em; top: 0.9em; }

.switch input:checked ~ .slider .star {
  opacity: 0;
}

.cloud {
  width: 3.5em;
  position: absolute;
  bottom: -1.4em;
  left: -1.1em;
  opacity: 0;
}

.switch input:checked ~ .slider .cloud {
  opacity: 1;
}

/* Hamburger button */
.hamburger {
  display: none;
  position: fixed;
  top: 16px;
  left: 14px;
  z-index: 200;
  width: 40px;
  height: 40px;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-secondary);
  backdrop-filter: blur(18px);
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 5px;
  cursor: pointer;
}

.hamburger.open {
  left: auto;
  right: 14px;
}

.hamburger span {
  display: block;
  width: 20px;
  height: 2px;
  background: var(--text-primary);
  border-radius: 2px;
}

.hamburger.open span:nth-child(1) {
  transform: rotate(45deg) translate(5px, 5px);
}

.hamburger.open span:nth-child(2) {
  opacity: 0;
}

.hamburger.open span:nth-child(3) {
  transform: rotate(-45deg) translate(5px, -5px);
}

.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 90;
  opacity: 0;
  pointer-events: none;
}

@media (max-width: 1024px) {
  .sidebar {
    width: 72px;
    min-width: 72px;
    padding: 14px 8px;
  }

  .brand-copy,
  .nav-label {
    display: none;
  }

  .theme-row {
    justify-content: center;
    padding: 8px;
  }

  .sidebar-header,
  .nav-link,
  .logout-btn {
    justify-content: center;
    padding-inline: 10px;
  }
}

@media (max-width: 768px) {
  .hamburger {
    display: flex;
  }

  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    transform: translateX(-100%);
    width: 280px;
    min-width: 0;
    height: 100vh;
  }

  .sidebar--open {
    transform: translateX(0);
  }

  .sidebar-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .brand-copy,
  .nav-label {
    display: block;
  }

  .mobile-user-info {
    display: block;
  }

  .theme-row {
    justify-content: space-between;
    padding: 8px 14px;
  }

  .sidebar-header,
  .nav-link,
  .logout-btn {
    justify-content: flex-start;
    padding-inline: 14px;
  }
}

</style>
