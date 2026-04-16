import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { idbGet, idbSet } from '../lib/idb'
import { useSyncStore } from './sync'

export const useCategoriesStore = defineStore('categories', () => {
  const categories = ref([])
  const loading = ref(false)
  const error = ref(null)
  const loaded = ref(false)

  async function fetchCategories(force = false) {
    if (loaded.value && !force) return categories.value

    if (!loaded.value) {
      const cached = await idbGet('categories')
      if (cached.length) {
        categories.value = cached
        loaded.value = true
      }
    }

    if (!navigator.onLine) { loading.value = false; return categories.value }

    loading.value = !loaded.value
    const { data, error: err } = await supabase.from('categories').select('*').order('type').order('name')
    if (err) {
      if (!loaded.value) error.value = err.message
    } else {
      categories.value = data || []
      loaded.value = true
      idbSet('categories', categories.value)
    }
    loading.value = false
    return categories.value
  }

  async function addCategory(payload) {
    const normalized = {
      ...payload,
      name: payload.name?.trim(),
      icon: payload.icon?.trim() || null,
    }

    const { data, error: err } = await supabase.from('categories').insert(normalized).select().single()
    if (err) {
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const localEntry = { ...normalized, id: tempId }
      categories.value.push(localEntry)
      loaded.value = true
      idbSet('categories', categories.value)
      useSyncStore().enqueue({ table: 'categories', action: 'insert', payload: normalized })
      return localEntry
    }

    categories.value.push(data)
    loaded.value = true
    idbSet('categories', categories.value)
    return data
  }

  async function updateCategory(id, payload) {
    const normalized = {
      ...payload,
      name: payload.name?.trim(),
      icon: payload.icon?.trim() || null,
    }
    const index = categories.value.findIndex(category => category.id === id)

    if (index !== -1) categories.value[index] = { ...categories.value[index], ...normalized }
    idbSet('categories', categories.value)

    const { data, error: err } = await supabase.from('categories').update(normalized).eq('id', id).select().single()
    if (err) {
      useSyncStore().enqueue({ table: 'categories', action: 'update', recordId: id, payload: normalized })
      return categories.value[index]
    }

    if (index !== -1) categories.value[index] = data
    idbSet('categories', categories.value)
    return data
  }

  async function deleteCategory(id) {
    categories.value = categories.value.filter(category => category.id !== id)
    idbSet('categories', categories.value)

    const { error: err } = await supabase.from('categories').delete().eq('id', id)
    if (err && !String(id).startsWith('temp_')) {
      useSyncStore().enqueue({ table: 'categories', action: 'delete', recordId: id })
    }
  }

  async function seedDefaultCategories(userId) {
    const { count, error: countError } = await supabase
      .from('categories')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    if (countError || count > 0) return

    const defaults = [
      { user_id: userId, name: 'Salary', type: 'income', color: '#2f9e44', icon: 'salary' },
      { user_id: userId, name: 'Freelance', type: 'income', color: '#3fa34d', icon: 'freelance' },
      { user_id: userId, name: 'Gift', type: 'income', color: '#5cc27f', icon: 'gift' },
      { user_id: userId, name: 'Food & Dining', type: 'expense', color: '#d94841', icon: 'food' },
      { user_id: userId, name: 'Subscriptions', type: 'expense', color: '#495057', icon: 'subscriptions' },
      { user_id: userId, name: 'Transport', type: 'expense', color: '#1971c2', icon: 'transport' },
      { user_id: userId, name: 'Utilities', type: 'expense', color: '#e67700', icon: 'utilities' },
      { user_id: userId, name: 'Shopping', type: 'expense', color: '#862e9c', icon: 'shopping' },
      { user_id: userId, name: 'Health', type: 'expense', color: '#0b7285', icon: 'health' },
      { user_id: userId, name: 'Miscellaneous', type: 'expense', color: '#6c757d', icon: 'misc' },
    ]

    await supabase.from('categories').insert(defaults)
    loaded.value = false
  }

  function $reset() {
    categories.value = []
    loading.value = false
    error.value = null
    loaded.value = false
  }

  return { categories, loading, error, loaded, fetchCategories, addCategory, updateCategory, deleteCategory, seedDefaultCategories, $reset }
})
