import { defineStore } from 'pinia'
import { computed } from 'vue'
import { createCollection } from '../lib/storage/collection'
import { getAdapter } from '../lib/storage'
import { useAuthStore } from './auth'
import { lookupCurrency, symbolFor } from '../lib/currencyCatalog'

const SEED_CODES = ['INR', 'USD']

function normalizeCurrency(payload) {
  const code = (payload.code || '').trim().toUpperCase()
  const meta = lookupCurrency(code)
  return {
    ...payload,
    code,
    name: payload.name || meta?.name || code,
    symbol: payload.symbol || meta?.symbol || code,
    is_default: !!payload.is_default,
  }
}

export const useCurrenciesStore = defineStore('currencies', () => {
  // Local-first storage: IndexedDB + the storage adapter (src/lib/storage).
  const col = createCollection({ table: 'currencies', cacheKey: 'currencies', orderBy: [['code', 'asc']] })
  const currencies = col.items

  const codes = computed(() => currencies.value.map(c => c.code))

  const defaultCurrency = computed(() => {
    const def = currencies.value.find(c => c.is_default)
    if (def) return def
    return currencies.value[0] || null
  })

  function symbolOf(code) {
    const found = currencies.value.find(c => c.code === code)
    return found?.symbol || symbolFor(code)
  }

  // First sign-in: INR + USD, with the locally remembered default. Online
  // only, and only when the backend has none for this user yet.
  async function seedDefaults(userId) {
    if (!userId || !navigator.onLine) return
    let existing
    try { existing = await getAdapter().list('currencies') } catch { return }
    if (existing.length) return
    const stored = localStorage.getItem('defaultCurrency') || 'INR'
    await Promise.all(SEED_CODES.map(code => {
      const meta = lookupCurrency(code)
      return col.insert({
        user_id: userId,
        code,
        name: meta?.name || code,
        symbol: meta?.symbol || code,
        is_default: code === stored,
      })
    }))
  }

  function fetchCurrencies(force = false) {
    return col.fetch(force)
  }

  async function addCurrency(payload) {
    const normalized = normalizeCurrency(payload)
    if (!normalized.code) throw new Error('Currency code required')
    if (currencies.value.some(c => c.code === normalized.code)) {
      throw new Error(`${normalized.code} already added`)
    }
    if (!normalized.user_id) {
      const uid = useAuthStore().user?.id
      if (!uid) throw new Error('Not signed in')
      normalized.user_id = uid
    }
    return col.insert(normalized)
  }

  async function setDefault(code) {
    const target = currencies.value.find(c => c.code === code)
    if (!target) return
    localStorage.setItem('defaultCurrency', code)
    // Only rows whose flag actually changes need a write.
    const changed = currencies.value.filter(c => !!c.is_default !== (c.code === code))
    for (const c of changed) {
      await col.update(c.id, { is_default: c.code === code })
    }
  }

  async function deleteCurrency(id) {
    const removed = currencies.value.find(c => c.id === id)
    await col.remove(id)
    if (removed?.is_default && currencies.value[0]) {
      await setDefault(currencies.value[0].code)
    }
  }

  return {
    currencies,
    codes,
    defaultCurrency,
    loading: col.loading,
    loaded: col.loaded,
    fetchCurrencies,
    addCurrency,
    setDefault,
    deleteCurrency,
    seedDefaults,
    symbolOf,
    $reset: col.reset,
  }
})
