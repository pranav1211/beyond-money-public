<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'

const route = useRoute()
const auth = useAuthStore()

const pageTitle = computed(() => route.name || 'BeyondMoney')
const userLabel = computed(() => auth.user?.user_metadata?.full_name || auth.user?.email?.split('@')[0] || 'Your')
const eyebrow = computed(() => `${userLabel.value}'s finance desk`)
</script>

<template>
  <header class="top-bar">
    <div class="top-bar-left">
      <div class="eyebrow">{{ eyebrow }}</div>
      <h1 class="page-heading">{{ pageTitle }}</h1>
    </div>
    <div class="top-bar-right">
      <span v-if="auth.user" class="user-email">{{ auth.user.email }}</span>
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
  background: rgba(9, 17, 31, 0.72);
  border-bottom: 1px solid var(--border-color);
  backdrop-filter: blur(18px);
}

:root[data-theme='light'] .top-bar {
  background: rgba(244, 241, 234, 0.76);
}

.top-bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.eyebrow {
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.page-heading {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--text-primary);
}

.user-email {
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 0.83rem;
  font-weight: 700;
}

@media (max-width: 768px) {
  .top-bar {
    padding: 0 14px 0 60px;
  }

  .eyebrow {
    display: none;
  }

  .page-heading {
    font-size: 1.05rem;
  }

  .user-email {
    display: none;
  }
}

</style>
