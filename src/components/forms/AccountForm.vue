<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  account: { type: Object, default: null },
})

const emit = defineEmits(['submit', 'cancel'])

const form = ref({
  name: '',
  type: 'savings',
  currency: 'INR',
  current_balance: 0,
  is_active: true,
})

onMounted(() => {
  if (props.account) {
    form.value = { ...props.account }
  }
})

function handleSubmit() {
  emit('submit', { ...form.value })
}
</script>

<template>
  <form class="account-form" @submit.prevent="handleSubmit">
    <div class="form-group">
      <label class="form-label">Name</label>
      <input v-model="form.name" class="form-input" required />
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Type</label>
        <select v-model="form.type" class="form-input">
          <option value="savings">Savings</option>
          <option value="cash">Cash</option>
          <option value="wallet">Wallet</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Currency</label>
        <select v-model="form.currency" class="form-input">
          <option value="INR">INR</option>
          <option value="USD">USD</option>
        </select>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Current Balance</label>
      <input v-model.number="form.current_balance" type="number" step="0.01" class="form-input" />
    </div>

    <div class="form-group">
      <label class="checkbox-label">
        <input v-model="form.is_active" type="checkbox" class="form-checkbox" />
        <span class="checkbox-text">Active</span>
      </label>
    </div>

    <div class="form-actions">
      <button type="submit" class="btn-primary">{{ account ? 'Update' : 'Add' }} Account</button>
      <button type="button" class="btn-cancel" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>

<style scoped>
.account-form {
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

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  margin: 0;
}

.form-checkbox {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
  cursor: pointer;
}

.checkbox-text {
  font-size: 0.9rem;
  color: var(--text-primary);
  font-weight: 500;
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
