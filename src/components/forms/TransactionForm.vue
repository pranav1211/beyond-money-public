<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import DateInput from '../shared/DateInput.vue'
import { useAccountsStore } from '../../stores/accounts'
import { useCategoriesStore } from '../../stores/categories'
import { useLabelsStore } from '../../stores/labels'
import { useCurrencyStore } from '../../stores/currency'

const props = defineProps({
  transaction: { type: Object, default: null },
})

const emit = defineEmits(['submit', 'cancel'])

const accountsStore = useAccountsStore()
const categoriesStore = useCategoriesStore()
const labelsStore = useLabelsStore()
const currencyStore = useCurrencyStore()

const errorMessage = ref('')
const form = ref({
  date: new Date().toISOString().split('T')[0],
  type: 'expense',
  amount: null,
  currency: 'INR',
  account_id: null,
  transfer_to_account_id: null,
  category_id: null,
  description: '',
  notes: '',
})
const selectedLabels = ref([])

const isTransferType = computed(() => form.value.type === 'transfer')

const filteredCategories = computed(() => {
  if (isTransferType.value) return []
  return categoriesStore.categories.filter(category => category.type === form.value.type)
})

const requiresCategory = computed(() => !isTransferType.value)

const convertedAmount = computed(() => {
  if (!form.value.amount) return null
  const target = form.value.currency === 'INR' ? 'USD' : 'INR'
  const converted = currencyStore.convert(form.value.amount, form.value.currency, target)
  if (typeof converted !== 'number' || Number.isNaN(converted)) return null
  return `${target === 'INR' ? '₹' : '$'}${converted.toFixed(2)}`
})

watch(() => form.value.type, (nextType) => {
  if (nextType === 'transfer') {
    form.value.category_id = null
  }
  if (form.value.category_id && !filteredCategories.value.some(category => category.id === form.value.category_id)) {
    form.value.category_id = null
  }
})

onMounted(async () => {
  await Promise.all([
    accountsStore.fetchAccounts(),
    categoriesStore.fetchCategories(),
    labelsStore.fetchLabels(),
    currencyStore.fetchRate(),
  ])

  if (props.transaction) {
    form.value = {
      date: props.transaction.date,
      type: props.transaction.type,
      amount: Number(props.transaction.amount || 0),
      currency: props.transaction.currency,
      account_id: props.transaction.account_id,
      category_id: props.transaction.category_id,
      description: props.transaction.description || '',
      notes: props.transaction.notes || '',
    }
    selectedLabels.value = props.transaction.transaction_labels?.map(item => item.label_id) || []
  }
})

function toggleLabel(labelId) {
  const index = selectedLabels.value.indexOf(labelId)
  if (index === -1) selectedLabels.value.push(labelId)
  else selectedLabels.value.splice(index, 1)
}

function handleSubmit() {
  errorMessage.value = ''

  if (!form.value.description.trim()) {
    errorMessage.value = 'Add a short description.'
    return
  }

  if (!form.value.amount || Number(form.value.amount) <= 0) {
    errorMessage.value = 'Enter an amount greater than zero.'
    return
  }

  if (requiresCategory.value && !form.value.category_id) {
    errorMessage.value = 'Select a category.'
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

  const amountInInr = form.value.currency === 'INR'
    ? Number(form.value.amount)
    : currencyStore.convert(form.value.amount, form.value.currency, 'INR')

  const { transfer_to_account_id, ...formFields } = form.value

  const submitData = {
    ...formFields,
    description: form.value.description.trim(),
    notes: form.value.notes.trim(),
    amount_inr: Number(amountInInr || form.value.amount),
    labels: selectedLabels.value,
  }

  if (isTransferType.value) {
    submitData._transfer = true
    submitData._fromAccountId = form.value.account_id
    submitData._toAccountId = form.value.transfer_to_account_id
  }

  emit('submit', submitData)
}
</script>

<template>
  <form class="tx-form" @submit.prevent="handleSubmit">
    <div class="type-row">
      <label
        v-for="typeOption in ['income', 'expense', 'transfer']"
        :key="typeOption"
        class="type-pill"
        :class="{ active: form.type === typeOption, [typeOption]: form.type === typeOption }"
      >
        <input v-model="form.type" type="radio" :value="typeOption" class="pill-radio" />
        <span>{{ typeOption === 'income' ? 'Incoming' : typeOption === 'transfer' ? 'Transfer' : typeOption }}</span>
      </label>
    </div>

    <div class="form-grid">
      <div class="field-card">
        <label>Date</label>
        <DateInput v-model="form.date" required />
      </div>

      <div class="field-card">
        <label>Amount</label>
        <div class="amount-wrap">
          <span class="currency-mark">{{ form.currency === 'INR' ? '₹' : '$' }}</span>
          <input v-model.number="form.amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" />
        </div>
        <div class="inline-row">
          <div class="currency-row">
            <label class="mini-pill" :class="{ active: form.currency === 'INR' }">
              <input v-model="form.currency" type="radio" value="INR" class="pill-radio" />
              <span>INR</span>
            </label>
            <label class="mini-pill" :class="{ active: form.currency === 'USD' }">
              <input v-model="form.currency" type="radio" value="USD" class="pill-radio" />
              <span>USD</span>
            </label>
          </div>
          <span v-if="convertedAmount" class="converted-hint">{{ convertedAmount }}</span>
        </div>
      </div>

      <div v-if="!isTransferType" class="field-card">
        <label>{{ form.type === 'income' ? 'Deposit Account' : 'Paid From Account' }}</label>
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

      <div class="field-card field-card--wide">
        <label>Description</label>
        <input v-model="form.description" required />
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
      <button type="submit" class="btn-primary">{{ transaction ? 'Update Transaction' : 'Add Transaction' }}</button>
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
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  padding: 0 16px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-weight: 800;
  text-transform: capitalize;
  cursor: pointer;
}

.mini-pill {
  min-height: 38px;
  padding: 0 12px;
}

.type-pill.active,
.mini-pill.active {
  color: #0d1827;
  border-color: transparent;
  background: linear-gradient(135deg, var(--accent), #8be7ed);
}

.type-pill.expense.active {
  background: linear-gradient(135deg, #ff9b9b, #ff6b81);
}

.type-pill.transfer.active {
  background: linear-gradient(135deg, #87c8ff, #5c7cfa);
}

.type-pill.income.active {
  background: linear-gradient(135deg, #8ce99a, #38d9a9);
}

.pill-radio {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.field-card {
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 18px;
  background: var(--bg-secondary);
}

.field-card--wide {
  grid-column: span 2;
}

.amount-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  padding: 0 14px;
}

.amount-wrap input {
  border: none;
  background: transparent;
  box-shadow: none;
  padding-inline: 0;
}

.currency-mark {
  font-weight: 800;
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

.label-grid {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.label-chip {
  border-radius: 14px;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  background: rgba(255, 255, 255, 0.02);
  color: var(--text-secondary);
  font-weight: 700;
}

.label-chip.selected {
  background: color-mix(in srgb, var(--label-color) 18%, transparent);
  border-color: var(--label-color);
  color: var(--text-primary);
}

.label-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--label-color);
}

.form-error {
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 125, 125, 0.12);
  border: 1px solid rgba(255, 125, 125, 0.24);
  color: var(--expense);
  font-weight: 700;
}

.form-actions {
  justify-content: flex-end;
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
