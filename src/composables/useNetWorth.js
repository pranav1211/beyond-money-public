import { computed } from 'vue'
import { useAccountsStore } from '../stores/accounts'
import { useAssetsStore } from '../stores/assets'
import { useCreditCardsStore } from '../stores/creditCards'
import { useCcExpensesStore } from '../stores/ccExpenses'
import { useTransactionsStore } from '../stores/transactions'
import { useNetWorthSnapshotsStore } from '../stores/netWorthSnapshots'
import { toCurrency, defaultCurrencyCode, inDefault } from '../lib/money'
import { localMonth } from '../lib/dateFormat'
import { allocateLoans } from '../lib/loans'

// Same sign rules as getAccountDelta in stores/transactions.js: how a single
// transaction moved the TOTAL of all account balances (transfer legs cancel).
function accountDelta(tx) {
  if (!tx.account_id) return 0
  const base = Number(inDefault(tx) || 0)
  if (tx.type === 'income' || tx.type === 'lend_repayment') return base
  if (tx.type === 'expense' || tx.type === 'lend') return -base
  if (tx.type === 'transfer') {
    if (tx.notes === 'transfer_out') return -base
    if (tx.notes === 'transfer_in') return base
  }
  return 0
}

// Month an asset entered the portfolio: earliest lot purchase, else created_at.
function assetMonth(a) {
  if (Array.isArray(a.lots) && a.lots.length) {
    const first = a.lots.map(l => l.purchased_at).filter(Boolean).sort()[0]
    if (first) return String(first).slice(0, 7)
  }
  return a.created_at ? String(a.created_at).slice(0, 7) : null
}

function monthsBetween(start, end) {
  const out = []
  let [y, m] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) { m = 1; y++ }
  }
  return out
}

export function useNetWorth() {
  const accountsStore = useAccountsStore()
  const assetsStore = useAssetsStore()
  const creditCardsStore = useCreditCardsStore()
  const ccExpensesStore = useCcExpensesStore()
  const transactionsStore = useTransactionsStore()
  const snapshotsStore = useNetWorthSnapshotsStore()

  const loading = computed(() =>
    accountsStore.loading || assetsStore.loading || creditCardsStore.loading || ccExpensesStore.loading || transactionsStore.loading
  )

  function accountValue(a) {
    return toCurrency(a.current_balance || 0, a.currency || defaultCurrencyCode(), defaultCurrencyCode())
  }

  function assetValue(a) {
    return toCurrency(a.current_value || 0, a.currency || defaultCurrencyCode(), defaultCurrencyCode())
  }

  const totalAccounts = computed(() =>
    accountsStore.accounts.reduce((sum, a) => sum + accountValue(a), 0)
  )

  const totalAssets = computed(() =>
    assetsStore.assets.reduce((sum, a) => sum + assetValue(a), 0)
  )

  // Net amount still owed on a card = unpaid spend minus any prepaid/early
  // payment already made (that cash already left an account, so counting the
  // full unpaid total here would double-count the prepaid portion).
  function cardNetDue(c) {
    return Math.max(0, ccExpensesStore.totalForCard(c.id) - Number(c.prepaid_amount || 0))
  }

  const totalCreditCards = computed(() =>
    creditCardsStore.creditCards.reduce((sum, c) => sum + cardNetDue(c), 0)
  )

  // Money lent that hasn't come back yet, in default currency (same units as
  // accounts/assets). Settlement rules live in lib/loans.js (INV-64).
  const loanAllocation = computed(() => allocateLoans(transactionsStore.transactions))

  const totalLoansOutstanding = computed(() => loanAllocation.value.totalOutstanding)

  const netWorth = computed(() =>
    totalAccounts.value + totalAssets.value + totalLoansOutstanding.value - totalCreditCards.value
  )

  const components = computed(() => {
    const items = []
    accountsStore.accounts.forEach(a =>
      items.push({ name: a.name, value: accountValue(a), type: 'Account' })
    )
    assetsStore.assets.forEach(a =>
      items.push({ name: a.name, value: assetValue(a), type: 'Asset' })
    )
    // Aggregate loans per borrower so the components table mirrors the
    // "Outstanding by borrower" view on the Loans page.
    for (const b of loanAllocation.value.borrowers) {
      if (b.outstanding > 0.0001) items.push({ name: b.name, value: b.outstanding, type: 'Loan' })
    }
    creditCardsStore.creditCards.forEach(c =>
      items.push({ name: c.name, value: -cardNetDue(c), type: 'Credit Card' })
    )
    return items
  })

  const positiveComponents = computed(() =>
    components.value.filter(c => c.value > 0)
  )

  // Month-end net worth history. A month with a stored snapshot uses it (real
  // market value captured at the time). Otherwise it's reconstructed from the
  // ledger, independently per month, so later activity never shifts earlier
  // months:
  //   accounts  = today's balances minus every account movement dated after it
  //   loans     = lends up to that month minus repayments up to that month
  //   cards     = card expenses incurred by then and not yet paid by then
  //   assets    = COST basis of holdings acquired by then (no historical prices)
  const netWorthHistory = computed(() => {
    const txns = transactionsStore.transactions.filter(t => t.date)
    const assets = assetsStore.assets
    const cc = ccExpensesStore.expenses
    const def = defaultCurrencyCode()

    const seen = []
    txns.forEach(t => seen.push(t.date.slice(0, 7)))
    cc.forEach(e => e.date && seen.push(String(e.date).slice(0, 7)))
    assets.forEach(a => { const m = assetMonth(a); if (m) seen.push(m) })
    if (!seen.length) return []

    const now = localMonth()
    const start = seen.sort()[0]
    const months = monthsBetween(start, now)
    const snaps = new Map(snapshotsStore.snapshots.map(s => [s.month, Number(s.net_worth)]))
    const deltas = txns.map(t => ({ m: t.date.slice(0, 7), d: accountDelta(t) }))
    const loanTxns = txns.filter(t => t.type === 'lend' || t.type === 'lend_repayment')

    return months.map(month => {
      if (snaps.has(month)) return { month, value: snaps.get(month), source: 'snapshot' }

      const later = deltas.reduce((s, x) => (x.m > month ? s + x.d : s), 0)
      const accounts = totalAccounts.value - later

      const loans = allocateLoans(loanTxns, { asOf: month }).totalOutstanding

      let cards = 0
      for (const e of cc) {
        if (!e.date || String(e.date).slice(0, 7) > month) continue
        const paidMonth = e.paid_date ? String(e.paid_date).slice(0, 7) : null
        const unpaidThen = paidMonth ? paidMonth > month : !e.is_paid
        if (unpaidThen) cards += Number(e.amount || 0)
      }

      let invested = 0
      for (const a of assets) {
        const m = assetMonth(a)
        if (m && m <= month) invested += toCurrency(a.principal_amount || 0, a.currency || def, def)
      }

      return { month, value: accounts + loans + invested - cards, source: 'reconstructed' }
    })
  })

  async function fetchAll() {
    // force=true on transactions so we don't get a stale month-filtered
    // subset cached by MonthReportView — net worth needs the full history
    // to compute outstanding loans.
    await Promise.all([
      accountsStore.fetchAccounts(),
      assetsStore.fetchAssets(),
      creditCardsStore.fetchCreditCards(),
      ccExpensesStore.fetchExpenses(),
      transactionsStore.fetchTransactions({}, true),
      snapshotsStore.fetchSnapshots(),
    ])
  }

  // Record this month's real (market-value) net worth. Online-only,
  // best-effort — never throws.
  async function captureSnapshot() {
    try {
      await snapshotsStore.captureCurrent({
        month: localMonth(),
        net_worth: netWorth.value,
        accounts: totalAccounts.value,
        assets: totalAssets.value,
        loans: totalLoansOutstanding.value,
        credit_cards: totalCreditCards.value,
      })
    } catch { /* auxiliary data — ignore */ }
  }

  return {
    loading,
    totalAccounts,
    totalAssets,
    totalCreditCards,
    totalLoansOutstanding,
    netWorth,
    components,
    positiveComponents,
    netWorthHistory,
    fetchAll,
    captureSnapshot,
  }
}
