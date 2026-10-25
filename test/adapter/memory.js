// In-memory storage adapter: the smallest correct implementation of the
// contract in docs/ADAPTERS.md. `npm run test:adapter` runs against it by
// default, and it's a readable starting point for writing a real adapter.
// Data lives only as long as the page/process, so it is not an app adapter.
import { primaryKeyOf } from '../../src/lib/storage/tables.js'

export default function createMemoryAdapter() {
  const tables = new Map()
  const rowsOf = (table) => {
    if (!tables.has(table)) tables.set(table, [])
    return tables.get(table)
  }
  // Callers get copies: changing a returned object must never change stored
  // data (the app freely mutates what it reads).
  const copy = (row) => JSON.parse(JSON.stringify(row))
  const sameKey = (keys, a, b) => keys.every(k => a[k] === b[k])

  function compare(a, b, orderBy) {
    for (const [col, dir] of orderBy) {
      const x = a[col] ?? null
      const y = b[col] ?? null
      if (x === y) continue
      if (x === null) return 1 // nulls last, like Postgres ascending
      if (y === null) return -1
      const r = x < y ? -1 : 1
      return dir === 'desc' ? -r : r
    }
    return 0
  }

  return {
    name: 'memory',

    async list(table, { orderBy = [] } = {}) {
      const keys = primaryKeyOf(table).map(k => [k, 'asc'])
      return rowsOf(table).slice().sort((a, b) => compare(a, b, [...orderBy, ...keys])).map(copy)
    },

    async insert(table, row) {
      const keys = primaryKeyOf(table)
      const rows = rowsOf(table)
      const existing = rows.find(r => sameKey(keys, r, row))
      if (existing) return copy(existing) // idempotent: first write wins
      const stored = copy(row)
      rows.push(stored)
      return copy(stored)
    },

    async update(table, id, patch) {
      const row = rowsOf(table).find(r => r.id === id)
      if (!row) return null // not found is not an error
      Object.assign(row, copy(patch), { id })
      return copy(row)
    },

    async remove(table, id) {
      tables.set(table, rowsOf(table).filter(r => r.id !== id))
    },

    async updateMany(table, ids, patch) {
      const set = new Set(ids || [])
      for (const row of rowsOf(table)) if (set.has(row.id)) Object.assign(row, copy(patch), { id: row.id })
    },

    async upsert(table, row, conflictKeys = ['id']) {
      const rows = rowsOf(table)
      const existing = rows.find(r => sameKey(conflictKeys, r, row))
      if (existing) {
        Object.assign(existing, copy(row))
        return copy(existing)
      }
      const stored = copy(row)
      rows.push(stored)
      return copy(stored)
    },

    async replaceLinks(linkTable, parentCol, parentId, childCol, childIds) {
      const kept = rowsOf(linkTable).filter(r => r[parentCol] !== parentId)
      for (const id of new Set(childIds || [])) kept.push({ [parentCol]: parentId, [childCol]: id })
      tables.set(linkTable, kept)
    },

    // No auth: the app falls back to its one-local-user sign-in.
    // No rates/quotes/health: the app fetches rates directly, prices are
    // entered by hand, and the service banner stays hidden.
  }
}
