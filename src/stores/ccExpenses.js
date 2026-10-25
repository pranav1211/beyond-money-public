import { defineStore } from 'pinia'
import { localISODate } from '../lib/dateFormat'
import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase'
import { idbGet, idbSet } from '../lib/idb'
import { useSyncStore } from './sync'

export const useCcExpensesStore = defineStore('ccExpenses', () => {
  const expenses = ref([])
  const loading = ref(false)
  const error = ref(null)
  const loaded = ref(false)

  function totalForCard(cardId) {
    return expenses.value
      .filter(e => e.credit_card_id === cardId && !e.is_paid)
      .reduce((sum, e) => sum + Number(e.amount || 0), 0)
  }

  function expensesForCard(cardId) {
    return expenses.value.filter(e => e.credit_card_id === cardId && !e.is_paid)
  }

  function paidExpensesForCard(cardId) {
    return expenses.value.filter(e => e.credit_card_id === cardId && e.is_paid)
  }

  async function fetchExpenses(force = false) {
    if (loaded.value && !force) return expenses.value

    if (!loaded.value) {
      const cached = await idbGet('ccExpenses')
      if (cached.length) {
        expenses.value = cached
        loaded.value = true
      }
    }

    if (!navigator.onLine) { loading.value = false; return expenses.value }

    loading.value = !loaded.value
    const { data, error: err } = await supabase
      .from('cc_expenses')
      .select('*, cc_expense_labels(label_id)')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })

    if (err) {
      if (!loaded.value) error.value = err.message
    } else {
      expenses.value = data || []
      loaded.value = true
      idbSet('ccExpenses', expenses.value)
    }
    loading.value = false
    return expenses.value
  }

  async function addExpense(payload) {
    const { labels = [], ...rest } = payload
    const normalized = {
      credit_card_id: rest.credit_card_id,
      user_id: rest.user_id,
      amount: Number(rest.amount || 0),
      description: (rest.description || '').trim(),
      date: rest.date || localISODate(),
      category_id: rest.category_id || null,
    }

    const { data, error: err } = await supabase.from('cc_expenses').insert(normalized).select().single()
    if (err) {
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const localEntry = { ...normalized, id: tempId, created_at: new Date().toISOString(), cc_expense_labels: labels.map(label_id => ({ label_id })) }
      expenses.value.unshift(localEntry)
      loaded.value = true
      idbSet('ccExpenses', expenses.value)
      useSyncStore().enqueue({ table: 'cc_expenses', action: 'insert', payload: normalized, _labels: labels })
      return localEntry
    }

    if (labels.length) {
      const { error: labelsError } = await supabase.from('cc_expense_labels').insert(
        labels.map(label_id => ({ cc_expense_id: data.id, label_id }))
      )
      if (labelsError) console.warn('cc_expense_labels insert failed', labelsError)
    }

    const enriched = { ...data, cc_expense_labels: labels.map(label_id => ({ label_id })) }
    expenses.value.unshift(enriched)
    loaded.value = true
    idbSet('ccExpenses', expenses.value)
    return enriched
  }

  async function updateExpense(id, payload) {
    const { labels, ...rest } = payload
    const normalized = {
      amount: Number(rest.amount || 0),
      description: (rest.description || '').trim(),
      date: rest.date || localISODate(),
      category_id: rest.category_id ?? null,
    }
    const index = expenses.value.findIndex(e => e.id === id)
    const labelsProvided = Array.isArray(labels)
    if (index !== -1) {
      expenses.value[index] = {
        ...expenses.value[index],
        ...normalized,
        ...(labelsProvided ? { cc_expense_labels: labels.map(label_id => ({ label_id })) } : {}),
      }
    }
    idbSet('ccExpenses', expenses.value)

    const { data, error: err } = await supabase.from('cc_expenses').update(normalized).eq('id', id).select().single()
    if (err) {
      useSyncStore().enqueue({ table: 'cc_expenses', action: 'update', recordId: id, payload: normalized, _labels: labelsProvided ? labels : undefined })
      return expenses.value[index]
    }

    if (labelsProvided) {
      await supabase.from('cc_expense_labels').delete().eq('cc_expense_id', id)
      if (labels.length) {
        const { error: labelsError } = await supabase.from('cc_expense_labels').insert(
          labels.map(label_id => ({ cc_expense_id: id, label_id }))
        )
        if (labelsError) console.warn('cc_expense_labels insert failed', labelsError)
      }
    }

    if (index !== -1) {
      expenses.value[index] = {
        ...data,
        cc_expense_labels: labelsProvided
          ? labels.map(label_id => ({ label_id }))
          : (expenses.value[index].cc_expense_labels || []),
      }
    }
    idbSet('ccExpenses', expenses.value)
    return expenses.value[index]
  }

  async function deleteExpense(id) {
    expenses.value = expenses.value.filter(e => e.id !== id)
    idbSet('ccExpenses', expenses.value)

    const { error: err } = await supabase.from('cc_expenses').delete().eq('id', id)
    if (err && !String(id).startsWith('temp_')) {
      useSyncStore().enqueue({ table: 'cc_expenses', action: 'delete', recordId: id })
    }
  }

  async function archiveForCard(cardId) {
    const toArchive = expenses.value.filter(e => e.credit_card_id === cardId && !e.is_paid)
    const paidDate = localISODate()

    // Mark locally
    for (const e of toArchive) {
      e.is_paid = true
      e.paid_date = paidDate
    }
    idbSet('ccExpenses', expenses.value)

    // Update in DB
    const ids = toArchive.filter(e => !String(e.id).startsWith('temp_')).map(e => e.id)
    if (ids.length) {
      const { error: err } = await supabase
        .from('cc_expenses')
        .update({ is_paid: true, paid_date: paidDate })
        .in('id', ids)
      if (err) {
        useSyncStore().enqueue({ table: 'cc_expenses', action: 'update_batch', payload: { ids, update: { is_paid: true, paid_date: paidDate } } })
      }
    }
  }

  async function clearForCard(cardId) {
    const toDelete = expenses.value.filter(e => e.credit_card_id === cardId)
    expenses.value = expenses.value.filter(e => e.credit_card_id !== cardId)
    idbSet('ccExpenses', expenses.value)

    for (const e of toDelete) {
      if (!String(e.id).startsWith('temp_')) {
        await supabase.from('cc_expenses').delete().eq('id', e.id)
      }
    }
  }

  function $reset() {
    expenses.value = []
    loading.value = false
    error.value = null
    loaded.value = false
  }

  return { expenses, loading, error, loaded, totalForCard, expensesForCard, paidExpensesForCard, fetchExpenses, addExpense, updateExpense, deleteExpense, archiveForCard, clearForCard, $reset }
})
