import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { idbGet, idbSet } from '../lib/idb'
import { useSyncStore } from './sync'

function num(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Rounding policy — kills the floating-point paise tails that made stock/asset
// figures read awkwardly and never quite tie out. Money is 2dp; per-unit cost
// keeps more precision (6dp) so quantity × unit_cost still reconstructs the
// invested amount; quantity keeps 8dp for fractional units/grams.
function round(n, dp) {
  const f = 10 ** dp
  return Math.round((Number(n) || 0) * f) / f
}
const round2 = (n) => round(n, 2)
const round6 = (n) => round(n, 6)
const round8 = (n) => round(n, 8)

function normalizeLots(raw) {
  if (!Array.isArray(raw)) return null
  const cleaned = raw
    .map(l => ({
      quantity: round8(num(l.quantity) || 0),
      unit_cost: round6(num(l.unit_cost) || 0),
      purchased_at: l.purchased_at || null,
      note: l.note || null,
    }))
    .filter(l => l.quantity > 0)
  return cleaned.length ? cleaned : null
}

function normalizeAsset(payload) {
  const lots = normalizeLots(payload.lots)

  let quantity = num(payload.quantity)
  let unitCost = num(payload.unit_cost)
  const unitPrice = num(payload.unit_price)

  // Lots take precedence — derive aggregates from them.
  if (lots) {
    quantity = round8(lots.reduce((s, l) => s + l.quantity, 0))
    const totalCost = lots.reduce((s, l) => s + l.quantity * l.unit_cost, 0)
    unitCost = quantity ? round6(totalCost / quantity) : 0
  } else if (quantity != null) {
    quantity = round8(quantity)
  }
  if (unitCost != null) unitCost = round6(unitCost)

  let principal = num(payload.principal_amount)
  let current = num(payload.current_value)
  if (lots) {
    principal = lots.reduce((s, l) => s + l.quantity * l.unit_cost, 0)
  } else if (quantity != null && unitCost != null) {
    principal = quantity * unitCost
  }
  if (quantity != null && unitPrice != null) current = quantity * unitPrice
  if (principal == null) principal = 0
  if (current == null) current = principal
  principal = round2(principal)
  current = round2(current)

  return {
    ...payload,
    name: payload.name?.trim() || '',
    notes: payload.notes?.trim() || null,
    currency: payload.currency || 'INR',
    type: payload.type || 'other',
    principal_amount: principal,
    current_value: current,
    quantity,
    unit_cost: unitCost,
    unit_price: unitPrice,
    price_updated_at: payload.price_updated_at || null,
    symbol: payload.symbol?.trim() || null,
    liquidity: payload.liquidity || null,
    provider: payload.provider?.trim() || null,
    tags: Array.isArray(payload.tags) ? payload.tags.filter(Boolean) : null,
    lots,
    interest_rate: num(payload.interest_rate),
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

    // Drain queued offline writes before reading so the fetch reflects them
    // instead of overwriting un-pushed records.
    await useSyncStore().flushPending()

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

  async function addAssetOffline(normalized) {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const localEntry = { ...normalized, id: tempId }
    assets.value.push(localEntry)
    loaded.value = true
    await idbSet('assets', assets.value)
    await useSyncStore().enqueue({ table: 'assets', action: 'insert', payload: normalized })
    return localEntry
  }

  async function addAsset(payload) {
    const normalized = normalizeAsset(payload)

    // Offline: write locally + queue, no network.
    if (!navigator.onLine) return addAssetOffline(normalized)

    const { data, error: err } = await supabase.from('assets').insert(normalized).select().single()
    if (err) return addAssetOffline(normalized)

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

    // Offline: local state already updated — queue and skip the network.
    if (!navigator.onLine) {
      await useSyncStore().enqueue({ table: 'assets', action: 'update', recordId: id, payload: normalized })
      return assets.value[index]
    }

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

    const isTemp = String(id).startsWith('temp_')

    // Offline: queue (real records only) and skip the network.
    if (!navigator.onLine) {
      if (!isTemp) await useSyncStore().enqueue({ table: 'assets', action: 'delete', recordId: id })
      return
    }

    const { error: err } = await supabase.from('assets').delete().eq('id', id)
    if (err && !isTemp) {
      useSyncStore().enqueue({ table: 'assets', action: 'delete', recordId: id })
    }
  }

  async function markRefreshed(id, current_value) {
    const asset = assets.value.find(a => a.id === id)
    if (!asset) return
    const payload = { ...asset, current_value: Number(current_value ?? asset.current_value), price_updated_at: new Date().toISOString() }
    return updateAsset(id, payload)
  }

  function $reset() {
    assets.value = []
    loading.value = false
    error.value = null
    loaded.value = false
  }

  return { assets, loading, error, loaded, fetchAssets, addAsset, updateAsset, deleteAsset, markRefreshed, $reset }
})
