<script setup>
import { ref, computed, onMounted } from 'vue'
import DateInput from '../shared/DateInput.vue'
import { useCurrenciesStore } from '../../stores/currencies'
import { ASSET_TYPES, ASSET_GROUPS, metaFor } from '../../lib/assetTypes'

const props = defineProps({
  asset: { type: Object, default: null },
})

const emit = defineEmits(['submit', 'cancel'])

const currenciesStore = useCurrenciesStore()

const tagsInput = ref('')

const form = ref({
  name: '',
  type: 'fd',
  currency: 'INR',
  principal_amount: 0,
  current_value: 0,
  quantity: null,
  unit_cost: null,
  unit_price: null,
  symbol: '',
  provider: '',
  tags: [],
  lots: [],
  interest_rate: null,
  maturity_date: null,
  notes: '',
})

const meta = computed(() => metaFor(form.value.type))
const shape = computed(() => meta.value.shape)

const groupedTypes = computed(() =>
  ASSET_GROUPS.map(g => ({
    ...g,
    items: ASSET_TYPES.filter(t => t.group === g.code),
  }))
)

const hasLots = computed(() => Array.isArray(form.value.lots) && form.value.lots.length > 0)

const lotsTotalQty = computed(() =>
  (form.value.lots || []).reduce((s, l) => s + (Number(l.quantity) || 0), 0)
)

const lotsTotalCost = computed(() =>
  (form.value.lots || []).reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0)
)

const currentPrice = computed(() => {
  const p = Number(form.value.unit_price)
  return Number.isFinite(p) && p > 0 ? p : null
})

const lotsTotalCurrent = computed(() =>
  currentPrice.value != null ? lotsTotalQty.value * currentPrice.value : null
)

const lotsTotalPnl = computed(() =>
  currentPrice.value != null ? lotsTotalCurrent.value - lotsTotalCost.value : null
)

const lotsTotalPnlPct = computed(() => {
  if (lotsTotalPnl.value == null || !lotsTotalCost.value) return null
  return (lotsTotalPnl.value / lotsTotalCost.value) * 100
})

// ── Fund (mutual fund) ──────────────────────────────────────────────
// Lots are SIP-style contributions tracked only by amount invested. Growth
// isn't per-lot (each grows at its own NAV) — it's the single folio value
// minus everything invested.
const isFund = computed(() => shape.value === 'fund')

const fundInvested = computed(() =>
  (form.value.lots || []).reduce((s, l) => s + (Number(l.amount) || 0), 0)
)

const folioValue = computed(() => {
  const v = Number(form.value.current_value)
  return Number.isFinite(v) ? v : 0
})

const fundPnl = computed(() => folioValue.value - fundInvested.value)

const fundPnlPct = computed(() =>
  fundInvested.value ? (fundPnl.value / fundInvested.value) * 100 : null
)

function lotPnl(lot) {
  if (currentPrice.value == null) return null
  const q = Number(lot.quantity) || 0
  const c = Number(lot.unit_cost) || 0
  if (!q) return null
  return (currentPrice.value - c) * q
}

function lotPnlPct(lot) {
  if (currentPrice.value == null) return null
  const c = Number(lot.unit_cost) || 0
  if (!c) return null
  return ((currentPrice.value - c) / c) * 100
}

function fmtSigned(n) {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : '−'
  return `${sign}${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function fmtSignedPct(n) {
  if (n == null) return ''
  const sign = n >= 0 ? '+' : '−'
  return `${sign}${Math.abs(n).toFixed(2)}%`
}

function addLot() {
  if (!Array.isArray(form.value.lots)) form.value.lots = []
  if (isFund.value) form.value.lots.push({ amount: null, purchased_at: null })
  else form.value.lots.push({ quantity: null, unit_cost: null, purchased_at: null })
}

function removeLot(i) {
  form.value.lots.splice(i, 1)
}

onMounted(async () => {
  await currenciesStore.fetchCurrencies()
  if (props.asset) {
    const incomingLots = Array.isArray(props.asset.lots) ? props.asset.lots.map(l => ({ ...l })) : []
    // Legacy assets stored as a single quantity + unit_cost — surface them
    // as one lot so the lots-only UI can edit them naturally.
    if (!incomingLots.length && props.asset.quantity != null && props.asset.unit_cost != null) {
      incomingLots.push({
        quantity: Number(props.asset.quantity) || 0,
        unit_cost: Number(props.asset.unit_cost) || 0,
        purchased_at: null,
      })
    }
    form.value = {
      ...form.value,
      ...props.asset,
      tags: Array.isArray(props.asset.tags) ? props.asset.tags : [],
      lots: incomingLots,
    }
    // Funds store each lot as quantity=amount, unit_cost=1. Legacy mutual
    // funds (old holding shape) stored quantity=units, unit_cost=NAV — either
    // way the invested amount is quantity*unit_cost, so surface that as a
    // single "amount" field the fund UI edits.
    if (metaFor(form.value.type).shape === 'fund') {
      form.value.lots = (form.value.lots || []).map(l => ({
        amount: Number(l.quantity || 0) * (Number(l.unit_cost) || 1),
        purchased_at: l.purchased_at || null,
        note: l.note || null,
      }))
    }
    tagsInput.value = (form.value.tags || []).join(', ')
  } else {
    form.value.currency = currenciesStore.defaultCurrency?.code || 'INR'
  }
})

function handleSubmit() {
  const tags = tagsInput.value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const out = { ...form.value, tags }

  // Shape-specific normalization so we only write relevant fields.
  if (shape.value === 'cash') {
    const amt = Number(out.principal_amount || 0)
    out.current_value = amt
    out.quantity = null
    out.unit_cost = null
    out.unit_price = null
    out.symbol = null
    out.interest_rate = null
    out.maturity_date = null
    out.lots = null
  } else if (shape.value === 'deposit') {
    out.quantity = null
    out.unit_cost = null
    out.unit_price = null
    out.symbol = null
    out.lots = null
  } else if (shape.value === 'holding') {
    const lots = (out.lots || [])
      .map(l => ({
        quantity: Number(l.quantity) || 0,
        unit_cost: Number(l.unit_cost) || 0,
        purchased_at: l.purchased_at || null,
        note: l.note || null,
      }))
      .filter(l => l.quantity > 0)

    if (lots.length) {
      const totalQty = lots.reduce((s, l) => s + l.quantity, 0)
      const totalCost = lots.reduce((s, l) => s + l.quantity * l.unit_cost, 0)
      out.lots = lots
      out.quantity = totalQty
      out.unit_cost = totalQty ? totalCost / totalQty : 0
      out.principal_amount = totalCost
      if (out.unit_price != null) out.current_value = totalQty * Number(out.unit_price)
    } else {
      out.lots = null
      if (out.quantity != null && out.unit_cost != null) out.principal_amount = Number(out.quantity) * Number(out.unit_cost)
      if (out.quantity != null && out.unit_price != null) out.current_value = Number(out.quantity) * Number(out.unit_price)
    }
    out.interest_rate = null
    out.maturity_date = null
  } else if (shape.value === 'fund') {
    // SIP lots → store each as quantity=amount, unit_cost=1 so the store's
    // aggregate (principal = Σ quantity*unit_cost) equals total invested.
    // current_value is the user-entered folio value; leave unit_price null so
    // it isn't recomputed from units.
    const lots = (out.lots || [])
      .map(l => ({
        quantity: Number(l.amount) || 0,
        unit_cost: 1,
        purchased_at: l.purchased_at || null,
        note: l.note || null,
      }))
      .filter(l => l.quantity > 0)

    out.lots = lots.length ? lots : null
    out.principal_amount = lots.reduce((s, l) => s + l.quantity, 0)
    out.current_value = Number(out.current_value) || 0
    out.quantity = null
    out.unit_cost = null
    out.unit_price = null
    out.symbol = null
    out.interest_rate = null
    out.maturity_date = null
  } else if (shape.value === 'property') {
    out.quantity = null
    out.unit_cost = null
    out.unit_price = null
    out.symbol = null
    out.interest_rate = null
    out.lots = null
    // keep maturity_date as purchase_date
  } else {
    out.quantity = null
    out.unit_cost = null
    out.unit_price = null
    out.symbol = null
    out.interest_rate = null
    out.maturity_date = null
    out.lots = null
  }

  emit('submit', out)
}
</script>

<template>
  <form class="asset-form" @submit.prevent="handleSubmit">
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Name</label>
        <input v-model="form.name" class="form-input" required />
      </div>
      <div class="form-group">
        <label class="form-label">Type</label>
        <select v-model="form.type" class="form-input">
          <optgroup v-for="g in groupedTypes" :key="g.code" :label="g.label">
            <option v-for="t in g.items" :key="t.code" :value="t.code">{{ t.label }}</option>
          </optgroup>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Currency</label>
        <select v-model="form.currency" class="form-input">
          <option v-for="c in currenciesStore.currencies" :key="c.code" :value="c.code">
            {{ c.code }} ({{ c.symbol }})
          </option>
        </select>
      </div>
    </div>

    <!-- CASH: just an amount -->
    <template v-if="shape === 'cash'">
      <div class="form-group">
        <label class="form-label">Amount</label>
        <input v-model.number="form.principal_amount" type="number" step="0.01" class="form-input" required />
        <span class="hint">Amount held. Shown in {{ form.currency }} on the card, with conversion to your default currency below.</span>
      </div>
    </template>

    <!-- DEPOSIT: principal + current + interest + maturity -->
    <template v-else-if="shape === 'deposit'">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Principal invested</label>
          <input v-model.number="form.principal_amount" type="number" step="0.01" class="form-input" />
        </div>
        <div class="form-group">
          <label class="form-label">Current value</label>
          <input v-model.number="form.current_value" type="number" step="0.01" class="form-input" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Interest rate (%)</label>
          <input v-model.number="form.interest_rate" type="number" step="0.01" class="form-input" />
        </div>
        <div class="form-group">
          <label class="form-label">Maturity date</label>
          <DateInput v-model="form.maturity_date" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Provider / bank</label>
        <input v-model="form.provider" class="form-input" placeholder="HDFC, SBI…" />
      </div>
    </template>

    <!-- HOLDING: quantity-based assets, lots-driven -->
    <template v-else-if="shape === 'holding'">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Symbol / ticker</label>
          <input v-model="form.symbol" class="form-input" :placeholder="form.type === 'crypto' ? 'BTC, ETH…' : form.type === 'gold' || form.type === 'silver' ? 'XAU, XAG…' : 'AAPL, NIFTYBEES…'" />
        </div>
        <div class="form-group">
          <label class="form-label">Current unit price</label>
          <input v-model.number="form.unit_price" type="number" step="0.01" class="form-input" placeholder="Latest market price" />
        </div>
      </div>

      <div class="form-group lots-block">
        <div class="lots-header">
          <label class="form-label">Purchase lots ({{ meta.unitsLabel || 'Quantity' }})</label>
          <button type="button" class="btn-add-lot" @click="addLot">+ Add lot</button>
        </div>
        <span class="hint">One row per buy. P&amp;L per lot is computed against the current unit price above.</span>

        <div v-if="hasLots" class="lots-list">
          <div v-for="(lot, i) in form.lots" :key="i" class="lot-row">
            <div class="lot-fields">
              <div class="lot-field">
                <label class="lot-label">Qty</label>
                <input v-model.number="lot.quantity" type="number" step="0.0001" class="form-input" />
              </div>
              <div class="lot-field">
                <label class="lot-label">Buy price</label>
                <input v-model.number="lot.unit_cost" type="number" step="0.01" class="form-input" />
              </div>
              <div class="lot-field">
                <label class="lot-label">Date</label>
                <DateInput v-model="lot.purchased_at" />
              </div>
              <div class="lot-field lot-pnl-field">
                <label class="lot-label">P&amp;L</label>
                <span class="lot-pnl num" :class="lotPnl(lot) == null ? 'pnl-muted' : (lotPnl(lot) >= 0 ? 'pnl-up' : 'pnl-down')">
                  <template v-if="lotPnl(lot) == null">—</template>
                  <template v-else>
                    {{ fmtSigned(lotPnl(lot)) }}
                    <span class="lot-pnl-pct">{{ fmtSignedPct(lotPnlPct(lot)) }}</span>
                  </template>
                </span>
              </div>
            </div>
            <button type="button" class="btn-remove-lot" @click="removeLot(i)" aria-label="Remove lot">×</button>
          </div>

          <div class="lots-summary">
            <div class="sum-cell">
              <span class="sum-label">Qty</span>
              <strong class="num">{{ lotsTotalQty.toLocaleString('en-IN', { maximumFractionDigits: 4 }) }}</strong>
            </div>
            <div class="sum-cell">
              <span class="sum-label">Invested</span>
              <strong class="num">{{ lotsTotalCost.toLocaleString('en-IN', { maximumFractionDigits: 2 }) }} {{ form.currency }}</strong>
            </div>
            <div class="sum-cell">
              <span class="sum-label">Current</span>
              <strong class="num">
                <template v-if="lotsTotalCurrent != null">
                  {{ lotsTotalCurrent.toLocaleString('en-IN', { maximumFractionDigits: 2 }) }} {{ form.currency }}
                </template>
                <template v-else>—</template>
              </strong>
            </div>
            <div class="sum-cell" :class="lotsTotalPnl == null ? '' : (lotsTotalPnl >= 0 ? 'sum-up' : 'sum-down')">
              <span class="sum-label">P&amp;L</span>
              <strong class="num">
                <template v-if="lotsTotalPnl == null">—</template>
                <template v-else>
                  {{ fmtSigned(lotsTotalPnl) }} {{ form.currency }}
                  <span class="lot-pnl-pct">{{ fmtSignedPct(lotsTotalPnlPct) }}</span>
                </template>
              </strong>
            </div>
          </div>
        </div>

        <div v-else class="lots-empty">
          No lots yet. Add one to start.
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Broker / exchange</label>
        <input v-model="form.provider" class="form-input" placeholder="Zerodha, Coinbase…" />
      </div>
    </template>

    <!-- FUND: mutual fund — SIP-style invested lots + a single folio value -->
    <template v-else-if="shape === 'fund'">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Folio value</label>
          <input v-model.number="form.current_value" type="number" step="0.01" class="form-input" placeholder="Current total value" />
          <span class="hint">The current total value of the whole folio (all units combined), in {{ form.currency }}.</span>
        </div>
        <div class="form-group">
          <label class="form-label">Fund house / folio no.</label>
          <input v-model="form.provider" class="form-input" placeholder="Zerodha, Groww, ICICI Pru…" />
        </div>
      </div>

      <div class="form-group lots-block">
        <div class="lots-header">
          <label class="form-label">Investments / SIP</label>
          <button type="button" class="btn-add-lot" @click="addLot">+ Add investment</button>
        </div>
        <span class="hint">One row per contribution (SIP instalment or lump sum). These only track how much you put in — growth is the folio value above minus the total invested.</span>

        <div v-if="hasLots" class="lots-list">
          <div v-for="(lot, i) in form.lots" :key="i" class="lot-row">
            <div class="lot-fields fund-lot-fields">
              <div class="lot-field">
                <label class="lot-label">Amount invested</label>
                <input v-model.number="lot.amount" type="number" step="0.01" class="form-input" />
              </div>
              <div class="lot-field">
                <label class="lot-label">Date</label>
                <DateInput v-model="lot.purchased_at" />
              </div>
            </div>
            <button type="button" class="btn-remove-lot" @click="removeLot(i)" aria-label="Remove investment">×</button>
          </div>

          <div class="lots-summary fund-summary">
            <div class="sum-cell">
              <span class="sum-label">Invested</span>
              <strong class="num">{{ fundInvested.toLocaleString('en-IN', { maximumFractionDigits: 2 }) }} {{ form.currency }}</strong>
            </div>
            <div class="sum-cell">
              <span class="sum-label">Folio value</span>
              <strong class="num">{{ folioValue.toLocaleString('en-IN', { maximumFractionDigits: 2 }) }} {{ form.currency }}</strong>
            </div>
            <div class="sum-cell" :class="fundPnl >= 0 ? 'sum-up' : 'sum-down'">
              <span class="sum-label">P&amp;L</span>
              <strong class="num">
                {{ fmtSigned(fundPnl) }} {{ form.currency }}
                <span v-if="fundPnlPct != null" class="lot-pnl-pct">{{ fmtSignedPct(fundPnlPct) }}</span>
              </strong>
            </div>
          </div>
        </div>

        <div v-else class="lots-empty">
          No investments yet. Add one to start.
        </div>
      </div>
    </template>

    <!-- PROPERTY: physical assets -->
    <template v-else-if="shape === 'property'">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Purchase price</label>
          <input v-model.number="form.principal_amount" type="number" step="0.01" class="form-input" />
        </div>
        <div class="form-group">
          <label class="form-label">Current market value</label>
          <input v-model.number="form.current_value" type="number" step="0.01" class="form-input" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">{{ meta.locationLabel || 'Details' }}</label>
          <input v-model="form.provider" class="form-input" />
        </div>
        <div class="form-group">
          <label class="form-label">Purchase date</label>
          <DateInput v-model="form.maturity_date" />
        </div>
      </div>
    </template>

    <!-- SIMPLE: fallback for investment/other -->
    <template v-else>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Principal amount</label>
          <input v-model.number="form.principal_amount" type="number" step="0.01" class="form-input" />
        </div>
        <div class="form-group">
          <label class="form-label">Current value</label>
          <input v-model.number="form.current_value" type="number" step="0.01" class="form-input" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Provider</label>
        <input v-model="form.provider" class="form-input" />
      </div>
    </template>

    <div class="form-group">
      <label class="form-label">Tags <span class="opt">(comma separated)</span></label>
      <input v-model="tagsInput" class="form-input" placeholder="emergency, retirement…" />
    </div>

    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea v-model="form.notes" class="form-input form-textarea"></textarea>
    </div>

    <div class="form-actions">
      <button type="submit" class="btn-primary">{{ asset ? 'Update' : 'Add' }} asset</button>
      <button type="button" class="btn-cancel" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>

<style scoped>
/* Inputs and labels take the global 3.0 styles (main.css); this sheet only
   lays the fields out, like TransactionForm. */
.asset-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
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

.form-textarea {
  min-height: 90px;
}

.hint {
  font-size: 0.78rem;
  color: var(--text-muted);
  line-height: 1.45;
}

/* ───── Lots ───── */
.lots-block {
  gap: 8px;
}

.lots-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.btn-add-lot {
  flex-shrink: 0;
  padding: 6px 14px;
  font-size: 0.8rem;
  background: var(--accent-dim);
  color: var(--accent);
}

.btn-add-lot:hover {
  background: color-mix(in srgb, var(--accent) 24%, transparent);
}

.lots-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 6px;
}

.lot-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.lot-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.fund-lot-fields { grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); }

.lot-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.lot-label {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
}

/* Narrow lot columns: trim the global input padding a little. */
.lot-field .form-input {
  padding-left: 12px;
  padding-right: 12px;
}

.lot-pnl-field { justify-content: flex-end; }

/* Same height as the inputs beside it. */
.lot-pnl {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  min-height: 50px;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 600;
}

.lot-pnl.pnl-up {
  color: var(--income);
  background: color-mix(in srgb, var(--income) 12%, transparent);
}

.lot-pnl.pnl-down {
  color: var(--expense);
  background: color-mix(in srgb, var(--expense) 12%, transparent);
}

.lot-pnl-pct {
  font-size: 0.72rem;
  font-weight: 600;
  opacity: 0.85;
}

.btn-remove-lot {
  width: 34px;
  height: 34px;
  padding: 0;
  margin-bottom: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: 1.2rem;
  line-height: 1;
}

.btn-remove-lot:hover {
  color: var(--expense);
  background: color-mix(in srgb, var(--expense) 12%, transparent);
}

.lots-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
}

.fund-summary { grid-template-columns: repeat(3, minmax(0, 1fr)); }

.sum-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sum-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
}

.sum-cell strong {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.sum-cell.sum-up strong { color: var(--income); }
.sum-cell.sum-down strong { color: var(--expense); }

.lots-empty {
  padding: 14px 16px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  text-align: center;
  font-size: 0.82rem;
  color: var(--text-muted);
}

/* ───── Actions ───── */
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
  .lot-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lots-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 480px) {
  .form-actions { flex-direction: column; }
  .form-actions button { width: 100%; }
}
</style>
