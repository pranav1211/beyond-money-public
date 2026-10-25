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
// Phones fold the six filter selects behind a toggle. The filters component
// stays mounted either way: it emits the initial filter on mount.
const showFilters = ref(false)
const activeFilterCount = ref(0)
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

// Last filters applied, so they can be restored after the edit form (which may
// load the full history for loan maths) has run.
const lastFilters = ref({})

async function handleFilter(filters) {
  lastFilters.value = filters
  currentPage.value = 1
  // The year defaults to the current one, so it doesn't count as "active".
  activeFilterCount.value = Object.keys(filters).filter(k => k !== 'year').length
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
  if (Object.keys(lastFilters.value).length) transactionsStore.fetchTransactions(lastFilters.value)
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
          <span class="balance-label">Across all accounts</span>
          <span class="balance-amount num">{{ totalBalance.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }) }}</span>
        </div>
        <TransactionButton
          label="Add Transaction"
          @click="router.push('/transactions/add')"
        />
      </header>

      <div class="card filters-card">
        <div class="filters-top">
          <div class="search-bar">
            <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
            <input
              v-model="search"
              type="search"
              placeholder="Search transactions"
              class="search-input"
              aria-label="Search transactions by description"
              @input="currentPage = 1"
            />
          </div>
          <button type="button" class="filters-toggle" :aria-expanded="showFilters" @click="showFilters = !showFilters">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4" /></svg>
            Filters
            <span v-if="activeFilterCount" class="filters-count">{{ activeFilterCount }}</span>
          </button>
        </div>
        <div class="filters-body" :class="{ open: showFilters }">
          <TransactionFilters @filter="handleFilter" />
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
  gap: 20px;
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
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
}

.balance-amount {
  font-size: 2rem;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.filters-card {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.filters-top {
  display: flex;
  gap: 10px;
  align-items: center;
}

.search-bar {
  position: relative;
  flex: 1;
  min-width: 0;
}

.search-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 12px 16px 12px 44px;
  border-radius: var(--radius-pill);
  font-size: 0.92rem;
}

.filters-toggle {
  display: none;
  flex-shrink: 0;
  gap: 8px;
  padding: 11px 16px;
  font-size: 0.88rem;
}

.filters-toggle[aria-expanded='true'] {
  background: var(--accent-dim);
  color: var(--accent);
}

.filters-count {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  display: grid;
  place-items: center;
  font-size: 0.72rem;
  background: var(--accent);
  color: var(--accent-ink);
}

.list-card {
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
  min-width: 40px;
  padding: 9px 14px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 0.86rem;
  font-weight: 600;
}

.page-btn:hover:not(:disabled) {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.page-btn.active {
  background: var(--accent);
  color: var(--accent-ink);
}

.page-btn:disabled {
  opacity: 0.4;
}

.page-ellipsis {
  color: var(--text-muted);
  padding: 0 4px;
}

@media (max-width: 640px) {
  .page-header {
    align-items: flex-end;
  }

  .balance-amount {
    font-size: 1.6rem;
  }

  .filters-card {
    padding: 12px;
    gap: 12px;
  }

  .filters-toggle {
    display: inline-flex;
  }

  .filters-body {
    display: none;
  }

  .filters-body.open {
    display: block;
  }
}
</style>
