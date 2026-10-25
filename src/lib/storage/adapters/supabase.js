import { getSupabase, pingBackend } from '../../supabase'
import { selectAll } from '../../selectAll'
import { primaryKeyOf } from '../tables'

// Reference storage adapter: Supabase (Postgres + Row Level Security).
// The contract every adapter follows is in docs/ADAPTERS.md; this file is the
// worked example. Every method throws on failure, which the app turns into a
// queued retry.
//
// `client` can be passed in (tests, scripts); in the app it's created from the
// VITE_SUPABASE_* env vars on first use.
export default function createSupabaseAdapter({ client = null, health = pingBackend } = {}) {
  const db = () => client || getSupabase()

  function check({ data, error }) {
    if (error) throw error
    return data
  }

  return {
    name: 'supabase',

    // Every row the signed-in user owns (RLS does the scoping), complete:
    // selectAll pages past the API's 1,000-row cap (INV-65).
    async list(table, { orderBy = [] } = {}) {
      const keys = primaryKeyOf(table)
      const data = check(await selectAll(() => {
        let q = db().from(table).select('*')
        for (const [col, dir] of orderBy) q = q.order(col, { ascending: dir !== 'desc' })
        for (const key of keys) q = q.order(key, { ascending: true })
        return q
      }))
      return data || []
    },

    // Idempotent by id: inserting a row that already exists is a no-op.
    async insert(table, row) {
      const data = check(await db().from(table)
        .upsert(row, { onConflict: primaryKeyOf(table).join(','), ignoreDuplicates: true })
        .select())
      return data?.[0] ?? row
    },

    async update(table, id, patch) {
      const data = check(await db().from(table).update(patch).eq('id', id).select())
      return data?.[0] ?? null
    },

    async remove(table, id) {
      check(await db().from(table).delete().eq('id', id))
    },

    async updateMany(table, ids, patch) {
      if (!ids?.length) return
      check(await db().from(table).update(patch).in('id', ids))
    },

    async upsert(table, row, conflictKeys = ['id']) {
      const data = check(await db().from(table)
        .upsert(row, { onConflict: conflictKeys.join(',') })
        .select())
      return data?.[0] ?? row
    },

    async replaceLinks(linkTable, parentCol, parentId, childCol, childIds) {
      check(await db().from(linkTable).delete().eq(parentCol, parentId))
      if (childIds?.length) {
        check(await db().from(linkTable).insert(childIds.map(id => ({ [parentCol]: parentId, [childCol]: id }))))
      }
    },

    // Optional capabilities.

    // Sign-in. The app uses this subset of Supabase's auth API: getSession,
    // onAuthStateChange, signInWithOAuth, signOut, setSession.
    get auth() {
      return db().auth
    },

    // Shared exchange-rate cache (rates are stored as 1 USD = rate × code).
    rates: {
      async get(codes) {
        return check(await db().from('exchange_rate_cache')
          .select('*').eq('from_currency', 'USD').in('to_currency', codes)) || []
      },
      async put(rows) {
        if (rows?.length) check(await db().from('exchange_rate_cache').insert(rows))
      },
      async clear(codes) {
        check(await db().from('exchange_rate_cache')
          .delete().eq('from_currency', 'USD').in('to_currency', codes))
      },
    },

    // Live stock quotes (Yahoo Finance via the stock-quote edge function) and
    // their shared cache.
    quotes: {
      async fetch(symbol) {
        const { data, error } = await db().functions.invoke('stock-quote', { body: { symbol } })
        if (error || !data || data.price == null) return null
        return { price: Number(data.price), currency: data.currency || 'INR' }
      },
      async getCached(symbol) {
        const { data } = await db().from('stock_price_cache').select('*').eq('symbol', symbol).maybeSingle()
        return data || null
      },
      async putCached(symbol, price, currency) {
        await db().from('stock_price_cache')
          .upsert({ symbol, price, currency, fetched_at: new Date().toISOString() }, { onConflict: 'symbol' })
      },
    },

    // Reachability ping that clears the "service degraded" banner.
    health,
  }
}
