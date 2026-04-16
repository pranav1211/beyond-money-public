<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '../components/layout/AppShell.vue'
import ConfirmDialog from '../components/shared/ConfirmDialog.vue'
import EmptyState from '../components/shared/EmptyState.vue'
import { useCategoriesStore } from '../stores/categories'
import { useLabelsStore } from '../stores/labels'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const categoriesStore = useCategoriesStore()
const labelsStore = useLabelsStore()
const auth = useAuthStore()

const activeTab = ref(route.query.tab === 'labels' ? 'labels' : 'categories')
const deletingLabelId = ref(null)
const deletingCategoryId = ref(null)
const editingLabelId = ref(null)
const editingCategoryId = ref(null)
const labelForm = ref({ name: '', color: '#3a86ff' })
const categoryForm = ref({ name: '', type: 'expense', color: '#008477', icon: '' })
const editLabel = ref({ name: '', color: '#3a86ff' })
const editCategory = ref({ name: '', color: '#008477', icon: '' })

const incomeCategories = computed(() => categoriesStore.categories.filter(item => item.type === 'income'))
const expenseCategories = computed(() => categoriesStore.categories.filter(item => item.type === 'expense'))

onMounted(async () => {
  await Promise.all([
    categoriesStore.fetchCategories(),
    labelsStore.fetchLabels(),
  ])
})

function setTab(tab) {
  activeTab.value = tab
  router.replace({ query: { ...route.query, tab } })
}

async function addLabel() {
  if (!labelForm.value.name.trim()) return
  await labelsStore.addLabel({
    user_id: auth.user.id,
    name: labelForm.value.name.trim(),
    color: labelForm.value.color,
  })
  labelForm.value = { name: '', color: '#3a86ff' }
}

async function addCategory() {
  if (!categoryForm.value.name.trim()) return
  await categoriesStore.addCategory({
    user_id: auth.user.id,
    name: categoryForm.value.name.trim(),
    type: categoryForm.value.type,
    color: categoryForm.value.color,
    icon: categoryForm.value.icon,
  })
  categoryForm.value = { name: '', type: categoryForm.value.type, color: '#008477', icon: '' }
}

function startLabelEdit(label) {
  editingLabelId.value = label.id
  editLabel.value = { name: label.name, color: label.color }
}

function startCategoryEdit(category) {
  editingCategoryId.value = category.id
  editCategory.value = { name: category.name, color: category.color, icon: category.icon || '' }
}

async function saveLabelEdit() {
  await labelsStore.updateLabel(editingLabelId.value, editLabel.value)
  editingLabelId.value = null
}

async function saveCategoryEdit() {
  await categoriesStore.updateCategory(editingCategoryId.value, editCategory.value)
  editingCategoryId.value = null
}

async function confirmDeleteLabel() {
  await labelsStore.deleteLabel(deletingLabelId.value)
  deletingLabelId.value = null
}

async function confirmDeleteCategory() {
  await categoriesStore.deleteCategory(deletingCategoryId.value)
  deletingCategoryId.value = null
}
</script>

<template>
  <AppShell>
    <div class="organize-page fade-in">
      <div class="tab-bar">
        <button class="tab-btn" :class="{ active: activeTab === 'categories' }" @click="setTab('categories')">Categories</button>
        <button class="tab-btn" :class="{ active: activeTab === 'labels' }" @click="setTab('labels')">Labels</button>
      </div>

      <template v-if="activeTab === 'categories'">
        <section class="card input-card">
          <div>
            <h3>Create Category</h3>
            <p>Use categories for primary reporting such as salary, groceries, transport, or subscriptions.</p>
          </div>
          <div class="create-grid">
            <input v-model="categoryForm.name" placeholder="Category name" @keyup.enter="addCategory" />
            <select v-model="categoryForm.type">
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
            <input v-model="categoryForm.icon" placeholder="Icon or short code" />
            <input v-model="categoryForm.color" type="color" />
            <button class="btn-primary" @click="addCategory">Add Category</button>
          </div>
        </section>

        <section class="grid-sections">
          <div class="card section-card">
            <div class="section-head">
              <h3>Income</h3>
              <span>{{ incomeCategories.length }}</span>
            </div>
            <EmptyState v-if="!incomeCategories.length" title="No income categories" message="Create the income groups you want to reuse." />
            <div v-else class="item-list">
              <div v-for="category in incomeCategories" :key="category.id" class="item-row">
                <template v-if="editingCategoryId === category.id">
                  <div class="edit-grid">
                    <input v-model="editCategory.name" />
                    <input v-model="editCategory.icon" placeholder="Icon" />
                    <input v-model="editCategory.color" type="color" />
                    <button class="btn-primary" @click="saveCategoryEdit">Save</button>
                    <button @click="editingCategoryId = null">Cancel</button>
                  </div>
                </template>
                <template v-else>
                  <div class="item-main">
                    <span class="swatch" :style="{ background: category.color }"></span>
                    <div>
                      <strong>{{ category.name }}</strong>
                      <p>{{ category.icon || 'No icon' }}</p>
                    </div>
                  </div>
                  <div class="item-actions">
                    <button @click="startCategoryEdit(category)">Edit</button>
                    <button class="btn-danger" @click="deletingCategoryId = category.id">Delete</button>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <div class="card section-card">
            <div class="section-head">
              <h3>Expense</h3>
              <span>{{ expenseCategories.length }}</span>
            </div>
            <EmptyState v-if="!expenseCategories.length" title="No expense categories" message="Create the buckets you want for spending reports." />
            <div v-else class="item-list">
              <div v-for="category in expenseCategories" :key="category.id" class="item-row">
                <template v-if="editingCategoryId === category.id">
                  <div class="edit-grid">
                    <input v-model="editCategory.name" />
                    <input v-model="editCategory.icon" placeholder="Icon" />
                    <input v-model="editCategory.color" type="color" />
                    <button class="btn-primary" @click="saveCategoryEdit">Save</button>
                    <button @click="editingCategoryId = null">Cancel</button>
                  </div>
                </template>
                <template v-else>
                  <div class="item-main">
                    <span class="swatch" :style="{ background: category.color }"></span>
                    <div>
                      <strong>{{ category.name }}</strong>
                      <p>{{ category.icon || 'No icon' }}</p>
                    </div>
                  </div>
                  <div class="item-actions">
                    <button @click="startCategoryEdit(category)">Edit</button>
                    <button class="btn-danger" @click="deletingCategoryId = category.id">Delete</button>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </section>
      </template>

      <template v-else>
        <section class="card input-card">
          <div>
            <h3>Create Label</h3>
            <p>Labels are optional tags like work, family, recurring, or reimbursable that help you filter transactions beyond their main category.</p>
          </div>
          <div class="create-grid create-grid--labels">
            <input v-model="labelForm.name" placeholder="Label name" @keyup.enter="addLabel" />
            <input v-model="labelForm.color" type="color" />
            <button class="btn-primary" @click="addLabel">Add Label</button>
          </div>
        </section>

        <section class="card section-card">
          <div class="section-head">
            <h3>Labels</h3>
            <span>{{ labelsStore.labels.length }}</span>
          </div>
          <EmptyState v-if="!labelsStore.labels.length" title="No labels" message="Create a few tags for cleaner filtering and reporting." />
          <div v-else class="item-list">
            <div v-for="label in labelsStore.labels" :key="label.id" class="item-row">
              <template v-if="editingLabelId === label.id">
                <div class="edit-grid edit-grid--labels">
                  <input v-model="editLabel.name" />
                  <input v-model="editLabel.color" type="color" />
                  <button class="btn-primary" @click="saveLabelEdit">Save</button>
                  <button @click="editingLabelId = null">Cancel</button>
                </div>
              </template>
              <template v-else>
                <div class="item-main">
                  <span class="swatch" :style="{ background: label.color }"></span>
                  <div>
                    <strong>{{ label.name }}</strong>
                    <p>Reusable tag for transaction filtering</p>
                  </div>
                </div>
                <div class="item-actions">
                  <button @click="startLabelEdit(label)">Edit</button>
                  <button class="btn-danger" @click="deletingLabelId = label.id">Delete</button>
                </div>
              </template>
            </div>
          </div>
        </section>
      </template>

      <ConfirmDialog v-if="deletingLabelId" title="Delete Label" message="Delete this label?" @confirm="confirmDeleteLabel" @cancel="deletingLabelId = null" />
      <ConfirmDialog v-if="deletingCategoryId" title="Delete Category" message="Delete this category?" @confirm="confirmDeleteCategory" @cancel="deletingCategoryId = null" />
    </div>
  </AppShell>
</template>

<style scoped>
.organize-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.tab-bar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.tab-btn.active {
  background: var(--bg-accent), var(--bg-secondary);
  border-color: var(--accent);
}

.input-card,
.section-card {
  padding: 20px;
}

.create-grid,
.edit-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.create-grid--labels,
.edit-grid--labels {
  grid-template-columns: minmax(0, 1fr) 64px auto auto;
}

.grid-sections {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.section-head span {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--bg-elevated);
}

.item-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.item-row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  padding: 14px;
  border-radius: 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
}

.item-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.item-main p {
  font-size: 0.82rem;
  color: var(--text-muted);
}

.item-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.swatch {
  width: 16px;
  height: 16px;
  border-radius: 5px;
  margin-top: 2px;
}

@media (max-width: 960px) {
  .grid-sections,
  .create-grid,
  .edit-grid,
  .create-grid--labels,
  .edit-grid--labels {
    grid-template-columns: 1fr;
  }

  .item-row {
    flex-direction: column;
  }
}
</style>
