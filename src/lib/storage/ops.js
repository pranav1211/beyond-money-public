import { LABEL_LINKS } from './tables'
import { newId, isLegacyTempId } from './ids'

// Runs one write operation against an adapter. The same function serves both
// live writes (online) and the sync queue's replays (after being offline), so
// a write behaves identically either way. Throws on failure; the caller queues
// or retries.
//
// op: { table, action, payload?, recordId?, _labels?, conflictKeys? }
//   insert        payload = full row (with id). _labels = full label list.
//   update        recordId + payload = changed fields. _labels = full label
//                 list, or undefined to leave labels alone.
//   set_links     recordId + _labels: replace a row's labels only.
//   update_batch  payload = { ids, update }: same change on many rows.
//   delete        recordId.
//   upsert        payload + conflictKeys (e.g. ['user_id', 'month']).
export async function executeOp(adapter, op) {
  const { table, action, payload, _labels } = op
  const recordId = op.recordId

  switch (action) {
    case 'insert': {
      // Queue items from before 3.1 may lack an id; give them one.
      const row = payload?.id ? payload : { ...payload, id: newId() }
      const saved = await adapter.insert(table, row)
      await setLabels(adapter, table, row.id, _labels)
      return saved
    }
    case 'update': {
      if (isLegacyTempId(recordId)) return null
      const saved = await adapter.update(table, recordId, payload || {})
      await setLabels(adapter, table, recordId, _labels)
      return saved
    }
    case 'set_links': {
      if (isLegacyTempId(recordId)) return null
      await setLabels(adapter, table, recordId, _labels)
      return null
    }
    case 'update_batch': {
      const ids = (payload?.ids || []).filter(id => !isLegacyTempId(id))
      if (ids.length) await adapter.updateMany(table, ids, payload.update)
      return null
    }
    case 'delete': {
      if (isLegacyTempId(recordId)) return null
      // Clear label links first: transaction_labels has no ON DELETE CASCADE,
      // so deleting a labelled transaction would otherwise fail.
      if (LABEL_LINKS[table]) await setLabels(adapter, table, recordId, [])
      await adapter.remove(table, recordId)
      return null
    }
    case 'upsert':
      return adapter.upsert(table, payload, op.conflictKeys || ['id'])
    default:
      throw new Error(`Unknown sync action: ${action}`)
  }
}

async function setLabels(adapter, table, parentId, labels) {
  const link = LABEL_LINKS[table]
  if (!link || !parentId || !Array.isArray(labels)) return
  await adapter.replaceLinks(link.linkTable, link.parentCol, parentId, link.childCol, labels)
}
