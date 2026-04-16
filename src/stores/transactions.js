import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAccountsStore } from './accounts'
import { useSyncStore } from './sync'
import { idbGet, idbSet } from '../lib/idb'

function normalizeTransaction(payload) {
  const normalized = {
    ...payload,
    amount: Number(payload.amount || 0),
    amount_inr: Number(payload.amount_inr || 0),
    description: payload.description?.trim() || '',
    notes: payload.notes?.trim() || null,
    account_id: payload.account_id || null,
    credit_card_id: payload.credit_card_id || null,
    category_id: payload.category_id || null,
  }

  if (normalized.type === 'transfer') {
    normalized.category_id = null
  }

  return normalized
}

function getAccountDelta(tx) {
  if (!tx.account_id) return 0
  if (tx.type === 'income') return Number(tx.amount_inr || 0)
  if (tx.type === 'expense') return -Number(tx.amount_inr || 0)
  if (tx.type === 'transfer') {
    if (tx.notes === 'transfer_out') return -Number(tx.amount_inr || 0)
    if (tx.notes === 'transfer_in') return Number(tx.amount_inr || 0)
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
      }
      loading.value = false
      return transactions.value
    }

    // Online: fetch from Supabase
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
      if (filters.label_id) {
        result = result.filter(transaction =>
          transaction.transaction_labels?.some(label => label.label_id === filters.label_id)
        )
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

  async function addTransaction(payload) {
    const { labels = [], ...rest } = payload
    const txData = normalizeTransaction(rest)

    const { data, error: err } = await supabase
      .from('transactions')
      .insert(txData)
      .select('*, transaction_labels(label_id), categories(name, color), accounts(name, currency)')
      .single()

    if (err) {
      // Offline fallback: add locally and queue
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const localEntry = { ...txData, id: tempId, created_at: new Date().toISOString(), transaction_labels: labels.map(label_id => ({ label_id })) }
      transactions.value.unshift(localEntry)
      idbSet('transactions', transactions.value)
      useSyncStore().enqueue({ table: 'transactions', action: 'insert', payload: txData, _labels: labels })

      // Still update account balances locally
      const accountDelta = getAccountDelta(txData)
      if (accountDelta) {
        const accountsStore = useAccountsStore()
        await accountsStore.updateBalance(txData.account_id, accountDelta)
      }

      loaded.value = true
      return localEntry
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

  async function updateTransaction(id, payload) {
    const existing = transactions.value.find(transaction => transaction.id === id)
    const { labels = [], ...rest } = payload
    const txData = normalizeTransaction(rest)

    const oldAccountDelta = existing ? getAccountDelta(existing) : 0
    const newAccountDelta = getAccountDelta(txData)

    const { data, error: err } = await supabase
      .from('transactions')
      .update(txData)
      .eq('id', id)
      .select('*, transaction_labels(label_id), categories(name, color), accounts(name, currency)')
      .single()

    if (err) {
      // Offline: update local state and queue
      const index = transactions.value.findIndex(transaction => transaction.id === id)
      if (index !== -1) {
        transactions.value[index] = { ...transactions.value[index], ...txData, transaction_labels: labels.map(label_id => ({ label_id })) }
      }
      idbSet('transactions', transactions.value)
      useSyncStore().enqueue({ table: 'transactions', action: 'update', recordId: id, payload: txData, _labels: labels })

      // Update account balances locally
      const accountsStore = useAccountsStore()
      if (existing?.account_id && (existing.account_id !== txData.account_id || oldAccountDelta !== newAccountDelta)) {
        await accountsStore.updateBalance(existing.account_id, -oldAccountDelta)
      }
      if (txData.account_id && (!existing || existing.account_id !== txData.account_id || oldAccountDelta !== newAccountDelta)) {
        await accountsStore.updateBalance(txData.account_id, newAccountDelta)
      }

      return transactions.value[index]
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

    // Try remote delete
    await supabase.from('transaction_labels').delete().eq('transaction_id', id)
    const { error: err } = await supabase.from('transactions').delete().eq('id', id)
    if (err && !String(id).startsWith('temp_')) {
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
      if (transaction.type === 'income') balance += Number(transaction.amount_inr || 0)
      else if (transaction.type === 'expense') balance -= Number(transaction.amount_inr || 0)
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
