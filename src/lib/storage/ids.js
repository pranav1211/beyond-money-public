// Every row gets its real id on the device, before it is saved anywhere. The
// same id is used locally and in the sync queue, so a row created offline can
// be edited, linked to, or deleted before it syncs, and a retried insert can
// never create a duplicate (adapters treat insert as idempotent by id). INV-68.
export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Ids minted by versions before 3.1, which never reached a server. Queued
// updates/deletes that target one can never succeed, so they're dropped.
export function isLegacyTempId(id) {
  return String(id || '').startsWith('temp_')
}
