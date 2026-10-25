<script setup>
import { onMounted, computed, ref } from 'vue'
import { useSyncStore } from '../stores/sync'
import { useOnlineStatus } from '../composables/useOnlineStatus'
import AppShell from '../components/layout/AppShell.vue'
import ConfirmDialog from '../components/shared/ConfirmDialog.vue'
import { APP_VERSION } from '../version'

const syncStore = useSyncStore()
const { online } = useOnlineStatus()
const showClearConfirm = ref(false)
const refreshingCache = ref(false)
const checkingUpdate = ref(false)
const updateStatus = ref('')

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

const ACTION_LABELS = { insert: 'Add', update: 'Edit', delete: 'Delete', upsert: 'Save' }
const TABLE_LABELS = {
  transactions: 'transaction', accounts: 'account', assets: 'asset',
  creditCards: 'credit card', cc_expenses: 'card expense', subscriptions: 'subscription',
  categories: 'category', labels: 'label', currencies: 'currency',
}

// Human-readable summary of a queued op, e.g. "Add transaction".
function describeItem(item) {
  const action = ACTION_LABELS[item.action] || item.action
  const table = TABLE_LABELS[item.table] || item.table
  return `${action} ${table}`
}

// Extra detail pulled from the payload so the list is actually useful —
// e.g. "expense · INR 100 · Groceries" for a queued transaction.
function describeDetail(item) {
  const p = item.payload
  if (!p) return ''
  if (item.table === 'transactions') {
    const parts = []
    if (p.type) parts.push(p.type)
    if (p.amount != null) parts.push(`${p.currency || ''} ${Number(p.amount).toLocaleString('en-IN')}`.trim())
    if (p.description) parts.push(p.description)
    return parts.join(' · ')
  }
  return p.name || ''
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

const cacheStatusMsg = ref('')

async function handleRefreshAppCache() {
  refreshingCache.value = true
  cacheStatusMsg.value = ''
  await syncStore.refreshAppCache()
  refreshingCache.value = false
  cacheStatusMsg.value = `All pages downloaded for offline — ${syncStore.swCacheInfo.totalCached} files cached.`
  setTimeout(() => { cacheStatusMsg.value = '' }, 8000)
}

// Force everything: push the pending queue, re-fetch all data, AND pull every
// app page/chunk into the cache so the app is fully usable offline.
async function handleForceEverything() {
  refreshingCache.value = true
  cacheStatusMsg.value = ''
  if (online.value) await syncStore.forceSyncAll()
  await syncStore.refreshAppCache()
  refreshingCache.value = false
  cacheStatusMsg.value = `Synced and cached for offline — ${syncStore.swCacheInfo.totalCached} files ready.`
  setTimeout(() => { cacheStatusMsg.value = '' }, 8000)
}

const updateAvailable = ref(false)

async function handleCheckForUpdate() {
  checkingUpdate.value = true
  updateStatus.value = ''
  updateAvailable.value = false
  try {
    const { status } = await syncStore.checkForAppUpdate()
    if (status === 'unsupported') {
      updateStatus.value = 'Service worker not available in this browser.'
    } else if (status === 'update-pending') {
      updateStatus.value = 'A new version is ready. Reload to apply it now.'
      updateAvailable.value = true
    } else {
      updateStatus.value = `You're on the latest version (v${APP_VERSION}).`
    }
  } catch (err) {
    updateStatus.value = `Update check failed: ${err.message || err}`
  } finally {
    checkingUpdate.value = false
    if (!updateAvailable.value) {
      setTimeout(() => { updateStatus.value = '' }, 8000)
    }
  }
}

function handleReloadNow() {
  window.location.reload()
}
</script>

<template>
  <AppShell>
    <div class="sync-page">
      <!-- Connection Status Banner -->
      <div class="connection-banner" :class="online ? 'online' : 'offline'" role="status">
        <span class="connection-dot" aria-hidden="true"></span>
        <span>{{ online ? 'Online' : 'Offline — using cached data' }}</span>
      </div>

      <!-- Sync Status Card -->
      <div class="card status-card">
        <div class="status-header">
          <div class="status-copy">
            <span class="status-label">Sync status</span>
            <span class="status-value" :class="syncStore.syncing ? 'syncing' : (syncStore.pendingCount ? 'has-pending' : 'synced')">
              {{ syncStore.syncing ? 'Syncing...' : (syncStore.pendingCount ? `${syncStore.pendingCount} pending` : 'All synced') }}
            </span>
          </div>
          <div class="status-meta">
            <span class="meta-label">Last sync</span>
            <span class="meta-value">{{ lastSyncDisplay }}</span>
          </div>
        </div>
        <div class="status-actions">
          <button class="btn-primary" @click="handleForceSync" :disabled="syncStore.syncing || !online">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            {{ syncStore.syncing ? 'Syncing...' : 'Sync all data' }}
          </button>
          <button v-if="failedItems.length" @click="handleRetryFailed" :disabled="syncStore.syncing || !online">
            Retry failed ({{ failedItems.length }})
          </button>
          <button v-if="syncStore.pendingCount" class="btn-danger" @click="showClearConfirm = true" :disabled="syncStore.syncing">
            Clear queue
          </button>
        </div>
      </div>

      <!-- Error Banner -->
      <div v-if="syncStore.lastSyncError" class="error-banner" role="alert">
        {{ syncStore.lastSyncError }}
      </div>

      <!-- Failed Items -->
      <div v-if="failedItems.length" class="card section">
        <div class="section-head">
          <h3 class="section-title">Failed</h3>
          <span class="pill pill--failed">{{ failedItems.length }}</span>
        </div>
        <div class="queue-list">
          <div v-for="item in failedItems" :key="item.id" class="queue-item queue-item--failed">
            <div class="queue-item-info">
              <div class="queue-title-row">
                <span class="queue-action">{{ describeItem(item) }}</span>
                <span class="pill pill--failed">Failed</span>
                <span v-if="item.retries" class="pill pill--retries">{{ item.retries }} retries</span>
              </div>
              <span v-if="describeDetail(item)" class="queue-table">{{ describeDetail(item) }}</span>
              <span v-if="item.lastError" class="queue-error">{{ item.lastError }}</span>
            </div>
            <div class="queue-item-meta">
              <span class="queue-time">{{ formatTime(item.created_at) }}</span>
              <button class="btn-remove" @click="handleRemoveItem(item.id)">Remove</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Pending Items -->
      <div v-if="pendingItems.length" class="card section">
        <div class="section-head">
          <h3 class="section-title">Waiting to sync</h3>
          <span class="pill pill--pending">{{ pendingItems.length }}</span>
        </div>
        <div class="queue-list">
          <div v-for="item in pendingItems" :key="item.id" class="queue-item">
            <div class="queue-item-info">
              <div class="queue-title-row">
                <span class="queue-action">{{ describeItem(item) }}</span>
                <span class="pill pill--pending">Pending</span>
                <span v-if="item.retries" class="pill pill--retries">{{ item.retries }} retries</span>
              </div>
              <span v-if="describeDetail(item)" class="queue-table">{{ describeDetail(item) }}</span>
              <span v-if="item.lastError" class="queue-error">{{ item.lastError }}</span>
            </div>
            <div class="queue-item-meta">
              <span class="queue-time">{{ formatTime(item.created_at) }}</span>
              <button class="btn-remove" @click="handleRemoveItem(item.id)">Remove</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="!syncStore.pendingCount && !syncStore.syncing" class="card empty-state">
        <span class="empty-icon" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </span>
        <h3>Everything is synced</h3>
        <p>No changes waiting to upload. Anything you change offline waits here until it syncs.</p>
      </div>

      <!-- App Version Card -->
      <div class="card version-card">
        <div class="version-row">
          <div class="version-copy">
            <span class="status-label">App version</span>
            <span class="version-value num">v{{ APP_VERSION }}</span>
          </div>
          <button class="btn-small" @click="handleCheckForUpdate" :disabled="checkingUpdate || !online">
            {{ checkingUpdate ? 'Checking...' : 'Check for update' }}
          </button>
        </div>
        <p v-if="updateStatus" class="version-status">
          {{ updateStatus }}
          <button v-if="updateAvailable" class="btn-primary btn-reload" @click="handleReloadNow">Reload now</button>
        </p>
      </div>

      <!-- Cache Status Card -->
      <div class="card cache-card">
        <div class="cache-header">
          <h3 class="section-title">Offline cache</h3>
          <button class="btn-small" @click="handleRefreshAppCache" :disabled="refreshingCache">
            {{ refreshingCache ? 'Downloading...' : 'Download for offline' }}
          </button>
        </div>
        <p class="cache-hint">
          Pulls every page and data table into the device cache so the whole app
          works without a connection. Run this once on a good connection before going offline.
        </p>
        <div class="cache-grid">
          <div v-for="entry in cacheEntries" :key="entry.key" class="cache-item">
            <span class="cache-name">{{ entry.label }}</span>
            <span class="cache-time" :class="{ stale: !entry.lastCached }">{{ cacheAge(entry.lastCached) }}</span>
          </div>
        </div>
        <div class="cache-footer">
          <span class="cache-sw-info">App cache: <span class="num">{{ syncStore.swCacheInfo.totalCached }}</span> files (v{{ syncStore.swCacheInfo.version || '?' }})</span>
          <button class="btn-small btn-force" @click="handleForceEverything" :disabled="refreshingCache || syncStore.syncing">
            Sync + cache everything
          </button>
        </div>
        <p v-if="cacheStatusMsg" class="cache-result">{{ cacheStatusMsg }}</p>
      </div>

      <ConfirmDialog
        v-if="showClearConfirm"
        title="Clear sync queue"
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
  gap: 18px;
  min-width: 0;
}

/* Soft status pills */
.pill {
  --tone: var(--text-muted);
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  font-size: 0.74rem;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
  flex-shrink: 0;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 14%, transparent);
}

.pill--pending { --tone: var(--warning); }
.pill--failed { --tone: var(--expense); }
.pill--retries { --tone: var(--info); }

/* Connection banner */
.connection-banner {
  --tone: var(--income);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 18px;
  border-radius: var(--radius-pill);
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 12%, transparent);
}

.connection-banner.offline {
  --tone: var(--warning);
}

.connection-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--tone);
}

/* Status card */
.status-card {
  padding: 24px;
  border-radius: var(--radius-lg);
  background: var(--bg-accent), var(--bg-secondary);
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 12px 16px;
  margin-bottom: 20px;
}

.status-copy,
.version-copy,
.status-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.status-meta {
  align-items: flex-end;
  text-align: right;
}

.status-label,
.meta-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.status-value {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  font-size: 1.9rem;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.status-value.synced { color: var(--income); }
.status-value.has-pending { color: var(--warning); }
.status-value.syncing { color: var(--info); }

.meta-value {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.status-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* Small pill buttons */
.btn-small {
  padding: 8px 16px;
  font-size: 0.82rem;
  font-weight: 700;
  border: 0;
  flex-shrink: 0;
}

.btn-force {
  color: var(--accent);
  background: var(--accent-dim);
}

.btn-force:hover {
  background: color-mix(in srgb, var(--accent) 24%, transparent);
}

/* Error banner */
.error-banner {
  padding: 12px 18px;
  border-radius: var(--radius-sm);
  color: var(--expense);
  background: color-mix(in srgb, var(--expense) 12%, transparent);
  font-size: 0.88rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}

/* Queue sections */
.section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 20px 22px 10px;
  min-width: 0;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-primary);
}

.queue-list {
  display: flex;
  flex-direction: column;
}

.queue-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  padding: 14px 0;
  min-width: 0;
}

.queue-item + .queue-item {
  border-top: 1px solid var(--border-color);
}

.queue-item-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.queue-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 8px;
  min-width: 0;
}

.queue-action {
  display: inline-block;
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.92rem;
}

.queue-action::first-letter {
  text-transform: uppercase;
}

.queue-table {
  color: var(--text-muted);
  font-size: 0.82rem;
  overflow-wrap: anywhere;
}

.queue-error {
  color: var(--expense);
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.queue-item-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.queue-time {
  color: var(--text-muted);
  font-size: 0.78rem;
  white-space: nowrap;
}

.btn-remove {
  padding: 6px 14px;
  font-size: 0.78rem;
  font-weight: 700;
  border: 0;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  flex-shrink: 0;
}

.btn-remove:hover {
  color: var(--expense);
  background: color-mix(in srgb, var(--expense) 12%, transparent);
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
  padding: 36px 20px;
}

.empty-icon {
  width: 56px;
  height: 56px;
  margin-bottom: 8px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--income);
  background: color-mix(in srgb, var(--income) 14%, transparent);
}

.empty-state h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.empty-state p {
  font-size: 0.88rem;
  color: var(--text-muted);
  max-width: 360px;
  margin: 0;
}

/* Version card */
.version-card {
  padding: 20px 22px;
}

.version-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.version-value {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

.version-status {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-color);
  font-size: 0.85rem;
  color: var(--text-secondary);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.btn-reload {
  padding: 8px 16px;
  font-size: 0.82rem;
}

/* Cache card */
.cache-card {
  padding: 22px;
}

.cache-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 12px;
  margin-bottom: 8px;
}

.cache-hint {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0 0 16px;
}

.cache-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.cache-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  min-width: 0;
}

.cache-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cache-time {
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--income);
}

.cache-time.stale {
  color: var(--text-muted);
}

.cache-footer {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.cache-sw-info {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.cache-result {
  margin-top: 12px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--income);
}

@media (max-width: 768px) {
  .status-card {
    padding: 20px;
  }

  .status-value {
    font-size: 1.55rem;
  }

  .section {
    padding: 18px 16px 8px;
  }

  .version-card,
  .cache-card {
    padding: 18px 16px;
  }

  .cache-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  /* Queue rows: details on top, time + remove underneath. */
  .queue-item {
    flex-direction: column;
    align-items: stretch;
  }

  .queue-item-meta {
    justify-content: space-between;
  }
}

@media (max-width: 420px) {
  .status-meta {
    align-items: flex-start;
    text-align: left;
  }

  .status-actions > button {
    flex: 1 1 auto;
  }
}
</style>
