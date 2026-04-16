import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { fetchExchangeRate } from '../lib/exchangeRates'

export const useCurrencyStore = defineStore('currency', () => {
  const currentRate = ref(null)
  const lastFetched = ref(null)
  const loading = ref(false)

  async function fetchRate() {
    loading.value = true

    const { data: cached } = await supabase
      .from('exchange_rate_cache')
      .select('*')
      .eq('from_currency', 'USD')
      .eq('to_currency', 'INR')
      .order('fetched_at', { ascending: false })
      .limit(1)
      .single()

    if (cached) {
      const age = Date.now() - new Date(cached.fetched_at).getTime()
      if (age < 24 * 60 * 60 * 1000) {
        currentRate.value = cached.rate
        lastFetched.value = cached.fetched_at
        loading.value = false
        return
      }
    }

    const rate = await fetchExchangeRate()
    currentRate.value = rate
    lastFetched.value = new Date().toISOString()

    await supabase.from('exchange_rate_cache').insert({
      from_currency: 'USD',
      to_currency: 'INR',
      rate,
      fetched_at: lastFetched.value,
    })

    loading.value = false
  }

  function convert(amount, from, to) {
    if (!currentRate.value || from === to) return amount
    if (from === 'USD' && to === 'INR') return amount * currentRate.value
    if (from === 'INR' && to === 'USD') return amount / currentRate.value
    return amount
  }

  return { currentRate, lastFetched, loading, fetchRate, convert }
})
