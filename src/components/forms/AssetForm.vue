<script setup>
import { ref, onMounted } from 'vue'
import DateInput from '../shared/DateInput.vue'

const props = defineProps({
  asset: { type: Object, default: null },
})

const emit = defineEmits(['submit', 'cancel'])

const form = ref({
  name: '',
  type: 'fd',
  principal_amount: 0,
  current_value: 0,
  interest_rate: 0,
  maturity_date: null,
  notes: '',
})

onMounted(() => {
  if (props.asset) {
    form.value = { ...props.asset }
  }
})

function handleSubmit() {
  emit('submit', { ...form.value })
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
          <option value="fd">Fixed Deposit</option>
          <option value="rd">Recurring Deposit</option>
          <option value="investment">Investment</option>
          <option value="cash">Cash</option>
          <option value="other">Other</option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Principal Amount</label>
        <input v-model.number="form.principal_amount" type="number" step="0.01" class="form-input" />
      </div>
      <div class="form-group">
        <label class="form-label">Current Value</label>
        <input v-model.number="form.current_value" type="number" step="0.01" class="form-input" />
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Interest Rate (%)</label>
        <input v-model.number="form.interest_rate" type="number" step="0.01" class="form-input" />
      </div>
      <div class="form-group">
        <label class="form-label">Maturity Date</label>
        <DateInput v-model="form.maturity_date" />
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea v-model="form.notes" class="form-input form-textarea"></textarea>
    </div>

    <div class="form-actions">
      <button type="submit" class="btn-primary">{{ asset ? 'Update' : 'Add' }} Asset</button>
      <button type="button" class="btn-cancel" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>

<style scoped>
.asset-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.form-input {
  padding: 10px 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 0.9rem;
  transition: border-color var(--transition), box-shadow var(--transition);
}

.form-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-dim);
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
}

.form-actions {
  display: flex;
  gap: 12px;
  padding-top: 8px;
}

.form-actions .btn-primary {
  padding: 10px 24px;
  background: var(--accent);
  color: #0d1117;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all var(--transition);
}

.form-actions .btn-primary:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  transform: translateY(-1px);
}

.form-actions .btn-cancel {
  padding: 10px 24px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all var(--transition);
}

.form-actions .btn-cancel:hover {
  background: var(--bg-elevated);
  border-color: var(--border-light);
  color: var(--text-primary);
}
</style>
