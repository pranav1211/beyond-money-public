import { defineStore } from 'pinia'
import { localISODate } from '../lib/dateFormat'
import { createCollection } from '../lib/storage/collection'

export const useCcExpensesStore = defineStore('ccExpenses', () => {
  // Local-first storage: IndexedDB + the storage adapter (src/lib/storage).
  // Rows carry their labels as cc_expense_labels: [{ label_id }].
  const col = createCollection({
    table: 'cc_expenses',
    cacheKey: 'ccExpenses',
    orderBy: [['date', 'desc'], ['created_at', 'desc']],
    labels: true,
  })
  const expenses = col.items

  function totalForCard(cardId) {
    return expenses.value
      .filter(e => e.credit_card_id === cardId && !e.is_paid)
      .reduce((sum, e) => sum + Number(e.amount || 0), 0)
  }

  function expensesForCard(cardId) {
    return expenses.value.filter(e => e.credit_card_id === cardId && !e.is_paid)
  }

  function paidExpensesForCard(cardId) {
    return expenses.value.filter(e => e.credit_card_id === cardId && e.is_paid)
  }

  function fetchExpenses(force = false) {
    return col.fetch(force)
  }

  function addExpense(payload) {
    const { labels = [], ...rest } = payload
    return col.insert({
      credit_card_id: rest.credit_card_id,
      user_id: rest.user_id,
      amount: Number(rest.amount || 0),
      description: (rest.description || '').trim(),
      date: rest.date || localISODate(),
      category_id: rest.category_id || null,
      is_paid: false,
    }, { labels, prepend: true })
  }

  // labels: the full new list, or omit to leave labels unchanged.
  function updateExpense(id, payload) {
    const { labels, ...rest } = payload
    return col.update(id, {
      amount: Number(rest.amount || 0),
      description: (rest.description || '').trim(),
      date: rest.date || localISODate(),
      category_id: rest.category_id ?? null,
    }, { labels: Array.isArray(labels) ? labels : undefined })
  }

  function deleteExpense(id) {
    return col.remove(id)
  }

  // Paying a card's bill archives its open expenses (kept for payment history).
  async function archiveForCard(cardId) {
    const toArchive = expenses.value.filter(e => e.credit_card_id === cardId && !e.is_paid)
    if (!toArchive.length) return
    const paidDate = localISODate()
    for (const e of toArchive) {
      e.is_paid = true
      e.paid_date = paidDate
    }
    await col.persist()
    await col.send({
      table: 'cc_expenses',
      action: 'update_batch',
      payload: { ids: toArchive.map(e => e.id), update: { is_paid: true, paid_date: paidDate } },
    })
  }

  // Deleting a card removes all of its expenses, open and archived.
  async function clearForCard(cardId) {
    const toDelete = expenses.value.filter(e => e.credit_card_id === cardId)
    for (const e of toDelete) {
      await col.remove(e.id)
    }
  }

  return {
    expenses,
    loading: col.loading,
    error: col.error,
    loaded: col.loaded,
    totalForCard,
    expensesForCard,
    paidExpensesForCard,
    fetchExpenses,
    addExpense,
    updateExpense,
    deleteExpense,
    archiveForCard,
    clearForCard,
    unlinkLabel: col.unlinkEverywhere,
    $reset: col.reset,
  }
})
