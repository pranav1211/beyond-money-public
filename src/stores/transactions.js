import { defineStore } from 'pinia'
import { createCollection } from '../lib/storage/collection'
import { useAccountsStore } from './accounts'
import { useCategoriesStore } from './categories'
import { inDefault, defaultCurrencyCode } from '../lib/money'

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

  // Drop legacy field if present so we don't write it back.
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

// Filters run in the browser over the full list (storage adapters only list
// whole tables). Exported for views that show a filtered slice, e.g. the
// Transactions page and the Month Report.
export function filterTransactions(txns, filters = {}) {
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

// A full refresh is reused for this long when a screen asks again with
// filters (e.g. flipping filters on the Transactions page).
const FULL_REFRESH_MS = 30000

export const useTransactionsStore = defineStore('transactions', () => {
  // Local-first storage: IndexedDB + the storage adapter (src/lib/storage).
  // `transactions` is always the FULL history, which is also what IndexedDB
  // holds. Rows carry transaction_labels: [{ label_id }] plus display names
  // (categories, accounts) attached here; those are never sent to storage.
  const col = createCollection({
    table: 'transactions',
    cacheKey: 'transactions',
    orderBy: [['date', 'desc'], ['created_at', 'desc']],
    labels: true,
    derived: ['categories', 'accounts'],
    hydrate: rows => rows.map(withNames),
  })
  const transactions = col.items
  let lastRefresh = 0

  function withNames(tx) {
    const cat = tx.category_id ? useCategoriesStore().categories.find(c => c.id === tx.category_id) : null
    const acc = tx.account_id ? useAccountsStore().accounts.find(a => a.id === tx.account_id) : null
    return {
      ...tx,
      categories: cat ? { name: cat.name, color: cat.color } : null,
      accounts: acc ? { name: acc.name, currency: acc.currency } : null,
    }
  }

  // Loads the full history (IndexedDB first, then storage when online) and
  // returns it, filtered when `filters` is given. `force` refreshes from
  // storage even if already loaded.
  async function fetchTransactions(filters = {}, force = false) {
    const hasFilters = Object.keys(filters).length > 0
    const fresh = Date.now() - lastRefresh < FULL_REFRESH_MS
    if (!col.loaded.value || force || (hasFilters && !fresh)) {
      // Names are attached from these, so load them first (cache-first, fast).
      await Promise.all([
        useCategoriesStore().fetchCategories(),
        useAccountsStore().fetchAccounts(),
      ])
      await col.fetch(true)
      if (navigator.onLine) lastRefresh = Date.now()
    }
    return hasFilters ? filterTransactions(transactions.value, filters) : transactions.value
  }

  async function addTransaction(payload) {
    const { labels = [], ...rest } = payload
    const txData = normalizeTransaction(rest)
    if (!txData.created_at) txData.created_at = new Date().toISOString()

    const saved = await col.insert(withNames(txData), { labels, prepend: true })

    const accountDelta = getAccountDelta(txData)
    if (accountDelta) await useAccountsStore().updateBalance(txData.account_id, accountDelta)
    return saved
  }

  // labels: the full label list for the row (an edit always sends all labels).
  async function updateTransaction(id, payload) {
    const existing = transactions.value.find(transaction => transaction.id === id)
    const { labels = [], ...rest } = payload
    const txData = normalizeTransaction(rest)

    const oldAccountDelta = existing ? getAccountDelta(existing) : 0
    const newAccountDelta = getAccountDelta(txData)

    const saved = await col.update(id, withNames(txData), { labels })

    const accountsStore = useAccountsStore()
    if (existing?.account_id && (existing.account_id !== txData.account_id || oldAccountDelta !== newAccountDelta)) {
      await accountsStore.updateBalance(existing.account_id, -oldAccountDelta)
    }
    if (txData.account_id && (!existing || existing.account_id !== txData.account_id || oldAccountDelta !== newAccountDelta)) {
      await accountsStore.updateBalance(txData.account_id, newAccountDelta)
    }
    return saved
  }

  async function deleteTransaction(id) {
    const transaction = transactions.value.find(tx => tx.id === id)
    if (!transaction) return

    const accountDelta = getAccountDelta(transaction)
    if (accountDelta) await useAccountsStore().updateBalance(transaction.account_id, -accountDelta)

    await col.remove(id)
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
    col.reset()
    lastRefresh = 0
  }

  return {
    transactions,
    loading: col.loading,
    error: col.error,
    loaded: col.loaded,
    fetchTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    getRunningBalance,
    $reset,
  }
})
