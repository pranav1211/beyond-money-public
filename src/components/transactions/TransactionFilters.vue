<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAccountsStore } from '../../stores/accounts'
import { useCategoriesStore } from '../../stores/categories'
import { useLabelsStore } from '../../stores/labels'

const emit = defineEmits(['filter'])
const route = useRoute()
const accountsStore = useAccountsStore()
const categoriesStore = useCategoriesStore()
const labelsStore = useLabelsStore()

const now = new Date()
const selectedYear = ref(now.getFullYear())
const selectedMonth = ref(null)

const years = computed(() => {
  const current = now.getFullYear()
  const list = []
  for (let y = current; y >= current - 5; y--) list.push(y)
  return list
})

const months = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
]

const filters = ref({
  account_id: null,
  category_id: null,
  type: null,
  label_id: null,
})

function currentFilters() {
  const clean = { year: String(selectedYear.value) }
  if (selectedMonth.value) {
    clean.month = `${selectedYear.value}-${selectedMonth.value}`
  }
  Object.entries(filters.value).forEach(([key, value]) => {
    if (value) clean[key] = value
  })
  return clean
}

function applyFilters() {
  emit('filter', currentFilters())
}

onMounted(async () => {
  filters.value.account_id = route.query.account_id || null
  filters.value.category_id = route.query.category_id || null
  filters.value.type = route.query.type || null

  await Promise.all([
    accountsStore.fetchAccounts(),
    categoriesStore.fetchCategories(),
    labelsStore.fetchLabels(),
  ])

  applyFilters()
})

watch(() => route.query.account_id, (value) => {
  filters.value.account_id = value || null
  applyFilters()
})
</script>

<template>
  <div class="filter-bar">
    <div class="filter-item">
      <label class="filter-label">Year</label>
      <select v-model="selectedYear" class="filter-input" @change="applyFilters">
        <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
      </select>
    </div>
    <div class="filter-item">
      <label class="filter-label">Month</label>
      <select v-model="selectedMonth" class="filter-input" @change="applyFilters">
        <option :value="null">All Months</option>
        <option v-for="m in months" :key="m.value" :value="m.value">{{ m.label }}</option>
      </select>
    </div>
    <div class="filter-item">
      <label class="filter-label">Account</label>
      <select v-model="filters.account_id" class="filter-input" @change="applyFilters">
        <option :value="null">All</option>
        <option v-for="account in accountsStore.accounts" :key="account.id" :value="account.id">{{ account.name }}</option>
      </select>
    </div>
    <div class="filter-item">
      <label class="filter-label">Category</label>
      <select v-model="filters.category_id" class="filter-input" @change="applyFilters">
        <option :value="null">All</option>
        <option v-for="category in categoriesStore.categories" :key="category.id" :value="category.id">{{ category.name }}</option>
      </select>
    </div>
    <div class="filter-item">
      <label class="filter-label">Type</label>
      <select v-model="filters.type" class="filter-input" @change="applyFilters">
        <option :value="null">All</option>
        <option value="income">Income</option>
        <option value="expense">Expense</option>
        <option value="transfer">Transfer</option>
      </select>
    </div>
    <div class="filter-item">
      <label class="filter-label">Label</label>
      <select v-model="filters.label_id" class="filter-input" @change="applyFilters">
        <option :value="null">All</option>
        <option v-for="label in labelsStore.labels" :key="label.id" :value="label.id">{{ label.name }}</option>
      </select>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-label {
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.filter-input {
  min-height: 46px;
}

@media (max-width: 900px) {
  .filter-bar {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .filter-bar {
    grid-template-columns: 1fr;
  }
}
</style>
