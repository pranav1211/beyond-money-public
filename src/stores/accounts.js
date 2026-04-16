import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { idbGet, idbSet } from '../lib/idb'
import { useSyncStore } from './sync'

function normalizeAccount(payload) {
  return {
    ...payload,
    name: payload.name?.trim() || '',
    currency: payload.currency || 'INR',
    current_balance: Number(payload.current_balance || 0),
    is_active: payload.is_active ?? true,
  }
}

export const useAccountsStore = defineStore('accounts', () => {
  const accounts = ref([])
  const loading = ref(false)
  const error = ref(null)
  const loaded = ref(false)

  async function fetchAccounts(force = false) {
    if (loaded.value && !force) return accounts.value

    // Load from IndexedDB first for instant display
    if (!loaded.value) {
      const cached = await idbGet('accounts')
      if (cached.length) {
        accounts.value = cached
        loaded.value = true
      }
    }

    if (!navigator.onLine) { loading.value = false; return accounts.value }

    loading.value = !loaded.value
    const { data, error: err } = await supabase.from('accounts').select('*').order('name')
    if (err) {
      if (!loaded.value) error.value = err.message
    } else {
      accounts.value = data || []
      loaded.value = true
      idbSet('accounts', accounts.value)
    }
    loading.value = false
    return accounts.value
  }

  async function addAccount(payload) {
    const normalized = normalizeAccount(payload)

    // Try Supabase first
    const { data, error: err } = await supabase.from('accounts').insert(normalized).select().single()
    if (err) {
      // Offline: create temp local entry and queue
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const localEntry = { ...normalized, id: tempId }
      accounts.value.push(localEntry)
      loaded.value = true
      idbSet('accounts', accounts.value)
      useSyncStore().enqueue({ table: 'accounts', action: 'insert', payload: normalized })
      return localEntry
    }

    accounts.value.push(data)
    loaded.value = true
    idbSet('accounts', accounts.value)
    return data
  }

  async function updateAccount(id, payload) {
    const normalized = normalizeAccount(payload)
    const index = accounts.value.findIndex(account => account.id === id)

    // Update local state immediately
    if (index !== -1) accounts.value[index] = { ...accounts.value[index], ...normalized }
    idbSet('accounts', accounts.value)

    // Try Supabase
    const { data, error: err } = await supabase.from('accounts').update(normalized).eq('id', id).select().single()
    if (err) {
      // Queue for retry - local state already updated
      useSyncStore().enqueue({ table: 'accounts', action: 'update', recordId: id, payload: normalized })
      return accounts.value[index]
    }

    if (index !== -1) accounts.value[index] = data
    idbSet('accounts', accounts.value)
    return data
  }

  async function deleteAccount(id) {
    // Update local state immediately
    const prev = [...accounts.value]
    accounts.value = accounts.value.filter(account => account.id !== id)
    idbSet('accounts', accounts.value)

    const { error: err } = await supabase.from('accounts').delete().eq('id', id)
    if (err) {
      // Queue for retry if it's a real server record (not temp)
      if (!String(id).startsWith('temp_')) {
        useSyncStore().enqueue({ table: 'accounts', action: 'delete', recordId: id })
      }
    }
  }

  async function updateBalance(id, delta) {
    const account = accounts.value.find(entry => entry.id === id)
    if (!account) return
    const nextBalance = Number(account.current_balance || 0) + Number(delta || 0)
    await updateAccount(id, { ...account, current_balance: nextBalance })
  }

  function $reset() {
    accounts.value = []
    loading.value = false
    error.value = null
    loaded.value = false
  }

  return { accounts, loading, error, loaded, fetchAccounts, addAccount, updateAccount, deleteAccount, updateBalance, $reset }
})
