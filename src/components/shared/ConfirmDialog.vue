<script setup>
defineProps({
  title: { type: String, default: 'Confirm' },
  message: { type: String, default: 'Are you sure?' },
  confirmLabel: { type: String, default: 'Confirm' },
  cancelLabel: { type: String, default: 'Cancel' },
  // 'danger' for destructive actions, 'primary' for anything else.
  confirmVariant: { type: String, default: 'danger' },
})

const emit = defineEmits(['confirm', 'cancel'])
</script>

<template>
  <Teleport to="body">
    <div class="confirm-backdrop" @click.self="emit('cancel')">
      <div class="confirm-card">
        <h3 class="confirm-title">{{ title }}</h3>
        <p class="confirm-message">{{ message }}</p>
        <div class="confirm-actions">
          <button class="btn-cancel" @click="emit('cancel')">{{ cancelLabel }}</button>
          <button :class="confirmVariant === 'primary' ? 'btn-primary' : 'btn-danger'" @click="emit('confirm')">{{ confirmLabel }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 8, 16, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 24px;
}

.confirm-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 28px;
  width: 100%;
  max-width: 420px;
  box-shadow: var(--shadow-lg);
}

.confirm-title {
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.confirm-message {
  font-size: 0.92rem;
  color: var(--text-secondary);
  line-height: 1.55;
  margin-bottom: 24px;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-cancel {
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

.btn-cancel:hover {
  color: var(--text-primary);
}
</style>
