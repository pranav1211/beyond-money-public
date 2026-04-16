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
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  overflow: hidden;
  transition: border-color var(--transition), box-shadow var(--transition);
}

.currency-input-wrapper:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-dim);
}

.currency-symbol {
  padding: 10px 0 10px 14px;
  color: var(--text-muted);
  font-size: 0.95rem;
  font-weight: 600;
  user-select: none;
  flex-shrink: 0;
}

.currency-input-field {
  flex: 1;
  padding: 10px 14px 10px 6px;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
  outline: none;
  width: 100%;
}

.currency-input-field::placeholder {
  color: var(--text-muted);
}
</style>
