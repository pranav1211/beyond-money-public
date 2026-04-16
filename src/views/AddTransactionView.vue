<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useTransactionsStore } from '../stores/transactions'
import { useAccountsStore } from '../stores/accounts'
import { useAuthStore } from '../stores/auth'
import AppShell from '../components/layout/AppShell.vue'
import TransactionForm from '../components/forms/TransactionForm.vue'

const router = useRouter()
const route = useRoute()
const transactionsStore = useTransactionsStore()
const auth = useAuthStore()

// Pre-populate from query params (e.g. from subscriptions "Mark Paid")
const prefill = computed(() => {
  const q = route.query
  if (!q.description) return null
  return {
    description: q.description || '',
    amount: Number(q.amount || 0),
    currency: q.currency || 'INR',
    type: q.type || 'expense',
  }
})

function getAccountName(accountId) {
  if (!accountId) return 'Cash'
  const acc = useAccountsStore().accounts.find(a => a.id === accountId)
  return acc?.name || 'Account'
}

async function handleSubmit(data) {
  const userId = auth.user.id

  if (data._transfer) {
    const { _transfer, _fromAccountId, _toAccountId, labels, ...txBase } = data
    const fromName = getAccountName(_fromAccountId)
    const toName = getAccountName(_toAccountId)
    const desc = `${fromName} → ${toName}`

    // Debit from source
    await transactionsStore.addTransaction({
      ...txBase, type: 'transfer', account_id: _fromAccountId || null,
      credit_card_id: null, category_id: null,
      description: desc, notes: 'transfer_out', user_id: userId, labels: [],
    })
    // Credit to destination
    await transactionsStore.addTransaction({
      ...txBase, type: 'transfer', account_id: _toAccountId || null,
      credit_card_id: null, category_id: null,
      description: desc, notes: 'transfer_in', user_id: userId, labels: [],
    })
  } else {
    await transactionsStore.addTransaction({ ...data, user_id: userId })
  }

  router.push('/transactions')
}
</script>

<template>
  <AppShell>
    <div class="add-transaction-page fade-in">
      <header class="page-header">
        <button class="back-btn" @click="router.push('/transactions')">Back</button>
      </header>

      <div class="form-card card">
        <TransactionForm :transaction="prefill" @submit="handleSubmit" @cancel="router.push('/transactions')" />
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.add-transaction-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.back-btn {
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.form-card {
  padding: 24px;
}

@media (max-width: 768px) {
  .form-card {
    padding: 16px;
  }
}
</style>
