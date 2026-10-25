<script setup>
import { computed } from 'vue'
import TransactionRow from './TransactionRow.vue'
import EmptyState from '../shared/EmptyState.vue'
import CandleLoader from '../shared/CandleLoader.vue'
import TransactionCards from './TransactionCards.vue'

const props = defineProps({
  transactions: { type: Array, required: true },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['edit', 'delete'])

const groupedByDate = computed(() => {
  const groups = []
  let currentDate = null
  for (const tx of props.transactions) {
    if (tx.date !== currentDate) {
      currentDate = tx.date
      groups.push({ date: currentDate, transactions: [tx] })
    } else {
      groups[groups.length - 1].transactions.push(tx)
    }
  }
  return groups
})

async function handleDelete(id) {
  if (confirm('Delete this transaction?')) {
    emit('delete', id)
  }
}

function handleEdit(tx) {
  emit('edit', tx)
}
</script>

<template>
  <div class="tx-list-wrapper">
    <EmptyState
      v-if="!loading && !transactions.length"
      title="No transactions"
      message="Add your first transaction to get started."
    />

    <TransactionCards
      v-if="transactions.length"
      class="mobile-only"
      :transactions="transactions"
      @edit="handleEdit"
      @delete="id => emit('delete', id)"
    />

    <div v-if="transactions.length" class="table-container desktop-only">
      <table class="tx-table">
        <thead>
          <tr>
            <th>Date</th>
            <th class="th-right">Amount</th>
            <th>Description</th>
            <th>Type</th>
            <th>Category</th>
            <th>Labels</th>
            <th>Account</th>
            <th>Actions</th>
          </tr>
        </thead>
        <template v-for="group in groupedByDate" :key="group.date">
          <tbody class="day-group">
            <TransactionRow
              v-for="tx in group.transactions"
              :key="tx.id"
              :transaction="tx"
              @delete="handleDelete"
              @edit="handleEdit"
            />
          </tbody>
        </template>
      </table>
    </div>

    <div v-if="loading" class="tx-loading">
      <CandleLoader size="sm" />
    </div>
  </div>
</template>

<style scoped>
.tx-list-wrapper {
  min-width: 0;
}

.table-container {
  overflow-x: auto;
}

.tx-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  background: transparent;
}

.tx-table th {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
  text-align: left;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border-color);
  white-space: nowrap;
}

.th-right {
  text-align: right;
}

.tx-table :deep(td) {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.9rem;
  color: var(--text-primary);
}

.tx-table :deep(tbody:last-child tr:last-child td) {
  border-bottom: none;
}

/* A slightly stronger rule marks where a new day starts. */
.day-group + .day-group :deep(tr:first-child td) {
  border-top: 1px solid var(--border-light);
}

.tx-loading {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.mobile-only {
  display: none;
}

/* Phones get the expandable card list; the table stays desktop-only. */
@media (max-width: 768px) {
  .mobile-only {
    display: flex;
  }

  .desktop-only {
    display: none;
  }
}
</style>
