<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTransactionsStore } from '../stores/transactions'
import { useCategoriesStore } from '../stores/categories'
import { useLabelsStore } from '../stores/labels'
import { useAccountsStore } from '../stores/accounts'
import { useCreditCardsStore } from '../stores/creditCards'
import { useCcExpensesStore } from '../stores/ccExpenses'
import { useAssetsStore } from '../stores/assets'
import { useSubscriptionsStore } from '../stores/subscriptions'
import { useNetWorthSnapshotsStore } from '../stores/netWorthSnapshots'
import { useCurrenciesStore } from '../stores/currencies'
import { useCurrencyStore } from '../stores/currency'
import { inDefault, toCurrency, defaultCurrencyCode, defaultCurrencySymbol, formatDefault } from '../lib/money'
import { isInvestmentTxn } from '../lib/investment'
import { ASSET_GROUPS, metaFor } from '../lib/assetTypes'
import { formatDate, localMonth } from '../lib/dateFormat'
import { allocateLoans } from '../lib/loans'
import { APP_VERSION } from '../version'
import CandleLoader from '../components/shared/CandleLoader.vue'

const route = useRoute()
const router = useRouter()

const transactionsStore = useTransactionsStore()
const categoriesStore = useCategoriesStore()
const labelsStore = useLabelsStore()
const accountsStore = useAccountsStore()
const creditCardsStore = useCreditCardsStore()
const ccExpensesStore = useCcExpensesStore()
const assetsStore = useAssetsStore()
const subscriptionsStore = useSubscriptionsStore()
const snapshotsStore = useNetWorthSnapshotsStore()
const currenciesStore = useCurrenciesStore()
const currencyStore = useCurrencyStore()

const loading = ref(true)
const generatedAt = ref(new Date())

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const todayMonth = localMonth()
// Product launched April 2026 — earlier months have no data so don't expose them.
const MIN_MONTH = '2026-04'

function clampMonth(m) {
  if (!MONTH_RE.test(m || '')) return todayMonth
  if (m < MIN_MONTH) return MIN_MONTH
  if (m > todayMonth) return todayMonth
  return m
}

const month = ref(clampMonth(route.params.month))

// Full transaction history (lightweight columns) for the whole account.
// The main transactions store is filtered to the report month + carries the
// joins (labels/categories/accounts) the month-specific sections need; this
// separate slim fetch powers everything that needs cross-month context:
// the 6-month trends, month-over-month movers, per-borrower loan balances and
// the reconstructed net-worth history. 300-ish rows — cheap to pull whole.
const allTxns = ref([])

// How many months of history the trend charts show, inclusive of the report month.
const TREND_WINDOW = 6

function monthRange(m) {
  const [y, mm] = m.split('-').map(Number)
  const start = `${m}-01`
  const end = mm === 12
    ? `${y + 1}-01-01`
    : `${y}-${String(mm + 1).padStart(2, '0')}-01`
  return { start, end }
}

function prevOf(m) {
  const [y, mm] = m.split('-').map(Number)
  const py = mm === 1 ? y - 1 : y
  const pm = mm === 1 ? 12 : mm - 1
  return `${py}-${String(pm).padStart(2, '0')}`
}

function nextOf(m) {
  const [y, mm] = m.split('-').map(Number)
  const ny = mm === 12 ? y + 1 : y
  const nm = mm === 12 ? 1 : mm + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

const monthLabel = computed(() => {
  const [y, mm] = month.value.split('-').map(Number)
  const date = new Date(y, mm - 1, 1)
  return date.toLocaleString('en-IN', { month: 'long', year: 'numeric' })
})

const isCurrentMonth = computed(() => month.value === todayMonth)
const canGoNext = computed(() => month.value < todayMonth)
const canGoPrev = computed(() => month.value > MIN_MONTH)

async function loadAll() {
  loading.value = true
  await Promise.all([
    transactionsStore.fetchTransactions({ month: month.value }, true),
    categoriesStore.fetchCategories(),
    labelsStore.fetchLabels(),
    accountsStore.fetchAccounts(),
    creditCardsStore.fetchCreditCards(),
    ccExpensesStore.fetchExpenses(),
    assetsStore.fetchAssets(),
    subscriptionsStore.fetchSubscriptions(),
    snapshotsStore.fetchSnapshots(),
    currenciesStore.fetchCurrencies(),
  ])
  await currencyStore.fetchRate(currenciesStore.codes.length ? currenciesStore.codes : ['INR', 'USD'])

  const { supabase } = await import('../lib/supabase')
  const { data: allData } = await supabase
    .from('transactions')
    .select('id, date, type, amount, amount_default, default_currency, currency, category_id, account_id, notes, loan_id, borrower_name')
  allTxns.value = allData || []

  generatedAt.value = new Date()
  loading.value = false
}

onMounted(loadAll)

watch(month, async (m) => {
  router.replace({ name: 'Month Report', params: { month: m } })
  await loadAll()
})

// --------- Derived data ---------

const txns = computed(() => transactionsStore.transactions)

// Expenses exclude investments (category named "Investment") — those are money
// moved into assets, broken out into their own section below. expenseTxns drives
// the total, the category/label breakdowns and the top-10, so excluding here
// keeps "expenses" meaning real consumption everywhere it's consumed.
const expenseTxns = computed(() => txns.value.filter(t => t.type === 'expense' && !isInvestmentTxn(t, categoriesStore.categories)))
const investmentTxns = computed(() =>
  txns.value
    .filter(t => t.type === 'expense' && isInvestmentTxn(t, categoriesStore.categories))
    .sort((a, b) => inDefault(b) - inDefault(a))
)
const incomeTxns = computed(() => txns.value.filter(t => t.type === 'income'))
const transferTxns = computed(() => txns.value.filter(t => t.type === 'transfer'))

const totalIncome = computed(() => incomeTxns.value.reduce((s, t) => s + inDefault(t), 0))
const totalExpenses = computed(() => expenseTxns.value.reduce((s, t) => s + inDefault(t), 0))
const totalInvestments = computed(() => investmentTxns.value.reduce((s, t) => s + inDefault(t), 0))
// Net is income minus all outflow (real expenses + investments) — value unchanged.
const net = computed(() => totalIncome.value - totalExpenses.value - totalInvestments.value)
const txCount = computed(() => txns.value.length)

// Value of a slim history row in the default currency. These rows may predate
// the live-rate cache, so we trust the stored amount_default snapshot first and
// only fall back to the raw amount (assumed already default) — inDefault() is
// reserved for the fully-joined report-month rows.
function histVal(t) {
  return Number(t.amount_default != null ? t.amount_default : t.amount || 0)
}

function txnsInMonth(m) {
  return allTxns.value.filter(t => t.date && t.date.slice(0, 7) === m)
}

function isInvestmentRow(t) {
  return isInvestmentTxn(t, categoriesStore.categories)
}

// Income / real-expense / investment / net totals for any month, computed from
// the slim history so every trend point uses one consistent method.
function monthTotals(m) {
  const rows = txnsInMonth(m)
  let income = 0, expense = 0, investment = 0
  for (const t of rows) {
    const v = histVal(t)
    if (t.type === 'income') income += v
    else if (t.type === 'expense') {
      if (isInvestmentRow(t)) investment += v
      else expense += v
    }
  }
  return { income, expense, investment, net: income - expense - investment }
}

const prevMonth = computed(() => prevOf(month.value))
const prevTotals = computed(() => monthTotals(prevMonth.value))
const prevIncome = computed(() => prevTotals.value.income)
const prevInvestments = computed(() => prevTotals.value.investment)
const prevExpenses = computed(() => prevTotals.value.expense)
const prevNet = computed(() => prevTotals.value.net)

function pctDelta(curr, prev) {
  if (!prev) return curr ? null : 0
  return ((curr - prev) / Math.abs(prev)) * 100
}

function fmtDelta(v) {
  if (v === null || v === undefined) return '—'
  if (v === 0) return '0%'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(0)}%`
}

const incomeDelta = computed(() => pctDelta(totalIncome.value, prevIncome.value))
const expenseDelta = computed(() => pctDelta(totalExpenses.value, prevExpenses.value))
const netDelta = computed(() => pctDelta(net.value, prevNet.value))

const savingsRate = computed(() => {
  if (!totalIncome.value) return null
  return (net.value / totalIncome.value) * 100
})

// Daily flow buckets
const dailyFlow = computed(() => {
  const [y, m] = month.value.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const buckets = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, income: 0, expense: 0 }))
  for (const t of txns.value) {
    if (t.type === 'transfer') continue
    const d = Number(t.date.split('-')[2])
    if (!buckets[d - 1]) continue
    const v = inDefault(t)
    if (t.type === 'income') buckets[d - 1].income += v
    else if (t.type === 'expense') buckets[d - 1].expense += v
  }
  return buckets
})

const dailyMax = computed(() => {
  let m = 0
  for (const b of dailyFlow.value) {
    if (b.income > m) m = b.income
    if (b.expense > m) m = b.expense
  }
  return m || 1
})

// Aggregations
function aggregateByCategory(list) {
  const map = new Map()
  for (const t of list) {
    const id = t.category_id || '__uncat__'
    const cat = categoriesStore.categories.find(c => c.id === t.category_id)
    const name = cat?.name || 'Uncategorized'
    const color = cat?.color || '#8c9ab0'
    const v = inDefault(t)
    const cur = map.get(id) || { id, name, color, amount: 0, count: 0 }
    cur.amount += v
    cur.count += 1
    map.set(id, cur)
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount)
}

const expensesByCategory = computed(() => aggregateByCategory(expenseTxns.value))
const incomeByCategory = computed(() => aggregateByCategory(incomeTxns.value))

const investmentDelta = computed(() => pctDelta(totalInvestments.value, prevInvestments.value))
// Share of total outflow (real expenses + investments) that went into investments.
const investmentRate = computed(() => {
  const outflow = totalExpenses.value + totalInvestments.value
  if (!outflow) return null
  return (totalInvestments.value / outflow) * 100
})

// Credit card expenses (in this month's resolving cycle) converted to the
// default currency. Each row is enriched with the card's currency so we can
// roll them into category/label breakdowns alongside normal expense txns.
const ccCycleExpenses = computed(() => {
  const rows = []
  for (const card of ccActivity.value) {
    if (card.status === 'none') continue
    for (const e of card.expenses) {
      rows.push({
        ...e,
        amount_default: toCurrency(Number(e.amount || 0), card.currency, defaultCurrencyCode()),
        card_currency: card.currency,
        card_name: card.name,
      })
    }
  }
  return rows
})

const totalCcCycleSpend = computed(() =>
  ccCycleExpenses.value.reduce((s, e) => s + e.amount_default, 0)
)

// Combined "expenses by category" — normal expense txns + CC cycle items.
// Each row carries a breakdown so the UI can show Normal vs Credit Card.
const expensesByCategoryCombined = computed(() => {
  const map = new Map()
  function bucket(id) {
    if (map.has(id)) return map.get(id)
    const cat = categoriesStore.categories.find(c => c.id === id)
    const row = {
      id: id || '__uncat__',
      name: cat?.name || 'Uncategorized',
      color: cat?.color || '#8c9ab0',
      amount: 0,
      count: 0,
      normalAmount: 0,
      normalCount: 0,
      ccAmount: 0,
      ccCount: 0,
    }
    map.set(id, row)
    return row
  }
  for (const t of expenseTxns.value) {
    const row = bucket(t.category_id || null)
    const v = inDefault(t)
    row.amount += v
    row.normalAmount += v
    row.count += 1
    row.normalCount += 1
  }
  for (const e of ccCycleExpenses.value) {
    const row = bucket(e.category_id || null)
    row.amount += e.amount_default
    row.ccAmount += e.amount_default
    row.count += 1
    row.ccCount += 1
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount)
})

const totalCombinedExpenses = computed(() =>
  expensesByCategoryCombined.value.reduce((s, r) => s + r.amount, 0)
)

function buildLabelBreakdown(normalList, ccList) {
  const map = new Map()
  function bucket(id, label) {
    if (map.has(id)) return map.get(id)
    const row = {
      id,
      name: label?.name || 'Unknown',
      color: label?.color || '#8c9ab0',
      amount: 0,
      count: 0,
      normalAmount: 0,
      normalCount: 0,
      ccAmount: 0,
      ccCount: 0,
    }
    map.set(id, row)
    return row
  }
  for (const t of normalList) {
    const labelIds = t.transaction_labels?.map(tl => tl.label_id) || []
    if (!labelIds.length) continue
    const v = inDefault(t)
    for (const lid of labelIds) {
      const label = labelsStore.labels.find(l => l.id === lid)
      if (!label) continue
      const row = bucket(lid, label)
      row.amount += v
      row.normalAmount += v
      row.count += 1
      row.normalCount += 1
    }
  }
  for (const e of ccList) {
    const labelIds = e.cc_expense_labels?.map(l => l.label_id) || []
    if (!labelIds.length) continue
    const v = e.amount_default
    for (const lid of labelIds) {
      const label = labelsStore.labels.find(l => l.id === lid)
      if (!label) continue
      const row = bucket(lid, label)
      row.amount += v
      row.ccAmount += v
      row.count += 1
      row.ccCount += 1
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount)
}

const expensesByLabel = computed(() =>
  buildLabelBreakdown(expenseTxns.value, ccCycleExpenses.value)
)

const topExpenses = computed(() => {
  return [...expenseTxns.value]
    .sort((a, b) => inDefault(b) - inDefault(a))
    .slice(0, 10)
})

const allIncoming = computed(() => {
  return [...incomeTxns.value].sort((a, b) => inDefault(b) - inDefault(a))
})

// Account breakdown — money in/out per account this month
const accountBreakdown = computed(() => {
  const map = new Map()
  for (const a of accountsStore.accounts) {
    map.set(a.id, { id: a.id, name: a.name, currency: a.currency, balance: Number(a.current_balance || 0), inFlow: 0, outFlow: 0, count: 0 })
  }
  // Cash bucket for txns without account
  map.set(null, { id: null, name: 'Cash / Wallet', currency: defaultCurrencyCode(), balance: 0, inFlow: 0, outFlow: 0, count: 0 })

  for (const t of txns.value) {
    const id = t.account_id || null
    const row = map.get(id)
    if (!row) continue
    const v = inDefault(t)
    if (t.type === 'income') row.inFlow += v
    else if (t.type === 'expense') row.outFlow += v
    else if (t.type === 'transfer') {
      if (t.notes === 'transfer_in') row.inFlow += v
      else if (t.notes === 'transfer_out') row.outFlow += v
    }
    row.count += 1
  }

  return [...map.values()].filter(r => r.count > 0 || (r.id !== null))
})

// Credit card activity for the report's month.
//
// CC billing cycles rarely align with the calendar month — a "May" bill
// typically covers spend from mid-April to mid-May and is paid in May.
// We surface the cycle that *resolves* in month M:
//   - If any of this card's expenses were paid in M → that paid cycle.
//   - Otherwise → the still-outstanding cycle (unpaid expenses up to end of M).
function buildCardCycle(card, all, start, end) {
  const cardAll = all.filter(e => e.credit_card_id === card.id)
  const paidInM = cardAll.filter(e => e.is_paid && e.paid_date && e.paid_date >= start && e.paid_date < end)

  let cycle, status, paidOn
  if (paidInM.length > 0) {
    cycle = paidInM
    status = 'paid'
    paidOn = paidInM.map(e => e.paid_date).sort().reverse()[0]
  } else {
    cycle = cardAll.filter(e => !e.is_paid && e.date < end)
    status = cycle.length ? 'outstanding' : 'none'
    paidOn = null
  }

  const sorted = [...cycle].sort((a, b) => a.date.localeCompare(b.date))
  const periodStart = sorted[0]?.date || null
  const periodEnd = paidOn || sorted[sorted.length - 1]?.date || null
  const amount = cycle.reduce((s, e) => s + Number(e.amount || 0), 0)

  return {
    id: card.id,
    name: card.name,
    bank: card.bank,
    lastFour: card.last_four,
    currency: card.currency,
    status,
    paidOn,
    periodStart,
    periodEnd,
    amount,
    txCount: cycle.length,
    expenses: sorted,
  }
}

const ccActivity = computed(() => {
  const { start, end } = monthRange(month.value)
  return creditCardsStore.creditCards.map(card => buildCardCycle(card, ccExpensesStore.expenses, start, end))
})

const totalCcPaid = computed(() =>
  ccActivity.value
    .filter(r => r.status === 'paid')
    .reduce((s, r) => s + toCurrency(r.amount, r.currency, defaultCurrencyCode()), 0)
)
const totalCcOutstanding = computed(() =>
  ccActivity.value
    .filter(r => r.status === 'outstanding')
    .reduce((s, r) => s + toCurrency(r.amount, r.currency, defaultCurrencyCode()), 0)
)
// Total outstanding across all cards (regardless of report month) — used in
// the net-worth snapshot since net worth is always current state. Net of any
// prepaid/early payment already made (that cash already left an account, so the
// full unpaid total would double-count it).
const allCardsOutstanding = computed(() => {
  const code = defaultCurrencyCode()
  return creditCardsStore.creditCards.reduce((s, c) => {
    const netDue = Math.max(0, ccExpensesStore.totalForCard(c.id) - Number(c.prepaid_amount || 0))
    return s + toCurrency(netDue, c.currency, code)
  }, 0)
})

// Asset snapshot (current)
const assetGroupSnapshot = computed(() => {
  const code = defaultCurrencyCode()
  const map = new Map(ASSET_GROUPS.map(g => [g.code, { code: g.code, label: g.label, value: 0, invested: 0, count: 0 }]))
  for (const a of assetsStore.assets) {
    const groupCode = metaFor(a.type).group
    const row = map.get(groupCode)
    if (!row) continue
    row.value += toCurrency(a.current_value || 0, a.currency || code, code)
    row.invested += toCurrency(a.principal_amount || 0, a.currency || code, code)
    row.count += 1
  }
  return [...map.values()].filter(r => r.count > 0)
})

const totalAssetValue = computed(() => assetGroupSnapshot.value.reduce((s, r) => s + r.value, 0))
const totalAssetInvested = computed(() => assetGroupSnapshot.value.reduce((s, r) => s + r.invested, 0))
const assetGrowth = computed(() => {
  if (!totalAssetInvested.value) return null
  return ((totalAssetValue.value - totalAssetInvested.value) / totalAssetInvested.value) * 100
})

const totalAccountsBalance = computed(() => {
  const code = defaultCurrencyCode()
  return accountsStore.accounts.reduce((s, a) => s + toCurrency(a.current_balance || 0, a.currency || code, code), 0)
})

// Money lent out and still owed — counts toward net worth like an asset.
// Derived from the full history (allTxns) because the main transactions store
// is filtered to the report month.
//
// Per-lend outstanding, aggregated by borrower, plus this-month lend/repayment
// activity. Powers both the net-worth line and the dedicated Lending section.
const loanSummary = computed(() => {
  const all = allTxns.value
  // Settlement rules (specific-loan first, then oldest first) live in
  // lib/loans.js so this report matches the Loans page (INV-64).
  const alloc = allocateLoans(all, { value: histVal })
  const m = month.value
  const lentThisMonth = all.filter(t => t.type === 'lend' && t.date?.slice(0, 7) === m).reduce((s, t) => s + histVal(t), 0)
  const repaidThisMonth = all.filter(t => t.type === 'lend_repayment' && t.date?.slice(0, 7) === m).reduce((s, t) => s + histVal(t), 0)
  const borrowers = alloc.borrowers
    .filter(b => b.outstanding > 0.0001)
    .map(b => ({ name: b.name, lent: b.lent, repaid: b.repaid, outstanding: b.outstanding }))
  return { totalOutstanding: alloc.totalOutstanding, borrowers, lentThisMonth, repaidThisMonth }
})

const totalLoansOutstanding = computed(() => loanSummary.value.totalOutstanding)

const netWorth = computed(() =>
  totalAccountsBalance.value + totalAssetValue.value + totalLoansOutstanding.value - allCardsOutstanding.value
)

// ===================================================================
//  Cross-month analytics (powered by allTxns / snapshots)
// ===================================================================

function shortMonthLabel(m) {
  const [y, mm] = m.split('-').map(Number)
  const d = new Date(y, mm - 1, 1)
  // Include the year on January so a window spanning a year boundary reads right.
  return mm === 1
    ? d.toLocaleString('en-IN', { month: 'short', year: '2-digit' })
    : d.toLocaleString('en-IN', { month: 'short' })
}

// The TREND_WINDOW months ending at (and including) the report month.
const monthWindow = computed(() => {
  const out = []
  let m = month.value
  for (let i = 0; i < TREND_WINDOW; i++) {
    out.unshift(m)
    m = prevOf(m)
  }
  return out
})

// Per-month income / expense / investment / net across the window.
const trendSeries = computed(() =>
  monthWindow.value.map(m => {
    const t = monthTotals(m)
    return {
      month: m,
      label: shortMonthLabel(m),
      isReport: m === month.value,
      income: t.income,
      expense: t.expense,
      investment: t.investment,
      net: t.net,
      savingsRate: t.income ? (t.net / t.income) * 100 : null,
    }
  })
)

const trendMax = computed(() => {
  let mx = 0
  for (const p of trendSeries.value) {
    if (p.income > mx) mx = p.income
    if (p.expense + p.investment > mx) mx = p.expense + p.investment
  }
  return mx || 1
})

// Averages over the months BEFORE the report month within the window that have
// any recorded activity — the baseline the report month is judged against.
const trendBaseline = computed(() => {
  const prior = trendSeries.value.filter(p => !p.isReport && (p.income || p.expense || p.investment))
  if (!prior.length) return null
  const avg = (sel) => prior.reduce((s, p) => s + sel(p), 0) / prior.length
  return {
    count: prior.length,
    income: avg(p => p.income),
    expense: avg(p => p.expense),
    net: avg(p => p.net),
  }
})

// --- Net-worth history (snapshot where captured, else reconstructed) ---

function assetMonthOf(a) {
  if (Array.isArray(a.lots) && a.lots.length) {
    const first = a.lots.map(l => l.purchased_at).filter(Boolean).sort()[0]
    if (first) return String(first).slice(0, 7)
  }
  return a.created_at ? String(a.created_at).slice(0, 7) : null
}

// How one txn moved the TOTAL of account balances (transfer legs cancel out).
function accountDeltaHist(t) {
  if (!t.account_id) return 0
  const base = histVal(t)
  if (t.type === 'income' || t.type === 'lend_repayment') return base
  if (t.type === 'expense' || t.type === 'lend') return -base
  if (t.type === 'transfer') {
    if (t.notes === 'transfer_out') return -base
    if (t.notes === 'transfer_in') return base
  }
  return 0
}

const netWorthTrend = computed(() => {
  const def = defaultCurrencyCode()
  const snaps = new Map(snapshotsStore.snapshots.map(s => [s.month, Number(s.net_worth)]))
  const loanTxns = allTxns.value.filter(t => t.type === 'lend' || t.type === 'lend_repayment')
  const cc = ccExpensesStore.expenses
  const assets = assetsStore.assets

  return monthWindow.value.map(m => {
    if (snaps.has(m)) return { month: m, label: shortMonthLabel(m), value: snaps.get(m), source: 'snapshot', isReport: m === month.value }

    const later = allTxns.value.reduce((s, t) => (t.date && t.date.slice(0, 7) > m ? s + accountDeltaHist(t) : s), 0)
    const accounts = totalAccountsBalance.value - later

    const loans = allocateLoans(loanTxns, { value: histVal, asOf: m }).totalOutstanding

    let cards = 0
    for (const e of cc) {
      if (!e.date || String(e.date).slice(0, 7) > m) continue
      const pm = e.paid_date ? String(e.paid_date).slice(0, 7) : null
      const unpaidThen = pm ? pm > m : !e.is_paid
      if (unpaidThen) cards += Number(e.amount || 0)
    }

    let invested = 0
    for (const a of assets) {
      const am = assetMonthOf(a)
      if (am && am <= m) invested += toCurrency(a.principal_amount || 0, a.currency || def, def)
    }

    return { month: m, label: shortMonthLabel(m), value: accounts + loans + invested - cards, source: 'reconstructed', isReport: m === month.value }
  })
})

const nwTrendBounds = computed(() => {
  const vals = netWorthTrend.value.map(p => p.value)
  if (!vals.length) return { min: 0, max: 1 }
  const min = Math.min(...vals, 0)
  const max = Math.max(...vals, 1)
  return { min, max: max === min ? min + 1 : max }
})

const reportMonthSnapshot = computed(() =>
  snapshotsStore.snapshots.find(s => s.month === month.value) || null
)

const netWorthChange = computed(() => {
  const t = netWorthTrend.value
  if (t.length < 2) return null
  const first = t[0].value
  const last = t[t.length - 1].value
  return { abs: last - first, pct: first ? ((last - first) / Math.abs(first)) * 100 : null, from: t[0].label, to: t[t.length - 1].label }
})

// --- Month-over-month category movers (real expenses only) ---

function expenseCatMap(m) {
  const map = new Map()
  for (const t of txnsInMonth(m)) {
    if (t.type !== 'expense' || isInvestmentRow(t)) continue
    const id = t.category_id || '__uncat__'
    map.set(id, (map.get(id) || 0) + histVal(t))
  }
  return map
}

const categoryMovers = computed(() => {
  const cur = expenseCatMap(month.value)
  const prev = expenseCatMap(prevMonth.value)
  const ids = new Set([...cur.keys(), ...prev.keys()])
  const rows = []
  for (const id of ids) {
    const c = cur.get(id) || 0
    const p = prev.get(id) || 0
    const delta = c - p
    if (Math.abs(delta) < 1) continue
    const cat = categoriesStore.categories.find(x => x.id === id)
    rows.push({
      id,
      name: cat?.name || 'Uncategorized',
      color: cat?.color || '#8c9ab0',
      cur: c,
      prev: p,
      delta,
      pct: p ? (delta / p) * 100 : null,
    })
  }
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  return {
    risers: rows.filter(r => r.delta > 0).slice(0, 5),
    fallers: rows.filter(r => r.delta < 0).slice(0, 5),
  }
})

// --- Recurring subscriptions ---

const subscriptionRows = computed(() => {
  const code = defaultCurrencyCode()
  const perMonthFactor = { monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }
  return subscriptionsStore.subscriptions
    .filter(s => s.is_active !== false)
    .map(s => {
      const native = Number(s.amount || 0)
      const inDef = toCurrency(native, s.currency || code, code)
      const monthly = inDef * (perMonthFactor[s.billing_cycle] ?? 1)
      return {
        id: s.id,
        name: s.service_name,
        category: s.category,
        cycle: s.billing_cycle,
        native,
        currency: s.currency || code,
        monthly,
        annual: monthly * 12,
        nextPayment: s.next_payment_date,
      }
    })
    .sort((a, b) => b.monthly - a.monthly)
})

const subsMonthlyTotal = computed(() => subscriptionRows.value.reduce((s, r) => s + r.monthly, 0))
const subsAnnualTotal = computed(() => subscriptionRows.value.reduce((s, r) => s + r.annual, 0))

// --- Weekday spend pattern (report month, real expenses) ---

const weekdaySpend = computed(() => {
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const totals = [0, 0, 0, 0, 0, 0, 0]
  const counts = [0, 0, 0, 0, 0, 0, 0]
  for (const t of expenseTxns.value) {
    const [y, m, d] = t.date.split('-').map(Number)
    const dow = (new Date(y, m - 1, d).getDay() + 6) % 7 // Mon=0
    totals[dow] += inDefault(t)
    counts[dow] += 1
  }
  const max = Math.max(...totals, 1)
  return names.map((name, i) => ({ name, total: totals[i], count: counts[i], pct: (totals[i] / max) * 100 }))
})

// --- Transfer summary (report month) ---

const transferSummary = computed(() => {
  let inFlow = 0, outFlow = 0
  for (const t of transferTxns.value) {
    if (t.notes === 'transfer_in') inFlow += inDefault(t)
    else if (t.notes === 'transfer_out') outFlow += inDefault(t)
  }
  return { inFlow, outFlow, count: transferTxns.value.length }
})

// --- Cashflow waterfall (report month) ---

const cashflowSteps = computed(() => {
  const inc = totalIncome.value
  const steps = [
    { label: 'Income', value: inc, kind: 'in' },
    { label: 'Expenses', value: -totalExpenses.value, kind: 'out' },
    { label: 'Investments', value: -totalInvestments.value, kind: 'out' },
    { label: 'Net', value: net.value, kind: net.value >= 0 ? 'net-pos' : 'net-neg' },
  ]
  const scaleMax = Math.max(inc, totalExpenses.value + totalInvestments.value, Math.abs(net.value), 1)
  return steps.map(s => ({ ...s, pct: (Math.abs(s.value) / scaleMax) * 100 }))
})

// --- Per-holding asset detail (current) ---

const assetHoldings = computed(() => {
  const code = defaultCurrencyCode()
  return assetsStore.assets
    .map(a => {
      const value = toCurrency(a.current_value || 0, a.currency || code, code)
      const invested = toCurrency(a.principal_amount || 0, a.currency || code, code)
      const meta = metaFor(a.type)
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        typeLabel: meta.label || a.type,
        group: meta.group,
        value,
        invested,
        gain: value - invested,
        gainPct: invested ? ((value - invested) / invested) * 100 : null,
      }
    })
    .sort((a, b) => b.value - a.value)
})

const assetAllocation = computed(() =>
  assetGroupSnapshot.value
    .map(g => ({ ...g, pct: totalAssetValue.value ? (g.value / totalAssetValue.value) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
)

// Conic-gradient stops for the allocation donut. A stable colour per group.
const GROUP_COLORS = ['#4dabf7', '#845ef7', '#f783ac', '#ffa94d', '#63e6be', '#ffd43b', '#a9e34b', '#ff8787']
const allocationGradient = computed(() => {
  if (!totalAssetValue.value) return 'conic-gradient(var(--border-color) 0 100%)'
  let acc = 0
  const stops = assetAllocation.value.map((g, i) => {
    const start = acc
    acc += g.pct
    return `${GROUP_COLORS[i % GROUP_COLORS.length]} ${start.toFixed(2)}% ${acc.toFixed(2)}%`
  })
  return `conic-gradient(${stops.join(', ')})`
})

function allocationColor(i) {
  return GROUP_COLORS[i % GROUP_COLORS.length]
}

// --- Insights (auto-written summary) ---

const spendDays = computed(() => {
  const [y, m] = month.value.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  if (!isCurrentMonth.value) return daysInMonth
  return Math.max(1, new Date().getDate())
})

const avgDailySpend = computed(() => totalExpenses.value / spendDays.value)

const projectedSpend = computed(() => {
  if (!isCurrentMonth.value) return null
  const [y, m] = month.value.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  return avgDailySpend.value * daysInMonth
})

const biggestSpendDay = computed(() => {
  let best = null
  for (const b of dailyFlow.value) {
    if (b.expense > 0 && (!best || b.expense > best.expense)) best = b
  }
  return best
})

const noSpendDays = computed(() => {
  let n = 0
  for (let i = 0; i < spendDays.value && i < dailyFlow.value.length; i++) {
    if (dailyFlow.value[i].expense === 0) n++
  }
  return n
})

const insights = computed(() => {
  const out = []

  if (savingsRate.value !== null) {
    if (net.value >= 0) out.push(`Saved ${formatDefault(net.value)} — a ${savingsRate.value.toFixed(0)}% savings rate on ${formatDefault(totalIncome.value)} income.`)
    else out.push(`Spent ${formatDefault(-net.value)} more than earned this month — outflow outran ${formatDefault(totalIncome.value)} of income.`)
  }

  if (trendBaseline.value) {
    const b = trendBaseline.value
    const diff = totalExpenses.value - b.expense
    if (Math.abs(diff) > 1 && b.expense > 0) {
      const pct = (diff / b.expense) * 100
      out.push(`Expenses ran ${Math.abs(pct).toFixed(0)}% ${diff > 0 ? 'above' : 'below'} the prior ${b.count}-month average of ${formatDefault(b.expense)}.`)
    }
  }

  if (categoryMovers.value.risers.length) {
    const r = categoryMovers.value.risers[0]
    out.push(`${r.name} rose the most vs last month, up ${formatDefault(r.delta)}${r.pct != null ? ` (${r.pct.toFixed(0)}%)` : ''}.`)
  }

  out.push(`Averaged ${formatDefault(avgDailySpend.value)}/day across ${spendDays.value} day${spendDays.value === 1 ? '' : 's'}${noSpendDays.value ? `, with ${noSpendDays.value} no-spend day${noSpendDays.value === 1 ? '' : 's'}` : ''}.`)

  if (projectedSpend.value != null) {
    out.push(`On this pace, ${monthLabel.value} lands near ${formatDefault(projectedSpend.value)} in expenses.`)
  }

  if (subsMonthlyTotal.value > 0) {
    out.push(`Active subscriptions commit ${formatDefault(subsMonthlyTotal.value)}/month (${formatDefault(subsAnnualTotal.value)}/year).`)
  }

  if (netWorthChange.value && netWorthChange.value.abs !== 0) {
    const c = netWorthChange.value
    out.push(`Net worth ${c.abs >= 0 ? 'grew' : 'fell'} ${formatDefault(Math.abs(c.abs))} over ${c.from}–${c.to}.`)
  }

  return out
})

// Compact money label for dense chart annotations (₹1.2L, ₹45K, -₹8.1K).
function fmtCompact(v) {
  const sym = defaultCurrencySymbol()
  const n = Number(v || 0)
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  let out
  if (abs >= 1e7) out = (abs / 1e7).toFixed(2) + 'Cr'
  else if (abs >= 1e5) out = (abs / 1e5).toFixed(2) + 'L'
  else if (abs >= 1e3) out = (abs / 1e3).toFixed(1) + 'K'
  else out = String(Math.round(abs))
  return `${sign}${sym}${out}`
}

// Scale helpers for the mini bar/line charts (percent heights).
function trendBarPct(v) {
  return (v / trendMax.value) * 100
}
function nwPointPct(v) {
  const { min, max } = nwTrendBounds.value
  return ((v - min) / (max - min)) * 100
}

// All transactions for the reference section (chronological)
const allTxnsAsc = computed(() => {
  return [...txns.value].sort((a, b) => {
    const d = a.date.localeCompare(b.date)
    if (d !== 0) return d
    return (a.created_at || '').localeCompare(b.created_at || '')
  })
})

// Helpers
function categoryName(t) {
  if (t.categories?.name) return t.categories.name
  const cat = categoriesStore.categories.find(c => c.id === t.category_id)
  return cat?.name || (t.type === 'transfer' ? 'Transfer' : 'Uncategorized')
}

function ccCategoryName(e) {
  if (!e.category_id) return 'Uncategorized'
  const cat = categoriesStore.categories.find(c => c.id === e.category_id)
  return cat?.name || 'Uncategorized'
}

function accountName(t) {
  if (t.accounts?.name) return t.accounts.name
  const acc = accountsStore.accounts.find(a => a.id === t.account_id)
  return acc?.name || 'Cash / Wallet'
}

function describe(t) {
  if (t.description) return t.description
  return categoryName(t)
}

function nativeAmount(t) {
  const sym = currenciesStore.symbolOf(t.currency || defaultCurrencyCode())
  return `${sym}${Number(t.amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function fmtNative(amount, code) {
  return `${currenciesStore.symbolOf(code)}${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function pctOfTotal(value, total) {
  if (!total) return 0
  return (value / total) * 100
}

function deltaClass(v, invert = false) {
  if (v === null || v === undefined || v === 0) return ''
  const up = v > 0
  const positive = invert ? !up : up
  return positive ? 'pos' : 'neg'
}

// --------- Navigation ---------

function goPrev() {
  if (!canGoPrev.value) return
  month.value = prevOf(month.value)
}

function goNext() {
  if (!canGoNext.value) return
  month.value = nextOf(month.value)
}

function goBack() {
  // Try to close the tab if it was script-opened.
  try { window.close() } catch (e) { /* ignore */ }
  // If still here after a tick, fall back to the dashboard in this tab.
  setTimeout(() => {
    if (!document.hidden) router.push('/')
  }, 80)
}

const exporting = ref(false)

// Light-theme override injected into html2canvas's cloned DOM so colour-mix /
// dark backgrounds don't render the PDF as a black-on-dark wall. Shared across
// every per-block render so all pages look identical.
const PDF_LIGHT_CSS = `
  .report-shell { background: #fff !important; color: #111 !important; }
  .report-toolbar, .no-print { display: none !important; }
  .block, .cover {
    background: #fff !important;
    border: 1px solid #ccc !important;
    box-shadow: none !important;
  }
  .cover-month {
    color: #111 !important;
    background: none !important;
    -webkit-text-fill-color: #111 !important;
  }
  .kpi, .kpi--income, .kpi--expense, .bar-row, .asset-summary-cell,
  .nw-cell, .nw-cell.nw-total, .cc-card, .cc-meta-cell,
  .cc-total-cell, .kpi--neutral, .insight-item, .trend-chart, .nw-chart,
  .mover-col, .waterfall, .weekday-chart, .alloc-wrap, .stat-cell {
    background: #fafafa !important;
    border: 1px solid #ccc !important;
  }
  .kpi--income { background: #e9f7ec !important; }
  .kpi--expense { background: #fdecec !important; }
  .nw-cell.nw-total { background: #eef9f7 !important; border-color: #6fc7b8 !important; }
  .bar-track { background: #ddd !important; }
  .daily-chart { background: #fafafa !important; border: 1px solid #ddd !important; }
  .report-table th, .report-table td { color: #111 !important; border-color: #ddd !important; }
  .report-table tbody tr:nth-child(2n) td { background: #f5f5f5 !important; }
  .report-table th { color: #555 !important; }
  .pos, .text-income { color: #006400 !important; }
  .neg, .text-expense { color: #b00020 !important; }
  .muted, .mut, .cell-label, .kpi-delta, .kpi-label, .block-sub, .footnote, .day-num, .report-footer, .axis-label {
    color: #555 !important;
  }
  .bar-fill--exp { background: #b00020 !important; }
  .bar-fill--inc { background: #006400 !important; }
  .bar-in { background: #006400 !important; }
  .bar-out { background: #b00020 !important; }
  .status-paid { background: #006400 !important; color: #fff !important; }
  .status-outstanding { background: #b00020 !important; color: #fff !important; }
  .status-none { background: #eee !important; color: #555 !important; border: 1px solid #ccc !important; }
  .trend-bar--inc, .wf-in { background: #006400 !important; }
  .trend-bar--out, .wf-out, .wf-net-neg, .weekday-bar { background: #b00020 !important; }
  .nw-bar { background: #1c7ed6 !important; }
  .nw-bar.snapshot { background: #0ca678 !important; }
  .wf-net-pos { background: #0ca678 !important; }
  .wf-track { background: #ddd !important; }
  .alloc-hole { background: #fff !important; }
  .trend-label--active, .insight-bullet { color: #1c7ed6 !important; }
  .insight-item, .stat-cell, .mover-col, .waterfall, .trend-chart, .nw-chart, .weekday-chart, .alloc-wrap {
    background: #fafafa !important; border: 1px solid #ccc !important;
  }
`

// Build a PDF by rasterising each report block on its OWN canvas and flowing
// the blocks across A4 pages, starting a new page whenever the next block would
// overflow. This is the fix for the old "one giant canvas sliced at fixed
// heights" approach, which cut tables and cards straight through the middle.
// Only a block that is itself taller than a full page is sliced — and it always
// begins at the top of a fresh page so the slice lands in dead space, not
// across a heading.
async function exportPdf() {
  const page = document.querySelector('.report-page')
  if (!page || exporting.value) return
  exporting.value = true
  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ])

    const blocks = [...page.children].filter(el => !el.classList.contains('no-print'))

    const renderWidth = Math.max(page.scrollWidth, 920)
    const canvases = []
    for (const el of blocks) {
      // eslint-disable-next-line no-await-in-loop
      const c = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        windowWidth: renderWidth,
        onclone: (doc) => {
          const style = doc.createElement('style')
          style.textContent = PDF_LIGHT_CSS
          doc.head.appendChild(style)
        },
      })
      canvases.push(c)
    }

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const margin = 10
    const gap = 4
    const usableW = pageW - margin * 2
    const usableH = pageH - margin * 2
    const bottom = pageH - margin

    let cursorY = margin
    for (const canvas of canvases) {
      const imgW = usableW
      const imgH = (canvas.height * imgW) / canvas.width
      const imgData = canvas.toDataURL('image/jpeg', 0.92)

      if (imgH <= usableH) {
        // Whole block fits on one page — move to the next page if it won't fit
        // in what's left of this one.
        if (cursorY + imgH > bottom) {
          pdf.addPage()
          cursorY = margin
        }
        pdf.addImage(imgData, 'JPEG', margin, cursorY, imgW, imgH, undefined, 'FAST')
        cursorY += imgH + gap
      } else {
        // Block taller than a page: begin on a clean page, then slice it across
        // as many pages as needed.
        if (cursorY > margin) {
          pdf.addPage()
          cursorY = margin
        }
        let drawnTop = 0
        while (drawnTop < imgH - 0.01) {
          const y = margin - drawnTop
          pdf.addImage(imgData, 'JPEG', margin, y, imgW, imgH, undefined, 'FAST')
          drawnTop += usableH
          if (drawnTop < imgH - 0.01) {
            pdf.addPage()
          }
        }
        const pagesSpanned = Math.ceil(imgH / usableH)
        const lastPageUsed = imgH - (pagesSpanned - 1) * usableH
        cursorY = margin + lastPageUsed + gap
      }
    }

    pdf.save(`Beyond-Money-Report-${month.value}.pdf`)
  } catch (e) {
    // Keep the error visible — the user explicitly invoked this and a silent
    // failure leaves them wondering why nothing downloaded.
    console.error('PDF export failed:', e)
    alert('PDF export failed. Check the console for details.')
  } finally {
    exporting.value = false
  }
}

// Generated-at formatting
const generatedLabel = computed(() => {
  return generatedAt.value.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
})

// Month picker — bounded by product launch month (MIN_MONTH) and current device month.
const monthOptions = computed(() => {
  const opts = []
  let cur = todayMonth
  while (cur >= MIN_MONTH) {
    const [y, m] = cur.split('-').map(Number)
    const label = new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
    opts.push({ key: cur, label })
    let py = y, pm = m - 1
    if (pm === 0) { pm = 12; py -= 1 }
    cur = `${py}-${String(pm).padStart(2, '0')}`
  }
  return opts
})
</script>

<template>
  <div class="report-shell">
    <header class="report-toolbar no-print">
      <button class="tb-btn tb-back" @click="goBack" title="Close report">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
        <span>Back</span>
      </button>
      <div class="month-nav">
        <button class="tb-btn icon-btn" :disabled="!canGoPrev" @click="goPrev" title="Previous month" aria-label="Previous month">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <select v-model="month" class="month-select" aria-label="Report month">
          <option v-for="opt in monthOptions" :key="opt.key" :value="opt.key">{{ opt.label }}</option>
        </select>
        <button class="tb-btn icon-btn" :disabled="!canGoNext" @click="goNext" title="Next month" aria-label="Next month">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <button class="tb-btn tb-primary btn-primary" :disabled="exporting" @click="exportPdf" title="Download as PDF">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span>{{ exporting ? 'Exporting…' : 'Save PDF' }}</span>
      </button>
    </header>

    <div v-if="loading" class="report-loading">
      <CandleLoader size="md" />
    </div>

    <article v-else class="report-page">
      <!-- 1. Cover band -->
      <section class="cover">
        <div class="cover-brand">Beyond Money</div>
        <h1 class="cover-title">Monthly report</h1>
        <div class="cover-month">{{ monthLabel }}</div>
        <div class="cover-meta">
          <span>Generated {{ generatedLabel }}</span>
          <span>·</span>
          <span>Currency {{ defaultCurrencyCode() }}</span>
          <span>·</span>
          <span>{{ txCount }} transactions</span>
        </div>
        <div class="cover-tagline" :class="net >= 0 ? 'pos' : 'neg'">
          Net <span class="num">{{ formatDefault(net, { signed: true }) }}</span> · {{ txCount }} transactions
        </div>
      </section>

      <!-- 2. KPI tiles -->
      <section class="block">
        <h2 class="block-title">At a glance</h2>
        <div class="kpi-grid">
          <div class="kpi kpi--income">
            <div class="kpi-label">Income</div>
            <div class="kpi-value">{{ formatDefault(totalIncome) }}</div>
            <div class="kpi-delta">vs last month: <span :class="deltaClass(incomeDelta)">{{ fmtDelta(incomeDelta) }}</span></div>
          </div>
          <div class="kpi kpi--expense">
            <div class="kpi-label">Expenses</div>
            <div class="kpi-value">{{ formatDefault(totalExpenses) }}</div>
            <div class="kpi-delta">vs last month: <span :class="deltaClass(expenseDelta, true)">{{ fmtDelta(expenseDelta) }}</span></div>
          </div>
          <div class="kpi kpi--net" :class="net >= 0 ? 'kpi--income' : 'kpi--expense'">
            <div class="kpi-label">Net</div>
            <div class="kpi-value" :class="net >= 0 ? 'pos' : 'neg'">{{ formatDefault(net, { signed: true }) }}</div>
            <div class="kpi-delta">vs last month: <span :class="deltaClass(netDelta)">{{ fmtDelta(netDelta) }}</span></div>
          </div>
          <div class="kpi kpi--neutral">
            <div class="kpi-label">Savings rate</div>
            <div class="kpi-value">{{ savingsRate === null ? '—' : `${savingsRate.toFixed(0)}%` }}</div>
            <div class="kpi-delta">net / income</div>
          </div>
        </div>
      </section>

      <!-- 2b. Insights -->
      <section v-if="insights.length" class="block">
        <h2 class="block-title">Insights</h2>
        <p class="block-sub">Auto-generated highlights for {{ monthLabel }}.</p>
        <div class="insight-list">
          <div v-for="(line, i) in insights" :key="i" class="insight-item">
            <span class="insight-bullet">•</span>
            <span>{{ line }}</span>
          </div>
        </div>
        <div class="stat-grid">
          <div class="stat-cell">
            <div class="cell-label">Avg / day</div>
            <div class="cell-value">{{ formatDefault(avgDailySpend) }}</div>
          </div>
          <div class="stat-cell">
            <div class="cell-label">Biggest day</div>
            <div class="cell-value sm">{{ biggestSpendDay ? `${monthLabel.split(' ')[0]} ${biggestSpendDay.day} · ${formatDefault(biggestSpendDay.expense)}` : '—' }}</div>
          </div>
          <div class="stat-cell">
            <div class="cell-label">No-spend days</div>
            <div class="cell-value">{{ noSpendDays }}</div>
          </div>
          <div v-if="projectedSpend != null" class="stat-cell">
            <div class="cell-label">Projected spend</div>
            <div class="cell-value">{{ formatDefault(projectedSpend) }}</div>
          </div>
          <div v-else class="stat-cell">
            <div class="cell-label">Transactions</div>
            <div class="cell-value">{{ txCount }}</div>
          </div>
        </div>
      </section>

      <!-- 2c. Cashflow waterfall -->
      <section class="block">
        <h2 class="block-title">Cashflow</h2>
        <p class="block-sub">How income converted to net this month: income in, then expenses and investments out.</p>
        <div class="waterfall">
          <div v-for="s in cashflowSteps" :key="s.label" class="wf-row">
            <div class="wf-label">{{ s.label }}</div>
            <div class="wf-track">
              <div class="wf-fill" :class="`wf-${s.kind}`" :style="{ width: s.pct + '%' }"></div>
            </div>
            <div class="wf-amt" :class="s.kind === 'out' ? '' : s.kind === 'net-neg' ? 'neg' : 'pos'">
              {{ formatDefault(s.value, { signed: true }) }}
            </div>
          </div>
        </div>
      </section>

      <!-- 2d. 6-month trend -->
      <section v-if="trendSeries.length" class="block">
        <h2 class="block-title">{{ TREND_WINDOW }}-month trend</h2>
        <p class="block-sub">Income (green) vs total outflow (expenses + investments, red) per month, ending {{ monthLabel }}. Line marks savings rate.</p>
        <div class="trend-chart">
          <div v-for="p in trendSeries" :key="p.month" class="trend-col" :class="{ 'trend-col--active': p.isReport }"
               :title="`${p.label} · in ${formatDefault(p.income)} · out ${formatDefault(p.expense + p.investment)} · net ${formatDefault(p.net)}`">
            <div class="trend-bars">
              <div class="trend-bar trend-bar--inc" :style="{ height: trendBarPct(p.income) + '%' }"></div>
              <div class="trend-bar trend-bar--out" :style="{ height: trendBarPct(p.expense + p.investment) + '%' }"></div>
            </div>
            <div class="trend-net" :class="p.net >= 0 ? 'pos' : 'neg'">{{ fmtCompact(p.net) }}</div>
            <div class="trend-label" :class="{ 'trend-label--active': p.isReport }">{{ p.label }}</div>
          </div>
        </div>
        <div class="legend">
          <span class="legend-dot legend-in"></span> Income
          <span class="legend-dot legend-out"></span> Outflow
          <span class="axis-label">· net shown under each bar</span>
        </div>
      </section>

      <!-- 2e. Net worth trend -->
      <section v-if="netWorthTrend.length" class="block">
        <h2 class="block-title">Net worth trend</h2>
        <p class="block-sub">
          Month-end net worth over the last {{ TREND_WINDOW }} months. Months with a captured snapshot use the real
          market value; earlier months are reconstructed from the ledger at cost basis.
        </p>
        <div class="nw-chart">
          <div v-for="p in netWorthTrend" :key="p.month" class="nw-col"
               :title="`${p.label} · ${formatDefault(p.value)} · ${p.source}`">
            <div class="nw-bar-wrap">
              <div class="nw-bar" :class="p.source" :style="{ height: Math.max(2, nwPointPct(p.value)) + '%' }"></div>
            </div>
            <div class="nw-val">{{ fmtCompact(p.value) }}</div>
            <div class="nw-lbl" :class="{ 'trend-label--active': p.isReport }">{{ p.label }}</div>
          </div>
        </div>
        <p v-if="netWorthChange" class="footnote">
          {{ netWorthChange.abs >= 0 ? 'Up' : 'Down' }}
          <strong :class="netWorthChange.abs >= 0 ? 'pos' : 'neg'">{{ formatDefault(Math.abs(netWorthChange.abs)) }}</strong>
          <span v-if="netWorthChange.pct != null">({{ netWorthChange.pct >= 0 ? '+' : '' }}{{ netWorthChange.pct.toFixed(0) }}%)</span>
          over {{ netWorthChange.from }}–{{ netWorthChange.to }}.
        </p>
      </section>

      <!-- 3. Daily flow -->
      <section class="block">
        <h2 class="block-title">Daily flow</h2>
        <p class="block-sub">Income (green) and expenses (red) per day. Each bar shows that day's total in {{ defaultCurrencyCode() }}.</p>
        <div class="daily-chart">
          <div v-for="b in dailyFlow" :key="b.day" class="day-col" :title="`Day ${b.day} · in ${formatDefault(b.income)} · out ${formatDefault(b.expense)}`">
            <div class="day-bars">
              <div class="day-bar bar-in" :style="{ height: ((b.income / dailyMax) * 100) + '%' }"></div>
              <div class="day-bar bar-out" :style="{ height: ((b.expense / dailyMax) * 100) + '%' }"></div>
            </div>
            <div class="day-num">{{ b.day }}</div>
          </div>
        </div>
        <div class="legend">
          <span class="legend-dot legend-in"></span> Income
          <span class="legend-dot legend-out"></span> Expense
        </div>
      </section>

      <!-- 4. Expenses by category -->
      <section v-if="expensesByCategoryCombined.length" class="block">
        <h2 class="block-title">Expenses by category</h2>
        <p class="block-sub">
          Combines normal expense transactions with credit card spend from the
          cycle resolving in {{ monthLabel }}. The CC bill payment itself is
          also one of the normal transactions, so combined totals here may
          exceed the headline “Total expenses” figure — that's expected.
        </p>
        <div class="bar-list">
          <div v-for="row in expensesByCategoryCombined" :key="row.id" class="bar-row bar-row--breakdown">
            <div class="bar-name">
              <span class="bar-dot" :style="{ background: row.color }"></span>
              {{ row.name }}
            </div>
            <div class="bar-track">
              <div
                class="bar-segment bar-segment--normal"
                :style="{ width: pctOfTotal(row.normalAmount, totalCombinedExpenses) + '%' }"
                :title="`Normal: ${formatDefault(row.normalAmount)}`"
              ></div>
              <div
                class="bar-segment bar-segment--cc"
                :style="{ width: pctOfTotal(row.ccAmount, totalCombinedExpenses) + '%' }"
                :title="`Credit card: ${formatDefault(row.ccAmount)}`"
              ></div>
            </div>
            <div class="bar-stats">
              <span class="bar-amt">{{ formatDefault(row.amount) }}</span>
              <span class="bar-pct">{{ pctOfTotal(row.amount, totalCombinedExpenses).toFixed(1) }}%</span>
              <span class="bar-count">{{ row.count }} tx</span>
            </div>
            <div v-if="row.ccAmount > 0 || row.normalAmount > 0" class="bar-breakdown">
              <span v-if="row.normalAmount > 0" class="breakdown-chip breakdown-chip--normal">
                <span class="dot"></span>
                Normal {{ formatDefault(row.normalAmount) }}
                <span class="muted">· {{ row.normalCount }} tx</span>
              </span>
              <span v-if="row.ccAmount > 0" class="breakdown-chip breakdown-chip--cc">
                <span class="dot"></span>
                Credit card {{ formatDefault(row.ccAmount) }}
                <span class="muted">· {{ row.ccCount }} tx</span>
              </span>
            </div>
          </div>
        </div>
        <p v-if="totalCcCycleSpend > 0" class="footnote">
          Credit card cycle total folded in:
          <strong>{{ formatDefault(totalCcCycleSpend) }}</strong>
          across {{ ccCycleExpenses.length }} card item{{ ccCycleExpenses.length === 1 ? '' : 's' }}.
        </p>
      </section>

      <!-- 4a. Category movers (MoM) -->
      <section v-if="categoryMovers.risers.length || categoryMovers.fallers.length" class="block">
        <h2 class="block-title">Month-over-month movers</h2>
        <p class="block-sub">Biggest category spend changes vs {{ shortMonthLabel(prevMonth) }} (real expenses only).</p>
        <div class="mover-grid">
          <div class="mover-col">
            <div class="mover-head">Increased</div>
            <div v-if="!categoryMovers.risers.length" class="empty-note">No increases.</div>
            <div v-for="r in categoryMovers.risers" :key="r.id" class="mover-row">
              <span class="bar-dot" :style="{ background: r.color }"></span>
              <span class="mover-name">{{ r.name }}</span>
              <span class="mover-delta neg">+{{ formatDefault(r.delta) }}</span>
              <span class="mover-pct muted">{{ r.pct != null ? `${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(0)}%` : 'new' }}</span>
            </div>
          </div>
          <div class="mover-col">
            <div class="mover-head">Decreased</div>
            <div v-if="!categoryMovers.fallers.length" class="empty-note">No decreases.</div>
            <div v-for="r in categoryMovers.fallers" :key="r.id" class="mover-row">
              <span class="bar-dot" :style="{ background: r.color }"></span>
              <span class="mover-name">{{ r.name }}</span>
              <span class="mover-delta pos">{{ formatDefault(r.delta, { signed: true }) }}</span>
              <span class="mover-pct muted">{{ r.pct != null ? `${r.pct.toFixed(0)}%` : '—' }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 4b. Investments -->
      <section v-if="investmentTxns.length" class="block">
        <h2 class="block-title">Investments</h2>
        <p class="block-sub">Spending filed under an “Investment” category — money put to work rather than consumed. Kept <strong>out</strong> of the Expenses total above and shown separately here. Net still accounts for it as outflow.</p>
        <div class="asset-summary">
          <div class="asset-summary-cell">
            <div class="cell-label">Invested this month</div>
            <div class="cell-value">{{ formatDefault(totalInvestments) }}</div>
          </div>
          <div class="asset-summary-cell">
            <div class="cell-label">Share of outflow</div>
            <div class="cell-value">{{ investmentRate === null ? '—' : `${investmentRate.toFixed(1)}%` }}</div>
          </div>
          <div class="asset-summary-cell">
            <div class="cell-label">vs last month</div>
            <div class="cell-value" :class="deltaClass(investmentDelta)">{{ fmtDelta(investmentDelta) }}</div>
          </div>
        </div>
        <div class="table-wrap">
          <table class="report-table">
            <thead>
              <tr><th>Date</th><th>Description</th><th>Category</th><th>Account</th><th class="right">Amount</th></tr>
            </thead>
            <tbody>
              <tr v-for="t in investmentTxns" :key="t.id">
                <td>{{ formatDate(t.date) }}</td>
                <td>{{ describe(t) }}</td>
                <td>{{ categoryName(t) }}</td>
                <td>{{ accountName(t) }}</td>
                <td class="right">{{ formatDefault(inDefault(t)) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colspan="4"><strong>Total invested</strong></td>
                <td class="right"><strong>{{ formatDefault(totalInvestments) }}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <!-- 5. Income by category -->
      <section v-if="incomeByCategory.length" class="block">
        <h2 class="block-title">Income by category</h2>
        <div class="bar-list">
          <div v-for="row in incomeByCategory" :key="row.id" class="bar-row">
            <div class="bar-name">
              <span class="bar-dot" :style="{ background: row.color }"></span>
              {{ row.name }}
            </div>
            <div class="bar-track">
              <div class="bar-fill bar-fill--inc" :style="{ width: pctOfTotal(row.amount, totalIncome) + '%' }"></div>
            </div>
            <div class="bar-stats">
              <span class="bar-amt">{{ formatDefault(row.amount) }}</span>
              <span class="bar-pct">{{ pctOfTotal(row.amount, totalIncome).toFixed(1) }}%</span>
              <span class="bar-count">{{ row.count }} tx</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 6. Expenses by label -->
      <section v-if="expensesByLabel.length" class="block">
        <h2 class="block-title">Expenses by label</h2>
        <p class="footnote">A transaction with multiple labels is counted under each, and credit card cycle items are folded in alongside normal expenses — totals may exceed the overall expense figure.</p>
        <div class="bar-list">
          <div v-for="row in expensesByLabel" :key="row.id" class="bar-row bar-row--breakdown">
            <div class="bar-name">
              <span class="bar-dot" :style="{ background: row.color }"></span>
              {{ row.name }}
            </div>
            <div class="bar-track">
              <div
                class="bar-segment bar-segment--normal"
                :style="{ width: pctOfTotal(row.normalAmount, totalCombinedExpenses) + '%' }"
                :title="`Normal: ${formatDefault(row.normalAmount)}`"
              ></div>
              <div
                class="bar-segment bar-segment--cc"
                :style="{ width: pctOfTotal(row.ccAmount, totalCombinedExpenses) + '%' }"
                :title="`Credit card: ${formatDefault(row.ccAmount)}`"
              ></div>
            </div>
            <div class="bar-stats">
              <span class="bar-amt">{{ formatDefault(row.amount) }}</span>
              <span class="bar-pct">{{ pctOfTotal(row.amount, totalCombinedExpenses).toFixed(1) }}%</span>
              <span class="bar-count">{{ row.count }} tx</span>
            </div>
            <div v-if="row.ccAmount > 0 || row.normalAmount > 0" class="bar-breakdown">
              <span v-if="row.normalAmount > 0" class="breakdown-chip breakdown-chip--normal">
                <span class="dot"></span>
                Normal {{ formatDefault(row.normalAmount) }}
                <span class="muted">· {{ row.normalCount }} tx</span>
              </span>
              <span v-if="row.ccAmount > 0" class="breakdown-chip breakdown-chip--cc">
                <span class="dot"></span>
                Credit card {{ formatDefault(row.ccAmount) }}
                <span class="muted">· {{ row.ccCount }} tx</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- 6b. Weekday pattern -->
      <section class="block">
        <h2 class="block-title">Spending by weekday</h2>
        <p class="block-sub">Which days of the week the money goes out (real expenses, {{ monthLabel }}).</p>
        <div class="weekday-chart">
          <div v-for="d in weekdaySpend" :key="d.name" class="weekday-col"
               :title="`${d.name} · ${formatDefault(d.total)} · ${d.count} tx`">
            <div class="weekday-bar-wrap">
              <div class="weekday-bar" :style="{ height: Math.max(2, d.pct) + '%' }"></div>
            </div>
            <div class="weekday-amt">{{ fmtCompact(d.total) }}</div>
            <div class="weekday-lbl">{{ d.name }}</div>
          </div>
        </div>
      </section>

      <!-- 7. Top 10 expenses -->
      <section v-if="topExpenses.length" class="block">
        <h2 class="block-title">Top 10 expenses</h2>
        <div class="table-wrap">
          <table class="report-table">
            <thead>
              <tr><th>Date</th><th>Description</th><th>Category</th><th>Account</th><th class="right">Amount</th></tr>
            </thead>
            <tbody>
              <tr v-for="t in topExpenses" :key="t.id">
                <td>{{ formatDate(t.date) }}</td>
                <td>{{ describe(t) }}</td>
                <td>{{ categoryName(t) }}</td>
                <td>{{ accountName(t) }}</td>
                <td class="right">{{ formatDefault(inDefault(t)) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 8. All incoming -->
      <section v-if="allIncoming.length" class="block">
        <h2 class="block-title">All incoming</h2>
        <div class="table-wrap">
          <table class="report-table">
            <thead>
              <tr><th>Date</th><th>Description</th><th>Category</th><th>Account</th><th class="right">Amount</th></tr>
            </thead>
            <tbody>
              <tr v-for="t in allIncoming" :key="t.id">
                <td>{{ formatDate(t.date) }}</td>
                <td>{{ describe(t) }}</td>
                <td>{{ categoryName(t) }}</td>
                <td>{{ accountName(t) }}</td>
                <td class="right pos">{{ formatDefault(inDefault(t)) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 8b. Subscriptions -->
      <section v-if="subscriptionRows.length" class="block">
        <h2 class="block-title">Recurring subscriptions</h2>
        <p class="block-sub">Active recurring commitments, normalized to a monthly cost in {{ defaultCurrencyCode() }}.</p>
        <div class="asset-summary">
          <div class="asset-summary-cell">
            <div class="cell-label">Monthly commitment</div>
            <div class="cell-value">{{ formatDefault(subsMonthlyTotal) }}</div>
          </div>
          <div class="asset-summary-cell">
            <div class="cell-label">Annualized</div>
            <div class="cell-value">{{ formatDefault(subsAnnualTotal) }}</div>
          </div>
          <div class="asset-summary-cell">
            <div class="cell-label">Active services</div>
            <div class="cell-value">{{ subscriptionRows.length }}</div>
          </div>
        </div>
        <div class="table-wrap">
          <table class="report-table">
            <thead>
              <tr><th>Service</th><th>Category</th><th>Cycle</th><th class="right">Billed</th><th class="right">Per month</th><th>Next</th></tr>
            </thead>
            <tbody>
              <tr v-for="s in subscriptionRows" :key="s.id">
                <td>{{ s.name }}</td>
                <td class="capitalize">{{ s.category }}</td>
                <td class="capitalize">{{ s.cycle }}</td>
                <td class="right">{{ fmtNative(s.native, s.currency) }}</td>
                <td class="right">{{ formatDefault(s.monthly) }}</td>
                <td>{{ s.nextPayment ? formatDate(s.nextPayment) : '—' }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colspan="4"><strong>Total per month</strong></td>
                <td class="right"><strong>{{ formatDefault(subsMonthlyTotal) }}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <!-- 8c. Lending -->
      <section v-if="loanSummary.borrowers.length || loanSummary.lentThisMonth > 0 || loanSummary.repaidThisMonth > 0" class="block">
        <h2 class="block-title">Lending</h2>
        <p class="block-sub">Money lent out and still owed to you. Outstanding balances count toward net worth.</p>
        <div class="asset-summary">
          <div class="asset-summary-cell">
            <div class="cell-label">Lent this month</div>
            <div class="cell-value">{{ formatDefault(loanSummary.lentThisMonth) }}</div>
          </div>
          <div class="asset-summary-cell">
            <div class="cell-label">Repaid this month</div>
            <div class="cell-value pos">{{ formatDefault(loanSummary.repaidThisMonth) }}</div>
          </div>
          <div class="asset-summary-cell">
            <div class="cell-label">Total outstanding</div>
            <div class="cell-value">{{ formatDefault(loanSummary.totalOutstanding) }}</div>
          </div>
        </div>
        <div v-if="loanSummary.borrowers.length" class="table-wrap">
          <table class="report-table">
            <thead>
              <tr><th>Borrower</th><th class="right">Lent</th><th class="right">Repaid</th><th class="right">Outstanding</th></tr>
            </thead>
            <tbody>
              <tr v-for="b in loanSummary.borrowers" :key="b.name">
                <td>{{ b.name }}</td>
                <td class="right">{{ formatDefault(b.lent) }}</td>
                <td class="right pos">{{ formatDefault(b.repaid) }}</td>
                <td class="right">{{ formatDefault(b.outstanding) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Total</strong></td>
                <td colspan="2"></td>
                <td class="right"><strong>{{ formatDefault(loanSummary.totalOutstanding) }}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p v-else class="empty-note">No outstanding loans.</p>
      </section>

      <!-- 9. Account breakdown -->
      <section v-if="accountBreakdown.length" class="block">
        <h2 class="block-title">Account breakdown</h2>
        <p class="block-sub">In-flow, out-flow and current balance per account. Cash / Wallet covers transactions with no linked account.</p>
        <div class="table-wrap">
          <table class="report-table">
            <thead>
              <tr><th>Account</th><th class="right">In</th><th class="right">Out</th><th class="right">Net</th><th class="right">Tx</th><th class="right">Balance now</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in accountBreakdown" :key="row.id || 'cash'">
                <td>{{ row.name }}</td>
                <td class="right pos">{{ formatDefault(row.inFlow) }}</td>
                <td class="right">{{ formatDefault(row.outFlow) }}</td>
                <td class="right" :class="(row.inFlow - row.outFlow) >= 0 ? 'pos' : 'neg'">{{ formatDefault(row.inFlow - row.outFlow, { signed: true }) }}</td>
                <td class="right">{{ row.count }}</td>
                <td class="right">{{ row.id ? fmtNative(row.balance, row.currency) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="transferSummary.count" class="footnote">
          {{ transferSummary.count }} transfer{{ transferSummary.count === 1 ? '' : 's' }} moved
          <strong>{{ formatDefault(transferSummary.outFlow) }}</strong> between accounts this month
          (in and out net to zero — shown here for visibility, excluded from income/expense totals).
        </p>
      </section>

      <!-- 10. Credit card activity -->
      <section v-if="ccActivity.length" class="block">
        <h2 class="block-title">Credit card activity</h2>
        <p class="block-sub">CC billing cycles don't align with calendar months. For each card we show the cycle that resolves in {{ monthLabel }} — either the bill paid this month, or (if not yet paid) the outstanding bill forming this month.</p>

        <div class="cc-cards">
          <div v-for="row in ccActivity" :key="row.id" class="cc-card">
            <div class="cc-card-head">
              <div class="cc-card-id">
                <span class="cc-card-name">{{ row.name }}</span>
                <span v-if="row.lastFour" class="muted">•••• {{ row.lastFour }}</span>
                <span v-if="row.bank" class="muted">· {{ row.bank }}</span>
              </div>
              <span class="status-pill" :class="`status-${row.status}`">
                {{ row.status === 'paid' ? 'Paid' : row.status === 'outstanding' ? 'Outstanding' : 'No activity' }}
              </span>
            </div>

            <div v-if="row.status !== 'none'" class="cc-card-meta">
              <div class="cc-meta-cell">
                <div class="cell-label">Cycle</div>
                <div class="cell-value sm">
                  {{ row.periodStart ? formatDate(row.periodStart) : '—' }}
                  →
                  {{ row.periodEnd ? formatDate(row.periodEnd) : '—' }}
                </div>
              </div>
              <div class="cc-meta-cell">
                <div class="cell-label">{{ row.status === 'paid' ? 'Paid amount' : 'Outstanding' }}</div>
                <div class="cell-value" :class="row.status === 'paid' ? 'pos' : ''">{{ fmtNative(row.amount, row.currency) }}</div>
              </div>
              <div class="cc-meta-cell">
                <div class="cell-label">Transactions</div>
                <div class="cell-value sm">{{ row.txCount }}</div>
              </div>
              <div v-if="row.paidOn" class="cc-meta-cell">
                <div class="cell-label">Paid on</div>
                <div class="cell-value sm">{{ formatDate(row.paidOn) }}</div>
              </div>
            </div>

            <div v-if="row.expenses.length" class="table-wrap">
              <table class="report-table tight cc-tx-table">
                <thead>
                  <tr><th>Date</th><th>Description</th><th>Category</th><th class="right">Amount</th></tr>
                </thead>
                <tbody>
                  <tr v-for="e in row.expenses" :key="e.id">
                    <td>{{ formatDate(e.date) }}</td>
                    <td>{{ e.description || '—' }}</td>
                    <td>{{ ccCategoryName(e) }}</td>
                    <td class="right">{{ fmtNative(e.amount, row.currency) }}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="3"><strong>Cycle total</strong></td>
                    <td class="right"><strong>{{ fmtNative(row.amount, row.currency) }}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <p v-else class="empty-note">No transactions in this cycle.</p>
          </div>
        </div>

        <div class="cc-totals">
          <div class="cc-total-cell">
            <div class="cell-label">Paid this month (in {{ defaultCurrencyCode() }})</div>
            <div class="cell-value pos">{{ formatDefault(totalCcPaid) }}</div>
          </div>
          <div class="cc-total-cell">
            <div class="cell-label">Outstanding cycle(s) (in {{ defaultCurrencyCode() }})</div>
            <div class="cell-value">{{ formatDefault(totalCcOutstanding) }}</div>
          </div>
        </div>
      </section>

      <!-- 11. Asset snapshot -->
      <section class="block">
        <h2 class="block-title">Asset snapshot</h2>
        <p class="block-sub">Current state at report time (historical month-end values not tracked).</p>
        <div class="asset-summary">
          <div class="asset-summary-cell">
            <div class="cell-label">Total value</div>
            <div class="cell-value">{{ formatDefault(totalAssetValue) }}</div>
          </div>
          <div class="asset-summary-cell">
            <div class="cell-label">Total invested</div>
            <div class="cell-value">{{ formatDefault(totalAssetInvested) }}</div>
          </div>
          <div class="asset-summary-cell">
            <div class="cell-label">Overall growth</div>
            <div class="cell-value" :class="(assetGrowth || 0) >= 0 ? 'pos' : 'neg'">
              {{ assetGrowth === null ? '—' : `${assetGrowth >= 0 ? '+' : ''}${assetGrowth.toFixed(2)}%` }}
            </div>
          </div>
        </div>
        <div v-if="assetAllocation.length" class="alloc-wrap">
          <div class="alloc-donut" :style="{ background: allocationGradient }">
            <div class="alloc-hole">
              <div class="alloc-hole-label">Assets</div>
              <div class="alloc-hole-value">{{ fmtCompact(totalAssetValue) }}</div>
            </div>
          </div>
          <div class="alloc-legend">
            <div v-for="(g, i) in assetAllocation" :key="g.code" class="alloc-legend-row">
              <span class="alloc-swatch" :style="{ background: allocationColor(i) }"></span>
              <span class="alloc-name">{{ g.label }}</span>
              <span class="alloc-pct">{{ g.pct.toFixed(1) }}%</span>
              <span class="alloc-val muted">{{ formatDefault(g.value) }}</span>
            </div>
          </div>
        </div>
        <div v-if="assetGroupSnapshot.length" class="table-wrap">
          <table class="report-table">
            <thead>
              <tr><th>Group</th><th class="right">Items</th><th class="right">Invested</th><th class="right">Value</th><th class="right">Growth</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in assetGroupSnapshot" :key="row.code">
                <td>{{ row.label }}</td>
                <td class="right">{{ row.count }}</td>
                <td class="right">{{ formatDefault(row.invested) }}</td>
                <td class="right">{{ formatDefault(row.value) }}</td>
                <td class="right" :class="(row.value - row.invested) >= 0 ? 'pos' : 'neg'">
                  {{ row.invested ? `${row.value - row.invested >= 0 ? '+' : ''}${(((row.value - row.invested) / row.invested) * 100).toFixed(1)}%` : '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty-note">No assets recorded.</p>

        <template v-if="assetHoldings.length">
          <h3 class="block-subtitle">Per-holding detail</h3>
          <div class="table-wrap">
            <table class="report-table tight">
              <thead>
                <tr><th>Holding</th><th>Type</th><th class="right">Invested</th><th class="right">Value</th><th class="right">Gain</th></tr>
              </thead>
              <tbody>
                <tr v-for="h in assetHoldings" :key="h.id">
                  <td>{{ h.name }}</td>
                  <td>{{ h.typeLabel }}</td>
                  <td class="right">{{ formatDefault(h.invested) }}</td>
                  <td class="right">{{ formatDefault(h.value) }}</td>
                  <td class="right" :class="h.gain >= 0 ? 'pos' : 'neg'">
                    {{ formatDefault(h.gain, { signed: true }) }}{{ h.gainPct != null ? ` (${h.gainPct >= 0 ? '+' : ''}${h.gainPct.toFixed(1)}%)` : '' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </section>

      <!-- 12. Net worth snapshot -->
      <section class="block">
        <h2 class="block-title">Net worth snapshot</h2>
        <p class="block-sub">Current state at report time.</p>
        <div class="nw-grid">
          <div class="nw-cell pos">
            <div class="cell-label">Accounts</div>
            <div class="cell-value">{{ formatDefault(totalAccountsBalance) }}</div>
          </div>
          <div class="nw-cell pos">
            <div class="cell-label">Assets</div>
            <div class="cell-value">{{ formatDefault(totalAssetValue) }}</div>
          </div>
          <div v-if="totalLoansOutstanding > 0" class="nw-cell pos">
            <div class="cell-label">Loans outstanding</div>
            <div class="cell-value">{{ formatDefault(totalLoansOutstanding) }}</div>
          </div>
          <div class="nw-cell neg">
            <div class="cell-label">Credit card outstanding</div>
            <div class="cell-value">−{{ formatDefault(allCardsOutstanding) }}</div>
          </div>
          <div class="nw-cell nw-total">
            <div class="cell-label">Net worth</div>
            <div class="cell-value">{{ formatDefault(netWorth) }}</div>
          </div>
        </div>
        <p v-if="reportMonthSnapshot" class="footnote">
          A month-end snapshot for {{ monthLabel }} was captured on
          {{ formatDate(String(reportMonthSnapshot.captured_at).slice(0, 10)) }}
          at <strong>{{ formatDefault(Number(reportMonthSnapshot.net_worth)) }}</strong>.
        </p>
      </section>

      <!-- 13. Full transactions reference -->
      <section v-if="allTxnsAsc.length" class="block">
        <h2 class="block-title">All transactions (reference)</h2>
        <p class="block-sub">Every transaction recorded in {{ monthLabel }}, chronological.</p>
        <div class="table-wrap table-wrap--wide">
          <table class="report-table tight">
            <thead>
              <tr><th>Date</th><th>Type</th><th>Description</th><th>Category</th><th>Account</th><th class="right">Native</th><th class="right">In {{ defaultCurrencyCode() }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="t in allTxnsAsc" :key="t.id">
                <td>{{ formatDate(t.date) }}</td>
                <td class="capitalize" :class="t.type === 'income' ? 'pos' : t.type === 'expense' ? '' : 'mut'">{{ t.type }}</td>
                <td>{{ describe(t) }}</td>
                <td>{{ t.type === 'transfer' ? '—' : categoryName(t) }}</td>
                <td>{{ accountName(t) }}</td>
                <td class="right">{{ nativeAmount(t) }}</td>
                <td class="right" :class="t.type === 'income' ? 'pos' : ''">{{ formatDefault(inDefault(t)) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 14. Footer -->
      <footer class="report-footer">
        <div>Beyond Money · v{{ APP_VERSION }}</div>
        <div>Report for {{ monthLabel }} · generated {{ generatedLabel }}</div>
      </footer>
    </article>
  </div>
</template>

<style scoped>
/*
 * 3.0 report styling. Everything inside .report-page is rasterised by
 * html2canvas for the PDF export, so this block deliberately avoids
 * color-mix() (html2canvas 1.4 can't parse the color() values Chrome
 * computes from it and aborts the export), backdrop-filter and
 * background-clip:text. Soft tints are plain rgba tokens defined per theme
 * below. PDF_LIGHT_CSS in the script repaints the export in light colours
 * by class name, so every class it targets is kept.
 */

/* ---------- Local tokens ---------- */
.report-shell {
  --tint-income: rgba(111, 220, 140, 0.14);
  --tint-expense: rgba(255, 127, 134, 0.14);
  --tint-warning: rgba(245, 200, 107, 0.16);
  /* Data colours for the chart series. */
  --series-in: var(--income);
  --series-out: var(--expense);
  --series-spend: var(--accent);
  --series-cc: #845ef7;
}

:root[data-theme='light'] .report-shell {
  --tint-income: rgba(26, 143, 82, 0.12);
  --tint-expense: rgba(207, 63, 72, 0.11);
  --tint-warning: rgba(168, 109, 18, 0.12);
  --series-cc: #7048e8;
}

/* ---------- Layout ---------- */
.report-shell {
  min-height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
}

.report-toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas: 'back nav save';
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.tb-back { grid-area: back; justify-self: start; }
.tb-primary { grid-area: save; justify-self: end; }

.month-nav {
  grid-area: nav;
  justify-self: center;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.tb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 16px;
  border-radius: var(--radius-pill);
  background: var(--bg-elevated);
  border: 1px solid transparent;
  color: var(--text-primary);
  font-weight: 700;
  font-size: 0.86rem;
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
}

.tb-btn:hover:not(:disabled) { background: var(--bg-surface); }
.tb-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.tb-btn.icon-btn {
  width: 40px;
  height: 40px;
  padding: 0;
  flex-shrink: 0;
}

.tb-primary {
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 800;
  box-shadow: var(--shadow-accent);
}

.tb-primary:hover:not(:disabled) { background: var(--accent-hover); }

.month-select {
  width: auto;
  min-width: 190px;
  padding: 9px 38px 9px 16px;
  border-radius: var(--radius-pill);
  background-color: var(--bg-elevated);
  font-weight: 700;
  font-size: 0.9rem;
}

.report-loading {
  display: flex;
  justify-content: center;
  padding: 80px 0;
}

.report-page {
  width: min(100%, 920px);
  margin: 0 auto;
  padding: 28px 24px 64px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ---------- Cover / hero ---------- */
.cover {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 32px;
  border-radius: var(--radius-lg);
  background: var(--bg-accent), var(--bg-secondary);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
}

.cover-brand {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.cover-title {
  margin-top: 2px;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.cover-month {
  margin-top: 6px;
  font-family: var(--font-display);
  font-size: 2.5rem;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.025em;
  color: var(--text-primary);
}

.cover-meta {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  color: var(--text-muted);
  font-size: 0.84rem;
}

.cover-tagline {
  margin-top: 18px;
  padding: 7px 16px;
  border-radius: var(--radius-pill);
  font-weight: 700;
  font-size: 0.95rem;
  background: var(--bg-elevated);
}

.cover-tagline.pos { color: var(--income); background: var(--tint-income); }
.cover-tagline.neg { color: var(--expense); background: var(--tint-expense); }

/* ---------- Sections ---------- */
.block {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 24px;
  border-radius: var(--radius-lg);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  page-break-inside: avoid;
  break-inside: avoid;
}

.block-title {
  font-size: 1.12rem;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.01em;
}

.block-sub,
.footnote {
  max-width: 70ch;
  color: var(--text-muted);
  font-size: 0.84rem;
  line-height: 1.5;
}

.block-title + .block-sub,
.block-title + .footnote { margin-top: -8px; }

.footnote strong {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--text-secondary);
}

.footnote strong.pos { color: var(--income); }
.footnote strong.neg { color: var(--expense); }

.empty-note { color: var(--text-muted); font-size: 0.88rem; }

.block-subtitle {
  margin-top: 6px;
  font-size: 0.98rem;
  font-weight: 600;
  color: var(--text-secondary);
}

/* Shared tile + figure styles */
.kpi,
.stat-cell,
.asset-summary-cell,
.nw-cell,
.cc-card,
.cc-total-cell,
.mover-col,
.insight-item,
.waterfall,
.alloc-wrap,
.daily-chart,
.trend-chart,
.nw-chart,
.weekday-chart {
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
}

.cell-label {
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.35;
  color: var(--text-muted);
}

.cell-value {
  margin-top: 4px;
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  font-size: 1.15rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.cell-value.sm { font-size: 0.95rem; }

/* ---------- KPI ---------- */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.kpi {
  --tone: var(--accent);
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 16px 18px;
}

.kpi--income { --tone: var(--income); }
.kpi--expense { --tone: var(--expense); }
.kpi--neutral { --tone: var(--accent); }

.kpi-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.kpi-label::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tone);
  flex-shrink: 0;
}

.kpi-value {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  font-size: 1.4rem;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}

.kpi-delta {
  margin-top: 4px;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.kpi-delta .pos,
.kpi-delta .neg { font-weight: 700; }

/* ---------- Insights ---------- */
.insight-list { display: flex; flex-direction: column; gap: 8px; }

.insight-item {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  font-size: 0.9rem;
  line-height: 1.45;
  color: var(--text-secondary);
}

.insight-bullet { color: var(--accent); font-weight: 800; flex-shrink: 0; }

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.stat-cell { padding: 14px 16px; min-width: 0; }

/* ---------- Cashflow waterfall ---------- */
.waterfall {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
}

.wf-row {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr) 140px;
  gap: 14px;
  align-items: center;
}

.wf-label { font-weight: 600; font-size: 0.88rem; color: var(--text-secondary); }

.wf-track {
  height: 14px;
  background: var(--bg-surface);
  border-radius: var(--radius-pill);
  overflow: hidden;
}

.wf-fill { height: 100%; border-radius: var(--radius-pill); }
.wf-in { background: var(--series-in); }
.wf-out { background: var(--series-out); }
.wf-net-pos { background: var(--accent); }
.wf-net-neg { background: var(--series-out); }

.wf-amt {
  text-align: right;
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 0.92rem;
  white-space: nowrap;
}

/* ---------- Column charts (shared) ---------- */
.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.legend-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}

.legend-in { background: var(--series-in); }
.legend-out { background: var(--series-out); }

.axis-label { color: var(--text-muted); }

/* ---------- Trend chart ---------- */
.trend-chart {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 8px;
  align-items: end;
  padding: 14px 10px 10px;
  min-height: 180px;
}

.trend-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 6px 2px;
  border-radius: 12px;
}

.trend-col--active {
  position: relative;
  background: var(--accent-dim);
}

.trend-bars {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 3px;
  width: 100%;
  height: 120px;
}

.trend-bar {
  width: 42%;
  max-width: 24px;
  border-radius: 6px 6px 2px 2px;
  min-height: 2px;
}

.trend-bar--inc { background: var(--series-in); }
.trend-bar--out { background: var(--series-out); }

.trend-net {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}

.trend-label {
  font-size: 0.74rem;
  color: var(--text-muted);
  font-weight: 600;
  white-space: nowrap;
}

.trend-label--active { color: var(--accent); font-weight: 700; }

/* ---------- Net worth chart ---------- */
.nw-chart {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 8px;
  align-items: end;
  padding: 16px 10px 10px;
  min-height: 170px;
}

.nw-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.nw-bar-wrap {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  height: 110px;
}

.nw-bar {
  width: 60%;
  max-width: 34px;
  border-radius: 6px 6px 2px 2px;
  min-height: 2px;
  background: var(--accent);
}

.nw-bar.snapshot { background: var(--info); }

.nw-val {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}

.nw-lbl { font-size: 0.74rem; color: var(--text-muted); font-weight: 600; white-space: nowrap; }

/* ---------- Daily flow ---------- */
.daily-chart {
  display: grid;
  grid-template-columns: repeat(31, minmax(0, 1fr));
  gap: 3px;
  align-items: end;
  padding: 14px 10px 8px;
  min-height: 140px;
}

.day-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.day-bars {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 1px;
  width: 100%;
  height: 90px;
}

.day-bar {
  width: 45%;
  border-radius: 3px 3px 1px 1px;
  min-height: 1px;
}

.bar-in { background: var(--series-in); }
.bar-out { background: var(--series-out); }

.day-num {
  font-size: 0.62rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

/* ---------- Weekday chart ---------- */
.weekday-chart {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
  align-items: end;
  padding: 16px 12px 10px;
  min-height: 150px;
}

.weekday-col { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }

.weekday-bar-wrap {
  display: flex;
  align-items: flex-end;
  width: 100%;
  height: 100px;
}

.weekday-bar {
  width: 100%;
  border-radius: 8px 8px 2px 2px;
  min-height: 2px;
  background: var(--series-spend);
}

.weekday-amt {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
}

.weekday-lbl { font-size: 0.74rem; color: var(--text-muted); font-weight: 600; }

/* ---------- Bar lists (categories, labels) ---------- */
.bar-list { display: flex; flex-direction: column; gap: 8px; }

.bar-row {
  display: grid;
  grid-template-columns: minmax(140px, 1.2fr) minmax(0, 2fr) minmax(180px, auto);
  gap: 14px;
  align-items: center;
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
}

.bar-name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 0.9rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.bar-track {
  position: relative;
  height: 8px;
  background: var(--bg-surface);
  border-radius: var(--radius-pill);
  overflow: hidden;
}

.bar-fill {
  position: absolute;
  inset: 0;
  width: 0;
  border-radius: var(--radius-pill);
}

.bar-fill--exp { background: var(--series-out); }
.bar-fill--inc { background: var(--series-in); }

.bar-row--breakdown .bar-track { display: flex; }

.bar-segment { height: 100%; }
.bar-segment--normal { background: var(--series-spend); }
.bar-segment--cc { background: var(--series-cc); }

.bar-breakdown {
  grid-column: 1 / -1;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.breakdown-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 11px;
  border-radius: var(--radius-pill);
  font-size: 0.78rem;
  font-weight: 600;
  background: var(--bg-surface);
  color: var(--text-secondary);
}

.breakdown-chip .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.breakdown-chip--normal .dot { background: var(--series-spend); }
.breakdown-chip--cc .dot { background: var(--series-cc); }

.breakdown-chip .muted { font-weight: 600; }

.bar-stats {
  display: inline-flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 12px;
  font-size: 0.86rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.bar-amt {
  font-family: var(--font-display);
  font-weight: 600;
}

.bar-pct { color: var(--text-muted); }
.bar-count { color: var(--text-muted); font-size: 0.78rem; }

/* ---------- Tables ---------- */
.table-wrap {
  width: 100%;
  min-width: 0;
}

.report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}

.report-table th,
.report-table td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
  vertical-align: middle;
}

.report-table th:first-child,
.report-table td:first-child { padding-left: 0; }

.report-table th:last-child,
.report-table td:last-child { padding-right: 0; }

.report-table th {
  padding-top: 4px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
}

.report-table td { color: var(--text-primary); }

.report-table td.right {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.report-table tfoot td {
  padding-top: 12px;
  border-top: 1px solid var(--border-light);
  border-bottom: none;
}

.report-table tfoot strong { font-weight: 700; }

.report-table.tight th,
.report-table.tight td {
  padding-top: 7px;
  padding-bottom: 7px;
  font-size: 0.8rem;
}

.report-table.tight th:not(:first-child),
.report-table.tight td:not(:first-child) { padding-left: 10px; }

.report-table.tight th:not(:last-child),
.report-table.tight td:not(:last-child) { padding-right: 10px; }

.right,
.report-table th.right,
.report-table td.right { text-align: right; }
.pos { color: var(--income); }
.neg { color: var(--expense); }
.mut { color: var(--text-muted); }
.muted { color: var(--text-muted); font-size: 0.78rem; }
.capitalize { text-transform: capitalize; }

/* ---------- Asset / net worth tiles ---------- */
.asset-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.nw-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.asset-summary-cell,
.nw-cell {
  padding: 14px 16px;
  min-width: 0;
}

.nw-cell { flex: 1 1 160px; }

.nw-cell.nw-total {
  flex-basis: 100%;
  background: var(--accent-dim);
}

.nw-cell.nw-total .cell-label { color: var(--accent); }
.nw-cell.nw-total .cell-value { font-size: 1.5rem; letter-spacing: -0.02em; }

/* ---------- Credit card cycles ---------- */
.cc-cards { display: flex; flex-direction: column; gap: 12px; }

.cc-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 16px 18px;
  page-break-inside: avoid;
  break-inside: avoid;
}

.cc-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.cc-card-id {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.cc-card-name {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1rem;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
}

.status-paid { color: var(--income); background: var(--tint-income); }
.status-outstanding { color: var(--warning); background: var(--tint-warning); }
.status-none { color: var(--text-muted); background: var(--bg-surface); }

.cc-card-meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.cc-meta-cell {
  padding: 10px 12px;
  min-width: 0;
  border-radius: 12px;
  background: var(--bg-surface);
}

.cc-tx-table { margin-top: 2px; }

.cc-totals {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.cc-total-cell { padding: 14px 16px; min-width: 0; }

/* ---------- Movers ---------- */
.mover-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.mover-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 14px 16px;
}

.mover-head {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.mover-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  font-size: 0.86rem;
}

.mover-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.mover-delta {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  white-space: nowrap;
}

.mover-pct { font-size: 0.78rem; font-variant-numeric: tabular-nums; }

/* ---------- Asset allocation ---------- */
.alloc-wrap {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
  padding: 18px;
}

.alloc-donut {
  position: relative;
  width: 140px;
  height: 140px;
  border-radius: 50%;
  flex-shrink: 0;
}

.alloc-hole {
  position: absolute;
  inset: 24px;
  border-radius: 50%;
  background: var(--bg-elevated);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.alloc-hole-label { font-size: 0.72rem; font-weight: 600; color: var(--text-muted); }

.alloc-hole-value {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  font-size: 1rem;
  font-weight: 600;
}

.alloc-legend { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 8px; }

.alloc-legend-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  font-size: 0.86rem;
}

.alloc-swatch { width: 10px; height: 10px; border-radius: 50%; }
.alloc-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.alloc-pct,
.alloc-val {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.alloc-pct { font-weight: 600; }

/* ---------- Footer ---------- */
.report-footer {
  margin-top: 4px;
  padding: 16px 4px 0;
  border-top: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 0.8rem;
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

/* ---------- Responsive ---------- */
@media (max-width: 760px) {
  .report-page { padding: 16px 16px 48px; gap: 14px; }

  .cover { padding: 24px 20px; }
  .cover-month { font-size: 2.1rem; }

  .block { padding: 18px 16px; gap: 12px; }

  .kpi-grid,
  .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }

  .kpi { padding: 14px; }
  .kpi-value { font-size: 1.2rem; }

  .mover-grid { grid-template-columns: 1fr; }

  .bar-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    padding: 12px 14px;
  }

  .bar-stats { justify-content: flex-start; }

  .wf-row { grid-template-columns: 76px minmax(0, 1fr) auto; gap: 10px; }
  .waterfall { padding: 14px; }

  .trend-chart,
  .nw-chart { gap: 4px; padding: 12px 6px 8px; }
  .trend-bars { height: 90px; }
  .nw-bar-wrap { height: 84px; }
  .weekday-chart { gap: 5px; padding: 12px 8px 8px; }
  .weekday-bar-wrap { height: 76px; }

  .daily-chart { min-height: 110px; gap: 2px; padding: 12px 6px 6px; }
  .day-bars { height: 70px; }
  .day-num { font-size: 0.55rem; }

  .cc-card { padding: 14px; }
  .cc-card-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cc-totals { grid-template-columns: 1fr; }

  /* Tables scroll inside their own wrapper; the page never scrolls sideways.
     Scoped to narrow screens so the PDF render (≥920px wide) is unclipped. */
  .table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
  }

  .table-wrap .report-table { min-width: 520px; }
  .table-wrap--wide .report-table { min-width: 680px; }
}

@media (max-width: 560px) {
  .report-toolbar {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'back save'
      'nav nav';
    gap: 10px;
    padding: 10px 16px;
  }

  .month-nav { justify-self: stretch; }
  .month-select { flex: 1; min-width: 0; }
}

@media (max-width: 480px) {
  .cover-month { font-size: 1.85rem; }
  .cover-title { font-size: 0.98rem; }

  .asset-summary { grid-template-columns: 1fr; gap: 8px; }

  .asset-summary-cell {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }

  .asset-summary-cell .cell-value { margin-top: 0; text-align: right; }

  .nw-cell { flex-basis: 130px; }

  .cc-meta-cell:first-child { grid-column: 1 / -1; }

  .day-col:nth-child(even) .day-num { visibility: hidden; }

  .alloc-wrap { flex-direction: column; align-items: stretch; }
  .alloc-donut { align-self: center; }
  .alloc-legend { min-width: 0; }

  .report-table { font-size: 0.8rem; }
}

@media (prefers-reduced-motion: reduce) {
  .tb-btn { transition: none; }
  .tb-btn:active:not(:disabled) { transform: none; }
  .table-wrap { scroll-behavior: auto; }
}

/* ---------- Print ---------- */
@media print {
  .no-print { display: none !important; }

  .report-shell { background: #fff; color: #111; }
  .report-page { padding: 0; max-width: 100%; gap: 18px; }

  .block,
  .cover {
    background: #fff;
    border: 1px solid #ccc;
    box-shadow: none;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .cover-month { color: #111 !important; }

  .kpi,
  .stat-cell,
  .bar-row,
  .asset-summary-cell,
  .nw-cell,
  .nw-cell.nw-total,
  .cc-card,
  .cc-meta-cell,
  .cc-total-cell,
  .mover-col,
  .insight-item,
  .waterfall,
  .alloc-wrap,
  .daily-chart,
  .trend-chart,
  .nw-chart,
  .weekday-chart {
    background: #fafafa !important;
    border: 1px solid #ddd;
  }

  .table-wrap { overflow: visible !important; }
  .table-wrap .report-table { min-width: 0 !important; }

  .bar-track,
  .wf-track { background: #ddd; }
  .report-table th,
  .report-table td { color: #111; border-color: #ddd; }

  .pos { color: #006400 !important; }
  .neg { color: #b00020 !important; }
  .muted, .mut, .cell-label, .kpi-delta, .kpi-label, .block-sub, .footnote { color: #555 !important; }

  .bar-fill--exp { background: #b00020 !important; }
  .bar-fill--inc { background: #006400 !important; }
  .bar-in { background: #006400 !important; }
  .bar-out { background: #b00020 !important; }

  @page {
    margin: 14mm 12mm;
    size: A4;
  }

  body, html, .report-shell {
    background: #fff !important;
  }
}
</style>
