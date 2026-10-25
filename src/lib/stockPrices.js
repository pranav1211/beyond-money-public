import { supabase } from './supabase'

// Live stock prices via the `stock-quote` Supabase edge function (Yahoo Finance)
// with a shared, day-granular cache table (`stock_price_cache`). Mirrors the
// exchange-rate cache pattern: read cache first, only hit the network when the
// cached quote isn't from today. All helpers swallow errors and return null so
// an offline / failed fetch never breaks the caller.

function todayStamp() {
  return new Date().toISOString().split('T')[0]
}

export function isFromToday(fetched_at) {
  if (!fetched_at) return false
  try {
    return new Date(fetched_at).toISOString().split('T')[0] === todayStamp()
  } catch {
    return false
  }
}

// Normalize a user-entered symbol to a Yahoo ticker. Bare tickers default to
// NSE (.NS); .BSE is rewritten to Yahoo's .BO suffix.
export function yahooSymbol(raw) {
  const s = String(raw || '').trim().toUpperCase()
  if (!s) return ''
  if (/\.BSE$/.test(s)) return s.replace(/\.BSE$/, '.BO')
  if (/\.(NS|BO)$/.test(s)) return s
  return `${s}.NS`
}

// Fetch a fresh quote from the edge function. Returns { symbol, price, currency }
// or null on any failure (offline, rate-limited, unknown symbol).
export async function fetchQuote(rawSymbol) {
  const symbol = yahooSymbol(rawSymbol)
  if (!symbol) return null
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null
  try {
    const { data, error } = await supabase.functions.invoke('stock-quote', { body: { symbol } })
    if (error || !data || data.price == null) return null
    return { symbol, price: Number(data.price), currency: data.currency || 'INR' }
  } catch {
    return null
  }
}

export async function getCachedPrice(rawSymbol) {
  const symbol = yahooSymbol(rawSymbol)
  if (!symbol) return null
  try {
    const { data } = await supabase.from('stock_price_cache').select('*').eq('symbol', symbol).maybeSingle()
    return data || null
  } catch {
    return null
  }
}

export async function upsertCachedPrice(rawSymbol, price, currency) {
  const symbol = yahooSymbol(rawSymbol)
  if (!symbol) return
  try {
    await supabase
      .from('stock_price_cache')
      .upsert({ symbol, price, currency, fetched_at: new Date().toISOString() }, { onConflict: 'symbol' })
  } catch { /* cache write is best-effort */ }
}

// Resolve a price for a symbol: today's cache first, else fetch + refresh cache.
// Returns { price, currency } or null.
export async function resolvePrice(rawSymbol) {
  const cached = await getCachedPrice(rawSymbol)
  if (cached && isFromToday(cached.fetched_at) && cached.price != null) {
    return { price: Number(cached.price), currency: cached.currency || 'INR' }
  }
  const fresh = await fetchQuote(rawSymbol)
  if (!fresh) {
    // Fall back to a stale cached value if we have one — better than nothing.
    if (cached && cached.price != null) return { price: Number(cached.price), currency: cached.currency || 'INR' }
    return null
  }
  await upsertCachedPrice(rawSymbol, fresh.price, fresh.currency)
  return { price: fresh.price, currency: fresh.currency }
}
