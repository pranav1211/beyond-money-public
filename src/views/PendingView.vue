<script setup>
import { onMounted, computed, ref } from 'vue'
import { useSyncStore } from '../stores/sync'
import { useOnlineStatus } from '../composables/useOnlineStatus'
import AppShell from '../components/layout/AppShell.vue'
import ConfirmDialog from '../components/shared/ConfirmDialog.vue'

const syncStore = useSyncStore()
const { online } = useOnlineStatus()
const showClearConfirm = ref(false)
const refreshingCache = ref(false)

onMounted(() => {
  syncStore.loadState()
})

const lastSyncDisplay = computed(() => {
  if (!syncStore.lastSyncTime) return 'Never'
  const d = new Date(syncStore.lastSyncTime)
  const now = Date.now()
  const diff = now - syncStore.lastSyncTime
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
})

const failedItems = computed(() => syncStore.pending.filter(item => item.failed))
const pendingItems = computed(() => syncStore.pending.filter(item => !item.failed))

const cacheEntries = computed(() => {
  const times = syncStore.dataCacheTimes
  const labels = {
    accounts: 'Accounts', transactions: 'Transactions', creditCards: 'Credit Cards',
    assets: 'Assets', subscriptions: 'Subscriptions', categories: 'Categories',
    labels: 'Labels', ccExpenses: 'CC Expenses',
  }
  return Object.entries(labels).map(([key, label]) => ({
    key,
    label,
    lastCached: times[key] || null,
  }))
})

function formatTime(ts) {
  if (!ts) return 'Never'
  return new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function cacheAge(ts) {
  if (!ts) return 'not cached'
  const diff = Date.now() - ts
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

async function handleForceSync() {
  await syncStore.forceSyncAll()
}

async function handleRetryFailed() {
  await syncStore.forceSync()
}

async function handleClearQueue() {
  await syncStore.clearQueue()
  showClearConfirm.value = false
}

async function handleRemoveItem(id) {
  await syncStore.removePendingItem(id)
}

async function handleRefreshAppCache() {
  refreshingCache.value = true
  await syncStore.refreshAppCache()
  refreshingCache.value = false
}
</script>

<template>
  <AppShell>
    <div class="sync-page">
      <!-- Connection Status Banner -->
      <div class="connection-banner" :class="online ? 'online' : 'offline'">
        <span class="connection-dot"></span>
        <span>{{ online ? 'Online' : 'Offline — using cached data' }}</span>
      </div>

      <!-- Sync Status Card -->
      <div class="status-card">
        <div class="status-header">
          <div>
            <div class="status-label">Sync Status</div>
            <div class="status-value" :class="syncStore.syncing ? 'syncing' : (syncStore.pendingCount ? 'has-pending' : 'synced')">
              {{ syncStore.syncing ? 'Syncing...' : (syncStore.pendingCount ? `${syncStore.pendingCount} pending` : 'All synced') }}
            </div>
          </div>
          <div class="status-meta">
            <div class="meta-item">
              <span class="meta-label">Last sync</span>
              <span class="meta-value">{{ lastSyncDisplay }}</span>
            </div>
          </div>
        </div>
        <div class="status-actions">
          <button class="btn-primary" @click="handleForceSync" :disabled="syncStore.syncing || !online">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            {{ syncStore.syncing ? 'Syncing...' : 'Sync All Data' }}
          </button>
          <button v-if="failedItems.length" @click="handleRetryFailed" :disabled="syncStore.syncing || !online">
            Retry Failed ({{ failedItems.length }})
          </button>
          <button v-if="syncStore.pendingCount" class="btn-danger" @click="showClearConfirm = true" :disabled="syncStore.syncing">
            Clear Queue
          </button>
        </div>
      </div>

      <!-- Error Banner -->
      <div v-if="syncStore.lastSyncError" class="error-banner">
        {{ syncStore.lastSyncError }}
      </div>

      <!-- Cache Status Card -->
      <div class="cache-card">
        <div class="cache-header">
          <h3 class="section-title">Data Cache</h3>
          <button class="btn-small" @click="handleRefreshAppCache" :disabled="refreshingCache">
            {{ refreshingCache ? 'Refreshing...' : 'Refresh App Cache' }}
          </button>
        </div>
        <div class="cache-grid">
          <div v-for="entry in cacheEntries" :key="entry.key" class="cache-item">
            <span class="cache-name">{{ entry.label }}</span>
            <span class="cache-time" :class="{ stale: !entry.lastCached }">{{ cacheAge(entry.lastCached) }}</span>
          </div>
        </div>
        <div class="cache-footer">
          <span class="cache-sw-info">App cache: {{ syncStore.swCacheInfo.totalCached }} files (v{{ syncStore.swCacheInfo.version || '?' }})</span>
        </div>
      </div>

      <!-- Failed Items -->
      <div v-if="failedItems.length" class="section">
        <h3 class="section-title">Failed</h3>
        <div class="queue-list">
          <div v-for="item in failedItems" :key="item.id" class="queue-item queue-item--failed">
            <div class="queue-item-info">
              <span class="queue-badge badge-failed">FAILED</span>
              <span class="queue-action">{{ item.action }}</span>
              <span class="queue-table">{{ item.table }}</span>
              <span v-if="item.retries" class="queue-retries">{{ item.retries }} retries</span>
            </div>
            <div class="queue-item-meta">
              <span v-if="item.lastError" class="queue-error">{{ item.lastError }}</span>
              <span class="queue-time">{{ formatTime(item.created_at) }}</span>
            </div>
            <button class="btn-remove" @click="handleRemoveItem(item.id)">Remove</button>
          </div>
        </div>
      </div>

      <!-- Pending Items -->
      <div v-if="pendingItems.length" class="section">
        <h3 class="section-title">Pending</h3>
        <div class="queue-list">
          <div v-for="item in pendingItems" :key="item.id" class="queue-item">
            <div class="queue-item-info">
              <span class="queue-badge badge-pending">PENDING</span>
              <span class="queue-action">{{ item.action }}</span>
              <span class="queue-table">{{ item.table }}</span>
              <span v-if="item.retries" class="queue-retries">{{ item.retries }} retries</span>
            </div>
            <div class="queue-item-meta">
              <span v-if="item.lastError" class="queue-error">{{ item.lastError }}</span>
              <span class="queue-time">{{ formatTime(item.created_at) }}</span>
            </div>
            <button class="btn-remove" @click="handleRemoveItem(item.id)">Remove</button>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="!syncStore.pendingCount && !syncStore.syncing" class="empty-state">
        <div class="empty-icon">&#10003;</div>
        <h3>All caught up</h3>
        <p>No pending sync operations. All data is up to date.</p>
      </div>

      <ConfirmDialog
        v-if="showClearConfirm"
        title="Clear Sync Queue"
        message="This will discard all pending sync operations. Unsynced changes will be lost."
        @confirm="handleClearQueue"
        @cancel="showClearConfirm = false"
      />
    </div>
  </AppShell>
</template>

<style scoped>
.sync-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Connection banner */
.connection-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-radius: var(--radius-sm);
  font-size: 0.88rem;
  font-weight: 700;
}

.connection-banner.online {
  background: rgba(120, 224, 143, 0.12);
  border: 1px solid rgba(120, 224, 143, 0.25);
  color: var(--income);
}

.connection-banner.offline {
  background: rgba(255, 125, 125, 0.12);
  border: 1px solid rgba(255, 125, 125, 0.25);
  color: var(--expense);
}

.connection-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.connection-banner.online .connection-dot {
  background: var(--income);
  box-shadow: 0 0 6px var(--income);
}

.connection-banner.offline .connection-dot {
  background: var(--expense);
  box-shadow: 0 0 6px var(--expense);
}

/* Status card */
.status-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 28px;
  box-shadow: var(--shadow-sm);
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 16px;
}

.status-label {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.status-value {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--text-primary);
}

.status-value.synced { color: var(--income); }
.status-value.has-pending { color: var(--warning); }
.status-value.syncing { color: var(--info); }

.status-meta {
  text-align: right;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.meta-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.meta-value {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.status-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

/* Cache card */
.cache-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 24px;
}

.cache-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.btn-small {
  padding: 6px 14px;
  font-size: 0.78rem;
  font-weight: 700;
  border-radius: 10px;
}

.cache-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.cache-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
}

.cache-name {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-secondary);
}

.cache-time {
  font-size: 0.75rem;
  color: var(--income);
  font-weight: 600;
}

.cache-time.stale {
  color: var(--text-muted);
}

.cache-footer {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.cache-sw-info {
  font-size: 0.78rem;
  color: var(--text-muted);
}

/* Error banner */
.error-banner {
  background: rgba(248, 81, 73, 0.12);
  border: 1px solid rgba(248, 81, 73, 0.3);
  border-radius: var(--radius-sm);
  padding: 12px 16px;
  color: var(--expense);
  font-size: 0.88rem;
  font-weight: 600;
}

/* Queue sections */
.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.queue-item {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.queue-item--failed {
  border-color: rgba(248, 81, 73, 0.3);
}

.queue-item-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.queue-badge {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.5px;
  padding: 2px 8px;
  border-radius: 6px;
  flex-shrink: 0;
}

.badge-pending {
  background: rgba(245, 200, 107, 0.15);
  color: var(--warning);
}

.badge-failed {
  background: rgba(248, 81, 73, 0.15);
  color: var(--expense);
}

.queue-action {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.88rem;
  text-transform: capitalize;
}

.queue-table {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.queue-retries {
  color: var(--text-muted);
  font-size: 0.75rem;
}

.queue-item-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.queue-error {
  color: var(--expense);
  font-size: 0.78rem;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-time {
  color: var(--text-muted);
  font-size: 0.75rem;
  white-space: nowrap;
}

.btn-remove {
  padding: 4px 10px;
  font-size: 0.75rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
}

.btn-remove:hover {
  color: var(--expense);
  border-color: rgba(248, 81, 73, 0.3);
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 3rem;
  color: var(--income);
  margin-bottom: 12px;
}

.empty-state h3 {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.empty-state p {
  font-size: 0.88rem;
  color: var(--text-muted);
  max-width: 360px;
  margin: 0 auto;
}

@media (max-width: 768px) {
  .status-card {
    padding: 20px;
  }

  .status-header {
    flex-direction: column;
  }

  .status-meta {
    text-align: left;
  }

  .status-value {
    font-size: 1.3rem;
  }

  .cache-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .queue-item {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
