<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '../components/layout/AppShell.vue'
import EmptyState from '../components/shared/EmptyState.vue'
import ConfirmDialog from '../components/shared/ConfirmDialog.vue'
import { useSubscriptionsStore } from '../stores/subscriptions'
import { useCreditCardsStore } from '../stores/creditCards'
import { useCurrencyStore } from '../stores/currency'
import { useCurrenciesStore } from '../stores/currencies'
import { useAuthStore } from '../stores/auth'
import { defaultCurrencyCode, defaultCurrencySymbol, toCurrency } from '../lib/money'

const router = useRouter()
const subscriptionsStore = useSubscriptionsStore()
const creditCardsStore = useCreditCardsStore()
const currencyStore = useCurrencyStore()
const currenciesStore = useCurrenciesStore()
const auth = useAuthStore()
const deletingId = ref(null)
const editingId = ref(null)

// Pay modal state
const payingSubscription = ref(null)
const payMethod = ref('account') // 'account' or 'credit_card'
const payCardId = ref(null)

const form = ref({
  service_name: '',
  category: 'tech',
  billing_cycle: 'monthly',
  amount: 0,
  currency: defaultCurrencyCode(),
  payment_day: '',
  payment_month: '',
  notes: '',
  is_active: true,
})

const monthlyEstimate = computed(() => {
  const target = defaultCurrencyCode()
  return subscriptionsStore.subscriptions
    .filter(item => item.is_active)
    .reduce((sum, item) => {
      const converted = toCurrency(Number(item.amount || 0), item.currency || target, target)
      return sum + converted / (item.billing_cycle === 'yearly' ? 12 : item.billing_cycle === 'quarterly' ? 3 : 1)
    }, 0)
})

onMounted(async () => {
  await Promise.all([
    subscriptionsStore.fetchSubscriptions(),
    creditCardsStore.fetchCreditCards(),
    currenciesStore.fetchCurrencies(),
    currencyStore.fetchRate(currenciesStore.codes.length ? currenciesStore.codes : ['INR', 'USD']),
  ])
})

function resetForm() {
  form.value = {
    service_name: '',
    category: 'tech',
    billing_cycle: 'monthly',
    amount: 0,
    currency: defaultCurrencyCode(),
    payment_day: '',
    payment_month: '',
    notes: '',
    is_active: true,
  }
  editingId.value = null
}

// ── Date helpers ────────────────────────────────────────────────────
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MS_DAY = 24 * 60 * 60 * 1000

function cycleMonths(cycle) {
  return cycle === 'yearly' ? 12 : cycle === 'quarterly' ? 3 : 1
}

function cycleDays(cycle) {
  return cycle === 'yearly' ? 366 : cycle === 'quarterly' ? 92 : 31
}

function midnight(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function todayMid() {
  return midnight(new Date())
}

function clampDay(year, monthIdx, day) {
  const last = new Date(year, monthIdx + 1, 0).getDate()
  return Math.min(Math.max(Number(day) || 1, 1), last)
}

function isoOf(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Shift a date by n billing cycles, keeping the day-of-month (clamped to the
// target month's length so the 31st survives a 30-day month).
function shiftCycle(date, cycle, n) {
  const day = date.getDate()
  const d = midnight(date)
  d.setDate(1)
  d.setMonth(d.getMonth() + n * cycleMonths(cycle))
  d.setDate(clampDay(d.getFullYear(), d.getMonth(), day))
  return midnight(d)
}

function formatDayMonth(date) {
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`
}

// Resolve a subscription's *real* next-due date + paid state, defensively.
// The stored next_payment_date can drift (a bad year like 2027, or repeated
// paid-advances), so we recompute the occurrence within ±one cycle of today
// from its day-of-month. A monthly sub is therefore never more than a month
// out — once its day passes it reads as overdue, not "due in 12 months". The
// stored year is ignored entirely.
function resolveDue(subscription) {
  const raw = subscription.next_payment_date
  if (!raw) return { due: null, paid: false }
  const parts = raw.split('-')
  if (parts.length !== 3) return { due: null, paid: false }

  const cycle = subscription.billing_cycle || 'monthly'
  const today = todayMid()
  const day = Number(parts[2])
  const stored = midnight(new Date(Number(parts[0]), Number(parts[1]) - 1, day))
  if (Number.isNaN(stored.getTime())) return { due: null, paid: false }

  // Honor is_paid only when the stored date sits a plausible "next cycle"
  // distance ahead — a far-future date is drift, not a real prepayment.
  let paid = !!subscription.is_paid
  if (paid && (stored - today) / MS_DAY > cycleDays(cycle) * 1.5) paid = false

  if (cycle === 'monthly') {
    // Unpaid: this month's occurrence of the day (overdue once it passes,
    // upcoming before then) — recomputed from the day so a drifted year can't
    // leak in. Paid: keep the fixed stored next-cycle date so "paid" expires
    // on its own once that date arrives.
    if (paid) return { due: stored, paid }
    return { due: midnight(new Date(today.getFullYear(), today.getMonth(), clampDay(today.getFullYear(), today.getMonth(), day))), paid }
  }

  // Quarterly / yearly: normalize the stored date to within one cycle of today.
  let occ = stored
  let guard = 0
  while ((today - occ) / MS_DAY > cycleDays(cycle) && guard++ < 4000) occ = shiftCycle(occ, cycle, 1)
  guard = 0
  while ((occ - today) / MS_DAY > cycleDays(cycle) && guard++ < 4000) occ = shiftCycle(occ, cycle, -1)

  return { due: occ, paid }
}

// First due date for a new/edited sub. Monthly & quarterly just use the
// day-of-month and land on the next occurrence from today; only yearly
// anchors to a specific month. (Never jumps a year for non-yearly cycles.)
function buildNextPaymentDate(day, month, billingCycle) {
  if (!day) return null
  const d = Number(day)
  if (!d || d < 1 || d > 31) return null
  const cycle = billingCycle || 'monthly'
  const today = todayMid()

  if (cycle === 'yearly' && month) {
    const m = Number(month)
    if (m < 1 || m > 12) return null
    let year = today.getFullYear()
    let due = midnight(new Date(year, m - 1, clampDay(year, m - 1, d)))
    if (due < today) due = midnight(new Date(year + 1, m - 1, clampDay(year + 1, m - 1, d)))
    return isoOf(due)
  }

  const y = today.getFullYear()
  const mo = today.getMonth()
  let due = midnight(new Date(y, mo, clampDay(y, mo, d)))
  if (due < today) due = shiftCycle(due, 'monthly', 1)
  return isoOf(due)
}

async function saveSubscription() {
  const next_payment_date = buildNextPaymentDate(form.value.payment_day, form.value.payment_month, form.value.billing_cycle)
  const existing = editingId.value ? subscriptionsStore.subscriptions.find(s => s.id === editingId.value) : null
  const payload = {
    service_name: form.value.service_name,
    category: form.value.category,
    billing_cycle: form.value.billing_cycle,
    amount: form.value.amount,
    currency: form.value.currency,
    next_payment_date,
    notes: form.value.notes,
    is_active: form.value.is_active,
    is_paid: existing ? !!existing.is_paid : false,
    user_id: auth.user.id,
  }
  if (editingId.value) {
    await subscriptionsStore.updateSubscription(editingId.value, payload)
  } else {
    await subscriptionsStore.addSubscription(payload)
  }
  resetForm()
}

function parseDayMonth(dateStr) {
  if (!dateStr) return { day: '', month: '' }
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    return { day: String(Number(parts[2])), month: String(Number(parts[1])) }
  }
  return { day: '', month: '' }
}

function startEdit(subscription) {
  editingId.value = subscription.id
  const { day, month } = parseDayMonth(subscription.next_payment_date)
  form.value = {
    service_name: subscription.service_name,
    category: subscription.category,
    billing_cycle: subscription.billing_cycle,
    amount: Number(subscription.amount || 0),
    currency: subscription.currency,
    payment_day: day,
    payment_month: month,
    notes: subscription.notes || '',
    is_active: subscription.is_active,
  }
}

async function confirmDelete() {
  await subscriptionsStore.deleteSubscription(deletingId.value)
  deletingId.value = null
}

function subscriptionSymbol(sub) {
  return currenciesStore.symbolOf(sub.currency || 'INR')
}

async function togglePaid(subscription) {
  // Mark paid → advance the due date one cycle (so the next due sits in the
  // future); unmark → roll it back. We shift from the *resolved* current due,
  // not the raw stored value, so toggling can't re-introduce drift.
  const { due } = resolveDue(subscription)
  const nextPaid = !isEffectivelyPaid(subscription)
  const cycle = subscription.billing_cycle || 'monthly'
  const next_payment_date = due
    ? isoOf(shiftCycle(due, cycle, nextPaid ? 1 : -1))
    : subscription.next_payment_date

  await subscriptionsStore.updateSubscription(subscription.id, {
    ...subscription,
    is_paid: nextPaid,
    next_payment_date,
    user_id: auth.user.id,
  })
}

function openPayModal(subscription) {
  payingSubscription.value = subscription
  payMethod.value = 'account'
  // Pre-select if user has exactly one card
  payCardId.value = creditCardsStore.creditCards.length === 1 ? creditCardsStore.creditCards[0].id : null
}

const selectedCard = computed(() => creditCardsStore.creditCards.find(c => c.id === payCardId.value) || null)

const convertedToCard = computed(() => {
  const sub = payingSubscription.value
  const card = selectedCard.value
  if (!sub || !card) return null
  return toCurrency(Number(sub.amount || 0), sub.currency || 'INR', card.currency || 'INR')
})

function confirmPay() {
  const sub = payingSubscription.value
  if (!sub) return

  if (payMethod.value === 'credit_card') {
    if (!payCardId.value) return
    const card = selectedCard.value
    const converted = convertedToCard.value
    payingSubscription.value = null
    router.push({
      path: '/credit-cards',
      query: {
        prefillCard: card.id,
        prefillAmount: Number(converted || 0).toFixed(2),
        prefillDescription: sub.service_name,
      },
    })
    return
  }

  // Account / cash: route to add-transaction prefilled with the subscription's
  // own currency. The user marks the subscription paid manually afterward.
  const query = {
    description: sub.service_name,
    amount: sub.amount,
    currency: sub.currency,
    type: 'expense',
  }
  payingSubscription.value = null
  router.push({ path: '/transactions/add', query })
}

function daysUntilDue(subscription) {
  const { due } = resolveDue(subscription)
  if (!due) return null
  return Math.ceil((due - todayMid()) / MS_DAY)
}

// Paid counts only while the paid-for due date is still in the future. Once
// it arrives the next cycle has begun and the sub is unpaid again — so a sub
// marked paid last month doesn't keep showing "Paid" this month.
function isEffectivelyPaid(subscription) {
  const { due, paid } = resolveDue(subscription)
  return paid && !!due && (due - todayMid()) > 0
}

// Tiered status: inactive | paid | overdue | due-today | due-soon | upcoming | unpaid
function getPaymentStatus(subscription) {
  if (!subscription.is_active) return 'inactive'
  if (isEffectivelyPaid(subscription)) return 'paid'
  const diff = daysUntilDue(subscription)
  if (diff == null) return 'unpaid'
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'due-today'
  if (diff <= 7) return 'due-soon'
  return 'upcoming'
}

function pluralize(n, unit) {
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}

// Big, prominent label for the row's status pill. Far-future dates
// roll up into months / years instead of leaking out as "Due in 365 days".
function statusHeadline(subscription) {
  const status = getPaymentStatus(subscription)
  const diff = daysUntilDue(subscription)
  switch (status) {
    case 'inactive': return 'Paused'
    case 'paid': return 'Paid'
    case 'unpaid': return 'Unpaid'
    case 'overdue': {
      if (!Number.isFinite(diff)) return 'Overdue'
      const d = Math.abs(diff)
      if (d > 45) return `Overdue ${pluralize(Math.round(d / 30), 'month')}`
      return `Overdue ${pluralize(d, 'day')}`
    }
    case 'due-today': return 'Due Today'
    case 'due-soon':
      if (diff === 1) return 'Due Tomorrow'
      return `Due in ${pluralize(diff, 'day')}`
    case 'upcoming':
      if (!Number.isFinite(diff) || diff <= 0) return 'Upcoming'
      if (diff > 45) return `Due in ${pluralize(Math.round(diff / 30), 'month')}`
      if (diff > 14) return `Due in ${pluralize(Math.ceil(diff / 7), 'week')}`
      return `Due in ${pluralize(diff, 'day')}`
    default: return ''
  }
}

// Small subtitle that complements the headline — the due date as "6 May"
// (no year; the year is unreliable and the user doesn't want it shown).
function statusSubtext(subscription) {
  const status = getPaymentStatus(subscription)
  if (status === 'inactive' || status === 'unpaid') return ''
  const { due } = resolveDue(subscription)
  if (!due) return ''
  return formatDayMonth(due)
}

function displayDayMonth(subscription) {
  const { due } = resolveDue(subscription)
  if (!due) return ''
  return String(due.getDate())
}
</script>

<template>
  <AppShell>
    <div class="subscriptions-page">
      <div class="summary-grid">
        <div class="card summary-card summary-card--hero">
          <span class="summary-label">Estimated monthly spend</span>
          <span class="summary-value num">{{ defaultCurrencySymbol() }}{{ monthlyEstimate.toLocaleString('en-IN', { maximumFractionDigits: 0 }) }}</span>
          <span class="summary-sub">Active subscriptions, in {{ defaultCurrencyCode() }}</span>
        </div>
        <div class="card summary-card">
          <span class="summary-label">Active subscriptions</span>
          <span class="summary-value num">{{ subscriptionsStore.subscriptions.filter(item => item.is_active).length }}</span>
          <span class="summary-sub">of {{ subscriptionsStore.subscriptions.length }} tracked</span>
        </div>
      </div>

      <section class="card form-card">
        <h2 class="section-title">{{ editingId ? 'Edit subscription' : 'Add a subscription' }}</h2>
        <div class="form-grid">
          <div class="field field--name">
            <span class="field-label">Service</span>
            <input v-model="form.service_name" placeholder="Service name" />
          </div>
          <div class="field">
            <span class="field-label">Category</span>
            <select v-model="form.category">
              <option value="tech">Tech</option>
              <option value="entertainment">Entertainment</option>
              <option value="productivity">Productivity</option>
              <option value="finance">Finance</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="field">
            <span class="field-label">Billing cycle</span>
            <select v-model="form.billing_cycle">
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <div class="field">
            <span class="field-label">Amount</span>
            <input v-model.number="form.amount" type="number" min="0" step="0.01" placeholder="Amount" class="num" />
          </div>
          <div class="field">
            <span class="field-label">Currency</span>
            <select v-model="form.currency">
              <option v-for="c in currenciesStore.currencies" :key="c.code" :value="c.code">{{ c.code }}</option>
            </select>
          </div>
          <div class="field field--due">
            <span class="field-label">Payment day</span>
            <div class="day-month-row">
              <input v-model="form.payment_day" type="number" min="1" max="31" placeholder="Day (1-31)" class="day-input" />
              <select v-model="form.payment_month" class="month-select">
                <option value="">Any month</option>
                <option v-for="m in 12" :key="m" :value="String(m)">{{ ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1] }}</option>
              </select>
            </div>
          </div>
        </div>
        <div class="form-actions">
          <label class="toggle-row">
            <input v-model="form.is_active" type="checkbox" />
            Active
          </label>
          <div class="action-row">
            <button v-if="editingId" class="btn-ghost" @click="resetForm">Cancel</button>
            <button class="btn-primary" @click="saveSubscription">{{ editingId ? 'Update' : 'Add' }}</button>
          </div>
        </div>
      </section>

      <section class="card list-card">
        <div class="list-head">
          <h2 class="section-title">Your subscriptions</h2>
          <span v-if="subscriptionsStore.subscriptions.length" class="list-count num">{{ subscriptionsStore.subscriptions.length }}</span>
        </div>
        <EmptyState v-if="!subscriptionsStore.subscriptions.length && !subscriptionsStore.loading" title="No subscriptions yet" message="Add your recurring payments." />
        <div v-else class="sub-list">
          <article
            v-for="subscription in subscriptionsStore.subscriptions"
            :key="subscription.id"
            class="sub-item"
            :class="{ 'is-overdue': getPaymentStatus(subscription) === 'overdue', 'is-inactive': !subscription.is_active }"
          >
            <!-- Row 1: what it is (left) and what it costs (right) -->
            <div class="sub-head">
              <div class="sub-info">
                <strong class="sub-name">{{ subscription.service_name }}</strong>
                <span class="sub-meta">{{ subscription.billing_cycle }}<template v-if="displayDayMonth(subscription)"> · Day {{ displayDayMonth(subscription) }}</template></span>
              </div>
              <span class="sub-amount num">{{ subscriptionSymbol(subscription) }}{{ Number(subscription.amount || 0).toLocaleString('en-IN') }}</span>
            </div>

            <!-- Row 2: compact status pill -->
            <div class="sub-status" :class="getPaymentStatus(subscription)">
              <span class="status-headline">{{ statusHeadline(subscription) }}</span>
              <span v-if="statusSubtext(subscription)" class="status-subtext"><template v-if="getPaymentStatus(subscription) === 'paid'">next </template>{{ statusSubtext(subscription) }}</span>
            </div>

            <!-- Row 3: actions, separated from the price -->
            <div class="sub-actions">
              <button
                v-if="subscription.is_active && !isEffectivelyPaid(subscription)"
                class="btn-primary btn-mark-paid"
                @click="openPayModal(subscription)"
                title="Choose how to pay"
              >
                Pay
              </button>
              <button
                v-if="subscription.is_active"
                class="btn-toggle-paid"
                :class="{ paid: isEffectivelyPaid(subscription) }"
                @click="togglePaid(subscription)"
                :title="isEffectivelyPaid(subscription) ? 'Mark unpaid (rolls due date back one cycle)' : 'Mark paid (rolls due date forward one cycle)'"
              >
                {{ isEffectivelyPaid(subscription) ? 'Mark unpaid' : 'Mark paid' }}
              </button>
              <div class="item-actions">
                <button class="btn-icon" title="Edit subscription" aria-label="Edit subscription" @click="startEdit(subscription)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                </button>
                <button class="btn-icon btn-icon--danger" title="Delete subscription" aria-label="Delete subscription" @click="deletingId = subscription.id">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>

      <!-- Pay Method Modal -->
      <Teleport to="body">
        <div v-if="payingSubscription" class="pay-backdrop" @click.self="payingSubscription = null">
          <div class="pay-card" role="dialog" aria-modal="true">
            <div class="pay-header">
              <h3>Pay {{ payingSubscription.service_name }}</h3>
              <button class="pay-close" aria-label="Close" @click="payingSubscription = null">×</button>
            </div>
            <p class="pay-amount num">{{ subscriptionSymbol(payingSubscription) }}{{ Number(payingSubscription.amount || 0).toLocaleString('en-IN') }}</p>
            <div class="pay-options">
              <label class="pay-option" :class="{ active: payMethod === 'account' }">
                <input v-model="payMethod" type="radio" value="account" />
                <span>Account / other</span>
              </label>
              <label class="pay-option" :class="{ active: payMethod === 'credit_card' }">
                <input v-model="payMethod" type="radio" value="credit_card" />
                <span>Credit card</span>
              </label>
            </div>
            <div v-if="payMethod === 'credit_card'" class="pay-card-select">
              <label class="select-label">Which card?</label>
              <select v-model="payCardId">
                <option :value="null">Select card</option>
                <option v-for="card in creditCardsStore.creditCards" :key="card.id" :value="card.id">
                  {{ card.name }}{{ card.last_four ? ` (*${card.last_four})` : '' }} — {{ card.currency || 'INR' }}
                </option>
              </select>
              <p
                v-if="selectedCard && convertedToCard !== null && (selectedCard.currency || 'INR') !== (payingSubscription.currency || 'INR')"
                class="conversion-hint"
              >
                Will record on card as
                <strong class="num">
                  {{ currenciesStore.symbolOf(selectedCard.currency || 'INR') }}{{ Number(convertedToCard).toLocaleString('en-IN', { maximumFractionDigits: 2 }) }}
                </strong>
                ({{ selectedCard.currency || 'INR' }})
              </p>
            </div>
            <p class="pay-hint">
              {{ payMethod === 'credit_card'
                  ? 'You\'ll be taken to the credit card page to confirm the entry.'
                  : 'You\'ll be taken to add a transaction. Mark the subscription paid manually after.' }}
            </p>
            <div class="pay-actions">
              <button class="btn-ghost" @click="payingSubscription = null">Cancel</button>
              <button class="btn-primary" @click="confirmPay" :disabled="payMethod === 'credit_card' && !payCardId">Continue</button>
            </div>
          </div>
        </div>
      </Teleport>

      <ConfirmDialog v-if="deletingId" title="Delete subscription" message="Delete this subscription?" @confirm="confirmDelete" @cancel="deletingId = null" />
    </div>
  </AppShell>
</template>

<style scoped>
.subscriptions-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
  max-width: 100%;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
}

/* ── Summary ─────────────────────────────────────────────── */
.summary-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 16px;
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 22px 24px;
  min-width: 0;
}

.summary-card--hero {
  background: var(--bg-accent), var(--bg-secondary);
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
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.summary-sub {
  font-size: 0.8rem;
  color: var(--text-muted);
}

/* ── Add / edit form ─────────────────────────────────────── */
.form-card,
.list-card {
  padding: 24px;
  min-width: 0;
}

.form-card .section-title {
  margin-bottom: 16px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.field-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.day-month-row {
  display: flex;
  gap: 8px;
  min-width: 0;
}

.day-input,
.month-select {
  width: 50%;
  min-width: 0;
}

.form-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 18px;
}

.action-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.toggle-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
}

.toggle-row input {
  width: 18px;
  height: 18px;
  padding: 0;
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
}

.toggle-row input:focus {
  box-shadow: none;
}

.btn-ghost {
  background: transparent;
}

.btn-ghost:hover {
  background: var(--bg-elevated);
}

/* ── List ────────────────────────────────────────────────── */
.list-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.list-count {
  min-width: 26px;
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  font-size: 0.78rem;
  font-weight: 600;
  text-align: center;
  color: var(--text-secondary);
  background: var(--bg-elevated);
}

.sub-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
  min-width: 0;
}

.sub-item {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  min-width: 0;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  transition: box-shadow var(--transition);
}

.sub-item.is-overdue {
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--expense) 50%, transparent);
}

.sub-item.is-inactive .sub-head {
  opacity: 0.65;
}

/* Row 1 */
.sub-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  min-width: 0;
}

.sub-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sub-name {
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.3;
  color: var(--text-primary);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.sub-meta {
  display: block;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.sub-meta::first-letter {
  text-transform: uppercase;
}

.sub-amount {
  flex-shrink: 0;
  font-size: 1.4rem;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  white-space: nowrap;
}

/* Row 2: soft status pill */
.sub-status {
  --tone: var(--text-muted);
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  max-width: 100%;
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  font-size: 0.8rem;
  font-weight: 700;
  line-height: 1.35;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 14%, transparent);
  font-variant-numeric: tabular-nums;
}

.status-subtext {
  font-weight: 600;
  opacity: 0.8;
}

.status-subtext::before {
  content: '·';
  margin-right: 6px;
}

.sub-status.paid { --tone: var(--income); }
.sub-status.upcoming { --tone: var(--info); }
.sub-status.due-soon { --tone: var(--warning); }
.sub-status.unpaid { --tone: var(--warning); }
.sub-status.due-today,
.sub-status.overdue { --tone: var(--expense); }
.sub-status.inactive { --tone: var(--text-muted); }

.sub-status.due-today {
  animation: pulse-due 1.6s ease-in-out infinite;
}

@keyframes pulse-due {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--expense) 0%, transparent); }
  50%      { box-shadow: 0 0 0 5px color-mix(in srgb, var(--expense) 16%, transparent); }
}

/* Row 3: actions */
.sub-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.btn-mark-paid,
.btn-toggle-paid {
  padding: 8px 16px;
  font-size: 0.84rem;
}

.btn-mark-paid {
  box-shadow: none;
}

.btn-toggle-paid {
  font-weight: 700;
  color: var(--income);
  background: color-mix(in srgb, var(--income) 14%, transparent);
}

.btn-toggle-paid:hover {
  background: color-mix(in srgb, var(--income) 22%, transparent);
}

/* Already paid: undoing is a quiet, secondary action. */
.btn-toggle-paid.paid {
  color: var(--text-secondary);
  background: transparent;
  border-color: var(--border-light);
}

.btn-toggle-paid.paid:hover {
  color: var(--text-primary);
  background: var(--bg-surface);
}

.item-actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.btn-icon {
  width: 38px;
  height: 38px;
  padding: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.btn-icon:hover {
  color: var(--accent);
  background: var(--accent-dim);
}

.btn-icon--danger:hover {
  color: var(--expense);
  background: color-mix(in srgb, var(--expense) 12%, transparent);
}

/* ── Pay modal ───────────────────────────────────────────── */
.pay-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 8, 16, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 16px;
}

.pay-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 24px;
  width: 100%;
  max-width: 420px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
}

.pay-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.pay-header h3 {
  font-size: 1.15rem;
  font-weight: 600;
  line-height: 1.35;
  padding-top: 6px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.pay-close {
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 50%;
  background: var(--bg-elevated);
  color: var(--text-muted);
  font-size: 1.2rem;
  line-height: 1;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.pay-close:hover {
  color: var(--text-primary);
  background: var(--bg-surface);
}

.pay-amount {
  margin: 4px 0 18px;
  font-size: 1.8rem;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.pay-options {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.pay-option {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  cursor: pointer;
  font-weight: 700;
  font-size: 0.88rem;
  text-align: center;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  transition: background-color var(--transition), color var(--transition), border-color var(--transition);
}

.pay-option:hover {
  background: var(--bg-surface);
}

.pay-option input {
  display: none;
}

.pay-option.active {
  border-color: var(--accent);
  color: var(--text-primary);
  background: var(--accent-dim);
}

.pay-card-select {
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.select-label {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.conversion-hint {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-muted);
}

.conversion-hint strong {
  font-weight: 600;
  color: var(--text-primary);
}

.pay-hint {
  margin: 0 0 18px;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--text-muted);
}

.pay-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* ── Responsive ──────────────────────────────────────────── */
@media (max-width: 900px) {
  .form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .field--name,
  .field--due {
    grid-column: 1 / -1;
  }
}

@media (max-width: 768px) {
  .subscriptions-page {
    gap: 16px;
  }

  .summary-grid {
    gap: 12px;
  }

  .summary-card {
    padding: 16px 18px;
  }

  .summary-value {
    font-size: 1.55rem;
  }

  .form-card,
  .list-card {
    padding: 18px 16px;
  }

  .form-grid {
    gap: 12px;
  }

  .sub-list {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }

  .sub-item {
    padding: 16px;
    gap: 10px;
  }

  .sub-amount {
    font-size: 1.3rem;
  }

  .sub-actions {
    padding-top: 10px;
  }
}

@media (max-width: 440px) {
  .summary-grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .summary-sub {
    font-size: 0.74rem;
  }

  .form-actions .action-row {
    flex: 1 1 auto;
    justify-content: flex-end;
  }

  .pay-card {
    padding: 20px;
  }

  .pay-amount {
    font-size: 1.55rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sub-status.due-today {
    animation: none;
  }
}
</style>
