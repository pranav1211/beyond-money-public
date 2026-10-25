// Supabase Edge Function: stock-quote
// Proxies Yahoo Finance's chart endpoint (browser CORS-blocked) and returns a
// simple { symbol, price, currency }. Yahoo needs no API key and supports NSE
// (.NS) / BSE (.BO) symbols, e.g. RELIANCE.NS -> regularMarketPrice in INR.
//
// Deploy:  supabase functions deploy stock-quote
// Call from the app via supabase.functions.invoke('stock-quote', { body: { symbol } })

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    let symbol = ''
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      symbol = body?.symbol || ''
    }
    if (!symbol) symbol = new URL(req.url).searchParams.get('symbol') || ''
    symbol = String(symbol).trim()
    if (!symbol) return json({ price: null, error: 'missing symbol' })

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!r.ok) return json({ symbol, price: null, error: `yahoo ${r.status}` })

    const data = await r.json()
    const meta = data?.chart?.result?.[0]?.meta
    const price = meta?.regularMarketPrice ?? null
    return json({ symbol, price, currency: meta?.currency ?? null })
  } catch (e) {
    // Never 500 the caller — a null price is handled gracefully client-side.
    return json({ price: null, error: String(e) })
  }
})
