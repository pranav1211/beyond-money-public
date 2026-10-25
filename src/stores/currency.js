import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getAdapter } from '../lib/storage'
import { fetchExchangeRates } from '../lib/exchangeRates'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

// Last rates kept on the device, so conversions use real rates offline and
// with storage adapters that have no shared rate cache.
const LOCAL_KEY = 'bm_rates'

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) } catch { return null }
}

function writeLocal(rates, fetchedAt) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ rates, fetchedAt })) } catch { /* storage full or blocked */ }
}

function isFresh(iso) {
  return !!iso && Date.now() - new Date(iso).getTime() < CACHE_TTL_MS
}

export const useCurrencyStore = defineStore('currency', () => {
  const saved = readLocal()
  // Map of currency code -> rate (units per 1 USD). USD is always 1.
  const rates = ref(saved?.rates || { USD: 1 })
  const lastFetched = ref(saved?.fetchedAt || null)
  const loading = ref(false)

  // Back-compat: USD->INR rate exposed as a single number for the converter view.
  const currentRate = computed({
    get: () => rates.value.INR ?? null,
    set: (v) => { rates.value = { ...rates.value, INR: v } },
  })

  async function fetchRate(symbols = ['INR']) {
    const wanted = Array.from(new Set([...(symbols || []), 'INR']))

    // The device copy covers everything and is from the last day: done.
    if (isFresh(lastFetched.value) && wanted.every(c => c === 'USD' || rates.value[c])) return rates.value
    if (!navigator.onLine) return rates.value

    loading.value = true
    try {
      // Shared cache (optional adapter capability): rates other sessions fetched.
      const shared = getAdapter().rates
      let fresh = []
      if (shared) {
        try {
          fresh = (await shared.get(wanted)).filter(r => isFresh(r.fetched_at))
        } catch { fresh = [] }
      }
      const freshCodes = new Set(fresh.map(r => r.to_currency))
      const stale = wanted.filter(c => c !== 'USD' && !freshCodes.has(c))

      if (!stale.length && fresh.length) {
        const next = { ...rates.value, USD: 1 }
        for (const row of fresh) next[row.to_currency] = Number(row.rate)
        rates.value = next
        lastFetched.value = fresh.reduce((acc, r) => (acc && acc > r.fetched_at ? acc : r.fetched_at), null)
        writeLocal(rates.value, lastFetched.value)
        return rates.value
      }

      const fetched = await fetchExchangeRates(wanted)
      const fetchedAt = new Date().toISOString()

      const merged = { ...rates.value, USD: 1 }
      for (const row of fresh) merged[row.to_currency] = Number(row.rate)
      for (const [code, rate] of Object.entries(fetched)) merged[code] = Number(rate)
      rates.value = merged
      lastFetched.value = fetchedAt
      writeLocal(merged, fetchedAt)

      const inserts = Object.entries(fetched)
        .filter(([code]) => code !== 'USD')
        .map(([code, rate]) => ({ from_currency: 'USD', to_currency: code, rate, fetched_at: fetchedAt }))
      if (shared && inserts.length) {
        try { await shared.put(inserts) } catch { /* best-effort cache */ }
      }
    } catch {
      // Offline or API failure — keep whatever rates we have.
    } finally {
      loading.value = false
    }
    return rates.value
  }

  // Forget cached rates (shared and device) so the next fetch is live.
  async function clearCachedRates(codes) {
    try { await getAdapter().rates?.clear(codes) } catch { /* best-effort */ }
    lastFetched.value = null
    writeLocal(rates.value, null)
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

  return { rates, currentRate, lastFetched, loading, fetchRate, clearCachedRates, convert }
})
