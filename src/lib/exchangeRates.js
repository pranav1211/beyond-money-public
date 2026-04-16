const APP_ID = import.meta.env.VITE_EXCHANGE_RATES_APP_ID

export async function fetchExchangeRate() {
  const response = await fetch(
    `https://openexchangerates.org/api/latest.json?app_id=${APP_ID}&symbols=INR`
  )
  const data = await response.json()
  return data.rates.INR
}
