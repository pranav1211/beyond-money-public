import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase'
import {
  syncQueueAdd,
  syncQueueGetAll,
  syncQueueRemove,
  syncQueueUpdate,
  syncQueueClear,
  syncMetaGet,
  syncMetaSet,
} from '../lib/idb'

const MAX_RETRIES = 5

const DATA_TABLES = ['accounts', 'transactions', 'creditCards', 'assets', 'subscriptions', 'categories', 'labels', 'ccExpenses']

export const useSyncStore = defineStore('sync', () => {
  const pending = ref([])
  const syncing = ref(false)
  const lastSyncTime = ref(null)
  const lastSyncError = ref(null)
  const dataCacheTimes = ref({})
  const swCacheInfo = ref({ totalCached: 0, version: '' })

  const pendingCount = computed(() => pending.value.length)

  async function loadState() {
    pending.value = await syncQueueGetAll()
    lastSyncTime.value = await syncMetaGet('lastSyncTime')
    const cached = await syncMetaGet('dataCacheTimes')
    if (cached) dataCacheTimes.value = cached
    await refreshSwCacheInfo()
  }

  async function refreshSwCacheInfo() {
    if (!navigator.serviceWorker?.controller) return
    return new Promise((resolve) => {
      const handler = (event) => {
        if (event.data?.type === 'CACHE_STATUS') {
          swCacheInfo.value = { totalCached: event.data.totalCached, version: event.data.version }
          navigator.serviceWorker.removeEventListener('message', handler)
          resolve()
        }
      }
      navigator.serviceWorker.addEventListener('message', handler)
      navigator.serviceWorker.controller.postMessage({ type: 'GET_CACHE_STATUS' })
      setTimeout(() => { navigator.serviceWorker.removeEventListener('message', handler); resolve() }, 3000)
    })
  }

  let _processPromise = null

  async function enqueue(operation) {
    const id = await syncQueueAdd(operation)
    if (id != null) {
      pending.value = await syncQueueGetAll()
    }
    // Try to process immediately in background (only if online)
    if (navigator.onLine) processQueue()
  }

  async function processQueue() {
    // If already processing, wait for the existing run to finish
    if (_processPromise) return _processPromise
    _processPromise = _runProcessQueue()
    try {
      await _processPromise
    } finally {
      _processPromise = null
    }
  }

  async function _runProcessQueue() {
    if (!navigator.onLine) return
    syncing.value = true
    lastSyncError.value = null

    // Refresh auth session before syncing — expired tokens cause first operation to fail
    try { await supabase.auth.getSession() } catch {}

    const items = await syncQueueGetAll()
    let hadFailure = false

    for (const item of items) {
      try {
        await executeOperation(item)
        await syncQueueRemove(item.id)
      } catch (err) {
        // Retry once — the first failure may have triggered a token refresh
        try {
          await executeOperation(item)
          await syncQueueRemove(item.id)
        } catch (retryErr) {
          hadFailure = true
          const newRetries = (item.retries || 0) + 1
          if (newRetries >= MAX_RETRIES) {
            await syncQueueUpdate(item.id, { retries: newRetries, lastError: retryErr.message, failed: true })
          } else {
            await syncQueueUpdate(item.id, { retries: newRetries, lastError: retryErr.message })
          }
        }
      }
    }

    const now = Date.now()
    await syncMetaSet('lastSyncTime', now)
    lastSyncTime.value = now

    if (hadFailure) {
      lastSyncError.value = 'Some items failed to sync'
    }

    pending.value = await syncQueueGetAll()
    syncing.value = false
  }

  async function forceSync() {
    // Reset retry counts for failed items
    const items = await syncQueueGetAll()
    for (const item of items) {
      if (item.failed) {
        await syncQueueUpdate(item.id, { retries: 0, failed: false, lastError: null })
      }
    }
    pending.value = await syncQueueGetAll()
    // Force a fresh run even if one was in progress
    _processPromise = null
    await processQueue()
  }

  async function forceSyncAll() {
    // Process pending queue first
    await forceSync()

    // Force re-fetch all data from Supabase (dynamic to avoid circular deps)
    const [
      { useAccountsStore },
      { useTransactionsStore },
      { useCreditCardsStore },
      { useAssetsStore },
      { useSubscriptionsStore },
      { useCategoriesStore },
      { useLabelsStore },
      { useCcExpensesStore },
    ] = await Promise.all([
      import('./accounts'),
      import('./transactions'),
      import('./creditCards'),
      import('./assets'),
      import('./subscriptions'),
      import('./categories'),
      import('./labels'),
      import('./ccExpenses'),
    ])

    const results = await Promise.allSettled([
      useAccountsStore().fetchAccounts(true),
      useTransactionsStore().fetchTransactions({}, true),
      useCreditCardsStore().fetchCreditCards(true),
      useCcExpensesStore().fetchExpenses(true),
      useAssetsStore().fetchAssets(true),
      useSubscriptionsStore().fetchSubscriptions(true),
      useCategoriesStore().fetchCategories(true),
      useLabelsStore().fetchLabels(true),
    ])

    const now = Date.now()
    const times = { ...dataCacheTimes.value }
    DATA_TABLES.forEach((table, i) => {
      if (results[i].status === 'fulfilled') times[table] = now
    })
    dataCacheTimes.value = times
    await syncMetaSet('dataCacheTimes', times)
    await syncMetaSet('lastSyncTime', now)
    lastSyncTime.value = now
    await refreshSwCacheInfo()
  }

  async function clearQueue() {
    await syncQueueClear()
    pending.value = []
  }

  async function removePendingItem(id) {
    await syncQueueRemove(id)
    pending.value = await syncQueueGetAll()
  }

  async function refreshAppCache() {
    if (!navigator.serviceWorker?.controller) return
    // Tell SW to re-cache the app shell and chunks
    navigator.serviceWorker.controller.postMessage({ type: 'REFRESH_APP_CACHE' })
    await new Promise(resolve => setTimeout(resolve, 2000))
    await refreshSwCacheInfo()
  }

  return {
    pending,
    syncing,
    lastSyncTime,
    lastSyncError,
    dataCacheTimes,
    swCacheInfo,
    pendingCount,
    loadState,
    enqueue,
    processQueue,
    forceSync,
    forceSyncAll,
    clearQueue,
    removePendingItem,
    refreshSwCacheInfo,
    refreshAppCache,
  }
})

async function executeOperation(item) {
  const { table, action, payload, id: _queueId, ...rest } = item
  const recordId = rest.recordId

  switch (action) {
    case 'insert': {
      const { data, error } = await supabase.from(table).insert(payload).select().single()
      if (error) throw error
      // Sync labels for transactions
      if (table === 'transactions' && rest._labels?.length && data?.id) {
        await supabase.from('transaction_labels').insert(
          rest._labels.map(label_id => ({ transaction_id: data.id, label_id }))
        ).catch(() => {})
      }
      break
    }
    case 'update': {
      const { error } = await supabase.from(table).update(payload).eq('id', recordId)
      if (error) throw error
      break
    }
    case 'delete': {
      const { error } = await supabase.from(table).delete().eq('id', recordId)
      if (error) throw error
      break
    }
    case 'upsert': {
      const { error } = await supabase.from(table).upsert(payload)
      if (error) throw error
      break
    }
    default:
      throw new Error(`Unknown sync action: ${action}`)
  }
}
