import { ref } from 'vue'
import { idbGet, idbSet, syncQueueGetAll } from '../idb'
import { getAdapter } from './index'
import { executeOp } from './ops'
import { newId } from './ids'
import { LABEL_LINKS } from './tables'
import { useSyncStore } from '../../stores/sync'

// One table's data, local-first. Stores wrap this and keep their own public
// API (normalising input, side effects like account balances).
//
// Reads: IndexedDB first (instant paint), then, online, drain the sync queue
// and refresh from the adapter (INV: "reads drain the queue before
// overwriting").
// Writes: change local state and IndexedDB immediately, then send through the
// adapter when online, or queue when offline. A failed online write is queued
// too. Every new row gets its real id up front (INV-68).
//
// options:
//   table      adapter table name, e.g. 'credit_cards'
//   cacheKey   IndexedDB store name, e.g. 'creditCards'
//   orderBy    [[column, 'asc' | 'desc'], ...] for list()
//   labels     true for tables with label links (transactions, cc_expenses):
//              rows carry `[linkTable]: [{ label_id }]`
//   derived    fields the app attaches to rows that are not columns, stripped
//              before anything is sent (e.g. ['categories', 'accounts'])
//   hydrate    (rows) => rows, run on rows fresh from the adapter
export function createCollection({ table, cacheKey, orderBy = [], labels = false, derived = [], hydrate = rows => rows }) {
  const items = ref([])
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref(null)

  const link = labels ? LABEL_LINKS[table] : null
  const stripped = new Set([...derived, ...(link ? [link.linkTable] : [])])

  // A row as stored by the adapter: no derived or link fields.
  function toRow(record) {
    const row = {}
    for (const key of Object.keys(record || {})) {
      if (!stripped.has(key)) row[key] = record[key]
    }
    return row
  }

  function linkField(labelIds) {
    return link && Array.isArray(labelIds) ? { [link.linkTable]: labelIds.map(label_id => ({ label_id })) } : {}
  }

  const indexOf = id => items.value.findIndex(r => r.id === id)

  async function persist() {
    await idbSet(cacheKey, items.value)
  }

  // Send one write: through the adapter when online, otherwise (or if that
  // fails) into the sync queue. Returns the stored row, or null when queued.
  async function send(op) {
    if (navigator.onLine) {
      try {
        return await executeOp(getAdapter(), op)
      } catch (e) {
        console.warn(`[storage] ${op.action} on ${op.table} failed; queued for retry:`, e?.message || e)
      }
    }
    await useSyncStore().enqueue(op)
    return null
  }

  async function fetch(force = false) {
    if (loaded.value && !force) return items.value

    if (!loaded.value) {
      const cached = await idbGet(cacheKey)
      if (cached.length) {
        items.value = cached
        loaded.value = true
      }
    }

    if (!navigator.onLine) {
      loading.value = false
      return items.value
    }

    // Push queued writes first so the read already contains them.
    await useSyncStore().flushPending()

    loading.value = !loaded.value
    try {
      const adapter = getAdapter()
      const [rows, linkRows] = await Promise.all([
        adapter.list(table, { orderBy }),
        link ? adapter.list(link.linkTable) : Promise.resolve(null),
      ])
      let result = rows
      if (link) {
        const byParent = new Map()
        for (const l of linkRows) {
          const key = l[link.parentCol]
          if (!byParent.has(key)) byParent.set(key, [])
          byParent.get(key).push({ label_id: l[link.childCol] })
        }
        result = result.map(r => ({ ...r, [link.linkTable]: byParent.get(r.id) || [] }))
      }
      result = hydrate(result)
      result = await keepUnsynced(result)
      items.value = result
      loaded.value = true
      error.value = null
      await persist()
    } catch (e) {
      if (!loaded.value) error.value = e?.message || String(e)
    }
    loading.value = false
    return items.value
  }

  // Safety net: if an insert is still queued (the flush above failed), keep
  // that local row so the refresh can't drop it.
  async function keepUnsynced(serverRows) {
    let queued
    try { queued = await syncQueueGetAll() } catch { return serverRows }
    const pendingIds = new Set(
      queued.filter(q => q.table === table && q.action === 'insert' && q.payload?.id).map(q => q.payload.id)
    )
    if (!pendingIds.size) return serverRows
    const serverIds = new Set(serverRows.map(r => r.id))
    const local = items.value.filter(r => pendingIds.has(r.id) && !serverIds.has(r.id))
    return local.length ? [...local, ...serverRows] : serverRows
  }

  async function insert(input, { labels: labelIds, prepend = false } = {}) {
    // id and created_at are set here, not left to storage defaults: net worth
    // history and loan ordering read created_at, and not every backend fills it.
    const record = {
      ...input,
      id: input.id || newId(),
      created_at: input.created_at || new Date().toISOString(),
      ...linkField(labelIds ?? (link ? [] : undefined)),
    }
    if (prepend) items.value.unshift(record)
    else items.value.push(record)
    loaded.value = true
    await persist()

    const saved = await send({ table, action: 'insert', payload: toRow(record), _labels: labelIds })
    if (saved) {
      const i = indexOf(record.id)
      if (i !== -1) {
        items.value[i] = { ...record, ...toRow(saved) }
        await persist()
      }
    }
    return items.value[indexOf(record.id)] || record
  }

  async function update(id, patch, { labels: labelIds } = {}) {
    let i = indexOf(id)
    if (i !== -1) {
      items.value[i] = { ...items.value[i], ...patch, ...linkField(labelIds) }
      await persist()
    }

    const saved = await send({ table, action: 'update', recordId: id, payload: toRow(patch), _labels: labelIds })
    i = indexOf(id)
    if (saved && i !== -1) {
      items.value[i] = { ...items.value[i], ...toRow(saved) }
      await persist()
    }
    return i !== -1 ? items.value[i] : null
  }

  async function remove(id) {
    items.value = items.value.filter(r => r.id !== id)
    await persist()
    await send({ table, action: 'delete', recordId: id })
  }

  function reset() {
    items.value = []
    loaded.value = false
    loading.value = false
    error.value = null
  }

  return { items, loaded, loading, error, fetch, insert, update, remove, send, persist, toRow, reset }
}
