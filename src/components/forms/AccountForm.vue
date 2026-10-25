<script setup>
import { ref, onMounted } from 'vue'
import { useCurrenciesStore } from '../../stores/currencies'

const props = defineProps({
  account: { type: Object, default: null },
})

const emit = defineEmits(['submit', 'cancel'])

const currenciesStore = useCurrenciesStore()

const form = ref({
  name: '',
  type: 'savings',
  currency: 'INR',
  current_balance: 0,
  is_active: true,
})

onMounted(async () => {
  await currenciesStore.fetchCurrencies()
  if (props.account) {
    form.value = { ...props.account }
  } else {
    form.value.currency = currenciesStore.defaultCurrency?.code || 'INR'
  }
})

function handleSubmit() {
  emit('submit', { ...form.value })
}
</script>

<template>
  <form class="account-form" @submit.prevent="handleSubmit">
    <div class="form-grid">
      <div class="field field--wide">
        <label for="account-name">Name</label>
        <input id="account-name" v-model="form.name" placeholder="e.g. Main savings" required />
      </div>

      <div class="field">
        <label for="account-type">Type</label>
        <select id="account-type" v-model="form.type">
          <option value="savings">Savings</option>
          <option value="cash">Cash</option>
          <option value="wallet">Wallet</option>
        </select>
      </div>

      <div class="field">
        <label for="account-currency">Currency</label>
        <select id="account-currency" v-model="form.currency">
          <option v-for="c in currenciesStore.currencies" :key="c.code" :value="c.code">
            {{ c.code }} ({{ c.symbol }})
          </option>
        </select>
      </div>

      <div class="field field--wide">
        <label for="account-balance">Current balance</label>
        <div class="amount-wrap">
          <span class="currency-mark">{{ currenciesStore.symbolOf(form.currency) }}</span>
          <input id="account-balance" v-model.number="form.current_balance" type="number" step="0.01" inputmode="decimal" placeholder="0.00" />
        </div>
      </div>

      <label class="toggle-row field--wide">
        <span class="toggle-copy">
          <span class="toggle-title">Active</span>
          <span class="toggle-hint">Turn off for accounts you no longer use</span>
        </span>
        <input v-model="form.is_active" type="checkbox" class="switch" role="switch" />
      </label>
    </div>

    <div class="form-actions">
      <button type="submit" class="btn-primary">{{ account ? 'Update' : 'Add' }} account</button>
      <button type="button" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>

<style scoped>
.account-form {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px 16px;
}

.field {
  min-width: 0;
}

.field--wide {
  grid-column: 1 / -1;
}

/* Balance reads like the transaction amount: currency mark + Sora figure. */
.amount-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  transition: border-color var(--transition), box-shadow var(--transition);
}

.amount-wrap:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-dim);
}

.amount-wrap input {
  min-width: 0;
  padding: 10px 0;
  border: none;
  background: transparent;
  box-shadow: none;
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  font-size: 1.4rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.amount-wrap input:focus {
  box-shadow: none;
  background: transparent;
}

.currency-mark {
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text-muted);
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 0;
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  cursor: pointer;
  user-select: none;
}

.toggle-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.toggle-title {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--text-primary);
}

.toggle-hint {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-muted);
}

/* Pill switch drawn on the native checkbox, so v-model and keyboard work as-is. */
.switch {
  appearance: none;
  position: relative;
  flex-shrink: 0;
  width: 44px;
  min-width: 44px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--bg-surface);
  box-shadow: inset 0 0 0 1px var(--border-light);
  cursor: pointer;
  transition: background-color var(--transition), box-shadow var(--transition);
}

.switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: transform var(--transition), background-color var(--transition);
}

.switch:checked {
  background: var(--accent);
  box-shadow: none;
}

.switch:checked::after {
  transform: translateX(18px);
  background: var(--accent-ink);
}

.switch:focus,
.switch:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px var(--accent-dim);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.form-actions .btn-primary {
  min-width: 160px;
}

@media (max-width: 380px) {
  .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 480px) {
  .form-actions {
    flex-direction: column;
  }
}
</style>
