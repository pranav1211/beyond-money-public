<script setup>
import AppIcon from './AppIcon.vue'

defineProps({
  label: { type: String, default: 'New Transaction' },
})

const emit = defineEmits(['click'])
</script>

<template>
  <button type="button" class="txn-button" @click="emit('click')">
    <span class="txn-plus" aria-hidden="true"><AppIcon name="plus" :size="18" /></span>
    <span>{{ label }}</span>
  </button>
</template>

<style scoped>
.txn-button {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 7px 20px 7px 7px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 800;
  font-size: 0.95rem;
  box-shadow: var(--shadow-accent);
}

.txn-button:hover {
  background: var(--accent-hover);
}

.txn-plus {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--accent-ink) 14%, transparent);
}
</style>
