<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useTransactionsStore } from '../../stores/transactions'
import { useCurrencyStore } from '../../stores/currency'
import { useCurrenciesStore } from '../../stores/currencies'
import { useCategoriesStore } from '../../stores/categories'
import { inDefault, formatDefault } from '../../lib/money'
import { isInvestmentTxn } from '../../lib/investment'
import { supabase } from '../../lib/supabase'
import { useToday } from '../../composables/useToday'
import CandleLoader from '../shared/CandleLoader.vue'

const transactionsStore = useTransactionsStore()
const currencyStore = useCurrencyStore()
const currenciesStore = useCurrenciesStore()
const categoriesStore = useCategoriesStore()
const loading = ref(true)
const prevTxns = ref([])

// Local month, reactive: flips at local midnight (was UTC → lagged to 05:30
// IST) and while the app stays open across the month boundary.
const { currentMonth } = useToday()
const prevMonth = computed(() => {
  const [y, m] = currentMonth.value.split('-').map(Number)
  const py = m === 1 ? y - 1 : y
  const pm = m === 1 ? 12 : m - 1
  return `${py}-${String(pm).padStart(2, '0')}`
})

function monthRange(month) {
  const [y, m] = month.split('-').map(Number)
  const start = `${month}-01`
  const end = m === 12
    ? `${y + 1}-01-01`
    : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return { start, end }
}

// Range guard so this card always shows the current month even when
// another component (e.g. NetWorthPie via useNetWorth) re-fetches the
// transactions store unfiltered. The Pinia store is global, so without
// this filter MonthSummary was summing whatever subset happened to be
// in the store at render time → doubled or inflated totals.
const currentRange = computed(() => monthRange(currentMonth.value))
function inCurrentMonth(t) {
  return t.date >= currentRange.value.start && t.date < currentRange.value.end
}

// Last month's totals only feed the "vs last month" delta, so this is a
// network-only enhancement: skipped offline and never awaited by first paint.
async function fetchPrevMonth() {
  if (!navigator.onLine) return
  try {
    const { start, end } = monthRange(prevMonth.value)
    const { data } = await supabase
      .from('transactions')
      .select('type, amount, amount_default, default_currency')
      .gte('date', start)
      .lt('date', end)
    prevTxns.value = data || []
  } catch {
    // Keep the summary; the delta just stays hidden.
  }
}

onMounted(async () => {
  // Render from cached data as soon as it's in the store (see the template's
  // v-if): the summary must never wait on a Supabase round-trip, which can
  // stall indefinitely on an offline launch.
  fetchPrevMonth()
  try {
    await Promise.all([
      transactionsStore.fetchTransactions({ month: currentMonth.value }),
      currenciesStore.fetchCurrencies(),
      categoriesStore.fetchCategories(),
    ])
  } finally {
    loading.value = false
  }
  currencyStore.fetchRate(currenciesStore.codes.length ? currenciesStore.codes : ['INR', 'USD'])
})

// New month while the dashboard is open → pull the new month + comparison.
watch(currentMonth, (month) => {
  transactionsStore.fetchTransactions({ month })
  fetchPrevMonth()
})

const incomeTxns = computed(() => transactionsStore.transactions.filter(t => t.type === 'income' && inCurrentMonth(t)))
const expenseTxns = computed(() => transactionsStore.transactions.filter(t => t.type === 'expense' && inCurrentMonth(t)))

const totalIncome = computed(() =>
  incomeTxns.value.reduce((sum, t) => sum + inDefault(t), 0)
)

// Investment spend = expenses whose category is named "Investment".
// Pulled OUT of the Expenses figure so "Expenses" reflects real consumption —
// investments are money moved into assets, not money spent.
const investmentTxns = computed(() =>
  expenseTxns.value.filter(t => isInvestmentTxn(t, categoriesStore.categories))
)
const totalInvestments = computed(() =>
  investmentTxns.value.reduce((sum, t) => sum + inDefault(t), 0)
)

// Real expenses exclude investments.
const totalExpenses = computed(() =>
  expenseTxns.value
    .filter(t => !isInvestmentTxn(t, categoriesStore.categories))
    .reduce((sum, t) => sum + inDefault(t), 0)
)

// Net is unchanged in value — income minus every outflow (real expenses +
// investments). Splitting investments into their own card doesn't change
// what's actually left over.
const net = computed(() => totalIncome.value - totalExpenses.value - totalInvestments.value)

const incomeCount = computed(() => incomeTxns.value.length)
const expenseCount = computed(() => expenseTxns.value.length)
const totalCount = computed(() => incomeCount.value + expenseCount.value)

const prevIncome = computed(() =>
  prevTxns.value.filter(t => t.type === 'income').reduce((s, t) => s + inDefault(t), 0)
)
const prevExpenses = computed(() =>
  prevTxns.value.filter(t => t.type === 'expense').reduce((s, t) => s + inDefault(t), 0)
)
const prevNet = computed(() => prevIncome.value - prevExpenses.value)

function pctDelta(curr, prev) {
  if (!prev) return curr ? null : 0
  return ((curr - prev) / Math.abs(prev)) * 100
}

const incomeDelta = computed(() => pctDelta(totalIncome.value, prevIncome.value))
const expenseDelta = computed(() => pctDelta(totalExpenses.value, prevExpenses.value))
const netDelta = computed(() => pctDelta(net.value, prevNet.value))

function openReport() {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '/')
  const url = `${base}month-report/${currentMonth.value}`.replace(/\/{2,}/g, '/')
  // Keep window.opener intact so the report's Back button can close the tab
  // and surface the original Beyond Money tab.
  window.open(url, '_blank')
}

function fmtDelta(v) {
  if (v === null || v === undefined) return null
  if (v === 0) return '0%'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(0)}%`
}
</script>

<template>
  <div class="month-summary">
    <div v-if="loading && !transactionsStore.loaded" class="summary-loading">
      <CandleLoader size="sm" />
    </div>
    <div v-else class="summary-body">
      <!-- Two columns at every width: the figure on the left, the report
           button on the right (it compacts on narrow cards). -->
      <div class="net-hero">
        <div class="net-main">
          <span class="net-label">Left over this month</span>
          <span class="net-value num" :class="{ 'is-negative': net < 0 }">{{ formatDefault(net) }}</span>
          <span v-if="fmtDelta(netDelta)" class="net-delta" :class="{ up: netDelta > 0, down: netDelta < 0 }">
            {{ fmtDelta(netDelta) }} vs last month
          </span>
        </div>
        <button type="button" class="report-btn" title="Open this month's report in a new tab" @click="openReport">
            <span class="report-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="3.5" width="15" height="17" rx="3" /><path d="M8.5 15.5v-3M12 15.5v-6M15.5 15.5v-4" /></svg>
            </span>
            <span class="report-copy">
              <span class="report-title">Month report</span>
              <span class="report-sub">Full breakdown</span>
            </span>
            <svg class="report-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
        </button>
      </div>

      <div class="stat-grid">
        <div class="stat stat--income">
          <span class="stat-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6.5 10.5L12 5l5.5 5.5" /></svg>
          </span>
          <span class="stat-label">Came in</span>
          <span class="stat-value num">{{ formatDefault(totalIncome) }}</span>
          <span v-if="fmtDelta(incomeDelta)" class="stat-foot">{{ fmtDelta(incomeDelta) }} vs last month</span>
        </div>

        <div class="stat stat--expense">
          <span class="stat-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6.5 13.5L12 19l5.5-5.5" /></svg>
          </span>
          <span class="stat-label">Spent</span>
          <span class="stat-value num">{{ formatDefault(totalExpenses) }}</span>
          <span v-if="fmtDelta(expenseDelta)" class="stat-foot">{{ fmtDelta(expenseDelta) }} vs last month</span>
        </div>

        <div class="stat stat--invest">
          <span class="stat-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20v-7" /><path d="M12 14c0-3.5 2.4-6 6-6 0 3.5-2.4 6-6 6z" /><path d="M12 16c0-2.8-2-4.6-4.8-4.6 0 2.8 2 4.6 4.8 4.6z" /></svg>
          </span>
          <span class="stat-label">Invested</span>
          <span class="stat-value num">{{ formatDefault(totalInvestments) }}</span>
        </div>
      </div>

      <p class="summary-foot">{{ totalCount }} {{ totalCount === 1 ? 'transaction' : 'transactions' }} this month</p>
    </div>
  </div>
</template>

<style scoped>
.month-summary {
  min-width: 0;
  /* Container queries let the stat tiles react to the card's actual width
     rather than the viewport (the dashboard is 2-col on laptops). */
  container-type: inline-size;
  container-name: monthsummary;
}

.summary-loading {
  display: grid;
  place-items: center;
  min-height: 180px;
}

.summary-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.net-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.net-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.net-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
}

.net-value {
  font-size: clamp(1.6rem, 8cqi, 2.6rem);
  white-space: nowrap;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.025em;
  color: var(--text-primary);
}

.net-value.is-negative {
  color: var(--expense);
}

/* The report link sits beside the headline figure: large enough to read as
   a real destination, quiet enough not to compete with the number. */
.report-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px 8px 8px;
  border-radius: var(--radius-sm);
  background: var(--accent-dim);
  color: var(--accent);
  text-align: left;
}

.report-btn:hover {
  background: color-mix(in srgb, var(--accent) 24%, transparent);
}

.report-icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--accent-ink);
  flex-shrink: 0;
}

.report-copy {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}

.report-title {
  font-family: var(--font-display);
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-primary);
}

.report-sub {
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--accent);
}

.report-arrow {
  margin-left: 2px;
  transition: transform var(--transition);
}

.report-btn:hover .report-arrow {
  transform: translate(2px, -2px);
}

.net-delta {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.net-delta.up { color: var(--income); }
.net-delta.down { color: var(--expense); }

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.stat {
  --tone: var(--accent);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 16px;
  min-width: 0;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
}

.stat--income { --tone: var(--income); }
.stat--expense { --tone: var(--expense); }
.stat--invest { --tone: var(--info); }

.stat-icon {
  width: 30px;
  height: 30px;
  margin-bottom: 10px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 16%, transparent);
}

.stat-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.stat-value {
  font-size: clamp(1rem, 4.4cqi, 1.3rem);
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-foot {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.summary-foot {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}

@container monthsummary (max-width: 420px) {
  /* Narrow card: the report button becomes a compact tile beside the figure. */
  .report-btn {
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 12px;
    text-align: center;
  }

  .report-icon {
    width: 34px;
    height: 34px;
  }

  .report-title {
    font-size: 0.8rem;
  }

  .report-sub,
  .report-arrow {
    display: none;
  }

  .stat-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .stat {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 12px;
    padding: 12px 14px;
  }

  .stat-icon {
    grid-row: span 2;
    margin-bottom: 0;
  }

  .stat-value {
    grid-column: 3;
    grid-row: 1 / span 2;
    text-align: right;
  }

  .stat-foot {
    grid-column: 2;
  }

  /* No comparison line (e.g. first month, or offline): centre the label. */
  .stat:not(:has(.stat-foot)) .stat-label {
    grid-row: 1 / span 2;
    align-self: center;
  }
}
</style>
