import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase'
import { fetchExchangeRates } from '../lib/exchangeRates'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export const useCurrencyStore = defineStore('currency', () => {
  // Map of currency code -> rate (units per 1 USD). USD is always 1.
  const rates = ref({ USD: 1 })
  const lastFetched = ref(null)
  const loading = ref(false)

  // Back-compat: USD->INR rate exposed as a single number for the converter view.
  const currentRate = computed({
    get: () => rates.value.INR ?? null,
    set: (v) => { rates.value = { ...rates.value, INR: v } },
  })

  function applyCachedRows(rows) {
    const next = { USD: 1 }
    for (const row of rows || []) {
      if (row.from_currency === 'USD' && row.to_currency) {
        next[row.to_currency] = Number(row.rate)
      }
    }
    rates.value = next
  }

  async function fetchRate(symbols = ['INR']) {
    loading.value = true
    try {
      const wanted = Array.from(new Set([...(symbols || []), 'INR']))

      const { data: cached } = await supabase
        .from('exchange_rate_cache')
        .select('*')
        .eq('from_currency', 'USD')
        .in('to_currency', wanted)

      const fresh = (cached || []).filter(r => Date.now() - new Date(r.fetched_at).getTime() < CACHE_TTL_MS)
      const freshCodes = new Set(fresh.map(r => r.to_currency))
      const stale = wanted.filter(c => c !== 'USD' && !freshCodes.has(c))

      if (!stale.length && fresh.length) {
        applyCachedRows(fresh)
        lastFetched.value = fresh.reduce((acc, r) => (acc && acc > r.fetched_at ? acc : r.fetched_at), null)
        return rates.value
      }

      const fetched = await fetchExchangeRates(wanted)
      const fetchedAt = new Date().toISOString()

      const merged = { USD: 1 }
      for (const row of fresh) merged[row.to_currency] = Number(row.rate)
      for (const [code, rate] of Object.entries(fetched)) merged[code] = Number(rate)
      rates.value = merged
      lastFetched.value = fetchedAt

      const inserts = Object.entries(fetched)
        .filter(([code]) => code !== 'USD')
        .map(([code, rate]) => ({ from_currency: 'USD', to_currency: code, rate, fetched_at: fetchedAt }))
      if (inserts.length) {
        try { await supabase.from('exchange_rate_cache').insert(inserts) } catch {}
      }
    } catch (err) {
      // Offline or API failure — keep whatever rates we have.
      if (!Object.keys(rates.value).length) rates.value = { USD: 1 }
    } finally {
      loading.value = false
    }
    return rates.value
  }

  function convert(amount, from, to) {
    const a = Number(amount)
    if (!Number.isFinite(a)) return amount
    if (!from || !to || from === to) return a
    const rFrom = rates.value[from]
    const rTo = rates.value[to]
    if (!rFrom || !rTo) return a
    return a * (rTo / rFrom)
  }

  return { rates, currentRate, lastFetched, loading, fetchRate, convert }
})
