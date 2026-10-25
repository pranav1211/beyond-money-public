import { defineStore } from 'pinia'
import { createCollection } from '../lib/storage/collection'

export const useLabelsStore = defineStore('labels', () => {
  // Local-first storage: IndexedDB + the storage adapter (src/lib/storage).
  const col = createCollection({ table: 'labels', cacheKey: 'labels', orderBy: [['name', 'asc']] })

  function fetchLabels(force = false) {
    return col.fetch(force)
  }

  function addLabel(payload) {
    return col.insert({ ...payload })
  }

  function updateLabel(id, payload) {
    return col.update(id, { ...payload })
  }

  function deleteLabel(id) {
    return col.remove(id)
  }

  return {
    labels: col.items,
    loading: col.loading,
    error: col.error,
    loaded: col.loaded,
    fetchLabels,
    addLabel,
    updateLabel,
    deleteLabel,
    $reset: col.reset,
  }
})
