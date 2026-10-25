import { defineStore } from 'pinia'
import { createCollection } from '../lib/storage/collection'

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
  // Local-first storage: IndexedDB + the storage adapter (src/lib/storage).
  const col = createCollection({ table: 'assets', cacheKey: 'assets', orderBy: [['name', 'asc']] })

  function fetchAssets(force = false) {
    return col.fetch(force)
  }

  function addAsset(payload) {
    return col.insert(normalizeAsset(payload))
  }

  function updateAsset(id, payload) {
    return col.update(id, normalizeAsset(payload))
  }

  function deleteAsset(id) {
    return col.remove(id)
  }

  async function markRefreshed(id, current_value) {
    const asset = col.items.value.find(a => a.id === id)
    if (!asset) return
    const payload = { ...asset, current_value: Number(current_value ?? asset.current_value), price_updated_at: new Date().toISOString() }
    return updateAsset(id, payload)
  }

  return {
    assets: col.items,
    loading: col.loading,
    error: col.error,
    loaded: col.loaded,
    fetchAssets,
    addAsset,
    updateAsset,
    deleteAsset,
    markRefreshed,
    $reset: col.reset,
  }
})
