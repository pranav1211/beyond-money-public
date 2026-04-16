<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '../components/layout/AppShell.vue'
import EmptyState from '../components/shared/EmptyState.vue'
import ConfirmDialog from '../components/shared/ConfirmDialog.vue'
import { useSubscriptionsStore } from '../stores/subscriptions'
import { useCreditCardsStore } from '../stores/creditCards'
import { useCurrencyStore } from '../stores/currency'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const subscriptionsStore = useSubscriptionsStore()
const creditCardsStore = useCreditCardsStore()
const currencyStore = useCurrencyStore()
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
  currency: 'INR',
  payment_day: '',
  payment_month: '',
  notes: '',
  is_active: true,
})

function toINR(amount, currency) {
  if (currency === 'INR') return Number(amount || 0)
  if (currency === 'USD') {
    if (!currencyStore.currentRate) return 0
    return Number(amount || 0) * currencyStore.currentRate
  }
  return 0
}

const monthlyEstimate = computed(() =>
  subscriptionsStore.subscriptions
    .filter(item => item.is_active)
    .reduce((sum, item) => {
      const inrAmount = toINR(item.amount, item.currency)
      return sum + inrAmount / (item.billing_cycle === 'yearly' ? 12 : item.billing_cycle === 'quarterly' ? 3 : 1)
    }, 0)
)

onMounted(async () => {
  await Promise.all([
    subscriptionsStore.fetchSubscriptions(),
    creditCardsStore.fetchCreditCards(),
    currencyStore.fetchRate(),
  ])
})

function resetForm() {
  form.value = {
    service_name: '',
    category: 'tech',
    billing_cycle: 'monthly',
    amount: 0,
    currency: 'INR',
    payment_day: '',
    payment_month: '',
    notes: '',
    is_active: true,
  }
  editingId.value = null
}

// Build next_payment_date from day+month (current or next occurrence)
function buildNextPaymentDate(day, month) {
  if (!day) return null
  const d = Number(day)
  const m = month ? Number(month) : null
  if (!d || d < 1 || d > 31) return null
  if (m !== null && (m < 1 || m > 12)) return null

  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1

  if (m !== null) {
    // Specific month+day: find next occurrence
    let year = currentYear
    const candidate = new Date(year, m - 1, d)
    if (candidate < today) {
      year++
    }
    const dd = String(d).padStart(2, '0')
    const mm = String(m).padStart(2, '0')
    return `${year}-${mm}-${dd}`
  }

  // Day only: use current month, or next month if past
  let targetMonth = currentMonth
  let targetYear = currentYear
  if (d < today.getDate()) {
    targetMonth++
    if (targetMonth > 12) { targetMonth = 1; targetYear++ }
  }
  const dd = String(d).padStart(2, '0')
  const mm = String(targetMonth).padStart(2, '0')
  return `${targetYear}-${mm}-${dd}`
}

async function saveSubscription() {
  const next_payment_date = buildNextPaymentDate(form.value.payment_day, form.value.payment_month)
  const payload = {
    service_name: form.value.service_name,
    category: form.value.category,
    billing_cycle: form.value.billing_cycle,
    amount: form.value.amount,
    currency: form.value.currency,
    next_payment_date,
    notes: form.value.notes,
    is_active: form.value.is_active,
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

function getPaymentStatus(subscription) {
  if (!subscription.is_active) return 'inactive'
  if (!subscription.next_payment_date) return 'not-due'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const next = new Date(subscription.next_payment_date + 'T00:00:00')
  if (next > today) return 'not-due'
  return 'unpaid'
}

function getNextDueText(subscription) {
  if (!subscription.next_payment_date) return 'not set'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const next = new Date(subscription.next_payment_date + 'T00:00:00')
  const diffDays = Math.ceil((next - today) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'due today'
  if (diffDays === 1) return 'due tomorrow'
  if (diffDays <= 7) return `due in ${diffDays} days`
  if (diffDays <= 30) return `due in ${Math.ceil(diffDays / 7)} weeks`
  const d = next.getDate()
  const m = next.getMonth() + 1
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

function openPayModal(subscription) {
  payingSubscription.value = subscription
  payMethod.value = 'account'
  payCardId.value = null
}

function advanceNextPaymentDate(dateStr, billingCycle) {
  if (!dateStr) return null
  const date = new Date(dateStr + 'T00:00:00')
  if (billingCycle === 'yearly') {
    date.setFullYear(date.getFullYear() + 1)
  } else if (billingCycle === 'quarterly') {
    date.setMonth(date.getMonth() + 3)
  } else {
    date.setMonth(date.getMonth() + 1)
  }
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function confirmPay() {
  const sub = payingSubscription.value
  if (!sub) return

  const query = {
    description: sub.service_name,
    amount: sub.amount,
    currency: sub.currency,
    type: 'expense',
  }

  if (payMethod.value === 'credit_card' && payCardId.value) {
    query.credit_card_id = payCardId.value
  }

  // Mark as paid: keep active, advance next_payment_date to next cycle
  const nextDate = advanceNextPaymentDate(sub.next_payment_date, sub.billing_cycle)
  subscriptionsStore.updateSubscription(sub.id, {
    ...sub,
    next_payment_date: nextDate,
    user_id: auth.user.id,
  })

  payingSubscription.value = null

  router.push({ path: '/transactions/add', query })
}

function displayDayMonth(subscription) {
  if (!subscription.next_payment_date) return ''
  const parts = subscription.next_payment_date.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`
  return ''
}
</script>

<template>
  <AppShell>
    <div class="subscriptions-page">
      <div class="summary-grid">
        <div class="card summary-card">
          <span class="summary-label">Estimated monthly spend</span>
          <strong>₹{{ monthlyEstimate.toLocaleString('en-IN', { maximumFractionDigits: 0 }) }}</strong>
        </div>
        <div class="card summary-card">
          <span class="summary-label">Active subscriptions</span>
          <strong>{{ subscriptionsStore.subscriptions.filter(item => item.is_active).length }}</strong>
        </div>
      </div>

      <section class="card form-card">
        <div class="form-grid">
          <input v-model="form.service_name" placeholder="Service name" />
          <select v-model="form.category">
            <option value="tech">Tech</option>
            <option value="entertainment">Entertainment</option>
            <option value="productivity">Productivity</option>
            <option value="finance">Finance</option>
            <option value="other">Other</option>
          </select>
          <select v-model="form.billing_cycle">
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
          <input v-model.number="form.amount" type="number" min="0" step="0.01" placeholder="Amount" />
          <select v-model="form.currency">
            <option value="INR">INR</option>
            <option value="USD">USD</option>
          </select>
          <div class="day-month-row">
            <input v-model="form.payment_day" type="number" min="1" max="31" placeholder="Day (1-31)" class="day-input" />
            <select v-model="form.payment_month" class="month-select">
              <option value="">Any month</option>
              <option v-for="m in 12" :key="m" :value="String(m)">{{ ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1] }}</option>
            </select>
          </div>
        </div>
        <div class="form-actions">
          <label class="toggle-row">
            <input v-model="form.is_active" type="checkbox" />
            Active
          </label>
          <div class="action-row">
            <button v-if="editingId" @click="resetForm">Cancel</button>
            <button class="btn-primary" @click="saveSubscription">{{ editingId ? 'Update' : 'Add' }}</button>
          </div>
        </div>
      </section>

      <section class="card list-card">
        <EmptyState v-if="!subscriptionsStore.subscriptions.length && !subscriptionsStore.loading" title="No subscriptions yet" message="Add your recurring payments." />
        <div v-else class="sub-list">
          <div v-for="subscription in subscriptionsStore.subscriptions" :key="subscription.id" class="sub-row">
            <div class="sub-info">
              <strong>{{ subscription.service_name }}</strong>
              <span class="sub-meta">{{ subscription.billing_cycle }} · {{ getNextDueText(subscription) }}<template v-if="displayDayMonth(subscription)"> · Day {{ displayDayMonth(subscription) }}</template></span>
            </div>
            <div class="sub-side">
              <strong class="sub-amount">{{ subscription.currency === 'INR' ? '₹' : '$' }}{{ Number(subscription.amount || 0).toLocaleString('en-IN') }}</strong>
              <span class="status-badge" :class="getPaymentStatus(subscription)">
                {{ getPaymentStatus(subscription) === 'not-due' ? 'Not Due' : getPaymentStatus(subscription) === 'unpaid' ? 'Unpaid' : 'Paused' }}
              </span>
              <button
                v-if="getPaymentStatus(subscription) === 'unpaid'"
                class="btn-mark-paid"
                @click="openPayModal(subscription)"
              >
                Mark Paid
              </button>
              <div class="item-actions">
                <button @click="startEdit(subscription)">Edit</button>
                <button class="btn-danger" @click="deletingId = subscription.id">Delete</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Pay Method Modal -->
      <Teleport to="body">
        <div v-if="payingSubscription" class="pay-backdrop" @click.self="payingSubscription = null">
          <div class="pay-card">
            <h3>Pay {{ payingSubscription.service_name }}</h3>
            <p class="pay-amount">{{ payingSubscription.currency === 'INR' ? '₹' : '$' }}{{ Number(payingSubscription.amount || 0).toLocaleString('en-IN') }}</p>
            <div class="pay-options">
              <label class="pay-option" :class="{ active: payMethod === 'account' }">
                <input v-model="payMethod" type="radio" value="account" />
                <span>Account / Other</span>
              </label>
              <label class="pay-option" :class="{ active: payMethod === 'credit_card' }">
                <input v-model="payMethod" type="radio" value="credit_card" />
                <span>Credit Card</span>
              </label>
            </div>
            <div v-if="payMethod === 'credit_card'" class="pay-card-select">
              <select v-model="payCardId">
                <option :value="null">Select card</option>
                <option v-for="card in creditCardsStore.creditCards" :key="card.id" :value="card.id">{{ card.name }}{{ card.last_four ? ` (*${card.last_four})` : '' }}</option>
              </select>
            </div>
            <div class="pay-actions">
              <button @click="payingSubscription = null">Cancel</button>
              <button class="btn-primary" @click="confirmPay" :disabled="payMethod === 'credit_card' && !payCardId">Pay</button>
            </div>
          </div>
        </div>
      </Teleport>

      <ConfirmDialog v-if="deletingId" title="Delete Subscription" message="Delete this subscription?" @confirm="confirmDelete" @cancel="deletingId = null" />
    </div>
  </AppShell>
</template>

<style scoped>
.subscriptions-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.summary-card,
.form-card,
.list-card {
  padding: 20px;
}

.summary-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.summary-card strong {
  display: block;
  margin-top: 8px;
  font-size: 1.6rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.day-month-row {
  display: flex;
  gap: 8px;
}

.day-input {
  width: 50%;
}

.month-select {
  width: 50%;
}

.form-actions,
.action-row,
.item-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.form-actions {
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
}

.sub-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sub-row {
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.sub-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 160px;
}

.sub-meta {
  font-size: 0.82rem;
  color: var(--text-muted);
}

.sub-side {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.sub-amount {
  white-space: nowrap;
}

.status-badge {
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.status-badge.not-due {
  background: rgba(117, 184, 255, 0.18);
  color: var(--info);
}

.status-badge.unpaid {
  background: rgba(255, 125, 125, 0.2);
  color: var(--expense);
}

.status-badge.inactive {
  background: rgba(140, 154, 176, 0.14);
  color: var(--text-muted);
}

.btn-mark-paid {
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 0.78rem;
  font-weight: 800;
  background: rgba(120, 224, 143, 0.2);
  color: var(--income);
  border-color: rgba(120, 224, 143, 0.35);
}

.btn-mark-paid:hover {
  background: rgba(120, 224, 143, 0.3);
}

/* Pay modal */
.pay-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 24px;
}

.pay-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 28px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
}

.pay-card h3 {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 4px;
}

.pay-amount {
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 18px;
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
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.88rem;
  color: var(--text-secondary);
  background: var(--bg-elevated);
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
}

.pay-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

@media (max-width: 900px) {
  .summary-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .sub-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .sub-side {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
