<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useTransactionsStore } from '../stores/transactions'
import { useAccountsStore } from '../stores/accounts'
import { useAuthStore } from '../stores/auth'
import { inDefault, defaultCurrencySymbol, defaultCurrencyCode } from '../lib/money'
import { formatDate, localISODate } from '../lib/dateFormat'
import { allocateLoans } from '../lib/loans'
import AppShell from '../components/layout/AppShell.vue'
import ModalWrapper from '../components/shared/ModalWrapper.vue'
import ConfirmDialog from '../components/shared/ConfirmDialog.vue'
import EmptyState from '../components/shared/EmptyState.vue'
import CandleLoader from '../components/shared/CandleLoader.vue'
import TransactionForm from '../components/forms/TransactionForm.vue'
import TransactionButton from '../components/shared/TransactionButton.vue'

const transactionsStore = useTransactionsStore()
const accountsStore = useAccountsStore()
const auth = useAuthStore()

onMounted(async () => {
  // force: loan maths need the full history, not a month-filtered subset that
  // another screen (the dashboard) may have left in the shared store.
  await Promise.all([
    accountsStore.fetchAccounts(),
    transactionsStore.fetchTransactions({}, true),
  ])
})

// Who owes what, and which loans count as settled: specific-loan payments
// first, then each person's payments oldest loan first (lib/loans.js).
const alloc = computed(() => allocateLoans(transactionsStore.transactions))

const owing = computed(() => alloc.value.borrowers.filter(b => b.outstanding > 0.0001))
const settledPeople = computed(() => alloc.value.borrowers.filter(b => b.outstanding <= 0.0001 && b.loans.length))

const tab = ref('owing') // 'owing' | 'settled'
const selectedKey = ref(null)

const peopleList = computed(() => (tab.value === 'owing' ? owing.value : settledPeople.value))
const selected = computed(() => alloc.value.byKey.get(selectedKey.value) || null)

// Keep a valid selection: first person in the current tab.
watch([peopleList, tab], () => {
  if (!peopleList.value.some(b => b.key === selectedKey.value)) {
    selectedKey.value = peopleList.value[0]?.key || null
  }
}, { immediate: true })

function selectPerson(key) {
  selectedKey.value = key
}

const sym = computed(() => defaultCurrencySymbol())
function fmt(n) {
  return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function initialOf(name) {
  return (String(name || '?').trim()[0] || '?').toUpperCase()
}

// Lent / Repaid only mean something while money is still out. Once a
// person's repayments match what they borrowed, both show 0 and drop out of
// the page totals. A person who overpaid still shows real figures.
function isSquare(b) {
  return b.outstanding <= 0.0001 && Math.abs(b.lent - b.repaid) < 0.5
}

function shownLent(b) {
  return isSquare(b) ? 0 : b.lent
}

function shownRepaid(b) {
  return isSquare(b) ? 0 : b.repaid
}

const pageTotals = computed(() => alloc.value.borrowers.reduce(
  (t, b) => ({ lent: t.lent + shownLent(b), repaid: t.repaid + shownRepaid(b) }),
  { lent: 0, repaid: 0 }
))

function repaidPct(b) {
  const lent = shownLent(b)
  return lent ? Math.min(100, (shownRepaid(b) / lent) * 100) : 0
}

const openCount = computed(() => selected.value ? selected.value.loans.filter(l => !l.settled).length : 0)

// Newest first for display; settlement order stays oldest first. While a
// person still owes something, their settled loans fold away behind a toggle
// so a long history of small loans doesn't bury what's still open.
const showSettledLoans = ref(false)
watch(selectedKey, () => { showSettledLoans.value = false })

const selectedLoans = computed(() => selected.value ? [...selected.value.loans].reverse() : [])
const settledLoanCount = computed(() => selectedLoans.value.filter(l => l.settled).length)
const visibleLoans = computed(() => {
  if (showSettledLoans.value || !openCount.value) return selectedLoans.value
  return selectedLoans.value.filter(l => !l.settled)
})

function loanStatus(loan) {
  if (loan.settled) return { label: 'Settled', tone: 'settled' }
  if (loan.partial) return { label: `${sym.value}${fmt(loan.outstanding)} left`, tone: 'partial' }
  return { label: 'Open', tone: 'open' }
}

function paymentNote(p) {
  if (p.loan) return `For the loan of ${formatDate(p.loan.date)}`
  return 'Oldest loans first'
}

// ---- Payment / loan forms ----
// mode: 'person' (any amount, oldest first) | 'settle' (everything pending) |
// 'loan' (one specific loan)
const payment = ref(null)
const lendFor = ref(null) // null = closed, '' = new person, 'Name' = lend again

function lastAccountOf(b) {
  const latest = [...b.loans].reverse().find(l => l.lend?.account_id)
  return latest?.lend.account_id || null
}

function openPayment(mode, loan = null) {
  if (!selected.value) return
  payment.value = { mode, borrower: selected.value, loan }
}

const paymentTitle = computed(() => {
  if (!payment.value) return ''
  const name = payment.value.borrower.name
  if (payment.value.mode === 'settle') return `Settle up with ${name}`
  if (payment.value.mode === 'loan') return `Repay the loan of ${formatDate(payment.value.loan.date)}`
  return `Payment from ${name}`
})

const prefilledRepayment = computed(() => {
  if (!payment.value) return null
  const { mode, borrower, loan } = payment.value
  const amount = mode === 'settle' ? borrower.outstanding : mode === 'loan' ? loan.outstanding : null
  return {
    id: null,
    date: localISODate(),
    type: 'lend_repayment',
    amount: amount != null ? Math.round(amount * 100) / 100 : null,
    currency: defaultCurrencyCode(),
    account_id: loan?.lend.account_id || lastAccountOf(borrower),
    category_id: null,
    description: mode === 'settle' ? `Settled up with ${borrower.name}` : `Repayment from ${borrower.name}`,
    notes: '',
    borrower_name: borrower.name === '(no name)' ? '' : borrower.name,
    loan_id: mode === 'loan' ? loan.id : null,
    transaction_labels: [],
  }
})

const prefilledLend = computed(() => ({
  id: null,
  date: localISODate(),
  type: 'lend',
  amount: null,
  currency: defaultCurrencyCode(),
  account_id: null,
  category_id: null,
  description: '',
  notes: '',
  borrower_name: lendFor.value || '',
  loan_id: null,
  transaction_labels: [],
}))

async function submitTransaction(data, close) {
  const { _transfer, _fromAccountId, _toAccountId, ...submitData } = data
  await transactionsStore.addTransaction({ ...submitData, user_id: auth.user.id })
  close()
}

function onPaymentSubmit(data) {
  return submitTransaction(data, () => { payment.value = null })
}

function onLendSubmit(data) {
  const name = (data.borrower_name || '').trim()
  return submitTransaction(data, () => {
    lendFor.value = null
    // Jump to the person you just lent to.
    tab.value = 'owing'
    const match = alloc.value.borrowers.find(b => b.name.toLowerCase() === name.toLowerCase())
    if (match) selectedKey.value = match.key
  })
}

// ---- Deletes ----
const confirming = ref(null) // { kind: 'payment' | 'loan', tx }

function askDeletePayment(p) {
  confirming.value = { kind: 'payment', tx: p.tx }
}

function askDeleteLoan(loan) {
  confirming.value = { kind: 'loan', tx: loan.lend }
}

const confirmCopy = computed(() => {
  if (!confirming.value) return { title: '', message: '' }
  if (confirming.value.kind === 'payment') {
    return {
      title: 'Delete payment',
      message: `Delete this ${sym.value}${fmt(inDefault(confirming.value.tx))} payment? The loans it settled become pending again and the account balance is adjusted.`,
    }
  }
  return {
    title: 'Delete loan',
    message: `Delete this ${sym.value}${fmt(inDefault(confirming.value.tx))} loan? The account balance will be restored.`,
  }
})

async function confirmDelete() {
  const id = confirming.value.tx.id
  confirming.value = null
  await transactionsStore.deleteTransaction(id)
}

// A loan can be deleted while nothing has been paid toward it.
function canDeleteLoan(loan) {
  return loan.repaid <= 0.0001
}
</script>

<template>
  <AppShell>
    <div class="loans-page">
      <section class="card loans-summary">
        <div class="summary-copy">
          <span class="summary-label">Still to come back</span>
          <span class="summary-value num">{{ sym }}{{ fmt(alloc.totalOutstanding) }}</span>
          <span class="summary-sub">
            Lent {{ sym }}{{ fmt(pageTotals.lent) }} · Repaid {{ sym }}{{ fmt(pageTotals.repaid) }}
          </span>
        </div>
        <TransactionButton label="New loan" @click="lendFor = ''" />
      </section>

      <div v-if="transactionsStore.loading && !alloc.borrowers.length" class="loader-container">
        <CandleLoader />
      </div>

      <div v-else-if="!alloc.borrowers.length" class="card">
        <EmptyState
          title="No loans yet"
          message="Track money you've lent to friends or family so it doesn't get mistaken for spending. Start with New loan."
        />
      </div>

      <template v-else>
        <section class="card people-card">
          <div class="people-head">
            <h3 class="section-title">People</h3>
            <div class="seg" role="tablist" aria-label="Show people">
              <button role="tab" :aria-selected="tab === 'owing'" :class="{ active: tab === 'owing' }" @click="tab = 'owing'">
                Owe you <span class="seg-count">{{ owing.length }}</span>
              </button>
              <button role="tab" :aria-selected="tab === 'settled'" :class="{ active: tab === 'settled' }" @click="tab = 'settled'">
                Settled <span class="seg-count">{{ settledPeople.length }}</span>
              </button>
            </div>
          </div>

          <div v-if="peopleList.length" class="people-list">
            <button
              v-for="b in peopleList"
              :key="b.key"
              type="button"
              class="person"
              :class="{ active: b.key === selectedKey }"
              :aria-pressed="b.key === selectedKey"
              @click="selectPerson(b.key)"
            >
              <span class="person-avatar">{{ initialOf(b.name) }}</span>
              <span class="person-copy">
                <span class="person-name">{{ b.name }}</span>
                <span v-if="tab === 'owing'" class="person-amount num">{{ sym }}{{ fmt(b.outstanding) }}</span>
                <span v-else class="person-meta">All settled</span>
              </span>
            </button>
          </div>
          <p v-else class="people-empty">
            {{ tab === 'owing' ? 'Nobody owes you anything right now.' : 'No settled people yet.' }}
          </p>
        </section>

        <section v-if="selected" class="card person-detail">
          <div class="detail-head">
            <span class="detail-avatar">{{ initialOf(selected.name) }}</span>
            <div class="detail-title">
              <h3>{{ selected.name }}</h3>
              <span class="detail-sub">
                {{ selected.loans.length }} {{ selected.loans.length === 1 ? 'loan' : 'loans' }}<template v-if="openCount"> · {{ openCount }} open</template>
              </span>
            </div>
          </div>

          <div class="detail-figures">
            <div class="figure figure--main">
              <span class="figure-label">Pending</span>
              <span class="figure-value num">{{ sym }}{{ fmt(selected.outstanding) }}</span>
            </div>
            <div class="figure">
              <span class="figure-label">Lent</span>
              <span class="figure-value num">{{ sym }}{{ fmt(shownLent(selected)) }}</span>
            </div>
            <div class="figure">
              <span class="figure-label">Repaid</span>
              <span class="figure-value num" :class="{ 'text-income': shownRepaid(selected) > 0 }">{{ sym }}{{ fmt(shownRepaid(selected)) }}</span>
            </div>
          </div>

          <div v-if="!isSquare(selected)" class="progress" :aria-label="`${repaidPct(selected).toFixed(0)}% repaid`">
            <div class="progress-track"><div class="progress-fill" :style="{ width: repaidPct(selected) + '%' }"></div></div>
            <span class="progress-label num">{{ repaidPct(selected).toFixed(0) }}% repaid</span>
          </div>

          <p v-if="selected.surplus > 0.0001" class="surplus-note">
            Paid {{ sym }}{{ fmt(selected.surplus) }} more than was lent.
          </p>

          <div class="detail-actions">
            <template v-if="selected.outstanding > 0.0001">
              <button class="btn-primary" @click="openPayment('person')">Record payment</button>
              <button @click="openPayment('settle')">Settle all · {{ sym }}{{ fmt(selected.outstanding) }}</button>
            </template>
            <button :class="{ 'btn-primary': selected.outstanding <= 0.0001 }" @click="lendFor = selected.name === '(no name)' ? '' : selected.name">
              Lend again
            </button>
          </div>

          <div class="detail-section">
            <h4 class="detail-section-title">Loans</h4>
            <ul class="rows">
              <li v-for="loan in visibleLoans" :key="loan.id" class="row">
                <div class="row-main">
                  <span class="row-title-line">
                    <span class="row-title num">{{ sym }}{{ fmt(loan.principal) }}</span>
                    <span class="status" :class="'status--' + loanStatus(loan).tone">{{ loanStatus(loan).label }}</span>
                  </span>
                  <span class="row-meta">
                    {{ formatDate(loan.date) }}<template v-if="loan.lend.accounts?.name"> · {{ loan.lend.accounts.name }}</template><template v-if="loan.lend.description"> · {{ loan.lend.description }}</template>
                  </span>
                </div>
                <div v-if="!loan.settled || canDeleteLoan(loan)" class="row-side">
                  <button v-if="!loan.settled" class="btn-ghost btn-sm" @click="openPayment('loan', loan)">Pay this loan</button>
                  <button v-if="canDeleteLoan(loan)" class="btn-ghost btn-sm btn-danger-text" @click="askDeleteLoan(loan)">Delete</button>
                </div>
              </li>
            </ul>
            <button
              v-if="settledLoanCount && openCount"
              type="button"
              class="btn-ghost btn-sm show-settled"
              :aria-expanded="showSettledLoans"
              @click="showSettledLoans = !showSettledLoans"
            >
              {{ showSettledLoans ? 'Hide settled loans' : `Show settled loans (${settledLoanCount})` }}
            </button>
          </div>

          <div v-if="selected.payments.length" class="detail-section">
            <h4 class="detail-section-title">Payments</h4>
            <ul class="rows">
              <li v-for="p in selected.payments" :key="p.tx.id" class="row">
                <div class="row-main">
                  <span class="row-title num text-income">+{{ sym }}{{ fmt(p.amount) }}</span>
                  <span class="row-meta">
                    {{ formatDate(p.tx.date) }}<template v-if="p.tx.accounts?.name"> · {{ p.tx.accounts.name }}</template> · {{ paymentNote(p) }}
                  </span>
                </div>
                <div class="row-side">
                  <button class="btn-ghost btn-sm btn-danger-text" @click="askDeletePayment(p)">Delete</button>
                </div>
              </li>
            </ul>
          </div>
        </section>
      </template>

      <ModalWrapper v-if="payment" @close="payment = null">
        <h3>{{ paymentTitle }}</h3>
        <TransactionForm :transaction="prefilledRepayment" @submit="onPaymentSubmit" @cancel="payment = null" />
      </ModalWrapper>

      <ModalWrapper v-if="lendFor !== null" @close="lendFor = null">
        <h3>{{ lendFor ? `Lend to ${lendFor}` : 'New loan' }}</h3>
        <TransactionForm :transaction="prefilledLend" @submit="onLendSubmit" @cancel="lendFor = null" />
      </ModalWrapper>

      <ConfirmDialog
        v-if="confirming"
        :title="confirmCopy.title"
        :message="confirmCopy.message"
        @confirm="confirmDelete"
        @cancel="confirming = null"
      />
    </div>
  </AppShell>
</template>

<style scoped>
.loans-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.loans-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
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
  font-size: 0.82rem;
  color: var(--text-muted);
}

.loader-container {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

/* People */
.people-card {
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.people-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.section-title {
  font-size: 1rem;
}

.seg {
  display: inline-flex;
  gap: 2px;
  padding: 4px;
  border-radius: var(--radius-pill);
  background: var(--bg-elevated);
}

.seg button {
  padding: 7px 14px;
  font-size: 0.84rem;
  background: transparent;
  color: var(--text-secondary);
  box-shadow: none;
}

.seg button.active {
  background: var(--bg-secondary);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}

.seg-count {
  min-width: 20px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  font-size: 0.72rem;
  background: var(--bg-surface);
  color: var(--text-muted);
}

.people-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}

.person {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  padding: 10px 14px 10px 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  border: 1.5px solid transparent;
  text-align: left;
  font-weight: 600;
  min-width: 0;
}

.person:hover {
  background: var(--bg-surface);
}

.person.active {
  border-color: color-mix(in srgb, var(--accent) 60%, transparent);
  background: var(--accent-dim);
}

.person-avatar,
.detail-avatar {
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-dim);
}

.person-avatar {
  width: 38px;
  height: 38px;
}

.person.active .person-avatar {
  background: var(--accent);
  color: var(--accent-ink);
}

.person-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.person-name {
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.person-amount {
  font-size: 0.92rem;
  color: var(--text-secondary);
}

.person-meta {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-muted);
}

.people-empty {
  font-size: 0.88rem;
  color: var(--text-muted);
}

/* Person detail */
.person-detail {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.detail-head {
  display: flex;
  align-items: center;
  gap: 14px;
}

.detail-avatar {
  width: 48px;
  height: 48px;
  font-size: 1.15rem;
}

.detail-title h3 {
  font-size: 1.25rem;
}

.detail-sub {
  font-size: 0.82rem;
  color: var(--text-muted);
}

.detail-figures {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: 12px;
}

.figure {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 14px 16px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  min-width: 0;
}

.figure-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.figure-value {
  font-size: 1.15rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.figure--main .figure-value {
  font-size: 1.7rem;
  line-height: 1.15;
  letter-spacing: -0.02em;
}

.progress {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-track {
  flex: 1;
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--bg-elevated);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--income);
}

.progress-label {
  font-size: 0.8rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.surplus-note {
  font-size: 0.85rem;
  color: var(--warning);
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-section-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
  font-family: var(--font-body);
  letter-spacing: 0;
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  margin-inline: -12px;
  border-radius: var(--radius-sm);
  transition: background-color var(--transition);
}

.row:hover {
  background: var(--bg-elevated);
}

.row-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.row-title-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
}

.row-title {
  font-size: 0.98rem;
  font-weight: 600;
}

.show-settled {
  align-self: flex-start;
  margin-top: 4px;
  color: var(--text-secondary);
}

.row-meta {
  font-size: 0.78rem;
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.row-side {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.status {
  --tone: var(--text-muted);
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 14%, transparent);
}

.status--settled { --tone: var(--income); }
.status--partial { --tone: var(--warning); }
.status--open { --tone: var(--info); }

.btn-ghost {
  background: transparent;
}

.btn-ghost:hover {
  background: var(--bg-surface);
}

.btn-sm {
  padding: 6px 12px;
  font-size: 0.8rem;
}

.btn-danger-text {
  color: var(--expense);
}

.btn-danger-text:hover {
  background: color-mix(in srgb, var(--expense) 12%, transparent);
}

@media (max-width: 640px) {
  .loans-summary {
    padding: 18px;
  }

  .summary-value {
    font-size: 1.7rem;
  }

  .people-card {
    padding: 16px;
  }

  /* Phones: people become a horizontal row of tabs you swipe through. */
  .people-list {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    /* scroll-padding keeps snapped chips 16px in from the card's edge;
       without it snapping ignores the padding and the first chip sits flush. */
    scroll-padding-inline: 16px;
    margin-inline: -16px;
    padding: 2px 16px 4px;
    scrollbar-width: none;
  }

  /* Trailing space so the last chip can also scroll clear of the edge
     (flex containers drop the end padding in the scroll area). */
  .people-list::after {
    content: '';
    flex: 0 0 4px;
  }

  .person {
    flex: 0 0 auto;
    max-width: 220px;
    scroll-snap-align: start;
  }

  .person-detail {
    padding: 18px;
    gap: 18px;
  }

  .detail-figures {
    grid-template-columns: 1fr 1fr;
  }

  .figure--main {
    grid-column: 1 / -1;
  }

  .detail-actions > button {
    flex: 1 1 auto;
  }

  /* Loan and payment rows: actions wrap under the amount when space runs out. */
  .row {
    flex-wrap: wrap;
    gap: 6px 12px;
  }

  .row-side {
    margin-left: auto;
  }
}
</style>
