<script setup>
import AppShell from '../components/layout/AppShell.vue'
import MonthSummary from '../components/dashboard/MonthSummary.vue'
import NetWorthPie from '../components/dashboard/NetWorthPie.vue'
import RecentTransactions from '../components/dashboard/RecentTransactions.vue'
</script>

<template>
  <AppShell>
    <div class="dashboard-page fade-in">
      <div class="dashboard-grid">
        <section class="dash-card dash-card--accent">
          <div class="dash-card-header">
            <span class="dash-card-title">Month Summary</span>
          </div>
          <div class="dash-card-body">
            <MonthSummary />
          </div>
        </section>

        <section class="dash-card dash-card--spotlight">
          <div class="dash-card-header">
            <span class="dash-card-title">Net Worth</span>
          </div>
          <div class="dash-card-body">
            <NetWorthPie />
          </div>
        </section>

        <section class="dash-card dash-card--full">
          <div class="dash-card-header">
            <span class="dash-card-title">Recent Transactions</span>
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
  gap: 18px;
}

.dash-card {
  padding: 22px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  box-shadow: var(--shadow-sm);
  min-width: 0;
}

.dash-card--full {
  grid-column: 1 / -1;
}

.dash-card--accent {
  background: var(--bg-accent), var(--bg-secondary);
}

.dash-card--spotlight {
  background:
    radial-gradient(circle at top right, rgba(255, 196, 87, 0.16), transparent 34%),
    radial-gradient(circle at top left, rgba(111, 228, 201, 0.18), transparent 30%),
    var(--bg-secondary);
}

.dash-card-header {
  margin-bottom: 14px;
}

.dash-card-title {
  font-size: 1rem;
  font-weight: 800;
}

@media (max-width: 900px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .dashboard-grid {
    gap: 12px;
  }

  .dash-card {
    padding: 12px;
  }

  .dash-card-header {
    margin-bottom: 8px;
  }
}
</style>
