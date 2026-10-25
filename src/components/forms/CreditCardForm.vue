<script setup>
import { computed, onMounted, ref } from 'vue'
import DateInput from '../shared/DateInput.vue'
import MonthInput from '../shared/MonthInput.vue'
import { useCurrenciesStore } from '../../stores/currencies'
import { useSubmitGuard } from '../../composables/useSubmitGuard'
import { defaultCurrencyCode } from '../../lib/money'

const props = defineProps({
  card: { type: Object, default: null },
})

const emit = defineEmits(['submit', 'cancel'])

const currenciesStore = useCurrenciesStore()
const { submitting, run: guardSubmit } = useSubmitGuard()

const form = ref({
  name: '',
  bank: '',
  last_four: '',
  credit_limit: 0,
  prepaid_amount: 0,
  currency: defaultCurrencyCode(),
  expiry_month: '',
  due_date: '',
})

const canSubmit = computed(() => form.value.name.trim() && form.value.bank.trim() && /^\d{4}$/.test(form.value.last_four))

onMounted(async () => {
  await currenciesStore.fetchCurrencies()
  if (props.card) {
    form.value = {
      name: props.card.name || '',
      bank: props.card.bank || '',
      last_four: props.card.last_four || '',
      credit_limit: props.card.credit_limit || 0,
      prepaid_amount: props.card.prepaid_amount || 0,
      currency: props.card.currency || defaultCurrencyCode(),
      expiry_month: props.card.expiry_month || '',
      due_date: props.card.due_date || '',
    }
  }
})

function handleSubmit() {
  if (submitting.value || !canSubmit.value) return
  guardSubmit(() => emit('submit', {
    ...form.value,
    name: form.value.name.trim(),
    bank: form.value.bank.trim(),
    last_four: form.value.last_four.trim(),
  }))
}
</script>

<template>
  <form class="cc-form" @submit.prevent="handleSubmit">
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Card Name</label>
        <input v-model="form.name" class="form-input" required />
      </div>
      <div class="form-group">
        <label class="form-label">Bank</label>
        <input v-model="form.bank" class="form-input" required />
      </div>
      <div class="form-group">
        <label class="form-label">Last Four Digits</label>
        <input v-model="form.last_four" maxlength="4" pattern="\d{4}" class="form-input" required />
      </div>
      <div class="form-group">
        <label class="form-label">Expiry (MM/YYYY)</label>
        <MonthInput v-model="form.expiry_month" class="form-input" />
      </div>
      <div class="form-group">
        <label class="form-label">Credit Limit</label>
        <input v-model.number="form.credit_limit" type="number" min="0" step="0.01" class="form-input" />
      </div>
      <div class="form-group">
        <label class="form-label">Paid Toward Current Bill</label>
        <input v-model.number="form.prepaid_amount" type="number" min="0" step="0.01" class="form-input" />
        <span class="form-hint">A partial or early payment already made. It only changes the displayed amount due.</span>
      </div>
      <div class="form-group">
        <label class="form-label">Currency</label>
        <select v-model="form.currency" class="form-input">
          <option v-for="c in currenciesStore.currencies" :key="c.code" :value="c.code">{{ c.code }} ({{ c.symbol }})</option>
        </select>
      </div>
      <div class="form-group form-group--wide">
        <label class="form-label">Payment Due Date</label>
        <DateInput v-model="form.due_date" />
      </div>
    </div>

    <div class="form-actions">
      <button type="button" class="btn-cancel" @click="emit('cancel')">Cancel</button>
      <button type="submit" class="btn-primary" :disabled="!canSubmit || submitting">{{ card ? 'Update Card' : 'Save Card' }}</button>
    </div>
  </form>
</template>

<style scoped>
.cc-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.form-group--wide {
  grid-column: span 2;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.form-hint {
  display: block;
  margin-top: 5px;
  font-size: 0.75rem;
  line-height: 1.35;
  color: var(--text-muted);
}

@media (max-width: 600px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-group--wide {
    grid-column: span 1;
  }
}
</style>
