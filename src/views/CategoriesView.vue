<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCategoriesStore } from '../stores/categories'
import { useAuthStore } from '../stores/auth'
import AppShell from '../components/layout/AppShell.vue'
import ConfirmDialog from '../components/shared/ConfirmDialog.vue'
import EmptyState from '../components/shared/EmptyState.vue'

const categoriesStore = useCategoriesStore()
const auth = useAuthStore()

const newName = ref('')
const newType = ref('expense')
const newColor = ref('#607D8B')
const newIcon = ref('')
const editingId = ref(null)
const editName = ref('')
const editColor = ref('')
const editIcon = ref('')
const deletingId = ref(null)

const incomeCategories = computed(() =>
  categoriesStore.categories.filter(c => c.type === 'income')
)
const expenseCategories = computed(() =>
  categoriesStore.categories.filter(c => c.type === 'expense')
)

onMounted(() => {
  categoriesStore.fetchCategories()
})

async function addCategory() {
  if (!newName.value.trim()) return
  await categoriesStore.addCategory({
    name: newName.value.trim(),
    type: newType.value,
    color: newColor.value,
    icon: newIcon.value,
    user_id: auth.user.id,
  })
  newName.value = ''
  newIcon.value = ''
}

function startEdit(cat) {
  editingId.value = cat.id
  editName.value = cat.name
  editColor.value = cat.color
  editIcon.value = cat.icon || ''
}

async function saveEdit() {
  await categoriesStore.updateCategory(editingId.value, {
    name: editName.value,
    color: editColor.value,
    icon: editIcon.value,
  })
  editingId.value = null
}

async function confirmDelete() {
  await categoriesStore.deleteCategory(deletingId.value)
  deletingId.value = null
}
</script>

<template>
  <AppShell>
    <div class="categories-page fade-in">
      <header class="page-header">
        <h2 class="page-title">Categories</h2>
      </header>

      <div class="card add-card">
        <h3 class="card-title">New category</h3>
        <div class="add-form">
          <input
            v-model="newName"
            placeholder="Category name"
            class="add-input"
            @keyup.enter="addCategory"
          />
          <select v-model="newType" class="type-select" aria-label="Type">
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <input v-model="newColor" type="color" class="color-input" aria-label="Category colour" />
          <input v-model="newIcon" placeholder="Icon" class="icon-input" />
          <button class="btn-primary add-btn" @click="addCategory">Add category</button>
        </div>
      </div>

      <EmptyState
        v-if="!categoriesStore.categories.length && !categoriesStore.loading"
        title="No categories"
        message="Categories will be created automatically on first login."
      />

      <div v-if="incomeCategories.length" class="card section-card section-card--income">
        <div class="section-header">
          <span class="section-dot income"></span>
          <h3 class="section-title">Income</h3>
          <span class="section-count">{{ incomeCategories.length }}</span>
        </div>
        <div class="category-list">
          <div
            v-for="cat in incomeCategories"
            :key="cat.id"
            class="category-item"
            :style="{ '--c': cat.color }"
          >
            <template v-if="editingId === cat.id">
              <div class="edit-form">
                <input v-model="editName" class="edit-input" aria-label="Category name" />
                <input v-model="editColor" type="color" class="color-input" aria-label="Category colour" />
                <input v-model="editIcon" placeholder="Icon" class="icon-input" />
                <div class="edit-actions">
                  <button class="btn-sm btn-ghost" @click="editingId = null">Cancel</button>
                  <button class="btn-primary btn-sm" @click="saveEdit">Save</button>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="category-display">
                <span class="category-avatar" aria-hidden="true"><span class="color-swatch"></span></span>
                <span class="category-name">{{ cat.name }}</span>
                <span v-if="cat.icon" class="category-icon">{{ cat.icon }}</span>
              </div>
              <div class="category-actions">
                <button class="icon-btn" title="Edit" aria-label="Edit" @click="startEdit(cat)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </button>
                <button class="icon-btn icon-btn--danger" title="Delete" aria-label="Delete" @click="deletingId = cat.id">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div v-if="expenseCategories.length" class="card section-card section-card--expense">
        <div class="section-header">
          <span class="section-dot expense"></span>
          <h3 class="section-title">Expense</h3>
          <span class="section-count">{{ expenseCategories.length }}</span>
        </div>
        <div class="category-list">
          <div
            v-for="cat in expenseCategories"
            :key="cat.id"
            class="category-item"
            :style="{ '--c': cat.color }"
          >
            <template v-if="editingId === cat.id">
              <div class="edit-form">
                <input v-model="editName" class="edit-input" aria-label="Category name" />
                <input v-model="editColor" type="color" class="color-input" aria-label="Category colour" />
                <input v-model="editIcon" placeholder="Icon" class="icon-input" />
                <div class="edit-actions">
                  <button class="btn-sm btn-ghost" @click="editingId = null">Cancel</button>
                  <button class="btn-primary btn-sm" @click="saveEdit">Save</button>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="category-display">
                <span class="category-avatar" aria-hidden="true"><span class="color-swatch"></span></span>
                <span class="category-name">{{ cat.name }}</span>
                <span v-if="cat.icon" class="category-icon">{{ cat.icon }}</span>
              </div>
              <div class="category-actions">
                <button class="icon-btn" title="Edit" aria-label="Edit" @click="startEdit(cat)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </button>
                <button class="icon-btn icon-btn--danger" title="Delete" aria-label="Delete" @click="deletingId = cat.id">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>

      <ConfirmDialog
        v-if="deletingId"
        title="Delete Category"
        message="Are you sure you want to delete this category?"
        @confirm="confirmDelete"
        @cancel="deletingId = null"
      />
    </div>
  </AppShell>
</template>

<style scoped>
.categories-page {
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
.section-card {
  padding: 24px;
  min-width: 0;
}

.card-title {
  font-size: 1.05rem;
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
  min-width: 180px;
}

.type-select {
  width: 140px;
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

.icon-input {
  width: 110px;
}

.section-card {
  --tone: var(--accent);
}

.section-card--income { --tone: var(--income); }
.section-card--expense { --tone: var(--expense); }

.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.section-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--tone);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--tone) 16%, transparent);
  margin: 0 4px 0 5px;
}

.section-title {
  font-size: 1.05rem;
  font-weight: 600;
  flex: 1;
}

.section-count {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 13%, transparent);
  padding: 3px 11px;
  border-radius: var(--radius-pill);
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.category-item {
  --c: var(--accent);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 10px 10px 12px;
  min-width: 0;
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  transition: background-color var(--transition);
}

.category-item:hover {
  background: var(--bg-surface);
}

.category-display {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.category-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--c) 18%, transparent);
}

.color-swatch {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--c);
}

.category-name {
  font-weight: 600;
  font-size: 0.94rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.category-icon {
  flex-shrink: 0;
  padding: 1px 9px;
  border-radius: var(--radius-pill);
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.category-actions {
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
  min-width: 140px;
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
  .section-card {
    padding: 18px;
  }

  .add-form {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr) minmax(0, 1fr);
  }

  .add-input,
  .add-btn {
    grid-column: 1 / -1;
    min-width: 0;
  }

  /* Grid order: name, [type, colour, icon] → put the colour first. */
  .color-input {
    grid-column: 1;
    grid-row: 2;
  }

  .type-select,
  .icon-input {
    width: 100%;
    min-width: 0;
  }

  .edit-input {
    flex-basis: 100%;
    min-width: 0;
  }

  .edit-form .icon-input {
    flex: 1;
    width: auto;
  }

  .edit-actions {
    flex-basis: 100%;
  }

  .edit-actions button {
    flex: 1;
  }
}
</style>
