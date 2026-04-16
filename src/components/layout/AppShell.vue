<script setup>
import Sidebar from './Sidebar.vue'
import TopBar from './TopBar.vue'
</script>

<template>
  <div class="app-shell">
    <Sidebar />
    <div class="app-main">
      <TopBar />
      <main class="app-content">
        <div class="content-inner">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
  background: transparent;
  max-width: 100vw;
  overflow-x: hidden;
}

.app-main {
  min-height: 100vh;
  flex: 1;
  min-width: 0;
  overflow-x: hidden;
}

.app-content {
  min-height: calc(100vh - var(--topbar-height));
  padding: 28px;
}

.content-inner {
  width: min(100%, var(--page-max));
  margin: 0 auto;
}

@media (max-width: 768px) {
  .app-main {
    width: 100%;
  }

  .app-content {
    padding: 14px 10px 28px;
  }
}
</style>
