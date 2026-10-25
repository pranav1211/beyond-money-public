<script setup>
import { ref, onMounted } from 'vue'
import { useLabelsStore } from '../stores/labels'
import { useAuthStore } from '../stores/auth'
import AppShell from '../components/layout/AppShell.vue'
import ConfirmDialog from '../components/shared/ConfirmDialog.vue'
import EmptyState from '../components/shared/EmptyState.vue'

const labelsStore = useLabelsStore()
const auth = useAuthStore()

const newName = ref('')
const newColor = ref('#2196F3')
const editingId = ref(null)
const editName = ref('')
const editColor = ref('')
const deletingId = ref(null)

onMounted(() => {
  labelsStore.fetchLabels()
})

async function addLabel() {
  if (!newName.value.trim()) return
  await labelsStore.addLabel({
    name: newName.value.trim(),
    color: newColor.value,
    user_id: auth.user.id,
  })
  newName.value = ''
  newColor.value = '#2196F3'
}

function startEdit(label) {
  editingId.value = label.id
  editName.value = label.name
  editColor.value = label.color
}

async function saveEdit() {
  await labelsStore.updateLabel(editingId.value, {
    name: editName.value,
    color: editColor.value,
  })
  editingId.value = null
}

async function confirmDelete() {
  await labelsStore.deleteLabel(deletingId.value)
  deletingId.value = null
}
</script>

<template>
  <AppShell>
    <div class="labels-page fade-in">
      <header class="page-header">
        <h2 class="page-title">Labels</h2>
      </header>

      <div class="card add-card">
        <h3 class="card-title">New label</h3>
        <div class="add-form">
          <input
            v-model="newName"
            placeholder="Label name"
            class="add-input"
            @keyup.enter="addLabel"
          />
          <input v-model="newColor" type="color" class="color-input" aria-label="Label colour" />
          <button class="btn-primary add-btn" @click="addLabel">Add label</button>
        </div>
      </div>

      <EmptyState
        v-if="!labelsStore.labels.length && !labelsStore.loading"
        title="No labels"
        message="Create labels to tag your transactions."
      />

      <div v-if="labelsStore.labels.length" class="card labels-card">
        <div class="section-header">
          <h3 class="section-title">Your labels</h3>
          <span class="section-count">{{ labelsStore.labels.length }}</span>
        </div>
        <div class="labels-grid">
          <div
            v-for="label in labelsStore.labels"
            :key="label.id"
            class="label-item"
            :style="{ '--c': label.color }"
          >
            <template v-if="editingId === label.id">
              <div class="edit-form">
                <input v-model="editName" class="edit-input" aria-label="Label name" />
                <input v-model="editColor" type="color" class="color-input" aria-label="Label colour" />
                <div class="edit-actions">
                  <button class="btn-sm btn-ghost" @click="editingId = null">Cancel</button>
                  <button class="btn-primary btn-sm" @click="saveEdit">Save</button>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="label-display">
                <span class="label-chip">
                  <span class="color-swatch"></span>
                  <span class="label-name">{{ label.name }}</span>
                </span>
              </div>
              <div class="label-actions">
                <button class="icon-btn" title="Edit" aria-label="Edit" @click="startEdit(label)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </button>
                <button class="icon-btn icon-btn--danger" title="Delete" aria-label="Delete" @click="deletingId = label.id">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>

      <ConfirmDialog
        v-if="deletingId"
        title="Delete Label"
        message="Are you sure you want to delete this label?"
        @confirm="confirmDelete"
        @cancel="deletingId = null"
      />
    </div>
  </AppShell>
</template>

<style scoped>
.labels-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-title {
  font-size: 1.6rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.add-card,
.labels-card {
  padding: 24px;
  min-width: 0;
}

.card-title,
.section-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-primary);
}

.card-title {
  margin-bottom: 16px;
}

.add-form {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.add-input {
  flex: 1;
  min-width: 200px;
}

.add-btn {
  min-height: 48px;
}

.color-input {
  width: 52px;
  min-width: 52px;
  height: 48px;
  padding: 6px;
  border-radius: var(--radius-sm);
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

.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.section-title {
  flex: 1;
}

.section-count {
  padding: 3px 11px;
  border-radius: var(--radius-pill);
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-dim);
}

.labels-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.label-item {
  --c: var(--accent);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 10px 10px 14px;
  min-width: 0;
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  transition: background-color var(--transition);
}

.label-item:hover {
  background: var(--bg-surface);
}

.label-display {
  display: flex;
  align-items: center;
  min-width: 0;
}

.label-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 5px 13px 5px 11px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--c) 16%, transparent);
}

.color-swatch {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--c);
}

.label-name {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.label-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.icon-btn {
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
}

.icon-btn:hover {
  color: var(--accent);
  background: var(--accent-dim);
}

.icon-btn--danger:hover {
  color: var(--expense);
  background: color-mix(in srgb, var(--expense) 12%, transparent);
}

.edit-form {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  flex-wrap: wrap;
}

.edit-input {
  flex: 1;
  min-width: 160px;
}

.edit-actions {
  display: flex;
  gap: 8px;
}

.btn-sm {
  padding: 9px 18px;
  font-size: 0.85rem;
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
}

.btn-ghost:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

@media (max-width: 768px) {
  .add-card,
  .labels-card {
    padding: 18px;
  }

  .add-form {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr);
  }

  .add-input {
    grid-column: 1 / -1;
    min-width: 0;
  }

  .edit-input {
    flex-basis: 100%;
    min-width: 0;
  }

  .edit-actions {
    flex: 1;
  }

  .edit-actions button {
    flex: 1;
  }
}
</style>
