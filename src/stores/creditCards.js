import { defineStore } from 'pinia'
import { createCollection } from '../lib/storage/collection'

function normalizeCard(payload) {
  const clean = {
    name: payload.name?.trim() || '',
    bank: payload.bank?.trim() || '',
    last_four: payload.last_four?.trim() || '',
    credit_limit: payload.credit_limit === '' || payload.credit_limit == null ? null : Number(payload.credit_limit),
    current_balance: Number(payload.current_balance || 0),
    // Display-only amount already paid toward the current card spend.
    prepaid_amount: Number(payload.prepaid_amount || 0),
    currency: payload.currency || 'INR',
    due_date: payload.due_date || null,
    expiry_month: payload.expiry_month || null,
  }
  if (payload.user_id) clean.user_id = payload.user_id
  return clean
}

export const useCreditCardsStore = defineStore('creditCards', () => {
  // Local-first storage: IndexedDB + the storage adapter (src/lib/storage).
  const col = createCollection({ table: 'credit_cards', cacheKey: 'creditCards', orderBy: [['name', 'asc']] })

  function fetchCreditCards(force = false) {
    return col.fetch(force)
  }

  function addCreditCard(payload) {
    return col.insert(normalizeCard(payload))
  }

  function updateCreditCard(id, payload) {
    return col.update(id, normalizeCard(payload))
  }

  function deleteCreditCard(id) {
    return col.remove(id)
  }

  return {
    creditCards: col.items,
    loading: col.loading,
    error: col.error,
    loaded: col.loaded,
    fetchCreditCards,
    addCreditCard,
    updateCreditCard,
    deleteCreditCard,
    $reset: col.reset,
  }
})
