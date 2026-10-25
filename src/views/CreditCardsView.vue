<script setup>
import { computed, ref, onMounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useCreditCardsStore } from '../stores/creditCards'
import { useCcExpensesStore } from '../stores/ccExpenses'
import { useCurrenciesStore } from '../stores/currencies'
import { useAuthStore } from '../stores/auth'
import { useCategoriesStore } from '../stores/categories'
import { useLabelsStore } from '../stores/labels'
import AppShell from '../components/layout/AppShell.vue'
import ModalWrapper from '../components/shared/ModalWrapper.vue'
import CreditCardForm from '../components/forms/CreditCardForm.vue'
import ConfirmDialog from '../components/shared/ConfirmDialog.vue'
import EmptyState from '../components/shared/EmptyState.vue'
import CandleLoader from '../components/shared/CandleLoader.vue'
import DateInput from '../components/shared/DateInput.vue'
import TransactionButton from '../components/shared/TransactionButton.vue'
import { formatDate, localISODate } from '../lib/dateFormat'
import { toCurrency, defaultCurrencyCode, defaultCurrencySymbol } from '../lib/money'

const router = useRouter()
const route = useRoute()
const creditCardsStore = useCreditCardsStore()
const ccExpensesStore = useCcExpensesStore()
const currenciesStore = useCurrenciesStore()
const auth = useAuthStore()
const categoriesStore = useCategoriesStore()
const labelsStore = useLabelsStore()

const expenseCategories = computed(() =>
  categoriesStore.categories.filter(c => c.type === 'expense')
)

function cardSymbol(card) {
  return currenciesStore.symbolOf(card?.currency || 'INR')
}

// expiry_month is stored as YYYY-MM → show MM/YY
function formatExpiry(value) {
  if (!value) return ''
  const parts = String(value).split('-')
  if (parts.length < 2) return ''
  const [yyyy, mm] = parts
  if (!yyyy || !mm) return ''
  return `${mm}/${yyyy.slice(-2)}`
}

const showForm = ref(false)
const editingCard = ref(null)
const deletingId = ref(null)

// Expense entry form state per card
const entryCardId = ref(null)
const editingEntryId = ref(null)
const entryForm = ref({ amount: null, description: '', date: localISODate(), category_id: null, labels: [] })

const totalOutstanding = computed(() => {
  const target = defaultCurrencyCode()
  return creditCardsStore.creditCards.reduce((sum, card) => {
    return sum + toCurrency(netDue(card), card.currency || 'INR', target)
  }, 0)
})

function creditLeft(card) {
  if (!card.credit_limit) return null
  return Number(card.credit_limit) - netDue(card)
}

function prepaidAmount(card) {
  return Math.max(0, Number(card.prepaid_amount || 0))
}

function netDue(card) {
  return Math.max(0, cardTotal(card) - prepaidAmount(card))
}

const paymentCategoryId = computed(() =>
  categoriesStore.categories.find(c => c.type === 'expense' && c.name.toLowerCase() === 'credit card bill')?.id || null
)

// A card is overdue when it has an outstanding (unpaid) balance and its due
// date is in the past. cardTotal() sums only UNPAID cc_expenses, so a fully
// paid card is never flagged even if the old due date has passed.
function isOverdue(card) {
  if (!card.due_date) return false
  if (netDue(card) <= 0) return false
  const due = new Date(card.due_date + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due < today
}

function daysOverdue(card) {
  if (!card.due_date) return 0
  const due = new Date(card.due_date + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((today - due) / 86400000))
}

const overdueCount = computed(() =>
  creditCardsStore.creditCards.filter(c => isOverdue(c)).length
)

onMounted(async () => {
  await Promise.all([
    creditCardsStore.fetchCreditCards(),
    ccExpensesStore.fetchExpenses(),
    currenciesStore.fetchCurrencies(),
    categoriesStore.fetchCategories(),
    labelsStore.fetchLabels(),
  ])

  // Prefill from a subscription "Pay" hand-off
  const q = route.query
  if (q.prefillCard) {
    const card = creditCardsStore.creditCards.find(c => c.id === q.prefillCard)
    if (card) {
      await nextTick()
      openEntryForm(card)
      entryForm.value.amount = q.prefillAmount ? Number(q.prefillAmount) : null
      entryForm.value.description = q.prefillDescription || ''
      // Clear query so a refresh doesn't re-trigger the prefill
      router.replace({ path: '/credit-cards' })
    }
  }
})

function openAdd() {
  editingCard.value = null
  showForm.value = true
}

function openEdit(card) {
  editingCard.value = card
  showForm.value = true
}

async function handleSubmit(data) {
  if (editingCard.value) {
    await creditCardsStore.updateCreditCard(editingCard.value.id, data)
  } else {
    await creditCardsStore.addCreditCard({ ...data, user_id: auth.user.id })
  }
  showForm.value = false
}

async function confirmDelete() {
  await ccExpensesStore.clearForCard(deletingId.value)
  await creditCardsStore.deleteCreditCard(deletingId.value)
  deletingId.value = null
}

function cardTotal(card) {
  return ccExpensesStore.totalForCard(card.id)
}

function utilization(card) {
  if (!card.credit_limit) return 0
  return ((netDue(card) / Number(card.credit_limit)) * 100).toFixed(1)
}

// Utilization above ~30% starts to hurt a credit score; above 70% is high.
function utilizationTone(card) {
  const u = Number(utilization(card))
  if (u >= 70) return 'is-high'
  if (u >= 30) return 'is-mid'
  return ''
}

// Each card gets its own face colour, chosen from a fixed palette by hashing
// its id, so a card keeps the same colour across sessions without storing it.
const CARD_FACES = [
  ['#0f5257', '#2a9d8f'],
  ['#272b6b', '#5a60c9'],
  ['#4a2a6b', '#8b52b8'],
  ['#1e2a38', '#41566e'],
  ['#0e4470', '#2f86c0'],
  ['#21473a', '#4c8467'],
  ['#5e2738', '#ab4f6b'],
]

function faceStyle(card) {
  const key = String(card.id || card.name || '')
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  const [from, to] = CARD_FACES[h % CARD_FACES.length]
  return { '--face-from': from, '--face-to': to }
}

function amount(value) {
  return Number(value || 0).toLocaleString('en-IN')
}

function nextMonthLastDay(dateStr) {
  if (!dateStr) return null
  const date = new Date(dateStr + 'T00:00:00')
  // Go to the last day of the next month
  const nextMonth = date.getMonth() + 2 // +2 because Date months are 0-indexed and we want next month's last day
  const lastDay = new Date(date.getFullYear(), nextMonth, 0) // day 0 of month N = last day of month N-1
  const yyyy = lastDay.getFullYear()
  const mm = String(lastDay.getMonth() + 1).padStart(2, '0')
  const dd = String(lastDay.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

async function payBill(card) {
  const billAmount = netDue(card)
  if (!window.confirm(`Record the full remaining payment of ${cardSymbol(card)}${amount(billAmount)} and archive this card's current expenses?`)) return

  router.push({
    path: '/transactions/add',
    query: {
      description: `${card.name} bill payment - ${new Date().toLocaleString('en-IN', { month: 'long' })}`,
      amount: billAmount,
      currency: card.currency || 'INR',
      type: 'expense',
      date: localISODate(),
      category_id: paymentCategoryId.value || '',
      bill_card_id: card.id,
    },
  })
}

function payPartial(card) {
  const remaining = netDue(card)
  const raw = window.prompt(`Partial payment for ${card.name} (up to ${cardSymbol(card)}${amount(remaining)}):`, '')
  if (raw == null || raw.trim() === '') return
  const partialAmount = Number(raw)
  if (!Number.isFinite(partialAmount) || partialAmount <= 0 || partialAmount > remaining) {
    window.alert('Enter a partial payment greater than zero and no more than the current Net Due.')
    return
  }

  router.push({
    path: '/transactions/add',
    query: {
      description: `${card.name} partial bill payment`,
      amount: partialAmount,
      currency: card.currency || 'INR',
      type: 'expense',
      date: localISODate(),
      category_id: paymentCategoryId.value || '',
      partial_card_id: card.id,
    },
  })
}

const entryCard = computed(() => creditCardsStore.creditCards.find(c => c.id === entryCardId.value) || null)

// Yesterday / Today / Tomorrow chips in the expense popup. Built from local
// date parts (never toISOString, which is UTC; see INV-61).
const DATE_OFFSETS = [
  { label: 'Yesterday', days: -1 },
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
]
function isoOffset(days) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return localISODate(d)
}

function openEntryForm(card) {
  entryCardId.value = card.id
  editingEntryId.value = null
  entryForm.value = { amount: null, description: '', date: localISODate(), category_id: null, labels: [] }
}

function closeEntryForm() {
  entryCardId.value = null
  editingEntryId.value = null
}

function startEditEntry(entry, card) {
  entryCardId.value = card.id
  editingEntryId.value = entry.id
  entryForm.value = {
    amount: entry.amount,
    description: entry.description,
    date: entry.date,
    category_id: entry.category_id || null,
    labels: entry.cc_expense_labels?.map(l => l.label_id) || [],
  }
}

function toggleEntryLabel(labelId) {
  const i = entryForm.value.labels.indexOf(labelId)
  if (i === -1) entryForm.value.labels.push(labelId)
  else entryForm.value.labels.splice(i, 1)
}

const submittingEntry = ref(false)

async function submitEntry() {
  if (submittingEntry.value) return
  if (!entryForm.value.amount || !entryForm.value.description.trim()) return
  submittingEntry.value = true
  try {
  const payload = {
    amount: Number(entryForm.value.amount),
    description: entryForm.value.description.trim(),
    date: entryForm.value.date,
    category_id: entryForm.value.category_id || null,
    labels: [...entryForm.value.labels],
  }
  if (editingEntryId.value) {
    await ccExpensesStore.updateExpense(editingEntryId.value, payload)
    editingEntryId.value = null
  } else {
    await ccExpensesStore.addExpense({
      credit_card_id: entryCardId.value,
      user_id: auth.user.id,
      ...payload,
    })
  }
  entryForm.value = { amount: null, description: '', date: localISODate(), category_id: null, labels: [] }
  entryCardId.value = null
  } finally {
    submittingEntry.value = false
  }
}

function categoryNameOf(entry) {
  if (!entry.category_id) return null
  return expenseCategories.value.find(c => c.id === entry.category_id)?.name || null
}

function labelsOf(entry) {
  const ids = entry.cc_expense_labels?.map(l => l.label_id) || []
  return labelsStore.labels.filter(l => ids.includes(l.id))
}

const historyEditingId = ref(null)
const historyEditForm = ref({ category_id: null, labels: [] })

function openHistoryEdit(entry) {
  historyEditingId.value = entry.id
  historyEditForm.value = {
    category_id: entry.category_id || null,
    labels: entry.cc_expense_labels?.map(l => l.label_id) || [],
  }
}

function toggleHistoryEditLabel(labelId) {
  const i = historyEditForm.value.labels.indexOf(labelId)
  if (i === -1) historyEditForm.value.labels.push(labelId)
  else historyEditForm.value.labels.splice(i, 1)
}

async function saveHistoryEdit(entry) {
  await ccExpensesStore.updateExpense(entry.id, {
    amount: entry.amount,
    description: entry.description,
    date: entry.date,
    category_id: historyEditForm.value.category_id,
    labels: [...historyEditForm.value.labels],
  })
  historyEditingId.value = null
}

const deletingEntryId = ref(null)

function removeEntry(id) {
  deletingEntryId.value = id
}

async function confirmRemoveEntry() {
  await ccExpensesStore.deleteExpense(deletingEntryId.value)
  deletingEntryId.value = null
}

// History modal
const historyCardId = ref(null)
const historyMonth = ref(new Date().getMonth() + 1)
const historyYear = ref(new Date().getFullYear())

function openHistory(card) {
  historyCardId.value = card.id
  // Default to latest paid entry's month/year
  const paid = ccExpensesStore.paidExpensesForCard(card.id)
  if (paid.length) {
    const latest = paid.sort((a, b) => b.paid_date?.localeCompare(a.paid_date))[0]
    if (latest.paid_date) {
      const [y, m] = latest.paid_date.split('-')
      historyYear.value = Number(y)
      historyMonth.value = Number(m)
    }
  }
}

const historyEntries = computed(() => {
  if (!historyCardId.value) return []
  const paid = ccExpensesStore.paidExpensesForCard(historyCardId.value)
  return paid.filter(e => {
    if (!e.paid_date) return false
    const [y, m] = e.paid_date.split('-')
    return Number(y) === historyYear.value && Number(m) === historyMonth.value
  })
})

const historyTotal = computed(() =>
  historyEntries.value.reduce((sum, e) => sum + Number(e.amount || 0), 0)
)

const historyAvailableYears = computed(() => {
  if (!historyCardId.value) return []
  const paid = ccExpensesStore.paidExpensesForCard(historyCardId.value)
  const years = new Set(paid.map(e => e.paid_date?.split('-')[0]).filter(Boolean).map(Number))
  return [...years].sort((a, b) => b - a)
})

const historyCardSymbol = computed(() => {
  if (!historyCardId.value) return defaultCurrencySymbol()
  const card = creditCardsStore.creditCards.find(c => c.id === historyCardId.value)
  return cardSymbol(card)
})

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
</script>

<template>
  <AppShell>
    <div class="cards-page">
      <div class="summary-banner card">
        <div class="summary-copy">
          <span class="summary-label">Outstanding across cards</span>
          <span class="summary-value num">{{ defaultCurrencySymbol() }}{{ totalOutstanding.toLocaleString('en-IN', { maximumFractionDigits: 0 }) }}</span>
          <span class="summary-sub">{{ creditCardsStore.creditCards.length }} {{ creditCardsStore.creditCards.length === 1 ? 'card' : 'cards' }} · in {{ defaultCurrencyCode() }}</span>
        </div>
        <div class="summary-side">
          <div v-if="overdueCount" class="summary-overdue-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            {{ overdueCount }} card{{ overdueCount > 1 ? 's' : '' }} overdue
          </div>
          <TransactionButton label="Add credit card" @click="openAdd" />
        </div>
      </div>

      <div v-if="creditCardsStore.loading" class="loader-container">
        <CandleLoader size="md" />
      </div>

      <EmptyState v-else-if="!creditCardsStore.creditCards.length" title="No credit cards" message="Add your first credit card to start tracking." />

      <div v-else class="cards-list">
        <div v-for="card in creditCardsStore.creditCards" :key="card.id" class="cc-item card" :class="{ 'cc-item--overdue': isOverdue(card) }">
          <div class="cc-side">
            <div class="cc-face" :style="faceStyle(card)">
              <div class="cc-face-top">
                <span class="cc-face-bank">{{ card.bank || 'Card' }}</span>
                <svg class="cc-face-chip" width="30" height="22" viewBox="0 0 30 22" aria-hidden="true"><rect x="0.5" y="0.5" width="29" height="21" rx="5" fill="rgba(255,255,255,0.28)" stroke="rgba(255,255,255,0.45)"/><path d="M10 1v20M20 1v20M1 8h9M20 8h9M1 14h9M20 14h9" stroke="rgba(255,255,255,0.45)" fill="none"/></svg>
              </div>
              <span class="cc-face-name">{{ card.name }}</span>
              <div class="cc-face-bottom">
                <span class="cc-face-number">•••• {{ card.last_four || '••••' }}</span>
                <span v-if="formatExpiry(card.expiry_month)" class="cc-face-exp">{{ formatExpiry(card.expiry_month) }}</span>
              </div>
            </div>
            <span v-if="isOverdue(card)" class="cc-overdue-pill">Overdue by {{ daysOverdue(card) }} {{ daysOverdue(card) === 1 ? 'day' : 'days' }}</span>
          </div>

          <button class="btn-history" @click="openHistory(card)" title="Payment history" aria-label="Payment history">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
          </button>

          <div class="cc-details">
            <div class="cc-headline">
              <div class="cc-head-stat">
                <span class="stat-label">Net due</span>
                <span class="head-value num">{{ cardSymbol(card) }}{{ amount(netDue(card)) }}</span>
                <span v-if="card.due_date" class="head-sub" :class="{ 'is-late': isOverdue(card) }">
                  {{ isOverdue(card) ? 'Was due' : 'Due' }} {{ formatDate(card.due_date) }}
                </span>
              </div>
              <div v-if="card.credit_limit" class="cc-head-stat">
                <span class="stat-label">Credit left</span>
                <span class="head-value num stat-credit-left">{{ cardSymbol(card) }}{{ amount(creditLeft(card)) }}</span>
                <span class="head-sub">of {{ cardSymbol(card) }}{{ amount(card.credit_limit) }} limit</span>
              </div>
            </div>

            <div class="cc-stats">
              <div class="cc-stat">
                <span class="stat-label">Total spend</span>
                <span class="stat-value num">{{ cardSymbol(card) }}{{ amount(cardTotal(card)) }}</span>
              </div>
              <div class="cc-stat">
                <span class="stat-label">Paid toward bill</span>
                <span class="stat-value num" :class="{ 'stat-prepaid': prepaidAmount(card) > 0 }">{{ cardSymbol(card) }}{{ amount(prepaidAmount(card)) }}</span>
              </div>
              <div v-if="card.credit_limit" class="cc-stat utilization-section">
                <div class="utilization-header">
                  <span class="stat-label">Utilization</span>
                  <span class="utilization-pct num">{{ utilization(card) }}%</span>
                </div>
                <div class="utilization-track">
                  <div class="utilization-fill" :class="utilizationTone(card)" :style="{ width: Math.min(Number(utilization(card)), 100) + '%' }"></div>
                </div>
              </div>
            </div>

            <!-- Expense entries -->
            <div class="entries-section">
              <div class="entries-header">
                <span class="stat-label">Expenses</span>
                <button class="btn-add-entry" @click="openEntryForm(card)">
                  <span class="btn-add-plus" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  </span>
                  Add expense
                </button>
              </div>

              <div v-if="ccExpensesStore.expensesForCard(card.id).length" class="entries-list">
                <div v-for="entry in ccExpensesStore.expensesForCard(card.id)" :key="entry.id" class="entry-row">
                  <div class="entry-info">
                    <span class="entry-desc">
                      {{ entry.description }}
                      <span v-if="categoryNameOf(entry)" class="entry-cat-pill">{{ categoryNameOf(entry) }}</span>
                      <span v-else class="entry-cat-pill entry-cat-pill--missing">Uncategorized</span>
                    </span>
                    <span class="entry-date">{{ formatDate(entry.date) }}</span>
                    <div v-if="labelsOf(entry).length" class="entry-labels">
                      <span
                        v-for="l in labelsOf(entry)"
                        :key="l.id"
                        class="entry-label-tag"
                        :style="{ '--label-color': l.color }"
                      >{{ l.name }}</span>
                    </div>
                  </div>
                  <div class="entry-right">
                    <span class="entry-amount-val num">{{ cardSymbol(card) }}{{ amount(entry.amount) }}</span>
                    <button class="btn-entry-edit" title="Edit expense" aria-label="Edit expense" @click="startEditEntry(entry, card)">✎</button>
                    <button class="btn-entry-remove" title="Delete expense" aria-label="Delete expense" @click="removeEntry(entry.id)">×</button>
                  </div>
                </div>
              </div>
              <p v-else class="entries-empty">No expenses recorded</p>
            </div>

            <div class="cc-actions">
              <button v-if="netDue(card) > 0" class="btn-action btn-primary" @click="payBill(card)">Record Full Payment</button>
              <button v-if="netDue(card) > 0" class="btn-action" @click="payPartial(card)">Pay Partial</button>
              <span class="cc-actions-spacer"></span>
              <button class="btn-action btn-ghost" @click="openEdit(card)">Edit</button>
              <button class="btn-action btn-ghost btn-action-danger" @click="deletingId = card.id">Delete</button>
            </div>
          </div>
        </div>
      </div>

      <ModalWrapper v-if="showForm" @close="showForm = false">
        <h3>{{ editingCard ? 'Edit' : 'Add' }} Credit Card</h3>
        <CreditCardForm :card="editingCard" @submit="handleSubmit" @cancel="showForm = false" />
      </ModalWrapper>

      <ConfirmDialog v-if="deletingId" title="Delete Credit Card" message="Are you sure you want to delete this credit card and all its expenses?" @confirm="confirmDelete" @cancel="deletingId = null" />

      <ConfirmDialog v-if="deletingEntryId" title="Delete Expense" message="Are you sure you want to delete this expense entry?" @confirm="confirmRemoveEntry" @cancel="deletingEntryId = null" />

      <!-- Add / Edit Expense Modal -->
      <Teleport to="body">
        <div v-if="entryCard" class="entry-backdrop" @click.self="closeEntryForm">
          <div class="entry-modal">
            <div class="entry-modal-header">
              <h3>{{ editingEntryId ? 'Edit Expense' : 'Add Expense' }}</h3>
              <button class="entry-close" @click="closeEntryForm" aria-label="Close">×</button>
            </div>
            <p class="entry-modal-sub">{{ entryCard.name }}<template v-if="entryCard.last_four"> · *{{ entryCard.last_four }}</template></p>

            <div class="entry-field">
              <label class="entry-field-label">Description</label>
              <input v-model="entryForm.description" placeholder="e.g. Groceries" class="entry-input" />
            </div>

            <div class="entry-field-row">
              <div class="entry-field">
                <label class="entry-field-label">Amount ({{ cardSymbol(entryCard) }})</label>
                <input v-model.number="entryForm.amount" type="number" min="0" step="0.01" placeholder="0.00" class="entry-input" />
              </div>
              <div class="entry-field">
                <label class="entry-field-label">Date</label>
                <DateInput v-model="entryForm.date" />
              </div>
            </div>

            <div class="entry-date-chips" role="group" aria-label="Quick date">
              <button
                v-for="o in DATE_OFFSETS"
                :key="o.label"
                type="button"
                class="entry-date-chip"
                :class="{ active: entryForm.date === isoOffset(o.days) }"
                @click="entryForm.date = isoOffset(o.days)"
              >{{ o.label }}</button>
            </div>

            <div class="entry-field">
              <label class="entry-field-label">Category</label>
              <select v-model="entryForm.category_id" class="entry-input">
                <option :value="null">Uncategorized</option>
                <option v-for="c in expenseCategories" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
            </div>

            <div v-if="labelsStore.labels.length" class="entry-field">
              <label class="entry-field-label">Labels</label>
              <div class="entry-label-grid">
                <button
                  v-for="label in labelsStore.labels"
                  :key="label.id"
                  type="button"
                  class="entry-label-chip"
                  :class="{ selected: entryForm.labels.includes(label.id) }"
                  :style="{ '--label-color': label.color }"
                  @click="toggleEntryLabel(label.id)"
                >
                  <span class="label-dot"></span>{{ label.name }}
                </button>
              </div>
            </div>

            <div class="entry-modal-actions">
              <button class="btn-sm" @click="closeEntryForm">Cancel</button>
              <button class="btn-primary btn-sm" :disabled="submittingEntry" @click="submitEntry">{{ editingEntryId ? 'Update' : 'Add' }}</button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- History Modal -->
      <Teleport to="body">
        <div v-if="historyCardId" class="history-backdrop" @click.self="historyCardId = null">
          <div class="history-card">
            <div class="history-header">
              <h3>Payment History</h3>
              <button class="history-close" @click="historyCardId = null">×</button>
            </div>
            <div class="history-filters">
              <select v-model="historyMonth">
                <option v-for="(m, i) in MONTHS" :key="i" :value="i + 1">{{ m }}</option>
              </select>
              <select v-model="historyYear">
                <option v-for="y in historyAvailableYears" :key="y" :value="y">{{ y }}</option>
              </select>
            </div>
            <div class="history-total">
              <span class="stat-label">Total</span>
              <strong>{{ historyCardSymbol }}{{ historyTotal.toLocaleString('en-IN') }}</strong>
            </div>
            <div v-if="historyEntries.length" class="history-list">
              <template v-for="entry in historyEntries" :key="entry.id">
                <div class="history-row">
                  <div class="history-info">
                    <span class="history-desc">
                      {{ entry.description }}
                      <span v-if="categoryNameOf(entry)" class="entry-cat-pill">{{ categoryNameOf(entry) }}</span>
                      <span v-else class="entry-cat-pill entry-cat-pill--missing">Uncategorized</span>
                    </span>
                    <span class="history-date">{{ formatDate(entry.date) }}</span>
                    <div v-if="labelsOf(entry).length" class="entry-labels">
                      <span
                        v-for="l in labelsOf(entry)"
                        :key="l.id"
                        class="entry-label-tag"
                        :style="{ '--label-color': l.color }"
                      >{{ l.name }}</span>
                    </div>
                  </div>
                  <div class="history-right">
                    <span class="history-amount">{{ historyCardSymbol }}{{ amount(entry.amount) }}</span>
                    <button class="btn-entry-edit" title="Edit category/labels" @click="openHistoryEdit(entry)">✎</button>
                  </div>
                </div>
                <div v-if="historyEditingId === entry.id" class="history-edit-panel">
                  <label class="history-edit-label">Category</label>
                  <select v-model="historyEditForm.category_id" class="entry-input">
                    <option :value="null">Uncategorized</option>
                    <option v-for="c in expenseCategories" :key="c.id" :value="c.id">{{ c.name }}</option>
                  </select>
                  <label class="history-edit-label">Labels</label>
                  <div class="entry-label-grid">
                    <button
                      v-for="label in labelsStore.labels"
                      :key="label.id"
                      type="button"
                      class="entry-label-chip"
                      :class="{ selected: historyEditForm.labels.includes(label.id) }"
                      :style="{ '--label-color': label.color }"
                      @click="toggleHistoryEditLabel(label.id)"
                    >
                      <span class="label-dot"></span>{{ label.name }}
                    </button>
                  </div>
                  <div class="entry-form-actions">
                    <button class="btn-primary btn-sm" @click="saveHistoryEdit(entry)">Save</button>
                    <button class="btn-sm" @click="historyEditingId = null">Cancel</button>
                  </div>
                </div>
              </template>
            </div>
            <p v-else class="entries-empty">No paid expenses for this period</p>
          </div>
        </div>
      </Teleport>
    </div>
  </AppShell>
</template>

<style scoped>
.cards-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
  max-width: 100%;
}

.page-header {
  display: flex;
  justify-content: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}

.stat-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
}

/* Summary */
.summary-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  padding: 22px 24px;
  background: var(--bg-accent), var(--bg-secondary);
}

.summary-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.summary-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
}

.summary-value {
  font-size: 2rem;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.02em;
}

.summary-sub {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.summary-side {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.summary-overdue-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--expense);
  background: color-mix(in srgb, var(--expense) 12%, transparent);
  white-space: nowrap;
}

/* Card rows */
.cards-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
  max-width: 100%;
}

.cc-item {
  position: relative;
  display: grid;
  /* The face column may shrink to 0 so it can never force the row wider than
     the viewport (the shell clips horizontal overflow). */
  grid-template-columns: minmax(0, 300px) minmax(0, 1fr);
  gap: 28px;
  padding: 24px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.cc-item--overdue {
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--expense) 55%, transparent), var(--shadow-sm);
}

.cc-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

/* The card face: proportioned like a real card (85.6 × 54 mm). */
.cc-face {
  position: relative;
  width: 100%;
  max-width: 300px;
  aspect-ratio: 1.586;
  padding: 18px 20px;
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: #ffffff;
  overflow: hidden;
  background:
    radial-gradient(120% 90% at 100% 0%, rgba(255, 255, 255, 0.22), transparent 55%),
    linear-gradient(135deg, var(--face-from), var(--face-to));
  box-shadow: 0 14px 30px -12px color-mix(in srgb, var(--face-from) 80%, transparent);
}

.cc-face-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.cc-face-bank {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cc-face-name {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cc-face-bottom {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
}

.cc-face-number {
  font-size: 0.95rem;
  letter-spacing: 0.14em;
}

.cc-face-exp {
  font-size: 0.78rem;
  opacity: 0.85;
}

.cc-overdue-pill {
  align-self: flex-start;
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--expense);
  background: color-mix(in srgb, var(--expense) 13%, transparent);
}

.btn-history {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 50%;
  background: var(--bg-elevated);
  border: 0;
  color: var(--text-muted);
  display: grid;
  place-items: center;
  z-index: 1;
}

.btn-history:hover {
  color: var(--accent);
  background: var(--accent-dim);
}

.cc-details {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
  max-width: 100%;
}

.cc-headline {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding-right: 44px;
}

.cc-head-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.head-value {
  font-size: 1.7rem;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}

.head-sub {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.head-sub.is-late {
  color: var(--expense);
  font-weight: 700;
}

.stat-credit-left {
  color: var(--income);
}

.cc-stats {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.4fr);
  gap: 12px;
  min-width: 0;
}

.cc-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  min-width: 0;
}

.stat-value {
  font-size: 1.02rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.stat-prepaid {
  color: var(--income);
}

.utilization-section {
  justify-content: space-between;
}

.utilization-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.utilization-pct {
  font-size: 0.85rem;
  font-weight: 600;
}

.utilization-track {
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--bg-surface);
  overflow: hidden;
}

.utilization-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
}

.utilization-fill.is-mid { background: var(--warning); }
.utilization-fill.is-high { background: var(--expense); }

/* Expense entries */
.entries-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.entries-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.btn-add-entry {
  gap: 8px;
  padding: 6px 16px 6px 6px;
  font-size: 0.86rem;
  font-weight: 700;
  background: var(--accent-dim);
  color: var(--accent);
  border: 0;
}

.btn-add-entry:hover {
  background: color-mix(in srgb, var(--accent) 24%, transparent);
}

.btn-add-plus {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--accent-ink);
}

.entry-date-chips {
  display: flex;
  gap: 8px;
  margin-top: -6px;
}

.entry-date-chip {
  flex: 1;
  padding: 7px 10px;
  font-size: 0.8rem;
  font-weight: 700;
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

.entry-date-chip.active {
  background: var(--accent-dim);
  color: var(--accent);
}

.entries-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 260px;
  overflow-y: auto;
  min-width: 0;
}

.entry-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  min-width: 0;
  max-width: 100%;
  transition: background-color var(--transition);
}

.entry-row:hover {
  background: var(--bg-elevated);
}

.entry-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.entry-desc {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-date {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.entry-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.entry-amount-val {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-right: 4px;
}

.btn-entry-edit,
.btn-entry-remove {
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 50%;
  font-size: 0.95rem;
  line-height: 1;
  background: transparent;
  color: var(--text-muted);
  border: 0;
}

.btn-entry-edit:hover {
  color: var(--accent);
  background: var(--accent-dim);
}

.btn-entry-remove:hover {
  color: var(--expense);
  background: color-mix(in srgb, var(--expense) 12%, transparent);
}

.entries-empty {
  font-size: 0.85rem;
  color: var(--text-muted);
  padding: 8px 0;
}

.entry-cat-pill {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 9px;
  border-radius: var(--radius-pill);
  font-size: 0.7rem;
  font-weight: 600;
  vertical-align: 1px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  white-space: nowrap;
}

.entry-cat-pill--missing {
  background: color-mix(in srgb, var(--warning) 14%, transparent);
  color: var(--warning);
}

.entry-labels {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.entry-label-tag {
  display: inline-block;
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  font-size: 0.68rem;
  font-weight: 700;
  background: var(--label-color);
  color: #11151b;
  white-space: nowrap;
}

/* Actions */
.cc-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cc-actions-spacer {
  flex: 1;
}

.btn-ghost {
  background: transparent;
}

.btn-ghost:hover {
  background: var(--bg-elevated);
}

.btn-action-danger {
  color: var(--expense);
}

.btn-action-danger:hover {
  background: color-mix(in srgb, var(--expense) 12%, transparent);
}

.loader-container {
  display: flex;
  justify-content: center;
  padding: 56px 0;
}

.btn-sm {
  padding: 8px 16px;
  font-size: 0.82rem;
}

/* Add / edit expense modal */
.entry-backdrop,
.history-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 8, 16, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 16px;
}

.entry-modal,
.history-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 24px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: var(--shadow-lg);
}

.entry-modal { max-width: 440px; }
.history-card { max-width: 480px; max-height: 80vh; }

.entry-modal-header,
.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.entry-modal-header h3,
.history-header h3 {
  font-size: 1.15rem;
  font-weight: 600;
}

.entry-close,
.history-close {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-elevated);
  border: 0;
  color: var(--text-muted);
  font-size: 1.2rem;
  line-height: 1;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  padding: 0;
}

.entry-close:hover,
.history-close:hover {
  color: var(--text-primary);
  background: var(--bg-surface);
}

.entry-modal-sub {
  margin: -8px 0 0;
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--text-muted);
}

.entry-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.entry-field-label,
.history-edit-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
}

.entry-field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.entry-input {
  min-height: 42px;
  min-width: 0;
}

.entry-modal-actions,
.entry-form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.entry-form-actions {
  grid-column: 1 / -1;
}

.entry-label-grid {
  grid-column: 1 / -1;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.entry-label-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 600;
}

.entry-label-chip.selected {
  background: var(--label-color);
  border-color: transparent;
  color: #11151b;
}

.entry-label-chip.selected .label-dot {
  background: #11151b;
  opacity: 0.5;
}

.entry-label-chip .label-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--label-color);
}

/* Payment history */
.history-filters {
  display: flex;
  gap: 8px;
}

.history-filters select {
  flex: 1;
}

.history-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
}

.history-total strong {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  font-size: 1.15rem;
  font-weight: 600;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  flex: 1;
}

.history-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
}

.history-row:hover {
  background: var(--bg-elevated);
}

.history-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.history-desc {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-date {
  font-size: 0.74rem;
  color: var(--text-muted);
}

.history-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.history-amount {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  font-size: 0.9rem;
  font-weight: 600;
  flex-shrink: 0;
}

.history-edit-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  margin: 4px 0 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
}

/* Stack early: large phones in landscape (~915px) and tablets would otherwise
   crowd the face beside the details and push the actions past the clipped
   right edge. */
@media (max-width: 1024px) {
  .cc-item {
    grid-template-columns: minmax(0, 1fr);
    padding: 20px;
    gap: 20px;
  }

  .cc-face {
    max-width: 340px;
  }
}

@media (max-width: 640px) {
  .summary-banner {
    padding: 18px;
  }

  .summary-value {
    font-size: 1.7rem;
  }

  .summary-side {
    width: 100%;
    justify-content: space-between;
  }

  .cc-item {
    padding: 16px;
    gap: 16px;
  }

  .cc-face {
    max-width: none;
  }

  .cc-headline {
    padding-right: 0;
  }

  .head-value {
    font-size: 1.35rem;
  }

  .cc-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cc-stats .utilization-section {
    grid-column: 1 / -1;
  }

  .btn-history {
    top: 26px;
    right: 26px;
    background: rgba(255, 255, 255, 0.18);
    color: #ffffff;
  }

  .cc-face-chip {
    display: none;
  }

  .cc-actions .btn-action {
    flex: 1 1 auto;
  }

  .cc-actions-spacer {
    display: none;
  }
}

@media (max-width: 440px) {
  .entry-field-row {
    grid-template-columns: 1fr;
  }
}
</style>
