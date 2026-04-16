<script setup>
import { ref, onMounted, computed } from 'vue'
import { useTransactionsStore } from '../../stores/transactions'
const transactionsStore = useTransactionsStore()
const loading = ref(true)

const currentMonth = new Date().toISOString().slice(0, 7)

onMounted(async () => {
  await transactionsStore.fetchTransactions({ month: currentMonth })
  loading.value = false
})

const totalIncome = computed(() =>
  transactionsStore.transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount_inr, 0)
)

const totalExpenses = computed(() =>
  transactionsStore.transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount_inr, 0)
)

const net = computed(() => totalIncome.value - totalExpenses.value)
</script>

<template>
  <div class="month-summary">
    <span class="summary-month">{{ new Date(currentMonth).toLocaleString('en-IN', { month: 'long', year: 'numeric' }) }}</span>
    <div v-if="loading" class="summary-loading">Loading...</div>
    <div v-else class="stat-grid">
      <div class="stat-box stat-box--income">
        <span class="stat-label">Income</span>
        <span class="stat-amount stat-amount--income">{{ totalIncome.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }) }}</span>
      </div>
      <div class="stat-box stat-box--expense">
        <span class="stat-label">Expenses</span>
        <span class="stat-amount stat-amount--expense">{{ totalExpenses.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }) }}</span>
      </div>
      <div class="stat-box stat-box--net">
        <span class="stat-label">Net</span>
        <span class="stat-amount stat-amount--net" :class="{ negative: net < 0 }">{{ net.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.month-summary {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 24px;
  min-width: 0;
  overflow: hidden;
}

.summary-month {
  display: inline-block;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-muted);
  background: var(--bg-surface);
  padding: 2px 10px;
  border-radius: 8px;
  margin-bottom: 14px;
}

.summary-loading {
  color: var(--text-muted);
  font-size: 0.9rem;
  padding: 12px 0;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.stat-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
}

.stat-box--income {
  border-left: 3px solid var(--income);
}

.stat-box--expense {
  border-left: 3px solid var(--expense);
}

.stat-box--net {
  border-left: 3px solid var(--accent);
}

.stat-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.stat-amount {
  font-size: 1.3rem;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-amount--income {
  color: var(--income);
}

.stat-amount--expense {
  color: var(--expense);
}

.stat-amount--net {
  color: var(--accent);
}

.stat-amount--net.negative {
  color: var(--expense);
}

@media (max-width: 900px) {
  .stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .stat-grid {
    grid-template-columns: 1fr;
  }

  .stat-amount {
    font-size: 1rem;
  }

  .month-summary {
    padding: 0;
    background: none;
    border: none;
    border-radius: 0;
  }

  .stat-box {
    padding: 10px;
  }
}
</style>
