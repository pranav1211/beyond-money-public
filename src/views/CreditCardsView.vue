<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCreditCardsStore } from '../stores/creditCards'
import { useCcExpensesStore } from '../stores/ccExpenses'
import { useAuthStore } from '../stores/auth'
import AppShell from '../components/layout/AppShell.vue'
import ModalWrapper from '../components/shared/ModalWrapper.vue'
import CreditCardForm from '../components/forms/CreditCardForm.vue'
import ConfirmDialog from '../components/shared/ConfirmDialog.vue'
import EmptyState from '../components/shared/EmptyState.vue'
import CreditCardWidget from '../components/shared/CreditCardWidget.vue'
import CandleLoader from '../components/shared/CandleLoader.vue'
import DateInput from '../components/shared/DateInput.vue'
import { formatDate } from '../lib/dateFormat'

const router = useRouter()
const creditCardsStore = useCreditCardsStore()
const ccExpensesStore = useCcExpensesStore()
const auth = useAuthStore()

const showForm = ref(false)
const editingCard = ref(null)
const deletingId = ref(null)

// Expense entry form state per card
const entryCardId = ref(null)
const editingEntryId = ref(null)
const entryForm = ref({ amount: null, description: '', date: new Date().toISOString().split('T')[0] })

const totalOutstanding = computed(() =>
  creditCardsStore.creditCards.reduce((sum, card) => sum + ccExpensesStore.totalForCard(card.id), 0)
)

onMounted(async () => {
  await Promise.all([
    creditCardsStore.fetchCreditCards(),
    ccExpensesStore.fetchExpenses(),
  ])
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
  return ((cardTotal(card) / Number(card.credit_limit)) * 100).toFixed(1)
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
  const billAmount = cardTotal(card)

  // Archive expenses for this billing cycle (keeps history)
  await ccExpensesStore.archiveForCard(card.id)

  // Set due date to last day of next month
  const nextDue = nextMonthLastDay(card.due_date)
  await creditCardsStore.updateCreditCard(card.id, { ...card, due_date: nextDue })

  router.push({
    path: '/transactions/add',
    query: {
      description: `${card.name} bill payment - ${new Date().toLocaleString('en-IN', { month: 'long' })}`,
      amount: billAmount,
      type: 'expense',
    },
  })
}

function openEntryForm(card) {
  entryCardId.value = card.id
  editingEntryId.value = null
  entryForm.value = { amount: null, description: '', date: new Date().toISOString().split('T')[0] }
}

function startEditEntry(entry, card) {
  entryCardId.value = card.id
  editingEntryId.value = entry.id
  entryForm.value = { amount: entry.amount, description: entry.description, date: entry.date }
}

async function submitEntry() {
  if (!entryForm.value.amount || !entryForm.value.description.trim()) return
  if (editingEntryId.value) {
    await ccExpensesStore.updateExpense(editingEntryId.value, {
      amount: Number(entryForm.value.amount),
      description: entryForm.value.description.trim(),
      date: entryForm.value.date,
    })
    editingEntryId.value = null
  } else {
    await ccExpensesStore.addExpense({
      credit_card_id: entryCardId.value,
      user_id: auth.user.id,
      amount: Number(entryForm.value.amount),
      description: entryForm.value.description.trim(),
      date: entryForm.value.date,
    })
  }
  entryForm.value = { amount: null, description: '', date: new Date().toISOString().split('T')[0] }
  entryCardId.value = null
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

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
</script>

<template>
  <AppShell>
    <div class="cards-page">
      <div class="page-header">
        <button class="btn-primary" @click="openAdd">Add Credit Card</button>
      </div>

      <div class="summary-banner card">
        <div>
          <span class="summary-label">Outstanding</span>
          <h3>₹{{ totalOutstanding.toLocaleString('en-IN') }}</h3>
        </div>
      </div>

      <div v-if="creditCardsStore.loading" class="loader-container">
        <CandleLoader size="md" />
      </div>

      <EmptyState v-else-if="!creditCardsStore.creditCards.length" title="No credit cards" message="Add your first credit card to start tracking." />

      <div v-else class="cards-list">
        <div v-for="card in creditCardsStore.creditCards" :key="card.id" class="cc-item card">
          <button class="btn-history" @click="openHistory(card)" title="Payment History">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </button>
          <div class="cc-widget-wrapper">
            <CreditCardWidget
              :name="card.name"
              :lastFour="card.last_four"
            />
          </div>

          <div class="cc-details">
            <div class="cc-stats">
              <div class="cc-stat">
                <span class="stat-label">Credit Limit</span>
                <span class="stat-value">₹{{ amount(card.credit_limit) }}</span>
              </div>
              <div class="cc-stat">
                <span class="stat-label">Total Spend</span>
                <span class="stat-value stat-balance">₹{{ amount(cardTotal(card)) }}</span>
              </div>
              <div v-if="card.due_date" class="cc-stat">
                <span class="stat-label">Due Date</span>
                <span class="stat-value stat-due">{{ formatDate(card.due_date) }}</span>
              </div>
            </div>

            <div class="utilization-section">
              <div class="utilization-header">
                <span class="stat-label">Utilization</span>
                <span class="utilization-pct">{{ utilization(card) }}%</span>
              </div>
              <div class="utilization-track">
                <div class="utilization-fill" :style="{ width: Math.min(Number(utilization(card)), 100) + '%' }"></div>
              </div>
            </div>

            <!-- Expense entries -->
            <div class="entries-section">
              <div class="entries-header">
                <span class="stat-label">Expenses</span>
                <button class="btn-add-entry" @click="openEntryForm(card)">+ Add</button>
              </div>

              <!-- Inline add/edit form -->
              <div v-if="entryCardId === card.id" class="entry-form">
                <input v-model="entryForm.description" placeholder="Description" class="entry-input" />
                <input v-model.number="entryForm.amount" type="number" min="0" step="0.01" placeholder="Amount" class="entry-input entry-amount" />
                <DateInput v-model="entryForm.date" class="entry-input entry-date" />
                <div class="entry-form-actions">
                  <button class="btn-primary btn-sm" @click="submitEntry">{{ editingEntryId ? 'Update' : 'Add' }}</button>
                  <button class="btn-sm" @click="entryCardId = null; editingEntryId = null">Cancel</button>
                </div>
              </div>

              <div v-if="ccExpensesStore.expensesForCard(card.id).length" class="entries-list">
                <div v-for="entry in ccExpensesStore.expensesForCard(card.id)" :key="entry.id" class="entry-row">
                  <div class="entry-info">
                    <span class="entry-desc">{{ entry.description }}</span>
                    <span class="entry-date">{{ formatDate(entry.date) }}</span>
                  </div>
                  <div class="entry-right">
                    <span class="entry-amount-val">₹{{ amount(entry.amount) }}</span>
                    <button class="btn-entry-edit" @click="startEditEntry(entry, card)">✎</button>
                    <button class="btn-entry-remove" @click="removeEntry(entry.id)">×</button>
                  </div>
                </div>
              </div>
              <p v-else class="entries-empty">No expenses recorded</p>
            </div>

            <div class="cc-actions">
              <button v-if="cardTotal(card) > 0" class="btn-action btn-pay" @click="payBill(card)">Pay Bill</button>
              <button class="btn-action" @click="openEdit(card)">Edit</button>
              <button class="btn-action btn-action-danger" @click="deletingId = card.id">Delete</button>
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
              <strong>₹{{ historyTotal.toLocaleString('en-IN') }}</strong>
            </div>
            <div v-if="historyEntries.length" class="history-list">
              <div v-for="entry in historyEntries" :key="entry.id" class="history-row">
                <div class="history-info">
                  <span class="history-desc">{{ entry.description }}</span>
                  <span class="history-date">{{ formatDate(entry.date) }}</span>
                </div>
                <span class="history-amount">₹{{ amount(entry.amount) }}</span>
              </div>
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
  gap: 18px;
}

.page-header,
.utilization-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.page-header {
  justify-content: flex-end;
}

.summary-banner {
  padding: 18px 20px;
}

.summary-label,
.stat-label {
  font-size: 0.76rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.cards-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cc-item {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 24px;
  padding: 22px;
}

.btn-history {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  line-height: 0;
}

.btn-history:hover {
  color: var(--accent);
  border-color: var(--accent-dim);
}

.cc-details {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cc-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 14px;
}

.cc-stat {
  padding: 14px;
  border-radius: 18px;
  background: var(--bg-elevated);
}

.stat-value {
  display: block;
  margin-top: 8px;
  font-size: 1rem;
  font-weight: 800;
}

.stat-balance {
  color: var(--warning);
}

.stat-due {
  color: var(--info);
}

.utilization-track {
  height: 10px;
  border-radius: 10px;
  background: var(--bg-elevated);
  overflow: hidden;
}

.utilization-fill {
  height: 100%;
  background: linear-gradient(135deg, #ffcf70, #ff8787);
}

/* Entries */
.entries-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.entries-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.btn-add-entry {
  padding: 4px 12px;
  font-size: 0.78rem;
  font-weight: 700;
  background: var(--accent-dim);
  color: var(--accent);
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
}

.btn-add-entry:hover {
  border-color: var(--accent);
}

.entry-form {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
}

.entry-input {
  min-height: 38px;
}

.entry-amount {
  max-width: 120px;
}

.entry-date {
  max-width: 120px;
}

.entry-form-actions {
  grid-column: 1 / -1;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn-sm {
  padding: 6px 14px;
  font-size: 0.78rem;
}

.entries-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 240px;
  overflow-y: auto;
}

.entry-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  gap: 10px;
}

.entry-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.entry-desc {
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-date {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.entry-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.entry-amount-val {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--expense);
}

.btn-entry-edit,
.btn-entry-remove {
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 6px;
  font-size: 1rem;
  line-height: 1;
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border-color);
  cursor: pointer;
}

.btn-entry-edit:hover {
  color: var(--accent);
  border-color: var(--accent-dim);
}

.btn-entry-remove:hover {
  color: var(--expense);
  border-color: rgba(248, 81, 73, 0.3);
}

.entries-empty {
  font-size: 0.82rem;
  color: var(--text-muted);
  padding: 8px 0;
}

/* Actions */
.cc-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-pay {
  background: rgba(120, 224, 143, 0.15);
  color: var(--income);
  border-color: rgba(120, 224, 143, 0.3);
}

.btn-pay:hover {
  background: rgba(120, 224, 143, 0.25);
}

.btn-action-danger {
  color: var(--expense);
}

.loader-container {
  display: flex;
  justify-content: center;
  padding: 56px 0;
}

/* History modal */
.history-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 24px;
}

.history-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 24px;
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.history-header h3 {
  font-size: 1.05rem;
  font-weight: 700;
}

.history-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  padding: 0;
}

.history-close:hover {
  color: var(--text-primary);
  border-color: var(--border-light);
}

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
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--bg-elevated);
}

.history-total strong {
  font-size: 1.1rem;
  color: var(--expense);
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  flex: 1;
}

.history-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  gap: 10px;
}

.history-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.history-desc {
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-date {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.history-amount {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--expense);
  flex-shrink: 0;
}

@media (max-width: 900px) {
  .cc-item {
    grid-template-columns: 1fr;
    padding: 16px;
  }

  .cc-widget-wrapper {
    display: flex;
    justify-content: center;
    overflow: hidden;
  }

  .entry-form {
    grid-template-columns: 1fr;
  }

  .entry-amount,
  .entry-date {
    max-width: none;
  }
}

@media (max-width: 640px) {
  .cc-stats {
    grid-template-columns: 1fr;
  }

  .cc-item {
    padding: 12px;
    gap: 14px;
  }
}
</style>
