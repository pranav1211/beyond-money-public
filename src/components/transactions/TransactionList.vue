<script setup>
import { computed } from 'vue'
import TransactionRow from './TransactionRow.vue'
import EmptyState from '../shared/EmptyState.vue'

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

    <div v-else class="table-container">
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
      <span class="loading-text">Loading transactions...</span>
    </div>
  </div>
</template>

<style scoped>
.tx-list-wrapper {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  overflow: hidden;
}

.table-container {
  overflow-x: auto;
}

.tx-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  background: transparent;
  border: none;
  border-radius: 0;
}

.tx-table thead {
  background: var(--bg-elevated);
}

.tx-table th {
  font-size: 0.73rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  text-align: left;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  white-space: nowrap;
}

.th-right {
  text-align: right;
}

.tx-table :deep(td) {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.88rem;
  color: var(--text-primary);
}

.tx-table :deep(tbody tr:last-child td) {
  border-bottom: none;
}

.day-group + .day-group :deep(tr:first-child td) {
  border-top: 3px solid var(--text-muted, rgba(255, 255, 255, 0.25));
}

.tx-loading {
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
}

.loading-text {
  font-size: 0.85rem;
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .tx-table th,
  .tx-table :deep(td) {
    padding: 10px 12px;
    font-size: 0.8rem;
  }
}
</style>
