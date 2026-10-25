// Supabase's API returns at most 1,000 rows per request (the project's
// max-rows setting). Reads that must be complete (full transaction history,
// card expenses) page through in chunks with .range().
//
// `build` returns a FRESH query each call (a builder can only be awaited
// once). It must have a deterministic order: include a unique tiebreaker such
// as .order('id') so rows don't shift between pages.
//
// All-or-nothing: if any page fails, this returns { data: null, error } rather
// than a partial list. Callers write the result into IndexedDB with idbSet,
// which replaces the whole store, so a partial list would silently delete the
// missing rows from the offline cache. See INV-65.
export const PAGE_SIZE = 1000

export async function selectAll(build) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1)
    if (error) return { data: null, error }
    if (data?.length) rows.push(...data)
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null }
  }
}
