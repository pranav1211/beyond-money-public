import { useCurrencyStore } from '../stores/currency'
import { useCurrenciesStore } from '../stores/currencies'

export function defaultCurrencyCode() {
  try {
    const code = useCurrenciesStore().defaultCurrency?.code
    if (code) return code
  } catch {}
  return localStorage.getItem('defaultCurrency') || 'INR'
}

export function defaultCurrencySymbol() {
  try {
    const c = useCurrenciesStore().defaultCurrency
    if (c?.symbol) return c.symbol
  } catch {}
  const code = defaultCurrencyCode()
  return code === 'INR' ? '\u20B9' : code === 'USD' ? '$' : code
}

// Live conversion: given a transaction or {amount, currency}, return value
// in the user's *current* default currency using current rates.
// Falls back to amount_default snapshot if rates unavailable.
export function inDefault(tx) {
  if (!tx) return 0
  const amount = Number(tx.amount || 0)
  const code = defaultCurrencyCode()
  const txCurrency = tx.currency || code
  if (txCurrency === code) return amount
  try {
    const converted = useCurrencyStore().convert(amount, txCurrency, code)
    if (Number.isFinite(converted) && converted !== amount) return converted
  } catch {}
  // Fallback: stored snapshot (only correct if default hasn't changed since write)
  const snapshot = Number(tx.amount_default ?? tx.amount_inr ?? 0)
  return snapshot || amount
}

// Convert any (amount, fromCurrency) pair to a target currency. Safe defaults.
export function toCurrency(amount, fromCurrency, toCode) {
  const a = Number(amount || 0)
  if (!toCode || fromCurrency === toCode) return a
  try {
    const v = useCurrencyStore().convert(a, fromCurrency || toCode, toCode)
    return Number.isFinite(v) ? v : a
  } catch {
    return a
  }
}

export function formatDefault(amount, opts = {}) {
  const code = defaultCurrencyCode()
  const symbol = defaultCurrencySymbol()
  const { signed = false, fractionDigits = 0 } = opts
  const sign = signed && amount > 0 ? '+' : amount < 0 ? '-' : ''
  const abs = Math.abs(Number(amount || 0))
  return `${sign}${symbol}${abs.toLocaleString('en-IN', { maximumFractionDigits: fractionDigits })}`
}
