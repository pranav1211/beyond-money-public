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
      <div class="tab-bar" role="tablist" aria-label="Organize">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'categories' }"
          role="tab"
          :aria-selected="activeTab === 'categories'"
          @click="setTab('categories')"
        >Categories</button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'labels' }"
          role="tab"
          :aria-selected="activeTab === 'labels'"
          @click="setTab('labels')"
        >Labels</button>
      </div>

      <template v-if="activeTab === 'categories'">
        <section class="card input-card">
          <div class="input-copy">
            <h3>New category</h3>
            <p>Use categories for primary reporting such as salary, groceries, transport, or subscriptions.</p>
          </div>
          <div class="create-grid create-grid--categories">
            <div class="field f-name">
              <span class="field-label">Name</span>
              <input v-model="categoryForm.name" placeholder="Category name" @keyup.enter="addCategory" />
            </div>
            <div class="field f-type">
              <span class="field-label">Type</span>
              <select v-model="categoryForm.type">
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            <div class="field f-icon">
              <span class="field-label">Icon</span>
              <input v-model="categoryForm.icon" placeholder="Icon or short code" />
            </div>
            <div class="field f-color">
              <span class="field-label">Colour</span>
              <input v-model="categoryForm.color" type="color" class="color-field" aria-label="Category colour" />
            </div>
            <button class="btn-primary f-submit" @click="addCategory">Add category</button>
          </div>
        </section>

        <section class="grid-sections">
          <div class="card section-card section-card--income">
            <div class="section-head">
              <span class="section-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6.5 10.5L12 5l5.5 5.5" /></svg>
              </span>
              <h3>Income</h3>
              <span class="count-pill">{{ incomeCategories.length }}</span>
            </div>
            <EmptyState v-if="!incomeCategories.length" title="No income categories" message="Create the income groups you want to reuse." />
            <div v-else class="item-list">
              <div v-for="category in incomeCategories" :key="category.id" class="item-row" :style="{ '--c': category.color }">
                <template v-if="editingCategoryId === category.id">
                  <div class="edit-grid edit-grid--categories">
                    <input v-model="editCategory.name" class="e-name" aria-label="Category name" />
                    <input v-model="editCategory.icon" class="e-icon" placeholder="Icon" aria-label="Icon" />
                    <input v-model="editCategory.color" type="color" class="color-field e-color" aria-label="Category colour" />
                    <div class="edit-actions e-actions">
                      <button class="btn-ghost" @click="editingCategoryId = null">Cancel</button>
                      <button class="btn-primary" @click="saveCategoryEdit">Save</button>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div class="item-main">
                    <span class="item-avatar" aria-hidden="true"><span class="item-dot"></span></span>
                    <div class="item-copy">
                      <strong>{{ category.name }}</strong>
                      <p>{{ category.icon || 'No icon' }}</p>
                    </div>
                  </div>
                  <div class="item-actions">
                    <button class="icon-btn" title="Edit" aria-label="Edit" @click="startCategoryEdit(category)">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                    </button>
                    <button class="icon-btn icon-btn--danger" title="Delete" aria-label="Delete" @click="deletingCategoryId = category.id">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                    </button>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <div class="card section-card section-card--expense">
            <div class="section-head">
              <span class="section-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6.5 13.5L12 19l5.5-5.5" /></svg>
              </span>
              <h3>Expense</h3>
              <span class="count-pill">{{ expenseCategories.length }}</span>
            </div>
            <EmptyState v-if="!expenseCategories.length" title="No expense categories" message="Create the buckets you want for spending reports." />
            <div v-else class="item-list">
              <div v-for="category in expenseCategories" :key="category.id" class="item-row" :style="{ '--c': category.color }">
                <template v-if="editingCategoryId === category.id">
                  <div class="edit-grid edit-grid--categories">
                    <input v-model="editCategory.name" class="e-name" aria-label="Category name" />
                    <input v-model="editCategory.icon" class="e-icon" placeholder="Icon" aria-label="Icon" />
                    <input v-model="editCategory.color" type="color" class="color-field e-color" aria-label="Category colour" />
                    <div class="edit-actions e-actions">
                      <button class="btn-ghost" @click="editingCategoryId = null">Cancel</button>
                      <button class="btn-primary" @click="saveCategoryEdit">Save</button>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div class="item-main">
                    <span class="item-avatar" aria-hidden="true"><span class="item-dot"></span></span>
                    <div class="item-copy">
                      <strong>{{ category.name }}</strong>
                      <p>{{ category.icon || 'No icon' }}</p>
                    </div>
                  </div>
                  <div class="item-actions">
                    <button class="icon-btn" title="Edit" aria-label="Edit" @click="startCategoryEdit(category)">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                    </button>
                    <button class="icon-btn icon-btn--danger" title="Delete" aria-label="Delete" @click="deletingCategoryId = category.id">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                    </button>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </section>
      </template>

      <template v-else>
        <section class="card input-card">
          <div class="input-copy">
            <h3>New label</h3>
            <p>Labels are optional tags like work, family, recurring, or reimbursable that help you filter transactions beyond their main category.</p>
          </div>
          <div class="create-grid create-grid--labels">
            <div class="field f-name">
              <span class="field-label">Name</span>
              <input v-model="labelForm.name" placeholder="Label name" @keyup.enter="addLabel" />
            </div>
            <div class="field f-color">
              <span class="field-label">Colour</span>
              <input v-model="labelForm.color" type="color" class="color-field" aria-label="Label colour" />
            </div>
            <button class="btn-primary f-submit" @click="addLabel">Add label</button>
          </div>
        </section>

        <section class="card section-card">
          <div class="section-head">
            <span class="section-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>
            </span>
            <h3>Labels</h3>
            <span class="count-pill">{{ labelsStore.labels.length }}</span>
          </div>
          <EmptyState v-if="!labelsStore.labels.length" title="No labels" message="Create a few tags for cleaner filtering and reporting." />
          <div v-else class="item-list">
            <div v-for="label in labelsStore.labels" :key="label.id" class="item-row" :style="{ '--c': label.color }">
              <template v-if="editingLabelId === label.id">
                <div class="edit-grid edit-grid--labels">
                  <input v-model="editLabel.name" class="e-name" aria-label="Label name" />
                  <input v-model="editLabel.color" type="color" class="color-field e-color" aria-label="Label colour" />
                  <div class="edit-actions e-actions">
                    <button class="btn-ghost" @click="editingLabelId = null">Cancel</button>
                    <button class="btn-primary" @click="saveLabelEdit">Save</button>
                  </div>
                </div>
              </template>
              <template v-else>
                <div class="item-main">
                  <div class="item-copy">
                    <span class="label-chip"><span class="item-dot"></span><strong>{{ label.name }}</strong></span>
                    <p>Reusable tag for transaction filtering</p>
                  </div>
                </div>
                <div class="item-actions">
                  <button class="icon-btn" title="Edit" aria-label="Edit" @click="startLabelEdit(label)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                  </button>
                  <button class="icon-btn icon-btn--danger" title="Delete" aria-label="Delete" @click="deletingLabelId = label.id">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                  </button>
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
  gap: 20px;
  min-width: 0;
  max-width: 100%;
}

/* Segmented control */
.tab-bar {
  align-self: flex-start;
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: var(--radius-pill);
  background: var(--bg-elevated);
}

.tab-btn {
  padding: 9px 24px;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.9rem;
  font-weight: 700;
}

.tab-btn:hover {
  background: transparent;
  color: var(--text-primary);
}

.tab-btn.active {
  background: var(--bg-secondary);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}

/* Create card */
.input-card,
.section-card {
  padding: 24px;
  min-width: 0;
}

.input-card {
  container-type: inline-size;
  container-name: createcard;
}

.input-copy h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.input-copy p {
  margin-top: 4px;
  max-width: 62ch;
  font-size: 0.88rem;
  color: var(--text-muted);
}

.create-grid {
  display: grid;
  gap: 12px;
  margin-top: 18px;
  align-items: end;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.field-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.f-name { grid-area: name; }
.f-type { grid-area: type; }
.f-icon { grid-area: icon; }
.f-color { grid-area: color; }
.f-submit { grid-area: submit; min-height: 48px; }

/* Narrow (phones): stacked. */
.create-grid--categories {
  grid-template-columns: 52px minmax(0, 1fr) minmax(0, 1fr);
  grid-template-areas:
    'name name name'
    'color type icon'
    'submit submit submit';
}

.create-grid--labels {
  grid-template-columns: 52px minmax(0, 1fr);
  grid-template-areas:
    'name name'
    'color submit';
}

@container createcard (min-width: 640px) {
  .create-grid--categories {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) 52px auto;
    grid-template-areas: 'name type icon color submit';
  }

  .create-grid--labels {
    grid-template-columns: minmax(0, 1fr) 52px auto;
    grid-template-areas: 'name color submit';
  }
}

/* Colour picker rendered as a soft rounded swatch. */
.color-field {
  width: 52px;
  min-width: 52px;
  height: 48px;
  padding: 6px;
  border-radius: var(--radius-sm);
}

.color-field::-webkit-color-swatch-wrapper {
  padding: 0;
}

.color-field::-webkit-color-swatch {
  border: none;
  border-radius: 10px;
}

.color-field::-moz-color-swatch {
  border: none;
  border-radius: 10px;
}

/* Sections */
.grid-sections {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  align-items: start;
}

.section-card {
  --tone: var(--accent);
}

.section-card--income { --tone: var(--income); }
.section-card--expense { --tone: var(--expense); }

.section-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.section-head h3 {
  flex: 1;
  font-size: 1.05rem;
  font-weight: 600;
}

.section-icon {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 16%, transparent);
}

.count-pill {
  padding: 3px 11px;
  border-radius: var(--radius-pill);
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 13%, transparent);
}

/* Rows */
.item-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item-row {
  --c: var(--accent);
  container-type: inline-size;
  container-name: itemrow;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 12px 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  min-width: 0;
  transition: background-color var(--transition);
}

.item-row:hover {
  background: var(--bg-surface);
}

.item-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.item-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--c) 18%, transparent);
}

.item-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--c);
}

.item-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}

.item-copy strong {
  font-weight: 600;
  font-size: 0.94rem;
  color: var(--text-primary);
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-copy p {
  font-size: 0.8rem;
  color: var(--text-muted);
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.label-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 4px 12px 4px 10px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--c) 16%, transparent);
}

.label-chip .item-dot {
  width: 9px;
  height: 9px;
}

.label-chip strong {
  font-size: 0.88rem;
}

.item-actions {
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

/* Inline editor: stacked by default, one row once the row is wide enough. */
.edit-grid {
  display: grid;
  gap: 10px;
  width: 100%;
  align-items: center;
}

.e-name { grid-area: name; min-width: 0; }
.e-icon { grid-area: icon; min-width: 0; }
.e-color { grid-area: color; }
.e-actions { grid-area: actions; }

.edit-grid--categories {
  grid-template-columns: 52px minmax(0, 1fr);
  grid-template-areas:
    'name name'
    'color icon'
    'actions actions';
}

.edit-grid--labels {
  grid-template-columns: 52px minmax(0, 1fr);
  grid-template-areas:
    'name name'
    'color actions';
}

.edit-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.edit-actions button {
  padding: 10px 18px;
  font-size: 0.86rem;
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
}

.btn-ghost:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

@container itemrow (min-width: 560px) {
  .edit-grid--categories {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) 52px auto;
    grid-template-areas: 'name icon color actions';
  }

  .edit-grid--labels {
    grid-template-columns: minmax(0, 1fr) 52px auto;
    grid-template-areas: 'name color actions';
  }
}

@media (max-width: 960px) {
  .grid-sections {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 768px) {
  .tab-bar {
    align-self: stretch;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .input-card,
  .section-card {
    padding: 18px;
  }

  .edit-actions button {
    flex: 1;
  }
}
</style>
