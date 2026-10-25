// Asset type metadata + grouping for forms and views.
// Keep type strings in sync with the assets_type_check constraint in schema.sql.
//
// `shape` drives which fields the AssetForm renders. Supported shapes:
//   - cash           : just an amount, no growth tracking
//   - deposit        : principal + current + interest + maturity (FD/RD/bond/PPF/NPS/loan)
//   - holding        : quantity + unit_cost + unit_price + symbol + provider (market + commodity + crypto)
//   - fund           : SIP-style invested lots (amount + date) + a single folio
//                      value. No per-unit price — each lot grows differently so
//                      growth is tracked at the folio level (mutual funds).
//   - property       : purchase_price + current_value + location/model + purchase_date
//   - simple         : principal + current (fallback)
export const ASSET_TYPES = [
  { code: 'cash',             label: 'Cash',              group: 'cash',      icon: '$',  shape: 'cash' },
  { code: 'fd',               label: 'Fixed Deposit',     group: 'cash',      icon: 'FD', shape: 'deposit' },
  { code: 'rd',               label: 'Recurring Deposit', group: 'cash',      icon: 'RD', shape: 'deposit' },
  { code: 'savings_bond',     label: 'Savings Bond',      group: 'cash',      icon: 'SB', shape: 'deposit' },
  { code: 'security_deposit', label: 'Security Deposit',  group: 'cash',      icon: 'SD', shape: 'cash' },

  { code: 'ppf',             label: 'PPF',               group: 'longterm',  icon: 'PP', shape: 'deposit' },
  { code: 'nps',             label: 'NPS',               group: 'longterm',  icon: 'NP', shape: 'deposit' },

  { code: 'mutual_fund',     label: 'Mutual Fund',       group: 'market',    icon: 'MF', shape: 'fund',    unitsLabel: 'Units' },
  { code: 'etf',             label: 'ETF',               group: 'market',    icon: 'ET', shape: 'holding', unitsLabel: 'Units' },
  { code: 'stock',           label: 'Stock',             group: 'market',    icon: 'ST', shape: 'holding', unitsLabel: 'Shares' },

  { code: 'gold',            label: 'Gold',              group: 'commodity', icon: 'Au', shape: 'holding', unitsLabel: 'Grams' },
  { code: 'silver',          label: 'Silver',            group: 'commodity', icon: 'Ag', shape: 'holding', unitsLabel: 'Grams' },
  { code: 'crypto',          label: 'Crypto',            group: 'commodity', icon: 'CR', shape: 'holding', unitsLabel: 'Coins' },

  { code: 'real_estate',     label: 'Real Estate',       group: 'physical',  icon: 'RE', shape: 'property', locationLabel: 'Address / Location' },
  { code: 'vehicle',         label: 'Vehicle',           group: 'physical',  icon: 'VH', shape: 'property', locationLabel: 'Make & Model' },
  { code: 'collectible',     label: 'Collectible',       group: 'physical',  icon: 'CL', shape: 'property', locationLabel: 'Description' },

  { code: 'loan_receivable', label: 'Loan Receivable',   group: 'other',     icon: 'LN', shape: 'deposit' },
  { code: 'investment',      label: 'Investment',        group: 'other',     icon: 'IV', shape: 'simple' },
  { code: 'other',           label: 'Other',             group: 'other',     icon: '?',  shape: 'simple' },
]

export const ASSET_GROUPS = [
  { code: 'cash',      label: 'Cash & Equivalents' },
  { code: 'longterm',  label: 'Long-term Saving' },
  { code: 'market',    label: 'Market' },
  { code: 'commodity', label: 'Commodity & Crypto' },
  { code: 'physical',  label: 'Physical' },
  { code: 'other',     label: 'Other' },
]

export function metaFor(typeCode) {
  return ASSET_TYPES.find(t => t.code === typeCode) || ASSET_TYPES[ASSET_TYPES.length - 1]
}

export function iconFor(typeCode) {
  return metaFor(typeCode).icon
}

export function groupFor(typeCode) {
  return metaFor(typeCode).group
}
