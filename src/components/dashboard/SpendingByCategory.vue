<script setup>
import { computed, onMounted } from 'vue'
import { Doughnut } from 'vue-chartjs'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { useTransactionsStore } from '../../stores/transactions'
import { useCategoriesStore } from '../../stores/categories'

ChartJS.register(ArcElement, Tooltip, Legend)

const transactionsStore = useTransactionsStore()
const categoriesStore = useCategoriesStore()

onMounted(async () => {
  await categoriesStore.fetchCategories()
})

const chartData = computed(() => {
  const expenses = transactionsStore.transactions.filter(t => t.type === 'expense')
  const byCategory = {}

  expenses.forEach(t => {
    if (!byCategory[t.category_id]) byCategory[t.category_id] = 0
    byCategory[t.category_id] += t.amount_inr
  })

  const labels = []
  const data = []
  const backgroundColor = []

  Object.entries(byCategory).forEach(([catId, amount]) => {
    const cat = categoriesStore.categories.find(c => c.id === catId)
    labels.push(cat?.name || 'Unknown')
    data.push(amount)
    backgroundColor.push(cat?.color || '#607D8B')
  })

  return {
    labels,
    datasets: [{ data, backgroundColor }],
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: true,
  cutout: '60%',
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        color: '#8b949e',
        padding: 16,
        font: { size: 12, family: 'Inter' },
        usePointStyle: true,
        pointStyleWidth: 10,
      },
    },
    tooltip: {
      backgroundColor: '#1c2333',
      titleColor: '#e6edf3',
      bodyColor: '#8b949e',
      borderColor: '#30363d',
      borderWidth: 1,
      padding: 12,
      cornerRadius: 8,
    },
  },
}
</script>

<template>
  <div class="chart-card">
    <h3 class="chart-title">Spending by Category</h3>
    <div class="chart-container">
      <Doughnut v-if="chartData.labels.length" :data="chartData" :options="chartOptions" />
      <p v-else class="chart-empty">No expenses this month</p>
    </div>
  </div>
</template>

<style scoped>
.chart-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 24px;
  transition: all var(--transition);
}

.chart-card:hover {
  border-color: var(--border-light);
  box-shadow: var(--card-shadow-hover);
}

.chart-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 20px;
}

.chart-container {
  max-width: 320px;
  margin: 0 auto;
}

.chart-empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.9rem;
  padding: 32px 0;
}
</style>
