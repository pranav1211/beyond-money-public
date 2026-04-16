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
        <h3 class="card-title">Create Category</h3>
        <div class="add-form">
          <input
            v-model="newName"
            placeholder="Category name"
            class="add-input"
            @keyup.enter="addCategory"
          />
          <select v-model="newType" class="type-select">
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <input v-model="newColor" type="color" class="color-input" />
          <input v-model="newIcon" placeholder="Icon" class="icon-input" />
          <button class="btn-primary" @click="addCategory">Add Category</button>
        </div>
      </div>

      <EmptyState
        v-if="!categoriesStore.categories.length && !categoriesStore.loading"
        title="No categories"
        message="Categories will be created automatically on first login."
      />

      <div v-if="incomeCategories.length" class="card section-card">
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
          >
            <template v-if="editingId === cat.id">
              <div class="edit-form">
                <input v-model="editName" class="edit-input" />
                <input v-model="editColor" type="color" class="color-input" />
                <input v-model="editIcon" placeholder="Icon" class="icon-input" />
                <div class="edit-actions">
                  <button class="btn-primary btn-sm" @click="saveEdit">Save</button>
                  <button class="btn-sm" @click="editingId = null">Cancel</button>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="category-display">
                <span class="color-swatch" :style="{ background: cat.color }"></span>
                <span class="category-name">{{ cat.name }}</span>
                <span v-if="cat.icon" class="category-icon">{{ cat.icon }}</span>
              </div>
              <div class="category-actions">
                <button class="btn-sm" @click="startEdit(cat)">Edit</button>
                <button class="btn-sm btn-danger" @click="deletingId = cat.id">Delete</button>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div v-if="expenseCategories.length" class="card section-card">
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
          >
            <template v-if="editingId === cat.id">
              <div class="edit-form">
                <input v-model="editName" class="edit-input" />
                <input v-model="editColor" type="color" class="color-input" />
                <input v-model="editIcon" placeholder="Icon" class="icon-input" />
                <div class="edit-actions">
                  <button class="btn-primary btn-sm" @click="saveEdit">Save</button>
                  <button class="btn-sm" @click="editingId = null">Cancel</button>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="category-display">
                <span class="color-swatch" :style="{ background: cat.color }"></span>
                <span class="category-name">{{ cat.name }}</span>
                <span v-if="cat.icon" class="category-icon">{{ cat.icon }}</span>
              </div>
              <div class="category-actions">
                <button class="btn-sm" @click="startEdit(cat)">Edit</button>
                <button class="btn-sm btn-danger" @click="deletingId = cat.id">Delete</button>
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
  min-width: 180px;
}

.type-select {
  width: 130px;
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

.icon-input {
  width: 90px;
}

.section-card {
  padding: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.section-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.section-dot.income {
  background: var(--income);
}

.section-dot.expense {
  background: var(--expense);
}

.section-title {
  font-size: 1.05rem;
  font-weight: 600;
  flex: 1;
}

.section-count {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--bg-primary);
  padding: 2px 10px;
  border-radius: 20px;
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.category-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  transition: background var(--transition);
}

.category-item:hover {
  background: var(--bg-surface);
}

.category-display {
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

.category-name {
  font-weight: 500;
  font-size: 0.95rem;
  color: var(--text-primary);
}

.category-icon {
  font-size: 1.1rem;
}

.category-actions {
  display: flex;
  gap: 8px;
  opacity: 0;
  transition: opacity var(--transition);
}

.category-item:hover .category-actions {
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
  min-width: 140px;
}

.edit-actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 600px) {
  .category-actions {
    opacity: 1;
  }

  .add-form {
    flex-direction: column;
    align-items: stretch;
  }

  .add-input,
  .type-select,
  .icon-input {
    width: 100%;
    min-width: 0;
  }
}
</style>
