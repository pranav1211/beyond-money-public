<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useTransactionsStore } from '../stores/transactions'
import { useAccountsStore } from '../stores/accounts'
import AppShell from '../components/layout/AppShell.vue'
import TransactionFilters from '../components/transactions/TransactionFilters.vue'
import TransactionList from '../components/transactions/TransactionList.vue'
import TransactionButton from '../components/shared/TransactionButton.vue'
import ModalWrapper from '../components/shared/ModalWrapper.vue'
import TransactionForm from '../components/forms/TransactionForm.vue'

const router = useRouter()
const transactionsStore = useTransactionsStore()
const accountsStore = useAccountsStore()

const editingTx = ref(null)
const search = ref('')
const currentPage = ref(1)
const perPage = 20

accountsStore.fetchAccounts()

const totalBalance = computed(() =>
  accountsStore.accounts.reduce((sum, a) => sum + Number(a.current_balance || 0), 0)
)

const sortedTransactions = computed(() => {
  const txns = [...transactionsStore.transactions]
  txns.sort((a, b) => {
    const dateDiff = new Date(b.date) - new Date(a.date)
    if (dateDiff !== 0) return dateDiff
    return new Date(b.created_at) - new Date(a.created_at)
  })
  return txns
})

const filteredTransactions = computed(() => {
  if (!search.value.trim()) return sortedTransactions.value
  const q = search.value.trim().toLowerCase()
  return sortedTransactions.value.filter(tx =>
    tx.description?.toLowerCase().includes(q)
  )
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredTransactions.value.length / perPage)))

const paginatedTransactions = computed(() => {
  const start = (currentPage.value - 1) * perPage
  return filteredTransactions.value.slice(start, start + perPage)
})

async function handleFilter(filters) {
  currentPage.value = 1
  await transactionsStore.fetchTransactions(filters)
}

async function handleDelete(id) {
  await transactionsStore.deleteTransaction(id)
}

function openEdit(tx) {
  editingTx.value = tx
}

async function handleUpdate(data) {
  const { _transfer, _fromAccountId, _toAccountId, ...submitData } = data
  await transactionsStore.updateTransaction(editingTx.value.id, submitData)
  editingTx.value = null
}

function goToPage(page) {
  if (page >= 1 && page <= totalPages.value) currentPage.value = page
}
</script>

<template>
  <AppShell>
    <div class="transactions-page fade-in">
      <header class="page-header">
        <div class="balance-display">
          <span class="balance-label">Total Balance</span>
          <span class="balance-amount">{{ totalBalance.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }) }}</span>
        </div>
        <TransactionButton
          label="Add Transaction"
          @click="router.push('/transactions/add')"
        />
      </header>

      <div class="card filters-card">
        <TransactionFilters @filter="handleFilter" />
        <div class="search-bar">
          <input
            v-model="search"
            type="text"
            placeholder="Search by description..."
            class="search-input"
            @input="currentPage = 1"
          />
        </div>
      </div>

      <div class="card list-card">
        <TransactionList
          :transactions="paginatedTransactions"
          :loading="transactionsStore.loading"
          @edit="openEdit"
          @delete="handleDelete"
        />
      </div>

      <div v-if="totalPages > 1" class="pagination">
        <button class="page-btn" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">Prev</button>
        <template v-for="page in totalPages" :key="page">
          <button
            v-if="page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)"
            class="page-btn"
            :class="{ active: page === currentPage }"
            @click="goToPage(page)"
          >{{ page }}</button>
          <span
            v-else-if="page === currentPage - 2 || page === currentPage + 2"
            class="page-ellipsis"
          >...</span>
        </template>
        <button class="page-btn" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)">Next</button>
      </div>

      <ModalWrapper v-if="editingTx" @close="editingTx = null">
        <h3>Edit Transaction</h3>
        <TransactionForm :transaction="editingTx" @submit="handleUpdate" @cancel="editingTx = null" />
      </ModalWrapper>
    </div>
  </AppShell>
</template>

<style scoped>
.transactions-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}

.balance-display {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.balance-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.balance-amount {
  font-size: 2rem;
  font-weight: 700;
  color: var(--warning);
}

.filters-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search-bar {
  width: 100%;
}

.search-input {
  width: 100%;
  padding: 10px 14px;
  border-radius: var(--radius-sm, 8px);
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.88rem;
  outline: none;
  transition: border-color 0.2s;
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-input:focus {
  border-color: var(--accent);
}

.list-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 0;
  overflow: hidden;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
}

.page-btn {
  padding: 8px 14px;
  border-radius: var(--radius-sm, 8px);
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;
}

.page-btn:hover:not(:disabled) {
  background: var(--bg-elevated);
  border-color: var(--accent-dim);
}

.page-btn.active {
  background: var(--accent);
  color: var(--bg-primary);
  border-color: var(--accent);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-ellipsis {
  color: var(--text-muted);
  padding: 0 4px;
}

@media (max-width: 600px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .filters-card {
    padding: 16px;
  }
}
</style>
