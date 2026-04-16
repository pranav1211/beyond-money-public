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
        <h3 class="card-title">Create Label</h3>
        <div class="add-form">
          <input
            v-model="newName"
            placeholder="Label name"
            class="add-input"
            @keyup.enter="addLabel"
          />
          <input v-model="newColor" type="color" class="color-input" />
          <button class="btn-primary" @click="addLabel">Add Label</button>
        </div>
      </div>

      <EmptyState
        v-if="!labelsStore.labels.length && !labelsStore.loading"
        title="No labels"
        message="Create labels to tag your transactions."
      />

      <div v-if="labelsStore.labels.length" class="card labels-card">
        <h3 class="card-title">Your Labels</h3>
        <div class="labels-grid">
          <div
            v-for="label in labelsStore.labels"
            :key="label.id"
            class="label-item"
          >
            <template v-if="editingId === label.id">
              <div class="edit-form">
                <input v-model="editName" class="edit-input" />
                <input v-model="editColor" type="color" class="color-input" />
                <div class="edit-actions">
                  <button class="btn-primary btn-sm" @click="saveEdit">Save</button>
                  <button class="btn-sm" @click="editingId = null">Cancel</button>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="label-display">
                <span class="color-swatch" :style="{ background: label.color }"></span>
                <span class="label-name">{{ label.name }}</span>
              </div>
              <div class="label-actions">
                <button class="btn-sm" @click="startEdit(label)">Edit</button>
                <button class="btn-sm btn-danger" @click="deletingId = label.id">Delete</button>
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
  gap: 24px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-title {
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.add-card {
  padding: 24px;
}

.card-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
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

.color-input {
  width: 44px;
  height: 40px;
  padding: 4px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  cursor: pointer;
}

.labels-card {
  padding: 24px;
}

.labels-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.label-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  transition: background var(--transition);
}

.label-item:hover {
  background: var(--bg-surface);
}

.label-display {
  display: flex;
  align-items: center;
  gap: 12px;
}

.color-swatch {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  flex-shrink: 0;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1);
}

.label-name {
  font-weight: 500;
  font-size: 0.95rem;
  color: var(--text-primary);
}

.label-actions {
  display: flex;
  gap: 8px;
  opacity: 0;
  transition: opacity var(--transition);
}

.label-item:hover .label-actions {
  opacity: 1;
}

.edit-form {
  display: flex;
  align-items: center;
  gap: 12px;
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

@media (max-width: 600px) {
  .label-actions {
    opacity: 1;
  }

  .add-form {
    flex-direction: column;
    align-items: stretch;
  }

  .add-input {
    min-width: 0;
  }
}
</style>
