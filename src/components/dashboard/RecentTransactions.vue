<script setup>
import { computed } from 'vue'
import { useTransactionsStore } from '../../stores/transactions'
import { useCategoriesStore } from '../../stores/categories'
import { formatDate } from '../../lib/dateFormat'

const transactionsStore = useTransactionsStore()
const categoriesStore = useCategoriesStore()

const recent = computed(() => transactionsStore.transactions.slice(0, 5))

function getCategoryName(id) {
  return categoriesStore.categories.find(c => c.id === id)?.name || '-'
}
</script>

<template>
  <div class="recent-card">
    <div v-if="recent.length" class="recent-list">
      <div
        v-for="tx in recent"
        :key="tx.id"
        class="recent-item"
      >
        <div class="recent-indicator" :class="tx.type"></div>
        <div class="recent-info">
          <span class="recent-desc">{{ tx.description }}</span>
          <span class="recent-meta">{{ formatDate(tx.date) }} &middot; {{ getCategoryName(tx.category_id) }}</span>
        </div>
        <span class="recent-amount" :class="tx.type">
          {{ tx.type === 'income' ? '+' : '-' }}{{ tx.amount_inr.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }) }}
        </span>
      </div>
    </div>
    <p v-else class="recent-empty">No transactions yet</p>
  </div>
</template>

<style scoped>
.recent-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 24px;
  transition: all var(--transition);
  min-width: 0;
}

.recent-card:hover {
  border-color: var(--border-light);
  box-shadow: var(--card-shadow-hover);
}

.recent-list {
  display: flex;
  flex-direction: column;
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
}

.recent-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.recent-item:first-child {
  padding-top: 0;
}

.recent-indicator {
  width: 4px;
  height: 32px;
  border-radius: 2px;
  flex-shrink: 0;
}

.recent-indicator.income {
  background: var(--income);
}

.recent-indicator.expense {
  background: var(--expense);
}

.recent-indicator.transfer {
  background: var(--info);
}

.recent-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.recent-desc {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-meta {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.recent-amount {
  font-size: 0.9rem;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.recent-amount.income {
  color: var(--income);
}

.recent-amount.expense {
  color: var(--expense);
}

.recent-amount.transfer {
  color: var(--info);
}

.recent-empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.9rem;
  padding: 24px 0;
}

@media (max-width: 640px) {
  .recent-card {
    padding: 0;
    background: none;
    border: none;
    border-radius: 0;
  }

  .recent-item {
    gap: 8px;
  }

  .recent-amount {
    font-size: 0.8rem;
  }

  .recent-desc {
    font-size: 0.82rem;
  }

  .recent-meta {
    font-size: 0.7rem;
  }
}
</style>
