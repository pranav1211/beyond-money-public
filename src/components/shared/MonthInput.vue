<script setup>
import { ref, watch, onMounted } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' }, // YYYY-MM format
  placeholder: { type: String, default: 'MM/YYYY' },
})

const emit = defineEmits(['update:modelValue'])

const display = ref('')

function isoToDisplay(iso) {
  if (!iso) return ''
  const parts = iso.split('-')
  if (parts.length !== 2) return iso
  return `${parts[1]}/${parts[0]}`
}

function displayToIso(val) {
  if (!val) return ''
  const parts = val.split('/')
  if (parts.length !== 2) return ''
  const [mm, yyyy] = parts
  if (mm.length !== 2 || yyyy.length !== 4) return ''
  const m = Number(mm)
  if (m < 1 || m > 12) return ''
  return `${yyyy}-${mm}`
}

onMounted(() => {
  display.value = isoToDisplay(props.modelValue)
})

watch(() => props.modelValue, (v) => {
  const expected = isoToDisplay(v)
  if (display.value !== expected) display.value = expected
})

function onInput(e) {
  let val = e.target.value
  const digits = val.replace(/\D/g, '')
  if (digits.length >= 2 && !val.includes('/')) {
    val = digits.slice(0, 2) + '/' + digits.slice(2, 6)
  }
  display.value = val

  const iso = displayToIso(val)
  if (iso) {
    emit('update:modelValue', iso)
  } else if (val === '') {
    emit('update:modelValue', '')
  }
}

function onBlur() {
  const iso = displayToIso(display.value)
  if (iso) {
    display.value = isoToDisplay(iso)
  }
}
</script>

<template>
  <input
    :value="display"
    @input="onInput"
    @blur="onBlur"
    :placeholder="placeholder"
    maxlength="7"
    inputmode="numeric"
  />
</template>
