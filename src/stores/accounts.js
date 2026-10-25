import { defineStore } from 'pinia'
import { createCollection } from '../lib/storage/collection'

function normalizeAccount(payload) {
  return {
    ...payload,
    name: payload.name?.trim() || '',
    currency: payload.currency || 'INR',
    current_balance: Number(payload.current_balance || 0),
    is_active: payload.is_active ?? true,
  }
}

export const useAccountsStore = defineStore('accounts', () => {
  // Local-first storage: IndexedDB + the storage adapter (src/lib/storage).
  const col = createCollection({ table: 'accounts', cacheKey: 'accounts', orderBy: [['name', 'asc']] })

  function fetchAccounts(force = false) {
    return col.fetch(force)
  }

  function addAccount(payload) {
    return col.insert(normalizeAccount(payload))
  }

  function updateAccount(id, payload) {
    return col.update(id, normalizeAccount(payload))
  }

  function deleteAccount(id) {
    return col.remove(id)
  }

  async function updateBalance(id, delta) {
    const account = col.items.value.find(entry => entry.id === id)
    if (!account) return
    const nextBalance = Number(account.current_balance || 0) + Number(delta || 0)
    await updateAccount(id, { ...account, current_balance: nextBalance })
  }

  return {
    accounts: col.items,
    loading: col.loading,
    error: col.error,
    loaded: col.loaded,
    fetchAccounts,
    addAccount,
    updateAccount,
    deleteAccount,
    updateBalance,
    $reset: col.reset,
  }
})
