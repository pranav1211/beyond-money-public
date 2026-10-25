import { defineStore } from 'pinia'
import { createCollection } from '../lib/storage/collection'
import { getAdapter } from '../lib/storage'

function normalizeCategory(payload) {
  return {
    ...payload,
    name: payload.name?.trim(),
    icon: payload.icon?.trim() || null,
  }
}

export const useCategoriesStore = defineStore('categories', () => {
  // Local-first storage: IndexedDB + the storage adapter (src/lib/storage).
  const col = createCollection({ table: 'categories', cacheKey: 'categories', orderBy: [['type', 'asc'], ['name', 'asc']] })
  const categories = col.items

  function fetchCategories(force = false) {
    return col.fetch(force)
  }

  function addCategory(payload) {
    return col.insert(normalizeCategory(payload))
  }

  // Find a category by (name, type) case-insensitively, creating it if missing.
  // Used by the automated investing flows so every buy/sell transaction lands on
  // a real category instead of null. Returns the category row (with id).
  async function ensureCategory({ name, type, color, icon }, userId) {
    await fetchCategories()
    const wanted = String(name).trim().toLowerCase()
    const existing = categories.value.find(
      c => c.type === type && String(c.name || '').trim().toLowerCase() === wanted
    )
    if (existing) return existing
    return addCategory({ user_id: userId, name, type, color: color || '#6366f1', icon: icon || null })
  }

  function updateCategory(id, payload) {
    return col.update(id, normalizeCategory(payload))
  }

  function deleteCategory(id) {
    return col.remove(id)
  }

  // First sign-in: give a new user a starter set. Online only, and only when the
  // backend has no categories for them yet.
  async function seedDefaultCategories(userId) {
    if (!userId || !navigator.onLine) return
    let existing
    try { existing = await getAdapter().list('categories') } catch { return }
    if (existing.length) return

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
      // Investing flows (buy/sell) depend on these — see INVESTING_CATEGORIES.
      { user_id: userId, name: 'Investment', type: 'expense', color: '#5f3dc4', icon: 'investment' },
      { user_id: userId, name: 'Capital Returned', type: 'income', color: '#1098ad', icon: 'investment' },
      { user_id: userId, name: 'Realized Gain', type: 'income', color: '#2f9e44', icon: 'investment' },
      { user_id: userId, name: 'Realized Loss', type: 'expense', color: '#e03131', icon: 'investment' },
    ]

    await Promise.all(defaults.map(row => col.insert(row)))
  }

  return {
    categories,
    loading: col.loading,
    error: col.error,
    loaded: col.loaded,
    fetchCategories,
    addCategory,
    ensureCategory,
    updateCategory,
    deleteCategory,
    seedDefaultCategories,
    $reset: col.reset,
  }
})
