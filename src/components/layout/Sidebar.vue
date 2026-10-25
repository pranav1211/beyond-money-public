<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useCurrencyStore } from '../../stores/currency'
import { getStoredTheme, applyTheme } from '../../lib/theme'
import { APP_VERSION } from '../../version'
import { usePwaInstall } from '../../composables/usePwaInstall'
import AccountSwitcher from './AccountSwitcher.vue'
import AppIcon from '../shared/AppIcon.vue'

// Bundled in public/ so the app (and offline installs) don't depend on an
// external host. BASE_URL keeps it working under a custom VITE_APP_BASE.
const logoSrc = `${import.meta.env.BASE_URL}logo.png`

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const currencyStore = useCurrencyStore()

const ratesStale = computed(() => {
  if (!currencyStore.lastFetched) return true
  const age = Date.now() - new Date(currencyStore.lastFetched).getTime()
  return age > 24 * 60 * 60 * 1000
})

const mobileOpen = ref(false)
const isDark = ref(getStoredTheme() === 'dark')

// PWA install — listener is attached at module load (from main.js) so
// the early-firing `beforeinstallprompt` event isn't missed.
const { isInstalled, install } = usePwaInstall()
const installStatus = ref('')

async function installApp() {
  installStatus.value = ''
  const { status } = await install()

  if (status === 'ios-guidance') {
    installStatus.value = 'Tap Share, then "Add to Home Screen"'
    setTimeout(() => { installStatus.value = '' }, 5000)
    return
  }
  if (status === 'manual-guidance') {
    installStatus.value = 'Open your browser menu and pick Install / Add to Home Screen'
    setTimeout(() => { installStatus.value = '' }, 5000)
  }
}

const links = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/transactions', label: 'Transactions', icon: 'transactions' },
  { to: '/accounts', label: 'Accounts', icon: 'accounts' },
  { to: '/credit-cards', label: 'Credit Cards', icon: 'cards' },
  { to: '/assets', label: 'Assets', icon: 'assets' },
  { to: '/subscriptions', label: 'Subscriptions', icon: 'subscriptions' },
  { to: '/loans', label: 'Loans', icon: 'loans' },
  { to: '/net-worth', label: 'Net Worth', icon: 'networth' },
  { to: '/organize', label: 'Labels & Categories', icon: 'labels' },
  { to: '/converter', label: 'Currency', icon: 'currency' },
  // deskOnly: on phones these move to the profile menu (TopBar avatar).
  { to: '/sync', label: 'Sync', icon: 'sync', deskOnly: true },
  { to: '/settings', label: 'Settings', icon: 'settings', deskOnly: true },
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
  <button class="hamburger" @click="mobileOpen = !mobileOpen" :class="{ open: mobileOpen }" :aria-label="mobileOpen ? 'Close menu' : 'Open menu'">
    <AppIcon :name="mobileOpen ? 'close' : 'menu'" :size="22" />
  </button>

  <!-- Overlay -->
  <div class="sidebar-overlay" :class="{ visible: mobileOpen }" @click="mobileOpen = false"></div>

  <aside class="sidebar" :class="{ 'sidebar--open': mobileOpen }">
    <div class="sidebar-header">
      <div class="brand-mark"><img :src="logoSrc" alt="BeyondMoney Logo" /></div>
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
        :class="{ active: isActive(link.to), 'desk-only': link.deskOnly }"
        @click.prevent="navigateTo(link.to)"
        href="#"
      >
        <span class="nav-icon"><AppIcon :name="link.icon" /></span>
        <span class="nav-label">{{ link.label }}</span>
        <span
          v-if="link.to === '/converter' && ratesStale"
          class="stale-dot"
          title="Exchange rates may be out of date — open Currency to refresh"
        ></span>
      </a>
    </nav>

    <div class="sidebar-bottom">
      <div class="theme-row desk-only">
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
      <button class="install-btn" @click="installApp" :disabled="isInstalled">
        <span class="nav-icon"><AppIcon :name="isInstalled ? 'installed' : 'install'" /></span>
        <span class="nav-label">{{ isInstalled ? 'Installed' : 'Install App' }}</span>
      </button>
      <span v-if="installStatus" class="install-status">{{ installStatus }}</span>
      <AccountSwitcher v-if="auth.user" class="desk-only" />
      <button class="logout-btn desk-only" @click="handleLogout">
        <span class="nav-icon"><AppIcon name="signout" /></span>
        <span class="nav-label">Sign out</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: sticky;
  top: 0;
  align-self: flex-start;
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  height: 100vh;
  padding: 22px 14px 18px;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  gap: 18px;
  z-index: 100;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 2px 10px;
}

.brand-mark {
  width: 40px;
  height: 40px;
  border-radius: 13px;
  overflow: hidden;
  display: grid;
  place-items: center;
  box-shadow: var(--shadow-sm);
}

.brand-mark img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.brand-title {
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

.brand-version {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-muted);
}

/* Mobile user info */
.mobile-user-info {
  display: none;
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  box-shadow: var(--shadow-sm);
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
  gap: 2px;
  overflow-y: auto;
  flex: 1;
  margin-inline: -4px;
  padding-inline: 4px;
  scrollbar-width: none;
}

.nav-link,
.logout-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 14px 6px 6px;
  border: 0;
  border-radius: var(--radius-pill);
  color: var(--text-secondary);
  background: transparent;
  text-decoration: none;
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--transition), color var(--transition), box-shadow var(--transition);
}

.nav-link:hover,
.logout-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.nav-link.active {
  background: var(--bg-secondary);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}

/* Icon sits in a soft round tile; the active page tints it with the accent. */
.nav-icon {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--text-muted);
  transition: background-color var(--transition), color var(--transition);
}

.nav-link:hover .nav-icon,
.logout-btn:hover .nav-icon {
  color: var(--text-primary);
}

.nav-link.active .nav-icon {
  background: var(--accent-dim);
  color: var(--accent);
  --icon-tint: color-mix(in srgb, var(--accent) 22%, transparent);
}

.stale-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--warning);
  margin-left: auto;
  box-shadow: 0 0 8px color-mix(in srgb, var(--warning) 60%, transparent);
  animation: stale-pulse 2.4s infinite;
  flex-shrink: 0;
}

@keyframes stale-pulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.15); }
}

.nav-label {
  font-size: 0.92rem;
  font-weight: 600;
  line-height: 1.3;
}

.sidebar-bottom {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.theme-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px 6px 14px;
  border-radius: var(--radius-pill);
}

.theme-label {
  font-size: 0.88rem;
}

.install-btn {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  width: 100%;
  padding: 6px 14px 6px 6px;
  border-radius: var(--radius-pill);
  border: 0;
  background: var(--bg-soft);
  color: var(--text-primary);
  font-weight: 600;
  cursor: pointer;
}

.install-btn .nav-icon {
  color: var(--accent);
}

.install-btn:hover:not(:disabled) {
  background: var(--accent-dim);
}

.install-btn:disabled {
  background: transparent;
  opacity: 0.7;
  cursor: default;
}

.install-status {
  font-size: 0.7rem;
  color: var(--text-muted, #888);
  text-align: center;
  padding: 0 0.5rem;
  margin-top: -0.25rem;
}

.logout-btn {
  width: 100%;
  justify-content: flex-start;
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
  top: calc(env(safe-area-inset-top, 0px) + 12px);
  left: calc(env(safe-area-inset-left, 0px) + 14px);
  z-index: 200;
  width: 42px;
  height: 42px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--bg-secondary);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
  place-items: center;
  cursor: pointer;
}

.hamburger.open {
  left: auto;
  right: calc(env(safe-area-inset-right, 0px) + 14px);
}

.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(4, 8, 16, 0.55);
  z-index: 90;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

@media (max-width: 1024px) {
  .sidebar {
    width: 78px;
    min-width: 78px;
    padding: 18px 10px;
  }

  .brand-copy,
  .nav-label {
    display: none;
  }

  .theme-row {
    justify-content: center;
    padding: 6px 0;
  }

  .sidebar-header,
  .nav-link,
  .logout-btn,
  .install-btn {
    justify-content: center;
    padding: 6px;
  }
}

@media (max-width: 768px) {
  .hamburger {
    display: grid;
  }

  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    width: 288px;
    min-width: 0;
    height: 100vh;
    padding-top: calc(env(safe-area-inset-top, 0px) + 22px);
    padding-left: calc(env(safe-area-inset-left, 0px) + 14px);
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 18px);
    box-shadow: var(--shadow-lg);
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

  /* Account, theme, settings, sync and sign-out live in the profile menu
     on phones; the drawer keeps navigation and Install App. */
  .desk-only {
    display: none !important;
  }

  .mobile-user-info {
    display: none;
  }

  .theme-row {
    justify-content: space-between;
    padding: 6px 8px 6px 14px;
  }

  .sidebar-header {
    justify-content: flex-start;
    padding: 2px 10px;
  }

  .nav-link,
  .logout-btn,
  .install-btn {
    justify-content: flex-start;
    padding: 6px 14px 6px 6px;
  }
}

</style>
