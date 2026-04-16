<script setup>
import { computed, onMounted } from 'vue'
import { Pie } from 'vue-chartjs'
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js'
import { useNetWorth } from '../../composables/useNetWorth'

ChartJS.register(ArcElement, Tooltip)

const { netWorth, positiveComponents, fetchAll } = useNetWorth()

onMounted(() => fetchAll())

const COLORS = ['#7dc2ff', '#71e6cb', '#ffd36d', '#ff8a7a', '#c9a3ff', '#5de2a3', '#f778ba', '#79c0ff']

const chartData = computed(() => ({
  labels: positiveComponents.value.map(c => c.name),
  datasets: [
    {
      data: positiveComponents.value.map(c => c.value),
      backgroundColor: positiveComponents.value.map((_, i) => COLORS[i % COLORS.length]),
      borderWidth: 0,
      hoverOffset: 10,
      spacing: 3,
      borderRadius: 8,
    },
  ],
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '66%',
  layout: {
    padding: 14,
  },
  plugins: {
    tooltip: {
      backgroundColor: '#14233b',
      titleColor: '#f5f7fb',
      bodyColor: '#d9e1ed',
      padding: 12,
      cornerRadius: 12,
      displayColors: true,
      callbacks: {
        label(context) {
          const amount = Number(context.parsed || 0)
          const total = positiveComponents.value.reduce((s, c) => s + c.value, 0)
          const percent = total ? ((amount / total) * 100).toFixed(1) : '0.0'
          return `${context.label}: ₹${amount.toLocaleString('en-IN')} (${percent}%)`
        },
      },
    },
  },
}))
</script>

<template>
  <div class="networth-panel">
    <div class="pie-shell">
      <div class="chart-wrap">
        <Pie v-if="positiveComponents.length" :data="chartData" :options="chartOptions" />
        <p v-else class="chart-empty">No data</p>
      </div>

      <div class="chart-center" v-if="positiveComponents.length">
        <strong>₹{{ netWorth.toLocaleString('en-IN') }}</strong>
      </div>
    </div>
  </div>
</template>

<style scoped>
.networth-panel {
  display: flex;
  justify-content: center;
}

.pie-shell {
  position: relative;
  width: 100%;
  max-width: 320px;
  min-height: 280px;
  border-radius: 28px;
  background:
    radial-gradient(circle at top, rgba(255, 209, 102, 0.14), transparent 34%),
    radial-gradient(circle at bottom left, rgba(111, 228, 201, 0.16), transparent 30%),
    linear-gradient(160deg, rgba(17, 36, 62, 0.95), rgba(23, 53, 90, 0.88));
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
}

:root[data-theme='light'] .pie-shell {
  background:
    radial-gradient(circle at top, rgba(255, 209, 102, 0.18), transparent 34%),
    radial-gradient(circle at bottom left, rgba(0, 132, 119, 0.12), transparent 30%),
    linear-gradient(160deg, rgba(255, 252, 247, 0.98), rgba(239, 232, 219, 0.92));
}

.chart-wrap {
  position: absolute;
  inset: 0;
  padding: 24px;
  z-index: 2;
}

.chart-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  min-width: 100px;
  min-height: 100px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  text-align: center;
  background: rgba(8, 16, 30, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.08);
  pointer-events: none;
  z-index: 1;
}

:root[data-theme='light'] .chart-center {
  background: rgba(255, 252, 247, 0.92);
}

.chart-center strong {
  font-size: 1.05rem;
}

.chart-empty {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--text-muted);
}

@media (max-width: 640px) {
  .pie-shell {
    max-width: 260px;
    min-height: 230px;
  }

  .chart-wrap {
    padding: 14px;
  }

  .chart-center {
    min-width: 80px;
    min-height: 80px;
  }

  .chart-center strong {
    font-size: 0.88rem;
  }
}
</style>
