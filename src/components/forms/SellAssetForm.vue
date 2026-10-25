<script setup>
import { ref, computed, onMounted } from 'vue'
import { localISODate } from '../../lib/dateFormat'
import DateInput from '../shared/DateInput.vue'
import { metaFor } from '../../lib/assetTypes'

const props = defineProps({
  asset: { type: Object, required: true },
  accounts: { type: Array, default: () => [] },
})

const emit = defineEmits(['submit', 'cancel'])

const shape = computed(() => metaFor(props.asset.type).shape)
const code = computed(() => props.asset.currency || 'INR')
const unitsLabel = computed(() => metaFor(props.asset.type).unitsLabel || 'Qty')

// Holdings (stock/ETF/gold/crypto…) carry a quantity and can be sold partially.
// Everything else (FD, mutual fund, property, simple) is redeemed whole.
const isHolding = computed(() => shape.value === 'holding' && Number(props.asset.quantity) > 0)
const maxQty = computed(() => Number(props.asset.quantity) || 0)

const sellQty = ref(0)
const proceeds = ref(null)
const accountId = ref('')
const date = ref(localISODate())
const error = ref('')

onMounted(() => {
  sellQty.value = maxQty.value
  if (props.accounts.length) accountId.value = props.accounts[0].id
})

const soldQty = computed(() => {
  if (!isHolding.value) return null
  const q = Number(sellQty.value) || 0
  return Math.min(Math.max(q, 0), maxQty.value)
})

const fullySold = computed(() => {
  if (!isHolding.value) return true
  return soldQty.value >= maxQty.value - 1e-9
})

// FIFO split of lots: returns the cost basis of the sold quantity and the lots
// that remain. Falls back to avg unit_cost when an asset has no explicit lots.
const split = computed(() => {
  if (!isHolding.value) {
    return { costBasis: Number(props.asset.principal_amount) || 0, remainingLots: null, remainingQty: null }
  }
  const lots = Array.isArray(props.asset.lots) ? props.asset.lots : []
  if (!lots.length) {
    const unitCost = Number(props.asset.unit_cost) || 0
    return {
      costBasis: soldQty.value * unitCost,
      remainingLots: null,
      remainingQty: maxQty.value - soldQty.value,
    }
  }
  let remaining = soldQty.value
  let costBasis = 0
  const remainingLots = []
  for (const lot of lots) {
    const q = Number(lot.quantity) || 0
    const c = Number(lot.unit_cost) || 0
    if (remaining <= 1e-9) { remainingLots.push({ ...lot }); continue }
    if (q <= remaining + 1e-9) {
      costBasis += q * c
      remaining -= q
    } else {
      costBasis += remaining * c
      remainingLots.push({ ...lot, quantity: q - remaining })
      remaining = 0
    }
  }
  return { costBasis, remainingLots, remainingQty: null }
})

const costBasis = computed(() => split.value.costBasis)
const proceedsNum = computed(() => Number(proceeds.value) || 0)
const profit = computed(() => proceedsNum.value - costBasis.value)
const profitPct = computed(() => costBasis.value ? (profit.value / costBasis.value) * 100 : 0)

// Optional: what the sale was worth BEFORE charges. For holdings it's
// qty × sell price; otherwise the gross redemption value. Purely a breakdown —
// the amount deposited stays the source of truth for cash and profit, so
// brokerage/STT/GST/DP charges are already reflected in the profit.
const sellPrice = ref(null)
const grossValue = computed(() => {
  const p = Number(sellPrice.value) || 0
  if (p <= 0) return 0
  return isHolding.value ? (soldQty.value || 0) * p : p
})
const charges = computed(() => (grossValue.value > 0 ? grossValue.value - proceedsNum.value : 0))

function fmt(n) {
  return `${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${code.value}`
}
function fmtSignedPct(n) {
  if (!Number.isFinite(n)) return ''
  const sign = n >= 0 ? '+' : '−'
  return `${sign}${Math.abs(n).toFixed(2)}%`
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100 }

function handleSubmit() {
  error.value = ''
  if (!accountId.value) { error.value = 'Select an account to deposit into.'; return }
  if (proceedsNum.value <= 0) { error.value = 'Enter the amount deposited from the sale.'; return }
  if (isHolding.value && soldQty.value <= 0) { error.value = `Enter a ${unitsLabel.value.toLowerCase()} to sell.`; return }
  if (grossValue.value > 0 && charges.value < -0.005) { error.value = 'Amount deposited is more than the gross sale value — check the numbers.'; return }

  emit('submit', {
    gross: round2(grossValue.value),
    charges: round2(charges.value),
    asset: props.asset,
    soldQty: soldQty.value,
    proceeds: round2(proceedsNum.value),
    costBasis: round2(costBasis.value),
    profit: round2(profit.value),
    accountId: accountId.value,
    date: date.value,
    fullySold: fullySold.value,
    remainingLots: split.value.remainingLots,
    remainingQty: split.value.remainingQty,
  })
}
</script>

<template>
  <form class="sell-form" @submit.prevent="handleSubmit">
    <p class="sell-intro">
      Selling <strong>{{ asset.name }}</strong>. Two incomings are recorded into the chosen
      account — your original invested amount, and the profit on top.
    </p>

    <div v-if="isHolding" class="form-group">
      <label class="form-label">{{ unitsLabel }} to sell</label>
      <input v-model.number="sellQty" type="number" step="0.0001" :max="maxQty" min="0" class="form-input" />
      <span class="hint">You hold {{ maxQty.toLocaleString('en-IN', { maximumFractionDigits: 4 }) }}. {{ fullySold ? 'Selling everything — the asset will be removed.' : 'Partial sale — remaining units stay tracked.' }}</span>
    </div>

    <div class="form-group">
      <label class="form-label">{{ isHolding ? 'Sell price per unit' : 'Gross value' }} <span class="opt">(optional)</span></label>
      <input v-model.number="sellPrice" type="number" step="0.01" min="0" class="form-input" :placeholder="isHolding ? 'Trade price from contract note' : 'Value before charges'" />
      <span class="hint">Only for the charges breakdown. Profit is always computed from the amount deposited.</span>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Amount deposited</label>
        <input v-model.number="proceeds" type="number" step="0.01" class="form-input" placeholder="Total received" required />
        <span class="hint">Net credited to your account after brokerage, STT, GST and DP charges, in {{ code }}.</span>
      </div>
      <div class="form-group">
        <label class="form-label">Deposit into</label>
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

    <div class="sell-summary">
      <template v-if="grossValue > 0">
        <div class="ss-row">
          <span class="ss-label">Gross sale value</span>
          <strong class="num">{{ fmt(grossValue) }}</strong>
        </div>
        <div class="ss-row ss-down">
          <span class="ss-label">Charges (brokerage, STT, GST, DP…)</span>
          <strong class="num">−{{ fmt(charges) }}</strong>
        </div>
      </template>
      <div class="ss-row">
        <span class="ss-label">Capital (invested) → incoming</span>
        <strong class="num">{{ fmt(costBasis) }}</strong>
      </div>
      <div class="ss-row" :class="profit >= 0 ? 'ss-up' : 'ss-down'">
        <span class="ss-label">{{ profit >= 0 ? 'Profit → incoming' : 'Loss → expense' }}</span>
        <strong class="num">
          {{ fmt(Math.abs(profit)) }}
          <span class="ss-pct">{{ fmtSignedPct(profitPct) }}</span>
        </strong>
      </div>
      <div class="ss-row ss-total">
        <span class="ss-label">Total deposited</span>
        <strong class="num">{{ fmt(proceedsNum) }}</strong>
      </div>
    </div>

    <p v-if="error" class="sell-error">{{ error }}</p>

    <div class="form-actions">
      <button type="submit" class="btn-primary">Record sale</button>
      <button type="button" class="btn-cancel" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>

<style scoped>
/* Inputs and labels take the global 3.0 styles (main.css); this sheet only
   lays the fields out, like TransactionForm. */
.sell-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.sell-intro {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.55;
  color: var(--text-muted);
}

.sell-intro strong {
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
.sell-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 18px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
}

.ss-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  color: var(--text-secondary);
}

.ss-label {
  min-width: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
}

.ss-row strong {
  flex-shrink: 0;
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-primary);
  text-align: right;
}

.ss-up strong { color: var(--income); }
.ss-down strong { color: var(--expense); }

.ss-pct {
  margin-left: 4px;
  font-size: 0.74rem;
  opacity: 0.8;
}

.ss-total {
  margin-top: 2px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}

.ss-total .ss-label { color: var(--text-secondary); }
.ss-total strong { font-size: 1.1rem; }

.sell-error {
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
