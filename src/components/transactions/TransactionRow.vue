<script setup>
import { computed } from 'vue'
import { formatDate } from '../../lib/dateFormat'
import { useLabelsStore } from '../../stores/labels'
import { useCurrenciesStore } from '../../stores/currencies'
import { inDefault, defaultCurrencyCode, defaultCurrencySymbol } from '../../lib/money'

const props = defineProps({
  transaction: { type: Object, required: true },
})

const emit = defineEmits(['delete', 'edit'])
const labelsStore = useLabelsStore()
const currenciesStore = useCurrenciesStore()

const transactionLabels = computed(() => {
  const labelIds = props.transaction.transaction_labels?.map(tl => tl.label_id) || []
  return labelsStore.labels.filter(l => labelIds.includes(l.id))
})

function accountName(transaction) {
  return transaction.accounts?.name || '-'
}

function categoryName(transaction) {
  if (transaction.type === 'transfer') return 'Transfer'
  if (transaction.type === 'lend') return 'Lent'
  if (transaction.type === 'lend_repayment') return 'Repaid'
  return transaction.categories?.name || 'Uncategorised'
}

const TYPE_LABELS = { income: 'Income', expense: 'Expense', transfer: 'Transfer', lend: 'Lent', lend_repayment: 'Repaid' }
function typeLabel(transaction) {
  return TYPE_LABELS[transaction.type] || transaction.type
}

function amountSign(transaction) {
  if (transaction.type === 'income' || transaction.type === 'lend_repayment') return '+'
  if (transaction.type === 'transfer') return transaction.notes === 'transfer_in' ? '+' : '−'
  return '−'
}

function displayAmount(transaction) {
  const code = transaction.currency || defaultCurrencyCode()
  const symbol = currenciesStore.symbolOf(code)
  const formatted = Number(transaction.amount || 0).toLocaleString('en-IN')
  if (code !== defaultCurrencyCode()) {
    const conv = Number(inDefault(transaction) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
    return `${symbol}${formatted} (${defaultCurrencySymbol()}${conv})`
  }
  return `${symbol}${formatted}`
}
</script>

<template>
  <tr class="tx-row">
    <td class="td-date">{{ formatDate(transaction.date) }}</td>
    <td class="td-amount">
      <span class="num" :class="transaction.type">{{ amountSign(transaction) }}{{ displayAmount(transaction) }}</span>
    </td>
    <td class="td-desc">
      {{ transaction.description || categoryName(transaction) }}
      <span v-if="transaction.borrower_name" class="borrower-pill">{{ transaction.borrower_name }}</span>
    </td>
    <td class="td-type">
      <span class="type-badge" :class="transaction.type">{{ typeLabel(transaction) }}</span>
    </td>
    <td class="td-cat">
      <span class="cat-dot" :style="{ background: transaction.categories?.color || 'var(--text-muted)' }" aria-hidden="true"></span>{{ categoryName(transaction) }}
    </td>
    <td class="td-labels" :class="{ 'is-empty': !transactionLabels.length }">
      <div v-if="transactionLabels.length" class="label-list">
        <span
          v-for="label in transactionLabels"
          :key="label.id"
          class="label-tag"
          :style="{ '--label-color': label.color }"
        >{{ label.name }}</span>
      </div>
      <span v-else class="text-muted">-</span>
    </td>
    <td class="td-account">{{ accountName(transaction) }}</td>
    <td class="td-actions">
      <div class="action-btns">
        <button class="btn-edit" @click="emit('edit', transaction)">Edit</button>
        <button class="btn-delete" @click="emit('delete', transaction.id)">Delete</button>
      </div>
    </td>
  </tr>
</template>

<style scoped>
.tx-row {
  transition: background-color var(--transition);
}

.tx-row:hover {
  background: var(--bg-elevated);
}

.td-date {
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.td-desc {
  white-space: normal;
  word-break: break-word;
  font-weight: 600;
}

.td-amount {
  text-align: right;
  white-space: nowrap;
}

.td-amount .num {
  font-weight: 600;
}

.td-cat {
  white-space: nowrap;
  color: var(--text-secondary);
}

.cat-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 8px;
  border-radius: 50%;
  vertical-align: 1px;
}

.td-account {
  color: var(--text-secondary);
  white-space: nowrap;
}

/* Amounts: income and repayments in green, transfers in blue; everyday
   spending stays in the normal text colour rather than alarm red. */
span.income,
span.lend_repayment { color: var(--income); }
span.transfer { color: var(--info); }

.type-badge {
  --tone: var(--text-muted);
  display: inline-block;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 14%, transparent);
  white-space: nowrap;
}

.type-badge.income { --tone: var(--income); }
.type-badge.expense { --tone: var(--text-secondary); }
.type-badge.transfer { --tone: var(--info); }
.type-badge.lend { --tone: var(--warning); }
.type-badge.lend_repayment { --tone: var(--income); }

.borrower-pill {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 9px;
  border-radius: var(--radius-pill);
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 14%, transparent);
  white-space: nowrap;
}

.label-list {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.label-tag {
  display: inline-block;
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  font-size: 0.7rem;
  font-weight: 700;
  background: var(--label-color);
  color: #11151b;
  white-space: nowrap;
}

.action-btns {
  display: flex;
  gap: 4px;
}

.btn-edit,
.btn-delete {
  padding: 6px 12px;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 600;
}

.btn-edit:hover {
  color: var(--accent);
  background: var(--accent-dim);
}

.btn-delete:hover {
  color: var(--expense);
  background: color-mix(in srgb, var(--expense) 12%, transparent);
}
</style>
