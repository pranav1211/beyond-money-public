<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
})

const emit = defineEmits(['update:modelValue'])

const displayValue = ref(formatNumber(props.modelValue))

function formatNumber(num) {
  if (!num && num !== 0) return ''
  return Number(num).toLocaleString('en-IN')
}

function onInput(e) {
  const raw = e.target.value.replace(/,/g, '')
  const num = parseFloat(raw)
  if (!isNaN(num)) {
    emit('update:modelValue', num)
  } else if (raw === '' || raw === '-') {
    emit('update:modelValue', 0)
  }
}

function onBlur() {
  displayValue.value = formatNumber(props.modelValue)
}

function onFocus() {
  displayValue.value = props.modelValue ? String(props.modelValue) : ''
}

watch(() => props.modelValue, (val) => {
  if (document.activeElement !== document.querySelector('.currency-input-field')) {
    displayValue.value = formatNumber(val)
  }
})
</script>

<template>
  <div class="currency-input-wrapper">
    <span class="currency-symbol">{{ currency === 'INR' ? '₹' : '$' }}</span>
    <input
      type="text"
      class="currency-input-field"
      :value="displayValue"
      @input="onInput"
      @blur="onBlur"
      @focus="onFocus"
    />
  </div>
</template>

<style scoped>
.currency-input-wrapper {
  display: flex;
  align-items: center;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  overflow: hidden;
  transition: border-color var(--transition), box-shadow var(--transition), background-color var(--transition);
}

.currency-input-wrapper:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-dim);
  background: var(--bg-surface);
}

.currency-symbol {
  padding: 12px 0 12px 16px;
  color: var(--text-muted);
  font-family: var(--font-display);
  font-size: 0.95rem;
  font-weight: 600;
  user-select: none;
  flex-shrink: 0;
}

/* The wrapper owns the border and focus ring; the field itself stays flat
   so the global input/focus styles don't draw a second box inside it. */
.currency-input-field,
.currency-input-field:focus {
  flex: 1;
  min-width: 0;
  padding: 12px 16px 12px 6px;
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  font-size: 0.95rem;
  font-weight: 600;
  outline: none;
  width: 100%;
}

.currency-input-field::placeholder {
  color: var(--text-muted);
}
</style>
