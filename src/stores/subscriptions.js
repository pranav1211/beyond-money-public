import { defineStore } from 'pinia'
import { createCollection } from '../lib/storage/collection'

function normalizeSubscription(payload) {
  return {
    ...payload,
    service_name: payload.service_name?.trim() || '',
    category: payload.category?.trim() || 'other',
    billing_cycle: payload.billing_cycle || 'monthly',
    amount: Number(payload.amount || 0),
    currency: payload.currency || 'INR',
    next_payment_date: payload.next_payment_date || null,
    notes: payload.notes?.trim() || null,
    is_active: payload.is_active ?? true,
    is_paid: payload.is_paid ?? false,
  }
}

export const useSubscriptionsStore = defineStore('subscriptions', () => {
  // Local-first storage: IndexedDB + the storage adapter (src/lib/storage).
  const col = createCollection({
    table: 'subscriptions',
    cacheKey: 'subscriptions',
    orderBy: [['next_payment_date', 'asc'], ['service_name', 'asc']],
  })

  function fetchSubscriptions(force = false) {
    return col.fetch(force)
  }

  function addSubscription(payload) {
    return col.insert(normalizeSubscription(payload))
  }

  function updateSubscription(id, payload) {
    return col.update(id, normalizeSubscription(payload))
  }

  function deleteSubscription(id) {
    return col.remove(id)
  }

  return {
    subscriptions: col.items,
    loading: col.loading,
    error: col.error,
    loaded: col.loaded,
    fetchSubscriptions,
    addSubscription,
    updateSubscription,
    deleteSubscription,
    $reset: col.reset,
  }
})
