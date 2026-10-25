import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAccountsStore } from './accounts'
import { useSyncStore } from './sync'
import { idbGet, idbSet } from '../lib/idb'
import { inDefault, defaultCurrencyCode } from '../lib/money'

// Stable client-side id so a queued insert is idempotent: if the sync retry
// fires a second time (the first network attempt failed *after* the server
// committed), the upsert lands on the same primary key instead of minting a
// duplicate row. See sync.js executeOperation('insert').
function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function normalizeTransaction(payload) {
  const normalized = {
    ...payload,
    amount: Number(payload.amount || 0),
    amount_default: Number(payload.amount_default ?? payload.amount_inr ?? 0),
    default_currency: payload.default_currency || defaultCurrencyCode(),
    description: payload.description?.trim() || '',
    notes: payload.notes?.trim() || null,
    account_id: payload.account_id || null,
    credit_card_id: payload.credit_card_id || null,
    category_id: payload.category_id || null,
    borrower_name: payload.borrower_name?.trim() || null,
    loan_id: payload.loan_id || null,
  }

  // Drop legacy field if present so we don't write it back to Supabase.
  delete normalized.amount_inr

  if (normalized.type === 'transfer' || normalized.type === 'lend' || normalized.type === 'lend_repayment') {
    normalized.category_id = null
  }
  if (normalized.type !== 'lend' && normalized.type !== 'lend_repayment') {
    normalized.borrower_name = null
    normalized.loan_id = null
  }
  if (normalized.type === 'lend') {
    normalized.loan_id = null
  }

  // Every income/expense must carry a category — the manual form enforces it and
  // the automated investing flows assign one. A null here means a new code path
  // slipped through; surface it loudly in dev rather than writing an
  // uncategorized row that pollutes the reports.
  if ((normalized.type === 'income' || normalized.type === 'expense') && !normalized.category_id) {
    console.warn('[transactions] income/expense written without a category:', normalized.description || '(no description)')
  }

  return normalized
}

function getAccountDelta(tx) {
  if (!tx.account_id) return 0
  const base = inDefault(tx)
  if (tx.type === 'income') return Number(base || 0)
  if (tx.type === 'expense') return -Number(base || 0)
  if (tx.type === 'lend') return -Number(base || 0)
  if (tx.type === 'lend_repayment') return Number(base || 0)
  if (tx.type === 'transfer') {
    if (tx.notes === 'transfer_out') return -Number(base || 0)
    if (tx.notes === 'transfer_in') return Number(base || 0)
  }
  return 0
}

function applyLocalFilters(txns, filters) {
  let result = txns
  if (filters.month) {
    const start = `${filters.month}-01`
    const [year, month] = filters.month.split('-').map(Number)
    const end = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`
    result = result.filter(tx => tx.date >= start && tx.date < end)
  } else if (filters.year) {
    const start = `${filters.year}-01-01`
    const end = `${Number(filters.year) + 1}-01-01`
    result = result.filter(tx => tx.date >= start && tx.date < end)
  } else if (filters.month_only) {
    const m = String(filters.month_only).padStart(2, '0')
    result = result.filter(tx => typeof tx.date === 'string' && tx.date.slice(5, 7) === m)
  }
  if (filters.account_id) result = result.filter(tx => tx.account_id === filters.account_id)
  if (filters.category_id) result = result.filter(tx => tx.category_id === filters.category_id)
  if (filters.type) result = result.filter(tx => tx.type === filters.type)
  if (filters.label_id) {
    result = result.filter(tx =>
      tx.transaction_labels?.some(label => label.label_id === filters.label_id)
    )
  }
  return result
}

export const useTransactionsStore = defineStore('transactions', () => {
  const transactions = ref([])
  const loading = ref(false)
  const error = ref(null)
  const loaded = ref(false)

  async function fetchTransactions(filters = {}, force = false) {
    const hasFilters = Object.keys(filters).length > 0
    if (loaded.value && !force && !hasFilters) return transactions.value

    // Always load from IndexedDB first
    if (!loaded.value) {
      const cached = await idbGet('transactions')
      if (cached.length) {
        transactions.value = cached
        loaded.value = true
      }
    }

    // Offline: use IDB data only, apply filters client-side
    if (!navigator.onLine) {
      if (hasFilters) {
        const allCached = await idbGet('transactions')
        transactions.value = applyLocalFilters(allCached.length ? allCached : transactions.value, filters)
      } else if (force) {
        // A forced unfiltered read wants the FULL history (loan maths, net
        // worth). Memory may hold a month-filtered subset left by another
        // screen, so restore the full cached copy.
        const allCached = await idbGet('transactions')
        if (allCached.length) transactions.value = allCached
      }
      loading.value = false
      return transactions.value
    }

    // Online: push any queued offline writes FIRST, then read — so the server
    // response already includes them and the overwrite below can't drop an
    // un-pushed record. "Do pending items, then proceed."
    const sync = useSyncStore()
    await sync.flushPending()

    loading.value = !loaded.value
    error.value = null

    let query = supabase
      .from('transactions')
      .select('*, transaction_labels(label_id), categories(name, color), accounts(name, currency)')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })

    if (filters.month) {
      const start = `${filters.month}-01`
      const [year, month] = filters.month.split('-').map(Number)
      const nextMonth = month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`

      query = query.gte('date', start).lt('date', nextMonth)
    } else if (filters.year) {
      const start = `${filters.year}-01-01`
      const nextYear = `${Number(filters.year) + 1}-01-01`
      query = query.gte('date', start).lt('date', nextYear)
    }
    if (filters.account_id) query = query.eq('account_id', filters.account_id)
    if (filters.category_id) query = query.eq('category_id', filters.category_id)
    if (filters.type) query = query.eq('type', filters.type)

    const { data, error: err } = await query
    if (err) {
      if (!loaded.value) error.value = err.message
    } else {
      let result = data || []
      if (filters.month_only) {
        const m = String(filters.month_only).padStart(2, '0')
        result = result.filter(tx => typeof tx.date === 'string' && tx.date.slice(5, 7) === m)
      }
      if (filters.label_id) {
        result = result.filter(transaction =>
          transaction.transaction_labels?.some(label => label.label_id === filters.label_id)
        )
      }
      // Safety net: if a queued insert still hasn't reached the server (e.g. the
      // flush above failed on a flaky reconnect), keep the un-synced local temp
      // rows so this overwrite can't drop them. Once the insert syncs there's no
      // pending insert left, so the temp rows fall away and the real server rows
      // take over — no duplicates.
      if (!hasFilters) {
        const localTemps = transactions.value.filter(tx => String(tx.id).startsWith('temp_'))
        const hasPendingInsert = sync.pending.some(op => op.table === 'transactions' && op.action === 'insert')
        if (localTemps.length && hasPendingInsert) {
          const serverIds = new Set(result.map(tx => tx.id))
          result = [...localTemps.filter(tx => !serverIds.has(tx.id)), ...result]
        }
      }
      transactions.value = result
      if (!hasFilters) {
        loaded.value = true
        idbSet('transactions', transactions.value)
      }
    }

    loading.value = false
    return transactions.value
  }

  // Offline write path: store to IDB + queue, update balances locally.
  // No network call is attempted — the caller already knows we're offline.
  async function addTransactionOffline(txData, labels) {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const localEntry = { ...txData, id: tempId, created_at: new Date().toISOString(), transaction_labels: labels.map(label_id => ({ label_id })) }
    transactions.value.unshift(localEntry)
    // Await both so the write is durably persisted (cache + queue) before we
    // return — a reconnect that fires right after must find the queued op.
    await idbSet('transactions', transactions.value)
    await useSyncStore().enqueue({ table: 'transactions', action: 'insert', payload: txData, _labels: labels })

    const accountDelta = getAccountDelta(txData)
    if (accountDelta) {
      const accountsStore = useAccountsStore()
      await accountsStore.updateBalance(txData.account_id, accountDelta)
    }

    loaded.value = true
    return localEntry
  }

  async function addTransaction(payload) {
    const { labels = [], ...rest } = payload
    const txData = normalizeTransaction(rest)
    // Assign the real PK up front (online and offline) so the insert is
    // idempotent on retry — no duplicate rows from a re-fired queue op.
    if (!txData.id) txData.id = newId()

    // Offline: don't touch the network — write locally and queue immediately.
    if (!navigator.onLine) return addTransactionOffline(txData, labels)

    const { data, error: err } = await supabase
      .from('transactions')
      .insert(txData)
      .select('*, transaction_labels(label_id), categories(name, color), accounts(name, currency)')
      .single()

    if (err) {
      // Network said online but the write still failed — fall back to queue.
      return addTransactionOffline(txData, labels)
    }

    if (labels.length) {
      const { error: labelsError } = await supabase.from('transaction_labels').insert(
        labels.map(label_id => ({ transaction_id: data.id, label_id }))
      )
      if (labelsError) throw labelsError
    }

    const accountDelta = getAccountDelta(txData)
    if (accountDelta) {
      const accountsStore = useAccountsStore()
      await accountsStore.updateBalance(txData.account_id, accountDelta)
    }

    transactions.value.unshift({ ...data, transaction_labels: labels.map(label_id => ({ label_id })) })
    loaded.value = true
    idbSet('transactions', transactions.value)
    return data
  }

  async function updateTransactionOffline(id, txData, labels, existing, oldAccountDelta, newAccountDelta) {
    const index = transactions.value.findIndex(transaction => transaction.id === id)
    if (index !== -1) {
      transactions.value[index] = { ...transactions.value[index], ...txData, transaction_labels: labels.map(label_id => ({ label_id })) }
    }
    await idbSet('transactions', transactions.value)
    await useSyncStore().enqueue({ table: 'transactions', action: 'update', recordId: id, payload: txData, _labels: labels })

    const accountsStore = useAccountsStore()
    if (existing?.account_id && (existing.account_id !== txData.account_id || oldAccountDelta !== newAccountDelta)) {
      await accountsStore.updateBalance(existing.account_id, -oldAccountDelta)
    }
    if (txData.account_id && (!existing || existing.account_id !== txData.account_id || oldAccountDelta !== newAccountDelta)) {
      await accountsStore.updateBalance(txData.account_id, newAccountDelta)
    }

    return transactions.value[index]
  }

  async function updateTransaction(id, payload) {
    const existing = transactions.value.find(transaction => transaction.id === id)
    const { labels = [], ...rest } = payload
    const txData = normalizeTransaction(rest)

    const oldAccountDelta = existing ? getAccountDelta(existing) : 0
    const newAccountDelta = getAccountDelta(txData)

    // Offline: update locally + queue, never hit the network.
    if (!navigator.onLine) return updateTransactionOffline(id, txData, labels, existing, oldAccountDelta, newAccountDelta)

    const { data, error: err } = await supabase
      .from('transactions')
      .update(txData)
      .eq('id', id)
      .select('*, transaction_labels(label_id), categories(name, color), accounts(name, currency)')
      .single()

    if (err) {
      return updateTransactionOffline(id, txData, labels, existing, oldAccountDelta, newAccountDelta)
    }

    const accountsStore = useAccountsStore()

    if (existing?.account_id && (existing.account_id !== txData.account_id || oldAccountDelta !== newAccountDelta)) {
      await accountsStore.updateBalance(existing.account_id, -oldAccountDelta)
    }
    if (txData.account_id && (!existing || existing.account_id !== txData.account_id || oldAccountDelta !== newAccountDelta)) {
      await accountsStore.updateBalance(txData.account_id, newAccountDelta)
    }

    await supabase.from('transaction_labels').delete().eq('transaction_id', id)
    if (labels.length) {
      const { error: labelsError } = await supabase.from('transaction_labels').insert(
        labels.map(label_id => ({ transaction_id: id, label_id }))
      )
      if (labelsError) throw labelsError
    }

    const index = transactions.value.findIndex(transaction => transaction.id === id)
    if (index !== -1) transactions.value[index] = { ...data, transaction_labels: labels.map(label_id => ({ label_id })) }
    idbSet('transactions', transactions.value)

    return data
  }

  async function deleteTransaction(id) {
    const transaction = transactions.value.find(tx => tx.id === id)
    if (!transaction) return

    // Update account balances locally first
    const accountDelta = getAccountDelta(transaction)
    if (accountDelta) {
      const accountsStore = useAccountsStore()
      await accountsStore.updateBalance(transaction.account_id, -accountDelta)
    }

    // Remove locally immediately
    transactions.value = transactions.value.filter(tx => tx.id !== id)
    idbSet('transactions', transactions.value)

    const isTemp = String(id).startsWith('temp_')

    // Offline: queue the delete (real records only) and skip the network.
    if (!navigator.onLine) {
      if (!isTemp) await useSyncStore().enqueue({ table: 'transactions', action: 'delete', recordId: id })
      return
    }

    // Try remote delete
    await supabase.from('transaction_labels').delete().eq('transaction_id', id)
    const { error: err } = await supabase.from('transactions').delete().eq('id', id)
    if (err && !isTemp) {
      useSyncStore().enqueue({ table: 'transactions', action: 'delete', recordId: id })
    }
  }

  function getRunningBalance(txns) {
    const sorted = [...txns].sort((a, b) => {
      const dateDiff = new Date(a.date) - new Date(b.date)
      if (dateDiff !== 0) return dateDiff
      return new Date(a.created_at) - new Date(b.created_at)
    })
    let balance = 0
    const withBalance = sorted.map(transaction => {
      const value = inDefault(transaction)
      if (transaction.type === 'income') balance += Number(value || 0)
      else if (transaction.type === 'expense') balance -= Number(value || 0)
      return { ...transaction, running_balance: balance }
    })
    return withBalance.reverse()
  }

  function $reset() {
    transactions.value = []
    loading.value = false
    error.value = null
    loaded.value = false
  }

  return {
    transactions,
    loading,
    error,
    loaded,
    fetchTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    getRunningBalance,
    $reset,
  }
})
