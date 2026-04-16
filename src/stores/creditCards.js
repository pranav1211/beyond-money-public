import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { idbGet, idbSet } from '../lib/idb'
import { useSyncStore } from './sync'

function normalizeCard(payload) {
  const clean = {
    name: payload.name?.trim() || '',
    bank: payload.bank?.trim() || '',
    last_four: payload.last_four?.trim() || '',
    credit_limit: payload.credit_limit === '' || payload.credit_limit == null ? null : Number(payload.credit_limit),
    current_balance: Number(payload.current_balance || 0),
    due_date: payload.due_date || null,
    expiry_month: payload.expiry_month || null,
  }
  if (payload.user_id) clean.user_id = payload.user_id
  return clean
}

export const useCreditCardsStore = defineStore('creditCards', () => {
  const creditCards = ref([])
  const loading = ref(false)
  const error = ref(null)
  const loaded = ref(false)

  async function fetchCreditCards(force = false) {
    if (loaded.value && !force) return creditCards.value

    if (!loaded.value) {
      const cached = await idbGet('creditCards')
      if (cached.length) {
        creditCards.value = cached
        loaded.value = true
      }
    }

    if (!navigator.onLine) { loading.value = false; return creditCards.value }

    loading.value = !loaded.value
    const { data, error: err } = await supabase.from('credit_cards').select('*').order('name')
    if (err) {
      if (!loaded.value) error.value = err.message
    } else {
      creditCards.value = data || []
      loaded.value = true
      idbSet('creditCards', creditCards.value)
    }
    loading.value = false
    return creditCards.value
  }

  async function addCreditCard(payload) {
    const normalized = normalizeCard(payload)

    const { data, error: err } = await supabase.from('credit_cards').insert(normalized).select().single()
    if (err) {
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const localEntry = { ...normalized, id: tempId }
      creditCards.value.push(localEntry)
      loaded.value = true
      idbSet('creditCards', creditCards.value)
      useSyncStore().enqueue({ table: 'credit_cards', action: 'insert', payload: normalized })
      return localEntry
    }

    creditCards.value.push(data)
    loaded.value = true
    idbSet('creditCards', creditCards.value)
    return data
  }

  async function updateCreditCard(id, payload) {
    const normalized = normalizeCard(payload)
    const index = creditCards.value.findIndex(card => card.id === id)

    if (index !== -1) creditCards.value[index] = { ...creditCards.value[index], ...normalized }
    idbSet('creditCards', creditCards.value)

    const { data, error: err } = await supabase.from('credit_cards').update(normalized).eq('id', id).select().single()
    if (err) {
      useSyncStore().enqueue({ table: 'credit_cards', action: 'update', recordId: id, payload: normalized })
      return creditCards.value[index]
    }

    if (index !== -1) creditCards.value[index] = data
    idbSet('creditCards', creditCards.value)
    return data
  }

  async function deleteCreditCard(id) {
    creditCards.value = creditCards.value.filter(card => card.id !== id)
    idbSet('creditCards', creditCards.value)

    const { error: err } = await supabase.from('credit_cards').delete().eq('id', id)
    if (err && !String(id).startsWith('temp_')) {
      useSyncStore().enqueue({ table: 'credit_cards', action: 'delete', recordId: id })
    }
  }

  function $reset() {
    creditCards.value = []
    loading.value = false
    error.value = null
    loaded.value = false
  }

  return { creditCards, loading, error, loaded, fetchCreditCards, addCreditCard, updateCreditCard, deleteCreditCard, $reset }
})
