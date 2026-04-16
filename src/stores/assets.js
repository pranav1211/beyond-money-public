import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { idbGet, idbSet } from '../lib/idb'
import { useSyncStore } from './sync'

function normalizeAsset(payload) {
  return {
    ...payload,
    name: payload.name?.trim() || '',
    notes: payload.notes?.trim() || null,
    principal_amount: Number(payload.principal_amount || 0),
    current_value: Number(payload.current_value || 0),
    interest_rate: payload.interest_rate === '' || payload.interest_rate == null ? null : Number(payload.interest_rate),
    maturity_date: payload.maturity_date || null,
  }
}

export const useAssetsStore = defineStore('assets', () => {
  const assets = ref([])
  const loading = ref(false)
  const error = ref(null)
  const loaded = ref(false)

  async function fetchAssets(force = false) {
    if (loaded.value && !force) return assets.value

    if (!loaded.value) {
      const cached = await idbGet('assets')
      if (cached.length) {
        assets.value = cached
        loaded.value = true
      }
    }

    if (!navigator.onLine) { loading.value = false; return assets.value }

    loading.value = !loaded.value
    const { data, error: err } = await supabase.from('assets').select('*').order('name')
    if (err) {
      if (!loaded.value) error.value = err.message
    } else {
      assets.value = data || []
      loaded.value = true
      idbSet('assets', assets.value)
    }
    loading.value = false
    return assets.value
  }

  async function addAsset(payload) {
    const normalized = normalizeAsset(payload)

    const { data, error: err } = await supabase.from('assets').insert(normalized).select().single()
    if (err) {
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const localEntry = { ...normalized, id: tempId }
      assets.value.push(localEntry)
      loaded.value = true
      idbSet('assets', assets.value)
      useSyncStore().enqueue({ table: 'assets', action: 'insert', payload: normalized })
      return localEntry
    }

    assets.value.push(data)
    loaded.value = true
    idbSet('assets', assets.value)
    return data
  }

  async function updateAsset(id, payload) {
    const normalized = normalizeAsset(payload)
    const index = assets.value.findIndex(asset => asset.id === id)

    if (index !== -1) assets.value[index] = { ...assets.value[index], ...normalized }
    idbSet('assets', assets.value)

    const { data, error: err } = await supabase.from('assets').update(normalized).eq('id', id).select().single()
    if (err) {
      useSyncStore().enqueue({ table: 'assets', action: 'update', recordId: id, payload: normalized })
      return assets.value[index]
    }

    if (index !== -1) assets.value[index] = data
    idbSet('assets', assets.value)
    return data
  }

  async function deleteAsset(id) {
    assets.value = assets.value.filter(asset => asset.id !== id)
    idbSet('assets', assets.value)

    const { error: err } = await supabase.from('assets').delete().eq('id', id)
    if (err && !String(id).startsWith('temp_')) {
      useSyncStore().enqueue({ table: 'assets', action: 'delete', recordId: id })
    }
  }

  function $reset() {
    assets.value = []
    loading.value = false
    error.value = null
    loaded.value = false
  }

  return { assets, loading, error, loaded, fetchAssets, addAsset, updateAsset, deleteAsset, $reset }
})
