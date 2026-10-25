// Common ISO 4217 currencies. Used for the "add currency" picker.
// Codes match those returned by openexchangerates.org /latest.json
export const CURRENCY_CATALOG = [
  { code: 'INR', name: 'Indian Rupee', symbol: '\u20B9' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '\u20AC' },
  { code: 'GBP', name: 'British Pound', symbol: '\u00A3' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '\u00A5' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '\u00A5' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'Mex$' },
  { code: 'KRW', name: 'South Korean Won', symbol: '\u20A9' },
  { code: 'THB', name: 'Thai Baht', symbol: '\u0E3F' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '\u20BA' },
  { code: 'RUB', name: 'Russian Ruble', symbol: '\u20BD' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '\u20B1' },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: '\u20A8' },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '\u09F3' },
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs' },
  { code: 'NPR', name: 'Nepalese Rupee', symbol: 'Rs' },
]

export function lookupCurrency(code) {
  if (!code) return null
  return CURRENCY_CATALOG.find(c => c.code === code.toUpperCase()) || null
}

export function symbolFor(code) {
  return lookupCurrency(code)?.symbol || code || ''
}
