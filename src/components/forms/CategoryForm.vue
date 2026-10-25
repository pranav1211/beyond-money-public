<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  category: { type: Object, default: null },
})

const emit = defineEmits(['submit', 'cancel'])

const form = ref({
  name: '',
  type: 'expense',
  color: '#607D8B',
  icon: '',
})

onMounted(() => {
  if (props.category) {
    form.value = { ...props.category }
  }
})

function handleSubmit() {
  emit('submit', { ...form.value })
}
</script>

<template>
  <form class="category-form" @submit.prevent="handleSubmit">
    <div class="form-group">
      <label class="form-label">Name</label>
      <input v-model="form.name" class="form-input" required />
    </div>

    <div class="form-group">
      <label class="form-label">Type</label>
      <select v-model="form.type" class="form-input">
        <option value="income">Income</option>
        <option value="expense">Expense</option>
      </select>
    </div>

    <div class="form-group">
      <label class="form-label">Color</label>
      <div class="color-picker-row">
        <input v-model="form.color" type="color" class="color-input" />
        <span class="color-value">{{ form.color }}</span>
        <span class="color-preview" :style="{ background: form.color }"></span>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Icon</label>
      <input v-model="form.icon" class="form-input" placeholder="e.g. shopping, food, salary" />
    </div>

    <div class="form-actions">
      <button type="submit" class="btn-primary">{{ category ? 'Update' : 'Add' }} Category</button>
      <button type="button" class="btn-cancel" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>

<style scoped>
.category-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.form-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  margin: 0;
}

.form-input {
  min-height: 48px;
}

/* Colour field: one inset tile holding the picker, the hex value and a dot. */
.color-picker-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 6px 14px 6px 6px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
}

.color-input {
  width: 44px;
  min-width: 44px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
}

.color-input:focus {
  background: transparent;
}

.color-input::-webkit-color-swatch-wrapper {
  padding: 0;
}

.color-input::-webkit-color-swatch {
  border: none;
  border-radius: 10px;
}

.color-input::-moz-color-swatch {
  border: none;
  border-radius: 10px;
}

.color-value {
  flex: 1;
  min-width: 0;
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
}

.color-preview {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Primary action sits on the right; DOM order is unchanged. */
.form-actions {
  display: flex;
  flex-direction: row-reverse;
  justify-content: flex-start;
  gap: 10px;
  padding-top: 6px;
}

.form-actions .btn-cancel {
  background: transparent;
  color: var(--text-secondary);
}

.form-actions .btn-cancel:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

@media (max-width: 768px) {
  .form-actions button {
    flex: 1;
  }
}
</style>
