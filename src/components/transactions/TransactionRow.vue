<script setup>
import { computed } from 'vue'
import { formatDate } from '../../lib/dateFormat'
import { useLabelsStore } from '../../stores/labels'

const props = defineProps({
  transaction: { type: Object, required: true },
})

const emit = defineEmits(['delete', 'edit'])
const labelsStore = useLabelsStore()

const transactionLabels = computed(() => {
  const labelIds = props.transaction.transaction_labels?.map(tl => tl.label_id) || []
  return labelsStore.labels.filter(l => labelIds.includes(l.id))
})

function accountName(transaction) {
  return transaction.accounts?.name || '-'
}

function categoryName(transaction) {
  return transaction.categories?.name || '-'
}

function displayAmount(transaction) {
  const symbol = transaction.currency === 'USD' ? '$' : '₹'
  const formatted = Number(transaction.amount || 0).toLocaleString('en-IN')
  if (transaction.currency === 'USD') {
    const inrFormatted = Number(transaction.amount_inr || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
    return `${symbol}${formatted} (₹${inrFormatted})`
  }
  return `${symbol}${formatted}`
}
</script>

<template>
  <tr class="tx-row">
    <td class="td-date">{{ formatDate(transaction.date) }}</td>
    <td class="td-amount">
      <span :class="transaction.type">{{ displayAmount(transaction) }}</span>
    </td>
    <td class="td-desc">{{ transaction.description }}</td>
    <td>
      <span class="type-badge" :class="transaction.type">{{ transaction.type }}</span>
    </td>
    <td>{{ categoryName(transaction) }}</td>
    <td>
      <div v-if="transactionLabels.length" class="label-list">
        <span v-for="label in transactionLabels" :key="label.id" class="label-tag" :style="{ '--label-color': label.color }">{{ label.name }}</span>
      </div>
      <span v-else class="text-muted">-</span>
    </td>
    <td>{{ accountName(transaction) }}</td>
    <td>
      <div class="action-btns">
        <button class="btn-edit" @click="emit('edit', transaction)">Edit</button>
        <button class="btn-delete" @click="emit('delete', transaction.id)">Delete</button>
      </div>
    </td>
  </tr>
</template>

<style scoped>
.tx-row:hover {
  background: rgba(255, 255, 255, 0.03);
}

.td-date {
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.td-desc {
  white-space: normal;
  word-break: break-word;
}

.td-amount {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.type-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.73rem;
  font-weight: 800;
  text-transform: uppercase;
}

.type-badge.income,
span.income {
  color: var(--income);
  background: rgba(120, 224, 143, 0.12);
}

.type-badge.expense,
span.expense {
  color: var(--expense);
  background: rgba(255, 125, 125, 0.12);
}

.type-badge.transfer,
span.transfer {
  color: var(--info);
  background: rgba(117, 184, 255, 0.12);
}

span.income,
span.expense,
span.transfer {
  background: transparent;
}

.label-list {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.label-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 0.7rem;
  font-weight: 700;
  background: color-mix(in srgb, var(--label-color) 18%, transparent);
  color: var(--label-color);
  border: 1px solid color-mix(in srgb, var(--label-color) 30%, transparent);
  white-space: nowrap;
}

.action-btns {
  display: flex;
  gap: 6px;
}

.btn-edit,
.btn-delete {
  padding: 6px 12px;
  border-radius: 10px;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.78rem;
}

.btn-edit:hover {
  color: var(--accent);
  border-color: var(--accent-dim);
  background: var(--accent-dim);
}

.btn-delete:hover {
  color: var(--expense);
  border-color: rgba(255, 125, 125, 0.3);
  background: rgba(255, 125, 125, 0.08);
}
</style>
