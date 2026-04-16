<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCurrencyStore } from '../stores/currency'
import AppShell from '../components/layout/AppShell.vue'
import CandleLoader from '../components/shared/CandleLoader.vue'

const currencyStore = useCurrencyStore()

const amount = ref(1)
const fromCurrency = ref('USD')
const toCurrency = ref('INR')

onMounted(() => {
  currencyStore.fetchRate()
})

const converted = computed(() => {
  if (!currencyStore.currentRate) return null
  return currencyStore.convert(amount.value, fromCurrency.value, toCurrency.value)
})

function swap() {
  const tmp = fromCurrency.value
  fromCurrency.value = toCurrency.value
  toCurrency.value = tmp
}

async function refresh() {
  currencyStore.currentRate = null
  currencyStore.lastFetched = null
  await currencyStore.fetchRate()
}
</script>

<template>
  <AppShell>
    <div class="converter-page fade-in">
      <div class="card converter-card">
        <div class="converter-layout">
          <div class="currency-panel">
            <label class="panel-label">From</label>
            <div class="panel-input-group">
              <input
                v-model.number="amount"
                type="number"
                step="0.01"
                class="amount-input"
                placeholder="Amount"
              />
              <select v-model="fromCurrency" class="currency-select">
                <option value="INR">INR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <div class="swap-section">
            <button class="swap-btn" @click="swap" title="Swap currencies">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M7 16l-4-4 4-4" />
                <path d="M17 8l4 4-4 4" />
                <path d="M3 12h18" />
              </svg>
            </button>
          </div>

          <div class="currency-panel">
            <label class="panel-label">To</label>
            <div class="panel-input-group">
              <input
                :value="converted !== null ? converted.toFixed(2) : '...'"
                readonly
                class="amount-input result-input"
              />
              <select v-model="toCurrency" class="currency-select">
                <option value="INR">INR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div class="card rate-card">
        <CandleLoader v-if="currencyStore.loading" size="sm" />
        <template v-else>
          <div class="rate-info">
            <div v-if="currencyStore.currentRate" class="rate-main">
              <span class="rate-label">Exchange Rate</span>
              <span class="rate-value">1 USD = &#8377;{{ currencyStore.currentRate.toFixed(2) }}</span>
            </div>
            <div v-if="currencyStore.lastFetched" class="rate-updated">
              Last updated: {{ new Date(currencyStore.lastFetched).toLocaleString() }}
            </div>
          </div>
          <button class="refresh-btn" @click="refresh" :disabled="currencyStore.loading">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
            {{ currencyStore.loading ? 'Refreshing...' : 'Refresh Rate' }}
          </button>
        </template>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.converter-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 720px;
}

.converter-card {
  padding: 32px;
}

.converter-layout {
  display: flex;
  align-items: flex-end;
  gap: 16px;
}

.currency-panel {
  flex: 1;
}

.panel-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.panel-input-group {
  display: flex;
  gap: 8px;
}

.amount-input {
  flex: 1;
  font-size: 1.3rem;
  font-weight: 600;
  padding: 14px 16px;
}

.result-input {
  color: var(--accent);
  background: var(--bg-elevated);
}

.currency-select {
  width: 90px;
  font-weight: 600;
  text-align: center;
}

.swap-section {
  display: flex;
  align-items: center;
  padding-bottom: 4px;
}

.swap-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  color: var(--accent);
  cursor: pointer;
  transition: all var(--transition);
  padding: 0;
}

.swap-btn:hover {
  background: var(--accent-dim);
  border-color: var(--accent);
  transform: rotate(180deg);
}

.rate-card {
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.rate-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rate-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.rate-label {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.rate-value {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--accent);
}

.rate-updated {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition);
  font-size: 0.85rem;
  font-weight: 500;
}

.refresh-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-dim);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 600px) {
  .converter-layout {
    flex-direction: column;
    align-items: stretch;
  }

  .swap-section {
    align-self: center;
    transform: rotate(90deg);
  }

  .converter-card {
    padding: 24px 20px;
  }
}
</style>
