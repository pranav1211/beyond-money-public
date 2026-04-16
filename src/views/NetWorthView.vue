<script setup>
import { computed, onMounted } from 'vue'
import { Pie, Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
} from 'chart.js'
import { useTransactionsStore } from '../stores/transactions'
import { useNetWorth } from '../composables/useNetWorth'
import AppShell from '../components/layout/AppShell.vue'
import CandleLoader from '../components/shared/CandleLoader.vue'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Filler)

const transactionsStore = useTransactionsStore()
const {
  loading: nwLoading,
  totalAccounts,
  totalAssets,
  totalCreditCards,
  netWorth,
  components,
  positiveComponents,
  fetchAll,
} = useNetWorth()

const loading = computed(() => nwLoading.value || transactionsStore.loading)

onMounted(async () => {
  await Promise.all([
    fetchAll(),
    transactionsStore.fetchTransactions(),
  ])
})

const pieData = computed(() => ({
  labels: positiveComponents.value.map(c => c.name),
  datasets: [{
    data: positiveComponents.value.map(c => c.value),
    backgroundColor: [
      '#5de2a3', '#3fb950', '#58a6ff', '#d29922',
      '#f778ba', '#bc8cff', '#ff7b72', '#79c0ff',
    ],
    borderColor: 'transparent',
    borderWidth: 0,
  }],
}))

const pieOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        color: '#8b949e',
        padding: 16,
        font: { family: 'Inter', size: 12 },
      },
    },
  },
}

const lineData = computed(() => {
  const txns = [...transactionsStore.transactions].sort((a, b) => new Date(a.date) - new Date(b.date))
  const byMonth = {}
  let running = 0

  txns.forEach(tx => {
    const month = tx.date.slice(0, 7)
    if (tx.type === 'income') running += tx.amount_inr
    else if (tx.type === 'expense') running -= tx.amount_inr
    byMonth[month] = running
  })

  const months = Object.keys(byMonth).sort()
  return {
    labels: months,
    datasets: [{
      label: 'Net Worth Trend',
      data: months.map(m => byMonth[m]),
      borderColor: '#5de2a3',
      backgroundColor: 'rgba(93, 226, 163, 0.08)',
      fill: true,
      tension: 0.4,
      pointBackgroundColor: '#5de2a3',
      pointBorderColor: '#0d1117',
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
    }],
  }
})

const lineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
  },
  scales: {
    x: {
      grid: { color: 'rgba(48, 54, 61, 0.5)' },
      ticks: { color: '#8b949e', font: { family: 'Inter', size: 11 } },
    },
    y: {
      grid: { color: 'rgba(48, 54, 61, 0.5)' },
      ticks: { color: '#8b949e', font: { family: 'Inter', size: 11 } },
    },
  },
}
</script>

<template>
  <AppShell>
    <div class="networth-page fade-in">
      <CandleLoader v-if="loading" size="lg" />

      <template v-else>
        <div class="hero-card">
          <span class="hero-label">Total Net Worth</span>
          <h1 class="hero-amount" :class="netWorth >= 0 ? 'positive' : 'negative'">
            {{ netWorth >= 0 ? '' : '-' }}&#8377;{{ Math.abs(netWorth).toLocaleString('en-IN') }}
          </h1>
          <div class="hero-breakdown">
            <div class="breakdown-item">
              <span class="breakdown-dot accounts"></span>
              <span class="breakdown-label">Accounts</span>
              <span class="breakdown-value">&#8377;{{ totalAccounts.toLocaleString('en-IN') }}</span>
            </div>
            <div class="breakdown-item">
              <span class="breakdown-dot assets"></span>
              <span class="breakdown-label">Assets</span>
              <span class="breakdown-value">&#8377;{{ totalAssets.toLocaleString('en-IN') }}</span>
            </div>
            <div class="breakdown-item">
              <span class="breakdown-dot liabilities"></span>
              <span class="breakdown-label">Credit Cards</span>
              <span class="breakdown-value negative">-&#8377;{{ totalCreditCards.toLocaleString('en-IN') }}</span>
            </div>
          </div>
        </div>

        <div class="charts-grid">
          <div class="card chart-card">
            <h3 class="card-title">Composition</h3>
            <div class="chart-container pie-container">
              <Pie v-if="positiveComponents.length" :data="pieData" :options="pieOptions" />
              <p v-else class="empty-text">No positive components to display</p>
            </div>
          </div>

          <div class="card chart-card">
            <h3 class="card-title">Net Worth Over Time</h3>
            <div class="chart-container line-container">
              <Line v-if="lineData.labels.length" :data="lineData" :options="lineOptions" />
              <p v-else class="empty-text">Not enough data yet</p>
            </div>
          </div>
        </div>

        <div class="card components-card">
          <h3 class="card-title">Components</h3>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th class="text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(comp, i) in components" :key="i">
                <td class="comp-name">{{ comp.name }}</td>
                <td>
                  <span class="type-badge" :class="comp.type.toLowerCase().replace(' ', '-')">
                    {{ comp.type }}
                  </span>
                </td>
                <td class="text-right" :class="comp.value >= 0 ? 'text-income' : 'text-expense'">
                  {{ comp.value >= 0 ? '' : '-' }}&#8377;{{ Math.abs(comp.value).toLocaleString('en-IN') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </AppShell>
</template>

<style scoped>
.networth-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.hero-card {
  background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-elevated) 100%);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 40px;
  text-align: center;
}

.hero-label {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.hero-amount {
  font-size: 3.2rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  margin: 8px 0 24px;
  line-height: 1.1;
}

.hero-amount.positive {
  color: var(--accent);
}

.hero-amount.negative {
  color: var(--expense);
}

.hero-breakdown {
  display: flex;
  justify-content: center;
  gap: 32px;
  flex-wrap: wrap;
}

.breakdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.breakdown-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.breakdown-dot.accounts { background: var(--info); }
.breakdown-dot.assets { background: var(--accent); }
.breakdown-dot.liabilities { background: var(--expense); }

.breakdown-label {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.breakdown-value {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.breakdown-value.negative {
  color: var(--expense);
}

.charts-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.chart-card {
  padding: 24px;
}

.card-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 20px;
}

.chart-container {
  position: relative;
}

.pie-container {
  height: 280px;
}

.line-container {
  height: 280px;
}

.empty-text {
  color: var(--text-muted);
  font-size: 0.9rem;
  text-align: center;
  padding: 40px 0;
}

.components-card {
  padding: 24px;
}

.components-card table {
  margin-top: 0;
}

.comp-name {
  font-weight: 500;
}

.text-right {
  text-align: right;
}

.type-badge {
  display: inline-block;
  padding: 3px 10px;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 20px;
  letter-spacing: 0.3px;
}

.type-badge.account {
  background: rgba(88, 166, 255, 0.12);
  color: var(--info);
}

.type-badge.asset {
  background: var(--accent-dim);
  color: var(--accent);
}

.type-badge.credit-card {
  background: rgba(248, 81, 73, 0.12);
  color: var(--expense);
}

@media (max-width: 768px) {
  .charts-grid {
    grid-template-columns: 1fr;
  }

  .hero-amount {
    font-size: 2.2rem;
  }

  .hero-card {
    padding: 28px 20px;
  }

  .hero-breakdown {
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
}
</style>
