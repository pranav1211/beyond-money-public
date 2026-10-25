import { defineStore } from 'pinia'
import { createCollection } from '../lib/storage/collection'
import { useTransactionsStore } from './transactions'
import { useCcExpensesStore } from './ccExpenses'

export const useLabelsStore = defineStore('labels', () => {
  // Local-first storage: IndexedDB + the storage adapter (src/lib/storage).
  const col = createCollection({ table: 'labels', cacheKey: 'labels', orderBy: [['name', 'asc']] })

  function fetchLabels(force = false) {
    return col.fetch(force)
  }

  function addLabel(payload) {
    return col.insert({ ...payload })
  }

  function updateLabel(id, payload) {
    return col.update(id, { ...payload })
  }

  // Take the label off every transaction and card expense first: the link
  // tables point at labels, and storage may refuse to delete one still in
  // use (Supabase does: transaction_labels has no ON DELETE CASCADE). Loading
  // both stores first also keeps idbSet from clobbering an unloaded cache.
  async function deleteLabel(id) {
    const transactions = useTransactionsStore()
    const ccExpenses = useCcExpensesStore()
    await Promise.all([transactions.fetchTransactions(), ccExpenses.fetchExpenses()])
    await transactions.unlinkLabel(id)
    await ccExpenses.unlinkLabel(id)
    return col.remove(id)
  }

  return {
    labels: col.items,
    loading: col.loading,
    error: col.error,
    loaded: col.loaded,
    fetchLabels,
    addLabel,
    updateLabel,
    deleteLabel,
    $reset: col.reset,
  }
})
