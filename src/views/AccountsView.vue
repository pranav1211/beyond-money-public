<script setup>
import { computed, ref, onMounted } from 'vue'
import { useAccountsStore } from '../stores/accounts'
import { useAuthStore } from '../stores/auth'
import AppShell from '../components/layout/AppShell.vue'
import ModalWrapper from '../components/shared/ModalWrapper.vue'
import AccountForm from '../components/forms/AccountForm.vue'
import ConfirmDialog from '../components/shared/ConfirmDialog.vue'
import EmptyState from '../components/shared/EmptyState.vue'
import WalletWidget from '../components/shared/WalletWidget.vue'
import CandleLoader from '../components/shared/CandleLoader.vue'

const accountsStore = useAccountsStore()
const auth = useAuthStore()

const showForm = ref(false)
const editingAccount = ref(null)
const deletingId = ref(null)

const totalBalance = computed(() =>
  accountsStore.accounts.reduce((sum, account) => sum + Number(account.current_balance || 0), 0)
)

onMounted(() => {
  accountsStore.fetchAccounts()
})

function openAdd() {
  editingAccount.value = null
  showForm.value = true
}

function openEdit(account) {
  editingAccount.value = account
  showForm.value = true
}

async function handleSubmit(data) {
  if (editingAccount.value) {
    await accountsStore.updateAccount(editingAccount.value.id, data)
  } else {
    await accountsStore.addAccount({ ...data, user_id: auth.user.id })
  }
  showForm.value = false
}

async function confirmDelete() {
  await accountsStore.deleteAccount(deletingId.value)
  deletingId.value = null
}
</script>

<template>
  <AppShell>
    <div class="accounts-page fade-in">
      <div class="page-header">
        <button class="btn-primary" @click="openAdd">Add Account</button>
      </div>

      <div v-if="accountsStore.loading" class="loader-container">
        <CandleLoader size="md" />
      </div>

      <EmptyState v-else-if="!accountsStore.accounts.length" title="No accounts" message="Add your first account to start tracking." />

      <template v-else>
        <div class="wallet-section">
          <WalletWidget :accounts="accountsStore.accounts" :totalBalance="totalBalance" />
        </div>

        <div class="accounts-list">
          <div v-for="account in accountsStore.accounts" :key="account.id" class="account-row">
            <div class="account-left">
              <strong>{{ account.name }}</strong>
              <span class="account-meta">{{ account.type }}</span>
            </div>
            <div class="account-right">
              <span class="account-status" :class="account.is_active ? 'status-active' : 'status-inactive'">{{ account.is_active ? 'Active' : 'Inactive' }}</span>
              <button class="btn-action" @click="openEdit(account)">Edit</button>
              <button class="btn-action btn-action-danger" @click="deletingId = account.id">Delete</button>
            </div>
          </div>
        </div>
      </template>

      <ModalWrapper v-if="showForm" @close="showForm = false">
        <h3>{{ editingAccount ? 'Edit' : 'Add' }} Account</h3>
        <AccountForm :account="editingAccount" @submit="handleSubmit" @cancel="showForm = false" />
      </ModalWrapper>

      <ConfirmDialog v-if="deletingId" title="Delete Account" message="Are you sure you want to delete this account?" @confirm="confirmDelete" @cancel="deletingId = null" />
    </div>
  </AppShell>
</template>

<style scoped>
.accounts-page {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.wallet-section {
  display: flex;
  justify-content: center;
  padding-bottom: 8px;
}

.accounts-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.account-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.account-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.account-meta {
  font-size: 0.8rem;
  color: var(--text-muted);
  text-transform: capitalize;
}

.account-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.account-status {
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
}

.status-active {
  background: rgba(120, 224, 143, 0.14);
  color: var(--income);
}

.status-inactive {
  background: rgba(140, 154, 176, 0.14);
  color: var(--text-muted);
}

.btn-action {
  background: var(--bg-elevated);
  padding: 6px 12px;
  font-size: 0.8rem;
}

.btn-action-danger {
  color: var(--expense);
}

.loader-container {
  display: flex;
  justify-content: center;
  padding: 56px 0;
}

@media (max-width: 600px) {
  .account-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .account-right {
    width: 100%;
  }
}
</style>
