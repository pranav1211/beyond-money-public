<script setup>
import { computed } from 'vue'
import { useTransactionsStore } from '../../stores/transactions'
import { useCategoriesStore } from '../../stores/categories'
import { formatDate } from '../../lib/dateFormat'
import { inDefault, formatDefault } from '../../lib/money'

const transactionsStore = useTransactionsStore()
const categoriesStore = useCategoriesStore()

// Sort explicitly: rows restored from IndexedDB come back in key (uuid) order,
// not date order, so the store's order can't be trusted for "latest".
const recent = computed(() =>
  [...transactionsStore.transactions]
    .sort((a, b) =>
      String(b.date || '').localeCompare(String(a.date || '')) ||
      String(b.created_at || '').localeCompare(String(a.created_at || ''))
    )
    .slice(0, 5)
)

function categoryOf(tx) {
  return categoriesStore.categories.find(c => c.id === tx.category_id) || null
}

function getCategoryName(tx) {
  if (tx.type === 'transfer') return 'Transfer'
  if (tx.type === 'lend') return 'Lent'
  if (tx.type === 'lend_repayment') return 'Repaid'
  return categoryOf(tx)?.name || 'Uncategorised'
}

// The badge takes the category's own colour; flows without a category fall
// back to the semantic colour for their type.
function badgeColor(tx) {
  const c = categoryOf(tx)?.color
  if (c && c.toLowerCase() !== '#ffffff') return c
  if (tx.type === 'income' || tx.type === 'lend_repayment') return 'var(--income)'
  if (tx.type === 'expense' || tx.type === 'lend') return 'var(--expense)'
  return 'var(--info)'
}

function sign(tx) {
  if (tx.type === 'income' || tx.type === 'lend_repayment') return '+'
  if (tx.type === 'transfer') return tx.notes === 'transfer_in' ? '+' : '−'
  return '−'
}

function tone(tx) {
  if (tx.type === 'transfer') return 'transfer'
  return sign(tx) === '+' ? 'income' : 'expense'
}
</script>

<template>
  <div class="recent-card">
    <ul v-if="recent.length" class="recent-list">
      <li v-for="tx in recent" :key="tx.id" class="recent-item">
        <span class="recent-badge" :style="{ '--c': badgeColor(tx) }" aria-hidden="true">
          {{ getCategoryName(tx).charAt(0) }}
        </span>
        <span class="recent-info">
          <span class="recent-desc">{{ tx.description || getCategoryName(tx) }}</span>
          <span class="recent-meta">{{ getCategoryName(tx) }} · {{ formatDate(tx.date) }}</span>
        </span>
        <span class="recent-amount num" :class="tone(tx)">{{ sign(tx) }}{{ formatDefault(inDefault(tx)) }}</span>
      </li>
    </ul>
    <p v-else class="recent-empty">No transactions yet. Add your first one with the + button.</p>
  </div>
</template>

<style scoped>
.recent-card {
  min-width: 0;
}

.recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 12px;
  margin-inline: -12px;
  border-radius: var(--radius-sm);
  transition: background-color var(--transition);
}

.recent-item:hover {
  background: var(--bg-elevated);
}

.recent-badge {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--c);
  background: color-mix(in srgb, var(--c) 16%, transparent);
}

.recent-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.recent-desc {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-meta {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.recent-amount {
  font-size: 0.95rem;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
  color: var(--text-primary);
}

.recent-amount.income {
  color: var(--income);
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
  .recent-item {
    gap: 12px;
    padding: 8px 10px;
    margin-inline: -10px;
  }

  .recent-badge {
    width: 36px;
    height: 36px;
  }

  .recent-desc {
    font-size: 0.88rem;
  }
}
</style>
