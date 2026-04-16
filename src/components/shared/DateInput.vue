<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  required: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const nativeRef = ref(null)

// yyyy-mm-dd → dd/mm/yyyy
function toDisplay(iso) {
  if (!iso) return ''
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

// dd/mm/yyyy → yyyy-mm-dd (strict: only converts if year is 4 digits)
function toISO(display) {
  if (!display) return ''
  const parts = display.split('/')
  if (parts.length !== 3) return ''
  const [dd, mm, yyyy] = parts
  if (!dd || !mm || !yyyy || yyyy.length !== 4) return ''
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}

// Normalize short years: 26 → 2026
function normalizeYear(display) {
  if (!display) return display
  const parts = display.split('/')
  if (parts.length !== 3) return display
  let [dd, mm, yyyy] = parts
  if (!yyyy) return display
  if (yyyy.length <= 2) yyyy = '20' + yyyy.padStart(2, '0')
  else if (yyyy.length === 3) yyyy = '2' + yyyy
  if (yyyy.length !== 4) return display
  return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`
}

const displayValue = ref(toDisplay(props.modelValue))
const focused = ref(false)

watch(() => props.modelValue, (val) => {
  if (focused.value) return
  const newDisplay = toDisplay(val)
  if (newDisplay !== displayValue.value) {
    displayValue.value = newDisplay
  }
})

function onFocus() {
  focused.value = true
}

function onTextInput(e) {
  displayValue.value = e.target.value
  const iso = toISO(e.target.value)
  if (iso) {
    emit('update:modelValue', iso)
  } else if (!e.target.value) {
    emit('update:modelValue', '')
  }
}

function onBlur() {
  focused.value = false
  // Normalize short year then sync display from model
  const normalized = normalizeYear(displayValue.value)
  const iso = toISO(normalized)
  if (iso) {
    emit('update:modelValue', iso)
    displayValue.value = toDisplay(iso)
  }
}

function onCalendarChange(e) {
  const iso = e.target.value
  emit('update:modelValue', iso)
  displayValue.value = toDisplay(iso)
}

function openPicker() {
  nativeRef.value?.showPicker?.()
}
</script>

<template>
  <div class="date-input-wrap">
    <input
      type="text"
      :value="displayValue"
      @input="onTextInput"
      @focus="onFocus"
      @blur="onBlur"
      placeholder="dd/mm/yyyy"
      inputmode="numeric"
      :required="required"
      class="date-text"
    />
    <button type="button" class="picker-btn" @click="openPicker" aria-label="Open calendar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    </button>
    <input
      ref="nativeRef"
      type="date"
      :value="modelValue"
      @input="onCalendarChange"
      class="date-native"
      tabindex="-1"
    />
  </div>
</template>

<style scoped>
.date-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.date-text {
  width: 100%;
  padding-right: 38px;
}

.picker-btn {
  position: absolute;
  right: 6px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.picker-btn:hover {
  color: var(--text-primary);
  background: var(--bg-elevated);
}

.date-native {
  position: absolute;
  right: 0;
  top: 0;
  width: 0;
  height: 0;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  color-scheme: dark;
}

:root[data-theme='light'] .date-native {
  color-scheme: light;
}
</style>
