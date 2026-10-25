<script setup>
import { ref, computed, onMounted } from 'vue'
import { localISODate } from '../../lib/dateFormat'
import DateInput from '../shared/DateInput.vue'
import { ASSET_TYPES, metaFor } from '../../lib/assetTypes'

const props = defineProps({
  // When set, we're buying MORE of an existing holding (adds a lot).
  // When null, it's a brand-new holding.
  asset: { type: Object, default: null },
  accounts: { type: Array, default: () => [] },
  defaultCurrency: { type: String, default: 'INR' },
})

const emit = defineEmits(['submit', 'cancel'])

const isExisting = computed(() => !!props.asset)

// Buyable holding types (qty × price). Funds/deposits/property use the asset form.
const buyableTypes = ASSET_TYPES.filter(t => t.shape === 'holding')

const name = ref('')
const type = ref('stock')
const symbol = ref('')
const currency = ref(props.defaultCurrency || 'INR')

const quantity = ref(null)
const price = ref(null)
const totalDebited = ref(null) // net settlement actually debited from the account (from the broker ledger)
const accountId = ref('')
const date = ref(localISODate())
const error = ref('')

onMounted(() => {
  if (props.asset) {
    name.value = props.asset.name
    type.value = props.asset.type
    symbol.value = props.asset.symbol || ''
    currency.value = props.asset.currency || props.defaultCurrency || 'INR'
  }
  if (props.accounts.length) accountId.value = props.accounts[0].id
})

const unitsLabel = computed(() => metaFor(type.value).unitsLabel || 'Qty')
const code = computed(() => currency.value || 'INR')

const qtyNum = computed(() => Number(quantity.value) || 0)
const priceNum = computed(() => Number(price.value) || 0)
const traded = computed(() => qtyNum.value * priceNum.value)
// If the user hasn't typed the debited amount, assume no charges (= traded).
const settlement = computed(() => {
  const d = Number(totalDebited.value)
  return Number.isFinite(d) && d > 0 ? d : traded.value
})
const charges = computed(() => settlement.value - traded.value)

function fmt(n) {
  return `${code.value} ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100 }

function handleSubmit() {
  error.value = ''
  if (!isExisting.value && !name.value.trim()) { error.value = 'Enter a name for the holding.'; return }
  if (qtyNum.value <= 0) { error.value = `Enter the ${unitsLabel.value.toLowerCase()} bought.`; return }
  if (priceNum.value <= 0) { error.value = 'Enter the price per unit.'; return }
  if (!accountId.value) { error.value = 'Select the account the money came from.'; return }
  if (settlement.value <= 0) { error.value = 'The debited amount must be greater than zero.'; return }
  if (charges.value < -0.005) { error.value = 'Amount debited is less than the traded value — check the numbers.'; return }

  emit('submit', {
    isExisting: isExisting.value,
    asset: props.asset,
    name: name.value.trim(),
    type: type.value,
    symbol: symbol.value.trim() || null,
    currency: code.value,
    quantity: qtyNum.value,
    price: round2(priceNum.value),
    traded: round2(traded.value),
    settlement: round2(settlement.value),
    charges: round2(charges.value),
    accountId: accountId.value,
    date: date.value,
  })
}
</script>

<template>
  <form class="buy-form" @submit.prevent="handleSubmit">
    <p class="buy-intro">
      <template v-if="isExisting">
        Buying more <strong>{{ asset.name }}</strong>. A new lot is added at the traded price, and one
        <strong>Investment</strong> expense is recorded for the amount debited (charges noted in its description).
      </template>
      <template v-else>
        Record a new holding purchase. The holding is valued at the traded price, and one
        <strong>Investment</strong> expense is recorded for the amount debited (charges noted in its description).
      </template>
    </p>

    <template v-if="!isExisting">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Name</label>
          <input v-model="name" type="text" class="form-input" placeholder="e.g. KPIT Technologies" required />
        </div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <select v-model="type" class="form-input">
            <option v-for="t in buyableTypes" :key="t.code" :value="t.code">{{ t.label }}</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Ticker symbol <span class="opt">(optional)</span></label>
          <input v-model="symbol" type="text" class="form-input" placeholder="e.g. KPITTECH.NS" />
          <span class="hint">Enables live price refresh later.</span>
        </div>
        <div class="form-group">
          <label class="form-label">Currency</label>
          <input v-model="currency" type="text" class="form-input" />
        </div>
      </div>
    </template>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label">{{ unitsLabel }} bought</label>
        <input v-model.number="quantity" type="number" step="0.00000001" min="0" class="form-input" placeholder="0" required />
      </div>
      <div class="form-group">
        <label class="form-label">Price per unit</label>
        <input v-model.number="price" type="number" step="0.01" min="0" class="form-input" :placeholder="`Traded price in ${code}`" required />
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Amount debited</label>
        <input v-model.number="totalDebited" type="number" step="0.01" min="0" class="form-input" :placeholder="`Net from broker bill (${fmt(traded)})`" />
        <span class="hint">The settlement amount actually taken from your account. Leave blank if it equals the traded value.</span>
      </div>
      <div class="form-group">
        <label class="form-label">Paid from</label>
        <select v-model="accountId" class="form-input" required>
          <option value="" disabled>Select account</option>
          <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Date</label>
      <DateInput v-model="date" />
    </div>

    <div class="buy-summary">
      <div class="bs-row">
        <span class="bs-label">Holding cost ({{ qtyNum || 0 }} × {{ priceNum || 0 }})</span>
        <strong class="num">{{ fmt(traded) }}</strong>
      </div>
      <div class="bs-row" :class="charges > 0 ? 'bs-charge' : ''">
        <span class="bs-label">Charges / fees</span>
        <strong class="num">{{ fmt(charges) }}</strong>
      </div>
      <div class="bs-row bs-total">
        <span class="bs-label">Debited from account</span>
        <strong class="num">{{ fmt(settlement) }}</strong>
      </div>
    </div>

    <p v-if="error" class="buy-error">{{ error }}</p>

    <div class="form-actions">
      <button type="submit" class="btn-primary">Record purchase</button>
      <button type="button" class="btn-cancel" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>

<style scoped>
/* Inputs and labels take the global 3.0 styles (main.css); this sheet only
   lays the fields out, like TransactionForm. */
.buy-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.buy-intro {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.55;
  color: var(--text-muted);
}

.buy-intro strong {
  color: var(--text-secondary);
  font-weight: 700;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.form-label {
  margin: 0;
}

.opt {
  color: var(--text-muted);
  font-weight: 500;
  font-size: 0.78rem;
  margin-left: 2px;
}

.hint {
  font-size: 0.78rem;
  color: var(--text-muted);
  line-height: 1.45;
}

/* Breakdown: an inset tile, total under a hairline. */
.buy-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 18px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
}

.bs-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  color: var(--text-secondary);
}

.bs-label {
  min-width: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
}

.bs-row strong {
  flex-shrink: 0;
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-primary);
  text-align: right;
}

.bs-charge strong { color: var(--expense); }

.bs-total {
  margin-top: 2px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}

.bs-total .bs-label { color: var(--text-secondary); }
.bs-total strong { font-size: 1.1rem; }

.buy-error {
  margin: 0;
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--expense) 12%, transparent);
  color: var(--expense);
  font-size: 0.86rem;
  font-weight: 700;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  padding-top: 4px;
}

.form-actions .btn-primary {
  min-width: 160px;
}

@media (max-width: 600px) {
  .form-row { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 480px) {
  .form-actions { flex-direction: column; }
  .form-actions button { width: 100%; }
}
</style>
