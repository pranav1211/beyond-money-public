import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { idbGet, idbSet } from '../lib/idb'
import { useSyncStore } from './sync'

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
  }
}

export const useSubscriptionsStore = defineStore('subscriptions', () => {
  const subscriptions = ref([])
  const loading = ref(false)
  const error = ref(null)
  const loaded = ref(false)

  async function fetchSubscriptions(force = false) {
    if (loaded.value && !force) return subscriptions.value

    if (!loaded.value) {
      const cached = await idbGet('subscriptions')
      if (cached.length) {
        subscriptions.value = cached
        loaded.value = true
      }
    }

    if (!navigator.onLine) { loading.value = false; return subscriptions.value }

    loading.value = !loaded.value
    const { data, error: err } = await supabase.from('subscriptions').select('*').order('next_payment_date').order('service_name')
    if (err) {
      if (!loaded.value) error.value = err.message
    } else {
      subscriptions.value = data || []
      loaded.value = true
      idbSet('subscriptions', subscriptions.value)
    }
    loading.value = false
    return subscriptions.value
  }

  async function addSubscription(payload) {
    const normalized = normalizeSubscription(payload)

    const { data, error: err } = await supabase.from('subscriptions').insert(normalized).select().single()
    if (err) {
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const localEntry = { ...normalized, id: tempId }
      subscriptions.value.push(localEntry)
      loaded.value = true
      idbSet('subscriptions', subscriptions.value)
      useSyncStore().enqueue({ table: 'subscriptions', action: 'insert', payload: normalized })
      return localEntry
    }

    subscriptions.value.push(data)
    loaded.value = true
    idbSet('subscriptions', subscriptions.value)
    return data
  }

  async function updateSubscription(id, payload) {
    const normalized = normalizeSubscription(payload)
    const index = subscriptions.value.findIndex(entry => entry.id === id)

    if (index !== -1) subscriptions.value[index] = { ...subscriptions.value[index], ...normalized }
    idbSet('subscriptions', subscriptions.value)

    const { data, error: err } = await supabase.from('subscriptions').update(normalized).eq('id', id).select().single()
    if (err) {
      useSyncStore().enqueue({ table: 'subscriptions', action: 'update', recordId: id, payload: normalized })
      return subscriptions.value[index]
    }

    if (index !== -1) subscriptions.value[index] = data
    idbSet('subscriptions', subscriptions.value)
    return data
  }

  async function deleteSubscription(id) {
    subscriptions.value = subscriptions.value.filter(entry => entry.id !== id)
    idbSet('subscriptions', subscriptions.value)

    const { error: err } = await supabase.from('subscriptions').delete().eq('id', id)
    if (err && !String(id).startsWith('temp_')) {
      useSyncStore().enqueue({ table: 'subscriptions', action: 'delete', recordId: id })
    }
  }

  function $reset() {
    subscriptions.value = []
    loading.value = false
    error.value = null
    loaded.value = false
  }

  return { subscriptions, loading, error, loaded, fetchSubscriptions, addSubscription, updateSubscription, deleteSubscription, $reset }
})
