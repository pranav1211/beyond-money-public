<script setup>
import { defineAsyncComponent, computed } from 'vue'
import { useToday } from '../composables/useToday'
import AppShell from '../components/layout/AppShell.vue'
import MonthSummary from '../components/dashboard/MonthSummary.vue'
import RecentTransactions from '../components/dashboard/RecentTransactions.vue'

// NetWorthPie pulls in useNetWorth (accounts, assets, loans, cards stores).
// Load it lazily so it's split out of the startup bundle: the dashboard shell
// paints immediately and the donut fills in a moment later. (It's plain SVG
// now, so it no longer brings chart.js onto the dashboard.)
const NetWorthPie = defineAsyncComponent(() => import('../components/dashboard/NetWorthPie.vue'))

// Label and data both derive from the same reactive LOCAL month. Previously the
// label was local but the data month was UTC, so after midnight IST the chip
// said the new month while the numbers stayed on the old one until 05:30.
const { currentMonth } = useToday()
const currentMonthLabel = computed(() => {
  const [y, m] = currentMonth.value.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
})

</script>

<template>
  <AppShell>
    <div class="dashboard-page fade-in">
      <div class="dashboard-grid">
        <section class="dash-card dash-card--accent">
          <div class="dash-card-header dash-card-header--split">
            <span class="dash-card-title">Month Summary</span>
            <span class="dash-card-chip">{{ currentMonthLabel }}</span>
          </div>
          <div class="dash-card-body">
            <MonthSummary />
          </div>
        </section>

        <section class="dash-card dash-card--spotlight">
          <div class="dash-card-header dash-card-header--split">
            <span class="dash-card-title">Net Worth</span>
            <router-link to="/net-worth" class="view-all">View all <span aria-hidden="true">→</span></router-link>
          </div>
          <div class="dash-card-body">
            <NetWorthPie />
          </div>
        </section>

        <section class="dash-card dash-card--full">
          <div class="dash-card-header dash-card-header--split">
            <span class="dash-card-title">Recent Transactions</span>
            <router-link to="/transactions" class="view-all">View all <span aria-hidden="true">→</span></router-link>
          </div>
          <div class="dash-card-body">
            <RecentTransactions />
          </div>
        </section>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.dashboard-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.dash-card {
  padding: 24px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  box-shadow: var(--shadow-sm);
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.dash-card-body {
  flex: 1;
  min-width: 0;
}

.dash-card--full {
  grid-column: 1 / -1;
}

.dash-card--accent {
  background: var(--bg-accent), var(--bg-secondary);
}

.dash-card-header {
  margin-bottom: 18px;
}

.dash-card-header--split {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dash-card-title {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.dash-card-chip {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  white-space: nowrap;
}

.view-all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: var(--radius-pill);
  font-size: 0.82rem;
  font-weight: 700;
  background: var(--accent-dim);
  color: var(--accent);
  white-space: nowrap;
  transition: background-color var(--transition);
}

.view-all:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 24%, transparent);
}

@media (max-width: 900px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .dashboard-grid {
    gap: 14px;
  }

  .dash-card {
    padding: 18px;
  }

  .dash-card-header {
    margin-bottom: 14px;
  }
}
</style>
