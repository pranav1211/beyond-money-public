<script setup>
const emit = defineEmits(['close'])
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="emit('close')">
      <div class="modal-content">
        <button class="modal-close" @click="emit('close')">&times;</button>
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 8, 16, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.modal-content {
  position: relative;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 28px;
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
}

.modal-content :slotted(h3) {
  font-size: 1.2rem;
  margin-bottom: 18px;
  padding-right: 44px;
}

.modal-close {
  position: absolute;
  top: 18px;
  right: 18px;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  padding: 0;
  background: var(--bg-elevated);
  border: 0;
  border-radius: 50%;
  color: var(--text-secondary);
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
}

.modal-close:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
}

/* Phones: a bottom sheet that rises from the thumb zone. */
@media (max-width: 600px) {
  .modal-backdrop {
    align-items: flex-end;
    padding: 0;
  }

  .modal-content {
    max-width: 100%;
    max-height: 92vh;
    padding: 24px 18px calc(24px + env(safe-area-inset-bottom, 0px));
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    border-bottom: 0;
  }

  .modal-content::before {
    content: '';
    display: block;
    width: 40px;
    height: 4px;
    margin: -10px auto 14px;
    border-radius: var(--radius-pill);
    background: var(--border-light);
  }
}
</style>
