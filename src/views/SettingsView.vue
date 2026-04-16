<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useTransactionsStore } from '../stores/transactions'
import { useAccountsStore } from '../stores/accounts'
import { useCreditCardsStore } from '../stores/creditCards'
import { useAssetsStore } from '../stores/assets'
import { useCategoriesStore } from '../stores/categories'
import { useLabelsStore } from '../stores/labels'
import AppShell from '../components/layout/AppShell.vue'
import { useBiometricLock } from '../composables/useBiometricLock'
const router = useRouter()
const auth = useAuthStore()
const { isSupported: biometricSupported, isEnabled: biometricEnabled, enroll: biometricEnroll, disable: biometricDisable } = useBiometricLock()
const biometricLoading = ref(false)

async function toggleBiometric() {
  biometricLoading.value = true
  try {
    if (biometricEnabled.value) {
      biometricDisable()
    } else {
      await biometricEnroll()
    }
  } catch {
    // enroll cancelled or failed
  }
  biometricLoading.value = false
}
const transactionsStore = useTransactionsStore()
const accountsStore = useAccountsStore()
const creditCardsStore = useCreditCardsStore()
const assetsStore = useAssetsStore()
const categoriesStore = useCategoriesStore()
const labelsStore = useLabelsStore()

const defaultCurrency = ref(localStorage.getItem('defaultCurrency') || 'INR')

function saveDefaultCurrency() {
  localStorage.setItem('defaultCurrency', defaultCurrency.value)
}

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}

function exportCSV() {
  const transactions = transactionsStore.transactions
  if (!transactions.length) return alert('No transactions to export')

  const headers = ['Date', 'Type', 'Description', 'Amount', 'Currency', 'Amount INR']
  const rows = transactions.map(tx => [tx.date, tx.type, tx.description, tx.amount, tx.currency, tx.amount_inr])
  const csv = [headers, ...rows].map(row => row.join(',')).join('\n')

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'transactions.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}

async function exportJSON() {
  await Promise.all([
    accountsStore.fetchAccounts(),
    creditCardsStore.fetchCreditCards(),
    assetsStore.fetchAssets(),
    categoriesStore.fetchCategories(),
    labelsStore.fetchLabels(),
    transactionsStore.fetchTransactions(),
  ])

  const data = {
    accounts: accountsStore.accounts,
    creditCards: creditCardsStore.creditCards,
    assets: assetsStore.assets,
    categories: categoriesStore.categories,
    labels: labelsStore.labels,
    transactions: transactionsStore.transactions,
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'beyond-money-export.json'
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <AppShell>
    <div class="settings-page fade-in">
      <div class="card settings-card" v-if="auth.user">
        <div class="card-header">
          <h3>Account</h3>
        </div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Name</span>
            <span class="info-value">{{ auth.user.user_metadata?.full_name || 'Not set' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Email</span>
            <span class="info-value">{{ auth.user.email }}</span>
          </div>
        </div>
      </div>

      <div class="card settings-card">
        <div class="card-header">
          <h3>Preferences</h3>
        </div>
        <div class="preference-grid">
          <div class="preference-item">
            <span class="preference-label">Default Currency</span>
            <select v-model="defaultCurrency" @change="saveDefaultCurrency">
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
            </select>
          </div>
          <div class="preference-item" v-if="biometricSupported">
            <div>
              <span class="preference-label">App Lock</span>
              <span class="preference-hint">Use fingerprint or face to unlock</span>
            </div>
            <button
              class="toggle-btn"
              :class="{ active: biometricEnabled }"
              :disabled="biometricLoading"
              @click="toggleBiometric"
            >
              <span class="toggle-knob" />
            </button>
          </div>
        </div>
      </div>

      <div class="card settings-card">
        <div class="card-header">
          <h3>Export</h3>
        </div>
        <div class="export-buttons">
          <button class="export-btn" @click="exportCSV">Export CSV</button>
          <button class="export-btn" @click="exportJSON">Export JSON</button>
        </div>
      </div>

      <div class="card settings-card danger-card">
        <div class="card-header">
          <h3>Sign Out</h3>
        </div>
        <button class="btn-danger signout-btn" @click="handleLogout">Sign Out</button>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 860px;
}

.settings-card {
  padding: 20px;
}

.card-header {
  margin-bottom: 14px;
}

.card-header h3 {
  font-size: 1.05rem;
  font-weight: 800;
}

.info-grid,
.preference-grid {
  display: grid;
  gap: 14px;
}

.preference-item,
.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 14px;
  border-radius: 16px;
  background: var(--bg-elevated);
}

.info-label,
.preference-label {
  font-size: 0.8rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.info-value {
  color: var(--text-secondary);
}

.export-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.export-btn {
  min-width: 160px;
}

.signout-btn {
  width: fit-content;
}

.preference-hint {
  display: block;
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 2px;
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
}

.toggle-btn {
  position: relative;
  width: 48px;
  height: 28px;
  border-radius: 14px;
  border: none;
  background: var(--bg-surface);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s;
}

.toggle-btn.active {
  background: var(--accent);
}

.toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--text-primary);
  transition: transform 0.2s;
}

.toggle-btn.active .toggle-knob {
  transform: translateX(20px);
  background: #0d1117;
}

.toggle-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 720px) {
  .preference-item,
  .info-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .preference-item select {
    width: 100%;
  }
}
</style>
