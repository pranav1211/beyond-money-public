import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase'
import { idbGet, idbSet } from '../lib/idb'
import { useSyncStore } from './sync'
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
  const currencies = ref([])
  const loading = ref(false)
  const loaded = ref(false)

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

  async function seedDefaults(userId) {
    if (!userId) return
    const { data } = await supabase.from('currencies').select('*').eq('user_id', userId)
    if (data && data.length) return
    const stored = localStorage.getItem('defaultCurrency') || 'INR'
    const rows = SEED_CODES.map(code => {
      const meta = lookupCurrency(code)
      return {
        user_id: userId,
        code,
        name: meta?.name || code,
        symbol: meta?.symbol || code,
        is_default: code === stored,
      }
    })
    try { await supabase.from('currencies').insert(rows) } catch {}
  }

  async function fetchCurrencies(force = false) {
    if (loaded.value && !force) return currencies.value

    if (!loaded.value) {
      const cached = await idbGet('currencies')
      if (cached.length) {
        currencies.value = cached
        loaded.value = true
      }
    }

    if (!navigator.onLine) { loading.value = false; return currencies.value }

    loading.value = !loaded.value
    const { data, error } = await supabase.from('currencies').select('*').order('code')
    if (!error) {
      currencies.value = data || []
      loaded.value = true
      idbSet('currencies', currencies.value)
    }
    loading.value = false
    return currencies.value
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

    const { data, error } = await supabase.from('currencies').insert(normalized).select().single()
    if (error) {
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const local = { ...normalized, id: tempId }
      currencies.value.push(local)
      loaded.value = true
      idbSet('currencies', currencies.value)
      useSyncStore().enqueue({ table: 'currencies', action: 'insert', payload: normalized })
      return local
    }

    currencies.value.push(data)
    loaded.value = true
    idbSet('currencies', currencies.value)
    return data
  }

  async function setDefault(code) {
    const target = currencies.value.find(c => c.code === code)
    if (!target) return
    const updates = currencies.value.map(c => ({ ...c, is_default: c.code === code }))
    currencies.value = updates
    idbSet('currencies', currencies.value)
    localStorage.setItem('defaultCurrency', code)

    for (const c of updates) {
      if (String(c.id).startsWith('temp_')) continue
      try {
        await supabase.from('currencies').update({ is_default: c.is_default }).eq('id', c.id)
      } catch {
        useSyncStore().enqueue({ table: 'currencies', action: 'update', recordId: c.id, payload: { is_default: c.is_default } })
      }
    }
  }

  async function deleteCurrency(id) {
    const removed = currencies.value.find(c => c.id === id)
    currencies.value = currencies.value.filter(c => c.id !== id)
    idbSet('currencies', currencies.value)

    const { error } = await supabase.from('currencies').delete().eq('id', id)
    if (error && !String(id).startsWith('temp_')) {
      useSyncStore().enqueue({ table: 'currencies', action: 'delete', recordId: id })
    }
    if (removed?.is_default && currencies.value[0]) {
      await setDefault(currencies.value[0].code)
    }
  }

  function $reset() {
    currencies.value = []
    loading.value = false
    loaded.value = false
  }

  return {
    currencies,
    codes,
    defaultCurrency,
    loading,
    loaded,
    fetchCurrencies,
    addCurrency,
    setDefault,
    deleteCurrency,
    seedDefaults,
    symbolOf,
    $reset,
  }
})
