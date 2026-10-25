<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { getRoster, removeAccount } from '../../lib/accountRoster'

// inline: render the account list in place (used inside the phone profile
// menu) instead of the sidebar's button + pop-up menu.
const props = defineProps({
  inline: { type: Boolean, default: false },
})

const auth = useAuthStore()

const open = ref(false)
const switching = ref(false)
const roster = ref(getRoster())

const currentId = computed(() => auth.user?.id || null)
const currentLabel = computed(() =>
  auth.user?.user_metadata?.full_name || auth.user?.email?.split('@')[0] || auth.user?.email || 'Account'
)

function toggle() {
  roster.value = getRoster()
  open.value = !open.value
}

async function switchTo(entry) {
  if (switching.value) return
  if (entry.id === currentId.value) { open.value = false; return }
  switching.value = true
  const ok = await auth.switchAccount(entry)
  switching.value = false
  if (ok) {
    // Hard reload so every store re-hydrates cleanly from the new session.
    window.location.assign(import.meta.env.BASE_URL || '/')
  } else {
    // Token likely expired — drop it and prompt a fresh login.
    removeAccount(entry.id)
    roster.value = getRoster()
    await auth.login()
  }
}

async function addAccount() {
  // Google OAuth redirect. On return the new session is captured into the
  // roster automatically (onAuthStateChange → cacheSession → upsertAccount).
  await auth.login()
}

function forget(entry) {
  removeAccount(entry.id)
  roster.value = getRoster()
}
</script>

<template>
  <div class="acct-switcher">
    <button v-if="!props.inline" class="acct-current" :class="{ open }" @click="toggle">
      <span class="acct-avatar">{{ (currentLabel[0] || '?').toUpperCase() }}</span>
      <span class="acct-name">{{ currentLabel }}</span>
      <span class="acct-caret" :class="{ open }">▾</span>
    </button>

    <div v-if="open || props.inline" class="acct-menu" :class="{ 'acct-menu--inline': props.inline }">
      <button
        v-for="entry in roster"
        :key="entry.id"
        class="acct-item"
        :class="{ active: entry.id === currentId }"
        :disabled="switching"
        @click="switchTo(entry)"
      >
        <span class="acct-avatar sm">{{ (entry.label[0] || '?').toUpperCase() }}</span>
        <span class="acct-item-copy">
          <span class="acct-item-label">{{ entry.label }}</span>
          <span class="acct-item-email">{{ entry.email }}</span>
        </span>
        <span v-if="entry.id === currentId" class="acct-badge">Active</span>
        <span
          v-else
          class="acct-forget"
          title="Forget this account"
          @click.stop="forget(entry)"
        >×</span>
      </button>

      <button class="acct-add" :disabled="switching" @click="addAccount">
        <span class="acct-avatar sm plus">+</span>
        <span class="acct-item-label">Add account</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.acct-switcher { position: relative; }

.acct-current {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  width: 100%;
  padding: 6px 14px 6px 6px;
  background: transparent;
  border: 0;
  border-radius: var(--radius-pill);
  color: var(--text-primary);
  cursor: pointer;
}
.acct-current:hover,
.acct-current.open { background: var(--bg-secondary); }

.acct-avatar {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--accent-dim);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 0.85rem;
}
.acct-avatar.sm { width: 26px; height: 26px; font-size: 0.76rem; }
.acct-avatar.plus { background: transparent; border: 1px dashed var(--border-light); color: var(--text-muted); }

.acct-name {
  flex: 1;
  text-align: left;
  font-size: 0.85rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.acct-caret { font-size: 0.7rem; color: var(--text-muted); transition: transform 0.2s ease; }
.acct-caret.open { transform: rotate(180deg); }

.acct-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  z-index: 200;
}

.acct-item,
.acct-add {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}
.acct-item:hover:not(:disabled),
.acct-add:hover:not(:disabled) { background: var(--bg-elevated); }
.acct-item:disabled,
.acct-add:disabled { opacity: 0.6; cursor: not-allowed; }
.acct-item.active { background: var(--accent-dim); }

.acct-item-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.acct-item-label { font-size: 0.82rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.acct-item-email { font-size: 0.7rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.acct-badge {
  font-size: 0.62rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--accent);
  background: var(--bg-secondary);
  padding: 2px 7px;
  border-radius: 999px;
}
.acct-forget {
  font-size: 1.05rem;
  line-height: 1;
  color: var(--text-muted);
  padding: 0 4px;
  border-radius: 6px;
}
.acct-forget:hover { color: var(--expense); }

.acct-add { margin-top: 2px; }

.acct-menu--inline {
  position: static;
  padding: 4px 0 0;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

@media (max-width: 1024px) and (min-width: 769px) {
  .acct-current { justify-content: center; padding: 6px; }
  .acct-name, .acct-caret { display: none; }
  .acct-menu { right: auto; width: 240px; }
}
</style>
