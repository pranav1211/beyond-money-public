<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  label: { type: Object, default: null },
})

const emit = defineEmits(['submit', 'cancel'])

const form = ref({
  name: '',
  color: '#2196F3',
})

onMounted(() => {
  if (props.label) {
    form.value = { ...props.label }
  }
})

function handleSubmit() {
  emit('submit', { ...form.value })
}
</script>

<template>
  <form class="label-form" @submit.prevent="handleSubmit">
    <div class="form-group">
      <label class="form-label">Name</label>
      <input v-model="form.name" class="form-input" required />
    </div>

    <div class="form-group">
      <label class="form-label">Color</label>
      <div class="color-picker-row">
        <input v-model="form.color" type="color" class="color-input" />
        <span class="color-value">{{ form.color }}</span>
        <span class="color-preview" :style="{ background: form.color }"></span>
      </div>
    </div>

    <div class="form-actions">
      <button type="submit" class="btn-primary">{{ label ? 'Update' : 'Add' }} Label</button>
      <button type="button" class="btn-cancel" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>

<style scoped>
.label-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
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

.color-picker-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.color-input {
  width: 48px;
  height: 40px;
  padding: 4px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  cursor: pointer;
  transition: border-color var(--transition);
}

.color-input:hover {
  border-color: var(--border-light);
}

.color-value {
  font-size: 0.85rem;
  color: var(--text-muted);
  font-family: monospace;
}

.color-preview {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--border-color);
  flex-shrink: 0;
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
