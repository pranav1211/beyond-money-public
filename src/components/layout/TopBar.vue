<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { getStoredTheme, applyTheme } from '../../lib/theme'
import AccountSwitcher from './AccountSwitcher.vue'
import AppIcon from '../shared/AppIcon.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const pageTitle = computed(() => route.name || 'BeyondMoney')
const fullName = computed(() => auth.user?.user_metadata?.full_name || '')
const firstName = computed(() => {
  if (fullName.value) return fullName.value.split(' ')[0]
  return auth.user?.email?.split('@')[0] || ''
})
const greeting = computed(() => {
  const h = new Date().getHours()
  const part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return firstName.value ? `${part}, ${firstName.value}` : part
})
const initial = computed(() => (firstName.value || '?').charAt(0).toUpperCase())

// Phone profile menu. On phones, Settings, Sync, Theme, Sign out and the
// account switcher live here instead of the hamburger drawer. Desktop keeps
// them in the sidebar and the avatar is display-only (see the CSS).
const menuOpen = ref(false)
const showAccounts = ref(false)
const isDark = ref(getStoredTheme() === 'dark')
const menuRef = ref(null)

function toggleMenu() {
  menuOpen.value = !menuOpen.value
  if (!menuOpen.value) showAccounts.value = false
}

function closeMenu() {
  menuOpen.value = false
  showAccounts.value = false
}

function toggleTheme() {
  isDark.value = !isDark.value
  applyTheme(isDark.value ? 'dark' : 'light')
}

function go(path) {
  closeMenu()
  router.push(path)
}

async function signOut() {
  closeMenu()
  await auth.logout()
  router.push('/login')
}

function onDocPointer(e) {
  if (menuRef.value && !menuRef.value.contains(e.target)) closeMenu()
}

function onKey(e) {
  if (e.key === 'Escape') closeMenu()
}

watch(menuOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', onDocPointer)
    document.addEventListener('keydown', onKey)
  } else {
    document.removeEventListener('pointerdown', onDocPointer)
    document.removeEventListener('keydown', onKey)
  }
})

watch(() => route.fullPath, closeMenu)

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <header class="top-bar">
    <div class="top-bar-left">
      <div class="eyebrow">{{ greeting }}</div>
      <h1 class="page-heading">{{ pageTitle }}</h1>
    </div>
    <div v-if="auth.user" ref="menuRef" class="top-bar-right">
      <!-- Desktop: display-only chip. Phone: opens the profile menu. -->
      <button
        type="button"
        class="user-chip"
        :aria-expanded="menuOpen"
        aria-haspopup="menu"
        :title="auth.user.email"
        @click="toggleMenu"
      >
        <span class="user-avatar">{{ initial }}</span>
        <span class="user-email">{{ auth.user.email }}</span>
      </button>

      <div v-if="menuOpen" class="profile-menu" role="menu">
        <button type="button" class="pm-identity" :aria-expanded="showAccounts" @click="showAccounts = !showAccounts">
          <span class="pm-avatar">{{ initial }}</span>
          <span class="pm-id-copy">
            <span class="pm-name">{{ fullName || firstName }}</span>
            <span class="pm-email">{{ auth.user.email }}</span>
          </span>
          <svg class="pm-caret" :class="{ open: showAccounts }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>

        <div v-if="showAccounts" class="pm-accounts">
          <span class="pm-section-label">Switch account</span>
          <AccountSwitcher inline />
        </div>

        <div class="pm-divider"></div>

        <button type="button" class="pm-item" role="menuitemcheckbox" :aria-checked="isDark" @click="toggleTheme">
          <span class="pm-icon" aria-hidden="true">
            <svg v-if="isDark" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
            <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" /></svg>
          </span>
          <span class="pm-label">Dark mode</span>
          <span class="pm-switch" :class="{ on: isDark }" aria-hidden="true"><span></span></span>
        </button>

        <button type="button" class="pm-item" role="menuitem" @click="go('/settings')">
          <span class="pm-icon" aria-hidden="true"><AppIcon name="settings" :size="18" /></span>
          <span class="pm-label">Settings</span>
        </button>

        <button type="button" class="pm-item" role="menuitem" @click="go('/sync')">
          <span class="pm-icon" aria-hidden="true"><AppIcon name="sync" :size="18" /></span>
          <span class="pm-label">Sync</span>
        </button>

        <div class="pm-divider"></div>

        <button type="button" class="pm-item pm-item--danger" role="menuitem" @click="signOut">
          <span class="pm-icon" aria-hidden="true"><AppIcon name="signout" :size="18" /></span>
          <span class="pm-label">Sign out</span>
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.top-bar {
  position: sticky;
  top: 0;
  z-index: 50;
  height: var(--topbar-height);
  padding: 0 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-primary);
}

.top-bar-right {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
}

.eyebrow {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.page-heading {
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 600;
  letter-spacing: -0.015em;
  line-height: 1.2;
  color: var(--text-primary);
}

.user-chip {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 5px 14px 5px 5px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--bg-secondary);
  box-shadow: var(--shadow-sm);
  font-weight: 600;
  /* Desktop: informational only (the sidebar has the account controls). */
  pointer-events: none;
}

.user-avatar,
.pm-avatar {
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: var(--accent-dim);
  color: var(--accent);
  font-family: var(--font-display);
  font-weight: 600;
}

.user-avatar {
  width: 30px;
  height: 30px;
  font-size: 0.85rem;
}

.user-email {
  color: var(--text-secondary);
  font-size: 0.83rem;
  font-weight: 600;
}

/* Profile menu (phones only) */
.profile-menu {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 120;
  width: min(300px, calc(100vw - 24px));
  padding: 8px;
  border-radius: var(--radius);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  gap: 2px;
  transform-origin: top right;
  animation: pm-in 0.16s ease-out;
}

@keyframes pm-in {
  from { opacity: 0; transform: scale(0.96) translateY(-4px); }
  to { opacity: 1; transform: none; }
}

.pm-identity,
.pm-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  padding: 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-primary);
  font-weight: 600;
  text-align: left;
}

.pm-identity:hover,
.pm-item:hover {
  background: var(--bg-elevated);
}

.pm-avatar {
  width: 40px;
  height: 40px;
  font-size: 1rem;
}

.pm-id-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.pm-name {
  font-family: var(--font-display);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pm-email {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pm-caret {
  color: var(--text-muted);
  transition: transform var(--transition);
}

.pm-caret.open {
  transform: rotate(180deg);
}

.pm-accounts {
  padding: 4px 4px 6px;
}

.pm-section-label {
  display: block;
  padding: 0 6px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
}

.pm-divider {
  height: 1px;
  margin: 4px 6px;
  background: var(--border-color);
}

.pm-icon {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  flex-shrink: 0;
}

.pm-label {
  flex: 1;
}

.pm-switch {
  width: 40px;
  height: 24px;
  padding: 3px;
  border-radius: var(--radius-pill);
  background: var(--bg-surface);
  transition: background-color var(--transition);
}

.pm-switch span {
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: transform var(--transition), background-color var(--transition);
}

.pm-switch.on {
  background: var(--accent);
}

.pm-switch.on span {
  transform: translateX(16px);
  background: var(--accent-ink);
}

.pm-item--danger {
  color: var(--expense);
}

.pm-item--danger .pm-icon {
  color: var(--expense);
  background: color-mix(in srgb, var(--expense) 12%, transparent);
}

@media (min-width: 769px) {
  .profile-menu {
    display: none;
  }
}

@media (max-width: 768px) {
  .top-bar {
    padding: 0 16px 0 68px;
  }

  .eyebrow {
    font-size: 0.72rem;
  }

  .page-heading {
    font-size: 1.15rem;
  }

  .user-chip {
    padding: 4px;
    pointer-events: auto;
    cursor: pointer;
  }

  .user-chip[aria-expanded='true'] {
    box-shadow: 0 0 0 2px var(--accent), var(--shadow-sm);
  }

  .user-avatar {
    width: 34px;
    height: 34px;
  }

  .user-email {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .profile-menu {
    animation: none;
  }
}
</style>
