<script setup>
import { computed, onMounted } from 'vue'
import { useNetWorth } from '../../composables/useNetWorth'
import { formatDefault } from '../../lib/money'

// Drawn as plain SVG rather than Chart.js: it sizes itself with CSS (no
// canvas measurement, which mis-sized the donut in stacked layouts), follows
// the theme, and keeps chart.js out of the dashboard's load.
const { netWorth, positiveComponents, fetchAll } = useNetWorth()

onMounted(() => { fetchAll() })

const COLORS = ['#5fe0c3', '#7cb6ff', '#f5c86b', '#ff9a8a', '#b9a3ff', '#6fdc8c', '#f39cc8', '#8fd3ff']

const total = computed(() => positiveComponents.value.reduce((s, c) => s + c.value, 0))

const items = computed(() => positiveComponents.value
  .map((c, i) => ({ ...c, color: COLORS[i % COLORS.length], pct: total.value ? (c.value / total.value) * 100 : 0 }))
  .sort((a, b) => b.value - a.value))

// Donut geometry: radius 42 in a 100×100 box. Each slice is a dashed arc on
// the same circle, offset by the slices before it, with a small gap between.
const R = 42
const C = 2 * Math.PI * R
const GAP = 2.2

const slices = computed(() => {
  const many = items.value.length > 1
  let offset = 0
  return items.value.map(item => {
    const len = (item.pct / 100) * C
    const dash = Math.max(len - (many ? GAP : 0), 0.001)
    const slice = { ...item, dasharray: `${dash} ${C - dash}`, dashoffset: -offset }
    offset += len
    return slice
  })
})

const legend = computed(() => items.value.slice(0, 6))
</script>

<template>
  <div class="networth-panel">
    <div class="networth-layout">
      <div class="pie-shell">
        <svg v-if="slices.length" class="donut" viewBox="0 0 100 100" role="img" :aria-label="`Net worth ${formatDefault(netWorth)}`">
          <circle class="donut-track" cx="50" cy="50" :r="R" />
          <circle
            v-for="s in slices"
            :key="s.type + s.name"
            class="donut-slice"
            cx="50"
            cy="50"
            :r="R"
            :stroke="s.color"
            :stroke-dasharray="s.dasharray"
            :stroke-dashoffset="s.dashoffset"
          >
            <title>{{ s.name }}: {{ formatDefault(s.value) }} ({{ s.pct.toFixed(1) }}%)</title>
          </circle>
        </svg>
        <p v-else class="chart-empty">Add an account or asset to see your net worth</p>

        <div v-if="slices.length" class="chart-center">
          <span class="center-label">Net worth</span>
          <strong class="num">{{ formatDefault(netWorth) }}</strong>
        </div>
      </div>

      <ul v-if="legend.length" class="legend">
        <li v-for="item in legend" :key="item.type + item.name">
          <i :style="{ background: item.color }"></i>
          <span class="legend-name">{{ item.name }}</span>
          <span class="legend-pct num">{{ item.pct.toFixed(0) }}%</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
/* The panel is the size container; the inner layout reacts to it (a
   container query can't restyle its own container). */
.networth-panel {
  container-type: inline-size;
  height: 100%;
}

.networth-layout {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
  height: 100%;
}

.pie-shell {
  position: relative;
  flex: none;
  width: 240px;
  max-width: 100%;
  aspect-ratio: 1 / 1;
}

.donut {
  display: block;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.donut-track {
  fill: none;
  stroke: var(--bg-elevated);
  stroke-width: 9;
}

.donut-slice {
  fill: none;
  stroke-width: 9;
  stroke-linecap: round;
  transition: stroke-width var(--transition);
}

.donut-slice:hover {
  stroke-width: 11;
}

.chart-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  text-align: center;
  pointer-events: none;
}

.center-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
}

.chart-center strong {
  font-size: 1.35rem;
  font-weight: 600;
  color: var(--text-primary);
}

.chart-empty {
  display: grid;
  place-items: center;
  height: 100%;
  padding: 24px;
  text-align: center;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  flex: 1 1 160px;
  max-width: 240px;
}

.legend li {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  font-size: 0.86rem;
}

.legend i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.legend-name {
  color: var(--text-secondary);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.legend-pct {
  color: var(--text-muted);
  font-size: 0.8rem;
}

@container (max-width: 460px) {
  .networth-layout {
    flex-direction: column;
    gap: 22px;
  }

  .pie-shell {
    width: 210px;
  }

  .legend {
    flex: none;
    max-width: none;
    width: 100%;
  }
}
</style>
