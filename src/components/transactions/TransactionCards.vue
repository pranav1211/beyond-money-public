<script setup>
import { ref, computed } from 'vue'
import { formatDate, localISODate } from '../../lib/dateFormat'
import { useLabelsStore } from '../../stores/labels'
import { useCurrenciesStore } from '../../stores/currencies'
import { inDefault, defaultCurrencyCode, defaultCurrencySymbol } from '../../lib/money'

// Phone list for the Transactions page (the desktop table is TransactionRow).
// Collapsed: amount, description, account, date. Tap to expand for category,
// type, labels, Edit and Delete. Nothing in the expanded part repeats the
// collapsed row.
const props = defineProps({
  transactions: { type: Array, required: true },
})

const emit = defineEmits(['edit', 'delete'])
const labelsStore = useLabelsStore()
const currenciesStore = useCurrenciesStore()

const openId = ref(null)
const confirmingId = ref(null)

function toggle(id) {
  openId.value = openId.value === id ? null : id
  confirmingId.value = null
}

function dayLabel(date) {
  const today = localISODate()
  const d = new Date(today + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  if (date === today) return 'Today'
  if (date === localISODate(d)) return 'Yesterday'
  const dt = new Date(date + 'T00:00:00')
  const sameYear = dt.getFullYear() === new Date().getFullYear()
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

function sign(tx) {
  if (tx.type === 'income' || tx.type === 'lend_repayment') return '+'
  if (tx.type === 'transfer') return tx.notes === 'transfer_in' ? '+' : '−'
  return '−'
}

function signedValue(tx) {
  if (tx.type === 'transfer') return 0
  return (sign(tx) === '+' ? 1 : -1) * Number(inDefault(tx) || 0)
}

// Day headers carry the day's net (money in minus money out; transfers move
// money between your own accounts, so they don't count).
const days = computed(() => {
  const groups = []
  for (const tx of props.transactions) {
    let g = groups[groups.length - 1]
    if (!g || g.date !== tx.date) {
      g = { date: tx.date, label: dayLabel(tx.date), net: 0, items: [] }
      groups.push(g)
    }
    g.items.push(tx)
    g.net += signedValue(tx)
  }
  return groups
})

function fmtDefault(n) {
  return `${defaultCurrencySymbol()}${Math.abs(Math.round(n)).toLocaleString('en-IN')}`
}

function amountText(tx) {
  const code = tx.currency || defaultCurrencyCode()
  return `${currenciesStore.symbolOf(code)}${Number(tx.amount || 0).toLocaleString('en-IN')}`
}

function convertedText(tx) {
  const code = tx.currency || defaultCurrencyCode()
  if (code === defaultCurrencyCode()) return ''
  return `≈ ${fmtDefault(inDefault(tx) || 0)}`
}

function tone(tx) {
  if (tx.type === 'transfer') return 'transfer'
  return sign(tx) === '+' ? 'income' : 'neutral'
}

const TYPE_LABELS = { income: 'Income', expense: 'Expense', transfer: 'Transfer', lend: 'Lent', lend_repayment: 'Repaid' }

function categoryName(tx) {
  if (tx.type === 'transfer') return null
  if (tx.type === 'lend' || tx.type === 'lend_repayment') return null
  return tx.categories?.name || 'Uncategorised'
}

function labelsOf(tx) {
  const ids = tx.transaction_labels?.map(l => l.label_id) || []
  return labelsStore.labels.filter(l => ids.includes(l.id))
}

function confirmDelete(tx) {
  confirmingId.value = null
  openId.value = null
  emit('delete', tx.id)
}
</script>

<template>
  <div class="tx-cards">
    <section v-for="day in days" :key="day.date" class="day">
      <header class="day-head">
        <span class="day-label">{{ day.label }}</span>
        <span v-if="day.net" class="day-net num" :class="{ 'is-in': day.net > 0 }">
          {{ day.net > 0 ? '+' : '−' }}{{ fmtDefault(day.net) }}
        </span>
      </header>

      <ul class="day-list">
        <li v-for="tx in day.items" :key="tx.id" class="tx" :class="{ open: openId === tx.id }">
          <button
            type="button"
            class="tx-summary"
            :aria-expanded="openId === tx.id"
            :aria-controls="`tx-detail-${tx.id}`"
            @click="toggle(tx.id)"
          >
            <span class="tx-left">
              <span class="tx-amount num" :class="tone(tx)">{{ sign(tx) }}{{ amountText(tx) }}</span>
              <span class="tx-desc">
                <span class="cat-dot" :style="{ background: tx.categories?.color || 'var(--text-muted)' }" aria-hidden="true"></span>
                {{ tx.description || categoryName(tx) || TYPE_LABELS[tx.type] }}
              </span>
            </span>
            <span class="tx-right">
              <span class="tx-account">{{ tx.accounts?.name || 'Cash' }}</span>
              <span class="tx-date">{{ formatDate(tx.date) }}</span>
            </span>
            <svg class="tx-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>

          <div v-if="openId === tx.id" :id="`tx-detail-${tx.id}`" class="tx-detail">
            <dl class="tx-facts">
              <template v-if="categoryName(tx)">
                <dt>Category</dt>
                <dd>{{ categoryName(tx) }}</dd>
              </template>
              <dt>Type</dt>
              <dd><span class="type-pill" :class="tx.type">{{ TYPE_LABELS[tx.type] || tx.type }}</span></dd>
              <template v-if="tx.borrower_name">
                <dt>Person</dt>
                <dd>{{ tx.borrower_name }}</dd>
              </template>
              <template v-if="convertedText(tx)">
                <dt>In {{ defaultCurrencyCode() }}</dt>
                <dd class="num">{{ convertedText(tx) }}</dd>
              </template>
              <template v-if="labelsOf(tx).length">
                <dt>Labels</dt>
                <dd class="tx-labels">
                  <span v-for="l in labelsOf(tx)" :key="l.id" class="label-tag" :style="{ '--label-color': l.color }">{{ l.name }}</span>
                </dd>
              </template>
            </dl>

            <div class="tx-actions">
              <template v-if="confirmingId === tx.id">
                <span class="confirm-text">Delete this transaction?</span>
                <button type="button" class="btn-sm" @click="confirmingId = null">No</button>
                <button type="button" class="btn-sm btn-danger" @click="confirmDelete(tx)">Yes, delete</button>
              </template>
              <template v-else>
                <button type="button" class="btn-sm" @click="emit('edit', tx)">Edit</button>
                <button type="button" class="btn-sm btn-ghost-danger" @click="confirmingId = tx.id">Delete</button>
              </template>
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.tx-cards {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 14px 12px 12px;
}

.day {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.day-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 0 6px;
}

.day-label {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-secondary);
}

.day-net {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.day-net.is-in {
  color: var(--income);
}

.day-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tx {
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  overflow: hidden;
}

.tx-summary {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 12px 12px 12px 14px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  font-weight: 500;
}

.tx-summary:hover {
  background: transparent;
}

.tx-summary:active {
  transform: none;
  background: var(--bg-surface);
}

.tx-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.tx-amount {
  font-size: 1.08rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.tx-amount.income { color: var(--income); }
.tx-amount.transfer { color: var(--info); }

.tx-desc {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 0.86rem;
  color: var(--text-secondary);
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cat-dot {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.tx-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 0;
  max-width: 42vw;
}

.tx-account {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tx-date {
  font-size: 0.74rem;
  color: var(--text-muted);
}

.tx-chevron {
  color: var(--text-muted);
  transition: transform var(--transition);
}

.tx.open .tx-chevron {
  transform: rotate(180deg);
}

.tx-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 2px 14px 14px;
  border-top: 1px solid var(--border-color);
}

.tx-facts {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px 16px;
  margin: 12px 0 0;
  font-size: 0.85rem;
}

.tx-facts dt {
  color: var(--text-muted);
  font-weight: 600;
}

.tx-facts dd {
  margin: 0;
  color: var(--text-primary);
  min-width: 0;
}

.type-pill {
  --tone: var(--text-secondary);
  display: inline-block;
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 14%, transparent);
}

.type-pill.income,
.type-pill.lend_repayment { --tone: var(--income); }
.type-pill.transfer { --tone: var(--info); }
.type-pill.lend { --tone: var(--warning); }

.tx-labels {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.label-tag {
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  font-size: 0.72rem;
  font-weight: 700;
  background: var(--label-color);
  color: #11151b;
}

.tx-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.confirm-text {
  margin-right: auto;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--expense);
}

.btn-sm {
  padding: 8px 16px;
  font-size: 0.84rem;
  background: var(--bg-surface);
}

.btn-ghost-danger {
  background: transparent;
  color: var(--expense);
}

.btn-ghost-danger:hover {
  background: color-mix(in srgb, var(--expense) 12%, transparent);
}
</style>
