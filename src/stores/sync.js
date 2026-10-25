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

const DATA_TABLES = ['accounts', 'transactions', 'creditCards', 'assets', 'subscriptions', 'categories', 'labels', 'ccExpenses', 'currencies']

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

  // Drain queued offline writes BEFORE any read overwrites the local cache.
  // Reads do `idbSet` (clear + rewrite the whole store), so pulling server data
  // while a write is still queued would wipe the un-pushed local record. Stores
  // call this at the top of their online fetch path: push first, then read, so
  // the fetched data already contains the writes. Cheap no-op when nothing is
  // queued; resilient so a sync failure never blocks the read.
  async function flushPending() {
    if (!navigator.onLine) return
    try {
      const items = await syncQueueGetAll()
      if (!items.length) return
      await processQueue()
    } catch {
      // never let a sync hiccup break a read
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
      { useCurrenciesStore },
    ] = await Promise.all([
      import('./accounts'),
      import('./transactions'),
      import('./creditCards'),
      import('./assets'),
      import('./subscriptions'),
      import('./categories'),
      import('./labels'),
      import('./ccExpenses'),
      import('./currencies'),
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
      useCurrenciesStore().fetchCurrencies(true),
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

  // User-triggered "check for new app version" — refetches sw.js, then
  // compares the current SW's build ID against our bundle's build ID.
  // Returns { status: 'no-update' | 'update-pending' | 'unsupported' }
  // so the UI can give actionable feedback (no silent failures).
  async function checkForAppUpdate() {
    if (!('serviceWorker' in navigator)) return { status: 'unsupported' }
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return { status: 'unsupported' }

    try { await reg.update() } catch {}

    // If an installing/waiting worker is now sitting there, an update
    // is queued. Ask it to skipWaiting so it activates → controllerchange
    // → main.js reloads when the tab next becomes hidden.
    const pending = reg.installing || reg.waiting
    if (pending) {
      try { pending.postMessage({ type: 'SKIP_WAITING' }) } catch {}
      return { status: 'update-pending' }
    }

    // Belt-and-suspenders: ask the active SW for its build ID and compare
    // against ours. If they diverge, the SW updated past us already.
    const ctrl = navigator.serviceWorker.controller
    if (!ctrl) return { status: 'no-update' }

    const { BUILD_ID } = await import('../version')
    const swBuildId = await new Promise((resolve) => {
      const handler = (event) => {
        if (event.data?.type !== 'VERSION') return
        navigator.serviceWorker.removeEventListener('message', handler)
        resolve(event.data.buildId || null)
      }
      navigator.serviceWorker.addEventListener('message', handler)
      try { ctrl.postMessage({ type: 'GET_VERSION' }) } catch { resolve(null) }
      setTimeout(() => { navigator.serviceWorker.removeEventListener('message', handler); resolve(null) }, 2000)
    })

    if (swBuildId && swBuildId !== BUILD_ID) return { status: 'update-pending' }
    return { status: 'no-update' }
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
    flushPending,
    forceSync,
    forceSyncAll,
    clearQueue,
    removePendingItem,
    refreshSwCacheInfo,
    refreshAppCache,
    checkForAppUpdate,
  }
})

async function executeOperation(item) {
  const { table, action, payload, id: _queueId, ...rest } = item
  const recordId = rest.recordId

  switch (action) {
    case 'insert': {
      // When the payload carries a client-generated PK, upsert with
      // ignoreDuplicates so a retried op (first attempt failed *after* the
      // server committed) is a no-op instead of inserting a duplicate row.
      // Payloads without an id fall back to a plain insert (server mints the PK).
      let recordPk = payload?.id || null
      if (recordPk) {
        const { error } = await supabase.from(table).upsert(payload, { onConflict: 'id', ignoreDuplicates: true })
        if (error) throw error
      } else {
        const { data, error } = await supabase.from(table).insert(payload).select().single()
        if (error) throw error
        recordPk = data?.id
      }
      // Sync labels for transactions (composite PK → duplicate inserts no-op).
      if (table === 'transactions' && rest._labels?.length && recordPk) {
        await supabase.from('transaction_labels').insert(
          rest._labels.map(label_id => ({ transaction_id: recordPk, label_id }))
        ).catch(() => {})
      }
      if (table === 'cc_expenses' && rest._labels?.length && recordPk) {
        await supabase.from('cc_expense_labels').insert(
          rest._labels.map(label_id => ({ cc_expense_id: recordPk, label_id }))
        ).catch(() => {})
      }
      break
    }
    case 'update': {
      const { error } = await supabase.from(table).update(payload).eq('id', recordId)
      if (error) throw error
      if (table === 'cc_expenses' && Array.isArray(rest._labels)) {
        await supabase.from('cc_expense_labels').delete().eq('cc_expense_id', recordId).catch(() => {})
        if (rest._labels.length) {
          await supabase.from('cc_expense_labels').insert(
            rest._labels.map(label_id => ({ cc_expense_id: recordId, label_id }))
          ).catch(() => {})
        }
      }
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
