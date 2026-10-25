// Investment-category detection.
//
// There is no `is_investment` flag on categories (see categories table in
// supabase/schema/schema.sql) — investment spend is identified purely by the
// category *name*. Any expense whose category is named "Investment" (or
// "Investments") is treated as money put into investments rather than consumed.
//
// Centralised here so the dashboard Month Summary card and the Month Report
// classify identically. If this ever grows into a real flag, this is the single
// place to swap the logic.

const INVESTMENT_NAMES = new Set(['investment', 'investments'])

// Canonical category names used by the automated investing flows (buy/sell).
// Centralised so the flows, the seed list and the backfill SQL all agree.
// `type` is the category's income/expense side.
export const INVESTING_CATEGORIES = {
  buy: { name: 'Investment', type: 'expense', color: '#5f3dc4', icon: 'investment' },
  capital: { name: 'Capital Returned', type: 'income', color: '#1098ad', icon: 'investment' },
  gain: { name: 'Realized Gain', type: 'income', color: '#2f9e44', icon: 'investment' },
  loss: { name: 'Realized Loss', type: 'expense', color: '#e03131', icon: 'investment' },
}

export function isInvestmentCategoryName(name) {
  if (!name) return false
  return INVESTMENT_NAMES.has(String(name).trim().toLowerCase())
}

// Resolve a transaction's category_id against the categories list and decide
// whether it's an investment. `categories` is the array from the categories store.
export function isInvestmentTxn(txn, categories) {
  if (!txn?.category_id) return false
  const cat = categories.find(c => c.id === txn.category_id)
  return isInvestmentCategoryName(cat?.name)
}
