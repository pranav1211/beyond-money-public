<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useTransactionsStore } from '../stores/transactions'
import { useAccountsStore } from '../stores/accounts'
import { useAuthStore } from '../stores/auth'
import { useCreditCardsStore } from '../stores/creditCards'
import AppShell from '../components/layout/AppShell.vue'
import TransactionForm from '../components/forms/TransactionForm.vue'
import { localISODate } from '../lib/dateFormat'

const router = useRouter()
const route = useRoute()
const transactionsStore = useTransactionsStore()
const auth = useAuthStore()
const creditCardsStore = useCreditCardsStore()

// Pre-populate from query params (e.g. from subscriptions "Mark Paid")
const prefill = computed(() => {
  const q = route.query
  if (!q.description) return null
  return {
    description: q.description || '',
    amount: Number(q.amount || 0),
    currency: q.currency || 'INR',
    type: q.type || 'expense',
    date: q.date || localISODate(),
    category_id: q.category_id || null,
    bill_card_id: q.bill_card_id || null,
    partial_card_id: q.partial_card_id || null,
  }
})

function getAccountName(accountId) {
  if (!accountId) return 'Cash'
  const acc = useAccountsStore().accounts.find(a => a.id === accountId)
  return acc?.name || 'Account'
}

let submitting = false

async function handleSubmit(data) {
  // Defense-in-depth against a double submit slipping past the form guard: the
  // prepaid/bill-payment side effects below must never run twice for one entry.
  if (submitting) return
  submitting = true
  try {
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

    const q = route.query
    if (q.partial_card_id) {
      const card = creditCardsStore.creditCards.find(c => c.id === q.partial_card_id)
      if (card) {
        await creditCardsStore.updateCreditCard(card.id, {
          ...card,
          prepaid_amount: Number(card.prepaid_amount || 0) + Number(data.amount || 0),
        })
      }
    } else if (q.bill_card_id) {
      const card = creditCardsStore.creditCards.find(c => c.id === q.bill_card_id)
      if (card) {
        // Archive only after the payment transaction has been saved.
        const { useCcExpensesStore } = await import('../stores/ccExpenses')
        await useCcExpensesStore().archiveForCard(card.id)
        const nextDue = card.due_date
          ? (() => { const d = new Date(card.due_date + 'T00:00:00'); const last = new Date(d.getFullYear(), d.getMonth() + 2, 0); return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}` })()
          : card.due_date
        await creditCardsStore.updateCreditCard(card.id, { ...card, due_date: nextDue, prepaid_amount: 0 })
      }
    }
  }

  router.push('/transactions')
  } finally {
    submitting = false
  }
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
