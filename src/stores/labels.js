import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { idbGet, idbSet } from '../lib/idb'
import { useSyncStore } from './sync'

export const useLabelsStore = defineStore('labels', () => {
  const labels = ref([])
  const loading = ref(false)
  const error = ref(null)
  const loaded = ref(false)

  async function fetchLabels(force = false) {
    if (loaded.value && !force) return labels.value

    if (!loaded.value) {
      const cached = await idbGet('labels')
      if (cached.length) {
        labels.value = cached
        loaded.value = true
      }
    }

    if (!navigator.onLine) { loading.value = false; return labels.value }

    loading.value = !loaded.value
    const { data, error: err } = await supabase.from('labels').select('*').order('name')
    if (err) {
      if (!loaded.value) error.value = err.message
    } else {
      labels.value = data || []
      loaded.value = true
      idbSet('labels', labels.value)
    }
    loading.value = false
    return labels.value
  }

  async function addLabel(payload) {
    const { data, error: err } = await supabase.from('labels').insert(payload).select().single()
    if (err) {
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const localEntry = { ...payload, id: tempId }
      labels.value.push(localEntry)
      loaded.value = true
      idbSet('labels', labels.value)
      useSyncStore().enqueue({ table: 'labels', action: 'insert', payload })
      return localEntry
    }

    labels.value.push(data)
    loaded.value = true
    idbSet('labels', labels.value)
    return data
  }

  async function updateLabel(id, payload) {
    const index = labels.value.findIndex(label => label.id === id)

    if (index !== -1) labels.value[index] = { ...labels.value[index], ...payload }
    idbSet('labels', labels.value)

    const { data, error: err } = await supabase.from('labels').update(payload).eq('id', id).select().single()
    if (err) {
      useSyncStore().enqueue({ table: 'labels', action: 'update', recordId: id, payload })
      return labels.value[index]
    }

    if (index !== -1) labels.value[index] = data
    idbSet('labels', labels.value)
    return data
  }

  async function deleteLabel(id) {
    labels.value = labels.value.filter(label => label.id !== id)
    idbSet('labels', labels.value)

    const { error: err } = await supabase.from('labels').delete().eq('id', id)
    if (err && !String(id).startsWith('temp_')) {
      useSyncStore().enqueue({ table: 'labels', action: 'delete', recordId: id })
    }
  }

  function $reset() {
    labels.value = []
    loading.value = false
    error.value = null
    loaded.value = false
  }

  return { labels, loading, error, loaded, fetchLabels, addLabel, updateLabel, deleteLabel, $reset }
})
