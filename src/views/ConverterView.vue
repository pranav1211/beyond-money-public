<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCurrencyStore } from '../stores/currency'
import { useCurrenciesStore } from '../stores/currencies'
import { CURRENCY_CATALOG, lookupCurrency } from '../lib/currencyCatalog'
import AppShell from '../components/layout/AppShell.vue'
import CandleLoader from '../components/shared/CandleLoader.vue'
import ConfirmDialog from '../components/shared/ConfirmDialog.vue'

const currencyStore = useCurrencyStore()
const currenciesStore = useCurrenciesStore()

const amount = ref(1)
const fromCurrency = ref('USD')
const toCurrency = ref('INR')
const adding = ref(false)
const newCode = ref('')
const addError = ref('')
const deletingId = ref(null)

onMounted(async () => {
  await currenciesStore.fetchCurrencies()
  await refresh()
  if (currenciesStore.codes.length) {
    if (!currenciesStore.codes.includes(fromCurrency.value)) fromCurrency.value = currenciesStore.codes[0]
    if (!currenciesStore.codes.includes(toCurrency.value)) toCurrency.value = currenciesStore.codes[1] || currenciesStore.codes[0]
  }
})

const converted = computed(() => {
  if (!Object.keys(currencyStore.rates).length) return null
  return currencyStore.convert(amount.value, fromCurrency.value, toCurrency.value)
})

const fromSymbol = computed(() => currenciesStore.symbolOf(fromCurrency.value))
const toSymbol = computed(() => currenciesStore.symbolOf(toCurrency.value))

const ratesStale = computed(() => {
  if (!currencyStore.lastFetched) return true
  return Date.now() - new Date(currencyStore.lastFetched).getTime() > 24 * 60 * 60 * 1000
})

async function hardRefresh() {
  try {
    const codes = currenciesStore.codes.length ? currenciesStore.codes : ['INR', 'USD']
    const { supabase } = await import('../lib/supabase')
    await supabase.from('exchange_rate_cache').delete().eq('from_currency', 'USD').in('to_currency', codes)
  } catch {}
  await refresh()
}

const availableToAdd = computed(() => {
  const existing = new Set(currenciesStore.codes)
  return CURRENCY_CATALOG.filter(c => !existing.has(c.code))
})

function swap() {
  const tmp = fromCurrency.value
  fromCurrency.value = toCurrency.value
  toCurrency.value = tmp
}

async function refresh() {
  const symbols = currenciesStore.codes.length ? currenciesStore.codes : ['INR', 'USD']
  await currencyStore.fetchRate(symbols)
}

async function handleAdd() {
  addError.value = ''
  const code = newCode.value.trim().toUpperCase()
  if (!code) { addError.value = 'Pick a currency'; return }
  try {
    adding.value = true
    await currenciesStore.addCurrency({ code })
    newCode.value = ''
    await refresh()
  } catch (e) {
    addError.value = e.message || 'Could not add currency'
  } finally {
    adding.value = false
  }
}

async function handleSetDefault(code) {
  await currenciesStore.setDefault(code)
}

async function handleDelete() {
  if (!deletingId.value) return
  await currenciesStore.deleteCurrency(deletingId.value)
  deletingId.value = null
  await refresh()
}

// Rate grid: every pair of the user's currencies converted against each other.
// We anchor to the user's default for readability.
const ratePairs = computed(() => {
  const base = currenciesStore.defaultCurrency?.code
  if (!base) return []
  return currenciesStore.currencies
    .filter(c => c.code !== base)
    .map(c => {
      const baseRate = currencyStore.rates[base]
      const cRate = currencyStore.rates[c.code]
      if (!baseRate || !cRate) return { code: c.code, symbol: c.symbol, name: c.name, per: null, inv: null }
      // units of base per 1 c.code (e.g. 1 USD = 83.2 INR)
      const per = baseRate / cRate
      const inv = cRate / baseRate
      return { code: c.code, symbol: c.symbol, name: c.name, per, inv, base }
    })
})
</script>

<template>
  <AppShell>
    <div class="converter-page fade-in">
      <div v-if="ratesStale" class="stale-banner" role="status">
        <span class="stale-dot" aria-hidden="true"></span>
        <div class="stale-text">
          <strong>Exchange rates may be out of date</strong>
          <span>Last updated {{ currencyStore.lastFetched ? new Date(currencyStore.lastFetched).toLocaleString() : 'never' }}. Refresh to pull fresh rates.</span>
        </div>
        <button class="stale-refresh" :disabled="currencyStore.loading" @click="hardRefresh">
          {{ currencyStore.loading ? 'Refreshing…' : 'Hard refresh' }}
        </button>
      </div>

      <div class="converter-grid">
        <div class="card converter-card">
          <div class="converter-head">
            <h3>Convert</h3>
          </div>

          <div class="converter-layout">
            <div class="currency-panel">
              <label class="panel-label" for="converter-amount">From</label>
              <div class="panel-input-group">
                <input
                  id="converter-amount"
                  v-model.number="amount"
                  type="number"
                  step="0.01"
                  inputmode="decimal"
                  class="amount-input num"
                  placeholder="Amount"
                />
                <select v-model="fromCurrency" class="currency-select" aria-label="From currency">
                  <option v-for="c in currenciesStore.currencies" :key="c.code" :value="c.code">{{ c.code }}</option>
                </select>
              </div>
              <span class="panel-hint num">{{ fromSymbol }}{{ amount || 0 }} {{ fromCurrency }}</span>
            </div>

            <div class="swap-section">
              <button class="swap-btn" @click="swap" title="Swap currencies" aria-label="Swap currencies">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M8 4v16" />
                  <path d="M4 8l4-4 4 4" />
                  <path d="M16 20V4" />
                  <path d="M20 16l-4 4-4-4" />
                </svg>
              </button>
            </div>

            <div class="currency-panel currency-panel--result">
              <label class="panel-label" for="converter-result">To</label>
              <div class="panel-input-group">
                <input
                  id="converter-result"
                  :value="converted !== null ? converted.toFixed(2) : '...'"
                  readonly
                  class="amount-input result-input num"
                />
                <select v-model="toCurrency" class="currency-select" aria-label="To currency">
                  <option v-for="c in currenciesStore.currencies" :key="c.code" :value="c.code">{{ c.code }}</option>
                </select>
              </div>
              <span class="panel-hint num">{{ toSymbol }}{{ converted !== null ? converted.toFixed(2) : '...' }} {{ toCurrency }}</span>
            </div>
          </div>

          <div class="rate-footer">
            <CandleLoader v-if="currencyStore.loading" size="sm" />
            <template v-else>
              <span v-if="currencyStore.lastFetched" class="rate-updated">
                Last updated {{ new Date(currencyStore.lastFetched).toLocaleString() }}
              </span>
              <button class="refresh-btn" @click="refresh" :disabled="currencyStore.loading">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M23 4v6h-6M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                </svg>
                {{ currencyStore.loading ? 'Refreshing...' : 'Refresh' }}
              </button>
            </template>
          </div>
        </div>

        <div class="card rate-grid-card">
          <div class="rate-grid-header">
            <h3>Rates</h3>
            <span v-if="currenciesStore.defaultCurrency" class="rate-base">Base {{ currenciesStore.defaultCurrency.code }}</span>
          </div>
          <div v-if="ratePairs.length" class="rate-list">
            <div v-for="r in ratePairs" :key="r.code" class="rate-row">
              <span class="rate-symbol">{{ r.symbol }}</span>
              <div class="rate-meta">
                <span class="rate-code">{{ r.code }}</span>
                <span class="rate-name">{{ r.name || lookupCurrency(r.code)?.name || r.code }}</span>
              </div>
              <div class="rate-values">
                <span class="rate-per num">
                  {{ r.per != null ? r.per.toFixed(4) : '—' }}
                  <span class="rate-unit">{{ r.base || currenciesStore.defaultCurrency?.code }}</span>
                </span>
                <span class="rate-inv num">1 {{ r.base || currenciesStore.defaultCurrency?.code }} = {{ r.inv != null ? r.inv.toFixed(4) : '—' }} {{ r.code }}</span>
              </div>
            </div>
          </div>
          <p v-else class="rate-empty">Add more currencies below to see cross-rates.</p>
        </div>

        <div class="card manage-card">
          <div class="manage-header">
            <h3>Manage currencies</h3>
            <p class="manage-hint">Currencies you add here become available across accounts, transactions, subscriptions, and the converter.</p>
          </div>

          <div class="manage-split">
            <div class="manage-search">
              <label class="manage-section-label" for="converter-add">Add a currency</label>
              <div class="add-row">
                <select id="converter-add" v-model="newCode" class="currency-select add-select">
                  <option value="" disabled>Select currency to add…</option>
                  <option v-for="c in availableToAdd" :key="c.code" :value="c.code">
                    {{ c.code }} — {{ c.name }}
                  </option>
                </select>
                <button class="btn-primary add-btn" :disabled="adding || !newCode" @click="handleAdd">{{ adding ? 'Adding…' : 'Add' }}</button>
              </div>
              <p v-if="addError" class="form-error">{{ addError }}</p>
            </div>

            <div class="manage-list-pane">
              <span class="manage-section-label">Your currencies</span>
              <div v-if="currenciesStore.currencies.length" class="currency-list">
                <div v-for="c in currenciesStore.currencies" :key="c.id" class="currency-row">
                  <div class="currency-row-left">
                    <span class="currency-symbol">{{ c.symbol }}</span>
                    <div class="currency-meta">
                      <span class="currency-code">{{ c.code }}</span>
                      <span class="currency-name">{{ c.name || lookupCurrency(c.code)?.name || '—' }}</span>
                    </div>
                  </div>
                  <div class="currency-row-right">
                    <button
                      class="btn-action default-btn"
                      :class="{ active: c.is_default }"
                      @click="handleSetDefault(c.code)"
                    >{{ c.is_default ? 'Default' : 'Set default' }}</button>
                    <button
                      class="btn-action btn-action-danger"
                      :disabled="c.is_default && currenciesStore.currencies.length === 1"
                      @click="deletingId = c.id"
                    >Remove</button>
                  </div>
                </div>
              </div>
              <p v-else class="rate-empty">No currencies yet — add one on the left.</p>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        v-if="deletingId"
        title="Remove currency"
        message="Existing data using this currency will keep its code but won't auto-convert anymore. Continue?"
        @confirm="handleDelete"
        @cancel="deletingId = null"
      />
    </div>
  </AppShell>
</template>

<style scoped>
.converter-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}

.converter-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-areas:
    "converter rates"
    "manage    manage";
  gap: 20px;
  align-items: start;
}

.converter-card {
  grid-area: converter;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  border-radius: var(--radius-lg);
  background: var(--bg-accent), var(--bg-secondary);
  min-width: 0;
}

.rate-grid-card {
  grid-area: rates;
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.manage-card {
  grid-area: manage;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

@media (max-width: 900px) {
  .converter-grid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "converter" "rates" "manage";
  }
}

.converter-head h3,
.rate-grid-header h3,
.manage-header h3 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
}

/* Converter: two inset tiles with a round swap button between them. */
.converter-layout {
  display: flex;
  flex-direction: column;
}

.currency-panel {
  min-width: 0;
  padding: 16px 18px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  transition: box-shadow var(--transition);
}

.currency-panel:not(.currency-panel--result):focus-within {
  box-shadow: inset 0 0 0 1.5px var(--accent), 0 0 0 4px var(--accent-dim);
}

.panel-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.panel-input-group {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.panel-hint {
  display: block;
  margin-top: 4px;
  font-size: 0.78rem;
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.amount-input,
.amount-input:focus {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  font-size: clamp(1.6rem, 7vw, 2.2rem);
  font-weight: 600;
  line-height: 1.2;
  color: var(--text-primary);
}

/* Hide the number spinners; the big figure reads cleaner without them. */
.amount-input::-webkit-outer-spin-button,
.amount-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.amount-input[type="number"] {
  -moz-appearance: textfield;
  appearance: textfield;
}

.result-input,
.result-input:focus {
  color: var(--accent);
  cursor: default;
}

.currency-select {
  width: auto;
  min-width: 92px;
  flex-shrink: 0;
  padding: 9px 34px 9px 16px;
  border: 0;
  border-radius: var(--radius-pill);
  background-color: var(--bg-secondary);
  font-weight: 700;
}

.swap-section {
  display: flex;
  justify-content: center;
  margin: -8px 0;
  position: relative;
  z-index: 1;
}

.swap-btn {
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 50%;
  border: 0;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--accent-ink);
  /* Card-coloured ring so the button reads as sitting between the tiles. */
  box-shadow: 0 0 0 4px var(--bg-secondary);
  flex-shrink: 0;
}

.swap-btn:hover {
  background: var(--accent-hover);
}

.swap-btn svg {
  transition: transform var(--transition);
}

.swap-btn:hover svg {
  transform: rotate(180deg);
}

.rate-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px 12px;
  flex-wrap: wrap;
}

.rate-updated {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.refresh-btn {
  margin-left: auto;
  padding: 8px 16px;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 0;
}

.refresh-btn:hover {
  color: var(--accent);
  background: var(--accent-dim);
}

/* Rates: clean rows */
.rate-grid-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.rate-base {
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-dim);
  white-space: nowrap;
}

.rate-list {
  display: flex;
  flex-direction: column;
}

.rate-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  min-width: 0;
}

.rate-row + .rate-row {
  border-top: 1px solid var(--border-color);
}

.rate-symbol,
.currency-symbol {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--accent);
  background: var(--accent-dim);
  overflow: hidden;
}

.rate-meta,
.currency-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
}

.rate-code,
.currency-code {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-primary);
}

.rate-name,
.currency-name {
  font-size: 0.78rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rate-values {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  flex-shrink: 0;
  text-align: right;
}

.rate-per {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.rate-unit {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
}

.rate-inv {
  font-size: 0.74rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.rate-empty {
  color: var(--text-muted);
  font-size: 0.88rem;
  margin: 0;
}

/* Manage */
.manage-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.manage-hint {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0;
}

.manage-split {
  display: grid;
  grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

.manage-search,
.manage-list-pane {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.manage-section-label {
  display: block;
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.add-row {
  display: flex;
  gap: 10px;
  align-items: stretch;
}

.add-select {
  flex: 1;
  min-width: 0;
  width: auto;
  padding: 11px 38px 11px 16px;
  background-color: var(--bg-elevated);
  font-weight: 600;
  text-align: left;
}

.add-btn {
  flex-shrink: 0;
}

.currency-list {
  display: flex;
  flex-direction: column;
  padding: 4px 16px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
}

.currency-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 12px;
  padding: 12px 0;
  min-width: 0;
}

.currency-row + .currency-row {
  border-top: 1px solid var(--border-color);
}

.currency-row-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1 1 160px;
  min-width: 0;
}

.currency-row-right {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  flex-shrink: 0;
}

.btn-action {
  padding: 6px 14px;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-secondary);
  background: var(--bg-surface);
  border: 0;
}

.default-btn.active,
.default-btn.active:hover {
  color: var(--accent);
  background: var(--accent-dim);
}

.btn-action-danger {
  color: var(--expense);
  background: transparent;
}

.btn-action-danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--expense) 12%, transparent);
}

.btn-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.form-error {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--expense) 12%, transparent);
  color: var(--expense);
  font-weight: 600;
  font-size: 0.85rem;
}

/* Stale-rates banner: soft warning tint */
.stale-banner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px 14px;
  padding: 14px 18px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--warning) 10%, var(--bg-secondary));
  border: 1px solid color-mix(in srgb, var(--warning) 22%, transparent);
}

.stale-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--warning);
  flex-shrink: 0;
}

.stale-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 220px;
  min-width: 0;
}

.stale-text strong {
  color: var(--warning);
  font-weight: 700;
  font-size: 0.92rem;
}

.stale-text span {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.stale-refresh {
  padding: 8px 16px;
  font-size: 0.82rem;
  white-space: nowrap;
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 16%, transparent);
  border: 0;
}

.stale-refresh:hover {
  background: color-mix(in srgb, var(--warning) 24%, transparent);
}

@media (max-width: 720px) {
  .manage-split {
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
  }
}

@media (max-width: 600px) {
  .converter-card,
  .rate-grid-card,
  .manage-card {
    padding: 18px 16px;
  }

  .currency-panel {
    padding: 14px 16px;
  }

  .add-row {
    flex-direction: column;
  }

  .currency-list {
    padding: 2px 14px;
  }

  /* Actions drop under the name on phones. */
  .currency-row-right {
    width: 100%;
    justify-content: flex-end;
  }
}

@media (prefers-reduced-motion: reduce) {
  .swap-btn:hover svg {
    transform: none;
  }
}
</style>
