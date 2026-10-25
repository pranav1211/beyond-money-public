<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { localISODate } from '../../lib/dateFormat'
import DateInput from '../shared/DateInput.vue'
import { useAccountsStore } from '../../stores/accounts'
import { useCategoriesStore } from '../../stores/categories'
import { useLabelsStore } from '../../stores/labels'
import { useCurrencyStore } from '../../stores/currency'
import { useCurrenciesStore } from '../../stores/currencies'
import { useTransactionsStore } from '../../stores/transactions'
import { useSubmitGuard } from '../../composables/useSubmitGuard'
import { allocateLoans, borrowerKey } from '../../lib/loans'

const props = defineProps({
  transaction: { type: Object, default: null },
})

const emit = defineEmits(['submit', 'cancel'])

const accountsStore = useAccountsStore()
const categoriesStore = useCategoriesStore()
const labelsStore = useLabelsStore()
const currencyStore = useCurrencyStore()
const currenciesStore = useCurrenciesStore()
const transactionsStore = useTransactionsStore()

const errorMessage = ref('')
const { submitting, run: guardSubmit } = useSubmitGuard()
const form = ref({
  date: localISODate(),
  type: 'expense',
  amount: null,
  currency: 'INR',
  account_id: null,
  transfer_to_account_id: null,
  category_id: null,
  description: '',
  notes: '',
  borrower_name: '',
  loan_id: null,
})
const selectedLabels = ref([])

// Quick date chips under the picker. Build the ISO string from local date parts
// (not toISOString, which is UTC and can shift the day by ±1 across timezones).
const dateOffsets = [
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
function setDateOffset(days) { form.value.date = isoOffset(days) }
function isActiveOffset(days) { return form.value.date === isoOffset(days) }

const isTransferType = computed(() => form.value.type === 'transfer')
const isLendType = computed(() => form.value.type === 'lend')
const isRepaymentType = computed(() => form.value.type === 'lend_repayment')
const isLendingFlow = computed(() => isLendType.value || isRepaymentType.value)

const filteredCategories = computed(() => {
  if (isTransferType.value || isLendingFlow.value) return []
  return categoriesStore.categories.filter(category => category.type === form.value.type)
})

const requiresCategory = computed(() => !isTransferType.value && !isLendingFlow.value)

// Loan state for the repayment picker, via the shared settlement rules
// (lib/loans.js). When editing a repayment, leave it out so the limits show
// what was owed before it.
const loanAllocation = computed(() => {
  const editingId = props.transaction?.id
  const txns = editingId
    ? transactionsStore.transactions.filter(t => t.id !== editingId)
    : transactionsStore.transactions
  return allocateLoans(txns)
})

// People who can repay: anyone with something pending, plus the borrower of
// the repayment being edited.
const repayBorrowers = computed(() => {
  const editingKey = props.transaction?.borrower_name ? borrowerKey(props.transaction.borrower_name) : null
  return loanAllocation.value.borrowers.filter(b => b.outstanding > 0.0001 || b.key === editingKey)
})

const selectedBorrower = computed(() =>
  form.value.borrower_name ? loanAllocation.value.byKey.get(borrowerKey(form.value.borrower_name)) || null : null
)

// Open loans of the selected person, for "apply to a specific loan".
const openLoans = computed(() => {
  const b = selectedBorrower.value
  if (!b) return []
  return b.loans.filter(l => l.outstanding > 0.0001 || l.id === props.transaction?.loan_id)
})

const repayLimit = computed(() => {
  if (!selectedBorrower.value) return null
  if (form.value.loan_id) {
    const loan = openLoans.value.find(l => l.id === form.value.loan_id)
    return loan ? loan.outstanding : null
  }
  return selectedBorrower.value.outstanding
})

// Names already used for loans, offered while typing a new loan so the same
// person isn't entered two different ways.
const knownBorrowers = computed(() => loanAllocation.value.borrowers.map(b => b.name).filter(n => n !== '(no name)'))

const defaultCode = computed(() => currenciesStore.defaultCurrency?.code || 'INR')
const currentSymbol = computed(() => currenciesStore.symbolOf(form.value.currency))

const convertedAmount = computed(() => {
  if (!form.value.amount) return null
  const target = form.value.currency === defaultCode.value
    ? (currenciesStore.codes.find(c => c !== defaultCode.value) || defaultCode.value)
    : defaultCode.value
  if (target === form.value.currency) return null
  const converted = currencyStore.convert(form.value.amount, form.value.currency, target)
  if (typeof converted !== 'number' || Number.isNaN(converted)) return null
  return `${currenciesStore.symbolOf(target)}${converted.toFixed(2)} ${target}`
})

watch(() => form.value.type, (nextType) => {
  if (nextType === 'transfer' || nextType === 'lend' || nextType === 'lend_repayment') {
    form.value.category_id = null
  }
  if (nextType !== 'lend' && nextType !== 'lend_repayment') {
    form.value.borrower_name = ''
    form.value.loan_id = null
  }
  if (nextType === 'lend') {
    form.value.loan_id = null
  }
  if (form.value.category_id && !filteredCategories.value.some(category => category.id === form.value.category_id)) {
    form.value.category_id = null
  }
})

// Loan maths need the full history, but the shared store may hold only the
// current month (the dashboard loads it filtered). Load everything once when a
// lending type is in play.
let loanHistoryLoaded = false
watch(isLendingFlow, (on) => {
  if (!on || loanHistoryLoaded) return
  loanHistoryLoaded = true
  transactionsStore.fetchTransactions({}, true)
}, { immediate: true })

// Switching person clears a specific-loan choice that belonged to someone else.
watch(() => form.value.borrower_name, () => {
  if (!isRepaymentType.value || !form.value.loan_id) return
  if (!openLoans.value.some(l => l.id === form.value.loan_id)) form.value.loan_id = null
})

function fmtMoney(n) {
  return `${currenciesStore.symbolOf(defaultCode.value)}${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

onMounted(async () => {
  await Promise.all([
    accountsStore.fetchAccounts(),
    categoriesStore.fetchCategories(),
    labelsStore.fetchLabels(),
    currenciesStore.fetchCurrencies(),
  ])
  await currencyStore.fetchRate(currenciesStore.codes.length ? currenciesStore.codes : ['INR', 'USD'])

  if (!props.transaction) {
    form.value.currency = currenciesStore.defaultCurrency?.code || 'INR'
  }

  if (props.transaction) {
    form.value = {
      date: props.transaction.date,
      type: props.transaction.type,
      amount: Number(props.transaction.amount || 0),
      currency: props.transaction.currency,
      account_id: props.transaction.account_id,
      transfer_to_account_id: null,
      category_id: props.transaction.category_id,
      description: props.transaction.description || '',
      notes: props.transaction.notes || '',
      borrower_name: props.transaction.borrower_name || '',
      loan_id: props.transaction.loan_id || null,
    }
    selectedLabels.value = props.transaction.transaction_labels?.map(item => item.label_id) || []

    // Repayments: show the person exactly as the picker lists them (older rows
    // may differ in case, or only carry a loan_id).
    if (form.value.type === 'lend_repayment') {
      const viaLoan = form.value.loan_id ? loanAllocation.value.loans.find(l => l.id === form.value.loan_id) : null
      const match = viaLoan
        ? loanAllocation.value.byKey.get(viaLoan.key)
        : loanAllocation.value.byKey.get(borrowerKey(form.value.borrower_name))
      if (match) form.value.borrower_name = match.name
    }
  }
})

function toggleLabel(labelId) {
  const index = selectedLabels.value.indexOf(labelId)
  if (index === -1) selectedLabels.value.push(labelId)
  else selectedLabels.value.splice(index, 1)
}

function handleSubmit() {
  if (submitting.value) return
  errorMessage.value = ''

  if (!form.value.amount || Number(form.value.amount) <= 0) {
    errorMessage.value = 'Enter an amount greater than zero.'
    return
  }

  if (requiresCategory.value && !form.value.category_id) {
    errorMessage.value = 'Select a category.'
    return
  }

  if (isLendType.value && !form.value.borrower_name.trim()) {
    errorMessage.value = 'Enter the borrower’s name.'
    return
  }

  if (isRepaymentType.value && !selectedBorrower.value) {
    errorMessage.value = 'Select who paid you back.'
    return
  }

  if (isLendingFlow.value && !form.value.account_id) {
    errorMessage.value = isLendType.value
      ? 'Select the account the money came from.'
      : 'Select the account the money was returned to.'
    return
  }

  if (isTransferType.value) {
    if (!form.value.account_id && !form.value.transfer_to_account_id) {
      errorMessage.value = 'Select at least one account.'
      return
    }
    if (form.value.account_id && form.value.transfer_to_account_id && form.value.account_id === form.value.transfer_to_account_id) {
      errorMessage.value = 'From and To accounts must be different.'
      return
    }
  } else if (!form.value.account_id) {
    errorMessage.value = 'Select an account.'
    return
  }

  const targetCode = defaultCode.value
  const amountInDefault = form.value.currency === targetCode
    ? Number(form.value.amount)
    : Number(currencyStore.convert(form.value.amount, form.value.currency, targetCode))

  // A repayment can't be more than what's owed (the whole person, or the
  // chosen loan). Half a unit of slack absorbs currency rounding.
  if (isRepaymentType.value && repayLimit.value != null && Number(amountInDefault || form.value.amount) > repayLimit.value + 0.5) {
    errorMessage.value = form.value.loan_id
      ? `This loan only has ${fmtMoney(repayLimit.value)} left.`
      : `${selectedBorrower.value.name} owes ${fmtMoney(repayLimit.value)} in total.`
    return
  }

  const { transfer_to_account_id, ...formFields } = form.value

  const submitData = {
    ...formFields,
    description: form.value.description.trim(),
    notes: form.value.notes.trim(),
    amount_default: Number(amountInDefault || form.value.amount),
    default_currency: targetCode,
    labels: selectedLabels.value,
  }

  // Store the borrower exactly as their loans spell it, so the payment always
  // groups with them (borrowerKey matching also tolerates case/spaces).
  if (isRepaymentType.value && selectedBorrower.value.name !== '(no name)') {
    submitData.borrower_name = selectedBorrower.value.name
  }

  if (isTransferType.value) {
    submitData._transfer = true
    submitData._fromAccountId = form.value.account_id
    submitData._toAccountId = form.value.transfer_to_account_id
  }

  guardSubmit(() => emit('submit', submitData))
}
</script>

<template>
  <form class="tx-form" @submit.prevent="handleSubmit">
    <div class="type-row">
      <label
        v-for="typeOption in ['income', 'expense', 'transfer', 'lend', 'lend_repayment']"
        :key="typeOption"
        class="type-pill"
        :class="{ active: form.type === typeOption, [typeOption]: form.type === typeOption }"
      >
        <input v-model="form.type" type="radio" :value="typeOption" class="pill-radio" />
        <span>{{
          typeOption === 'income' ? 'Incoming'
            : typeOption === 'transfer' ? 'Transfer'
            : typeOption === 'lend' ? 'Lend'
            : typeOption === 'lend_repayment' ? 'Lend Repaid'
            : typeOption
        }}</span>
      </label>
    </div>

    <div class="form-grid">
      <div class="field-card">
        <label>Date</label>
        <DateInput v-model="form.date" required />
        <div class="date-quick">
          <button
            v-for="o in dateOffsets"
            :key="o.label"
            type="button"
            class="date-chip"
            :class="{ active: isActiveOffset(o.days) }"
            @click="setDateOffset(o.days)"
          >{{ o.label }}</button>
        </div>
      </div>

      <div class="field-card">
        <label>Amount</label>
        <div class="amount-wrap">
          <span class="currency-mark">{{ currentSymbol }}</span>
          <input v-model.number="form.amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" />
        </div>
        <div class="inline-row">
          <div class="currency-row">
            <label
              v-for="c in currenciesStore.currencies"
              :key="c.code"
              class="mini-pill"
              :class="{ active: form.currency === c.code }"
            >
              <input v-model="form.currency" type="radio" :value="c.code" class="pill-radio" />
              <span>{{ c.code }}</span>
            </label>
          </div>
          <span v-if="convertedAmount" class="converted-hint">{{ convertedAmount }}</span>
        </div>
      </div>

      <div v-if="!isTransferType" class="field-card">
        <label>{{
          form.type === 'income' ? 'Deposit Account'
            : form.type === 'lend' ? 'Lent From Account'
            : form.type === 'lend_repayment' ? 'Returned To Account'
            : 'Paid From Account'
        }}</label>
        <select v-model="form.account_id">
          <option :value="null">Select account</option>
          <option v-for="account in accountsStore.accounts" :key="account.id" :value="account.id">{{ account.name }}</option>
        </select>
      </div>

      <template v-if="isTransferType">
        <div class="field-card">
          <label>From</label>
          <select v-model="form.account_id">
            <option :value="null">Cash / Wallet</option>
            <option v-for="account in accountsStore.accounts" :key="account.id" :value="account.id">{{ account.name }}</option>
          </select>
        </div>
        <div class="field-card">
          <label>To</label>
          <select v-model="form.transfer_to_account_id">
            <option :value="null">Cash / Wallet</option>
            <option v-for="account in accountsStore.accounts" :key="account.id" :value="account.id">{{ account.name }}</option>
          </select>
        </div>
      </template>

      <div v-if="requiresCategory" class="field-card field-card--wide">
        <label>Category</label>
        <select v-model="form.category_id">
          <option :value="null">Select category</option>
          <option v-for="category in filteredCategories" :key="category.id" :value="category.id">{{ category.name }}</option>
        </select>
      </div>

      <div v-if="isLendType" class="field-card">
        <label for="tx-borrower">Borrower</label>
        <input id="tx-borrower" v-model="form.borrower_name" list="tx-borrower-names" placeholder="Name (e.g. Alice)" autocomplete="off" />
        <datalist id="tx-borrower-names">
          <option v-for="name in knownBorrowers" :key="name" :value="name" />
        </datalist>
      </div>

      <template v-if="isRepaymentType">
        <div class="field-card">
          <label for="tx-repay-person">Paid back by</label>
          <select id="tx-repay-person" v-model="form.borrower_name">
            <option value="">Select a person</option>
            <option v-for="b in repayBorrowers" :key="b.key" :value="b.name">
              {{ b.name }} · owes {{ fmtMoney(b.outstanding) }}
            </option>
          </select>
          <p v-if="!repayBorrowers.length" class="hint-text">Nobody owes you anything right now.</p>
        </div>

        <div class="field-card">
          <label for="tx-repay-loan">Apply to</label>
          <select id="tx-repay-loan" v-model="form.loan_id" :disabled="!selectedBorrower">
            <option :value="null">Oldest loans first</option>
            <option v-for="loan in openLoans" :key="loan.id" :value="loan.id">
              Loan of {{ loan.date }} · {{ fmtMoney(loan.outstanding) }} left
            </option>
          </select>
          <p v-if="repayLimit != null" class="hint-text">
            {{ form.loan_id ? 'Up to' : 'Owes' }} {{ fmtMoney(repayLimit) }}{{ form.loan_id ? ' on this loan' : ' in total' }}
          </p>
        </div>
      </template>

      <div class="field-card field-card--wide">
        <label>Description <span class="optional-hint">(optional)</span></label>
        <input v-model="form.description" />
      </div>

      <div class="field-card field-card--wide">
        <label>Labels</label>
        <div class="label-grid">
          <button
            v-for="label in labelsStore.labels"
            :key="label.id"
            type="button"
            class="label-chip"
            :class="{ selected: selectedLabels.includes(label.id) }"
            :style="{ '--label-color': label.color }"
            @click="toggleLabel(label.id)"
          >
            <span class="label-dot"></span>
            {{ label.name }}
          </button>
        </div>
      </div>

    </div>

    <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>

    <div class="form-actions">
      <button type="submit" class="btn-primary" :disabled="submitting">{{ transaction && transaction.id ? 'Update Transaction' : 'Add Transaction' }}</button>
      <button type="button" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>

<style scoped>
.tx-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.type-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.type-pill,
.mini-pill {
  --tone: var(--accent);
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 18px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-weight: 700;
  text-transform: capitalize;
  cursor: pointer;
  transition: background-color var(--transition), color var(--transition), box-shadow var(--transition);
}

.type-pill:hover,
.mini-pill:hover {
  color: var(--text-primary);
}

.type-pill:focus-within,
.mini-pill:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.mini-pill {
  min-height: 34px;
  padding: 0 14px;
  font-size: 0.85rem;
}

/* Selected: a soft tint of the type's colour with a matching ring. */
.type-pill.active,
.mini-pill.active {
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 16%, transparent);
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--tone) 55%, transparent);
}

.type-pill.expense { --tone: var(--expense); }
.type-pill.transfer { --tone: var(--info); }
.type-pill.income { --tone: var(--income); }
.type-pill.lend { --tone: var(--warning); }
.type-pill.lend_repayment { --tone: var(--income); }

.hint-text {
  margin: 8px 0 0;
  font-size: 0.82rem;
  color: var(--text-muted);
}

.pill-radio {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px 20px;
}

.field-card {
  min-width: 0;
}

.field-card--wide {
  grid-column: span 2;
}

.date-quick {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.date-chip {
  flex: 1;
  min-height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}
.date-chip:hover { color: var(--text-primary); background: var(--bg-surface); }
.date-chip.active {
  color: var(--accent);
  background: var(--accent-dim);
}

.amount-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  padding: 0 16px;
  transition: border-color var(--transition), box-shadow var(--transition);
}

.amount-wrap:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-dim);
}

.amount-wrap input {
  border: none;
  background: transparent;
  box-shadow: none;
  padding: 10px 0;
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.amount-wrap input:focus {
  box-shadow: none;
  background: transparent;
}

.currency-mark {
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--text-muted);
}

.inline-row,
.currency-row,
.form-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.inline-row {
  justify-content: space-between;
  margin-top: 10px;
}

.converted-hint {
  color: var(--text-muted);
  font-size: 0.84rem;
}

.optional-hint {
  color: var(--text-muted);
  font-weight: 500;
  font-size: 0.78rem;
  margin-left: 4px;
}

.label-grid {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.label-chip {
  border-radius: var(--radius-pill);
  padding: 8px 14px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  font-weight: 600;
}

.label-chip:hover {
  background: var(--bg-elevated);
}

.label-chip.selected {
  background: var(--label-color);
  border-color: transparent;
  color: #11151b;
}

.label-chip.selected .label-dot {
  background: #11151b;
  opacity: 0.5;
}

.label-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--label-color);
}

.form-error {
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--expense) 12%, transparent);
  color: var(--expense);
  font-weight: 700;
}

.form-actions {
  justify-content: flex-end;
  padding-top: 4px;
}

.form-actions .btn-primary {
  min-width: 180px;
}

@media (max-width: 900px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .field-card--wide {
    grid-column: span 1;
  }
}

@media (max-width: 480px) {
  .type-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .type-pill {
    min-height: 42px;
    padding: 0 10px;
    font-size: 0.82rem;
  }

  .form-actions {
    flex-direction: column;
  }

  .form-actions button {
    width: 100%;
  }
}
</style>
