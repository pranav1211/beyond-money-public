const APP_ID = import.meta.env.VITE_EXCHANGE_RATES_APP_ID

// openexchangerates.org free plan returns USD as base.
// `symbols` is a comma-separated list of ISO codes to include.
export async function fetchExchangeRates(symbols = ['INR']) {
  const list = Array.from(new Set(symbols.filter(Boolean).map(s => s.toUpperCase()).filter(s => s !== 'USD')))
  const params = new URLSearchParams({ app_id: APP_ID })
  if (list.length) params.set('symbols', list.join(','))
  const response = await fetch(`https://openexchangerates.org/api/latest.json?${params.toString()}`)
  if (!response.ok) throw new Error(`Exchange rate fetch failed: ${response.status}`)
  const data = await response.json()
  // Normalize: USD always 1; merge symbol rates.
  return { USD: 1, ...(data.rates || {}) }
}

// Back-compat for older code paths that only need USD->INR.
export async function fetchExchangeRate() {
  const rates = await fetchExchangeRates(['INR'])
  return rates.INR
}
