<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useTransactionsStore } from '../stores/transactions'
import { useAccountsStore } from '../stores/accounts'
import { useCreditCardsStore } from '../stores/creditCards'
import { useAssetsStore } from '../stores/assets'
import { useCategoriesStore } from '../stores/categories'
import { useCurrenciesStore } from '../stores/currencies'
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
const currenciesStore = useCurrenciesStore()
const labelsStore = useLabelsStore()

const defaultCurrency = ref(localStorage.getItem('defaultCurrency') || 'INR')

onMounted(async () => {
  await currenciesStore.fetchCurrencies()
  if (currenciesStore.defaultCurrency?.code) {
    defaultCurrency.value = currenciesStore.defaultCurrency.code
  }
})

watch(() => currenciesStore.defaultCurrency?.code, (code) => {
  if (code) defaultCurrency.value = code
})

async function saveDefaultCurrency() {
  localStorage.setItem('defaultCurrency', defaultCurrency.value)
  await currenciesStore.setDefault(defaultCurrency.value)
}

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}

function exportCSV() {
  const transactions = transactionsStore.transactions
  if (!transactions.length) return alert('No transactions to export')

  const headers = ['Date', 'Type', 'Description', 'Amount', 'Currency', 'Amount (Default)', 'Default Currency']
  const rows = transactions.map(tx => [tx.date, tx.type, tx.description, tx.amount, tx.currency, tx.amount_default ?? tx.amount_inr ?? '', tx.default_currency || ''])
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
      <section v-if="auth.user" class="settings-group">
        <h2 class="group-title">Account</h2>
        <div class="card group-card">
          <div class="profile-row">
            <span class="profile-avatar" aria-hidden="true">
              {{ (auth.user.user_metadata?.full_name || auth.user.email || '?').charAt(0).toUpperCase() }}
            </span>
            <div class="profile-copy">
              <span class="profile-name" :class="{ 'is-unset': !auth.user.user_metadata?.full_name }">
                {{ auth.user.user_metadata?.full_name || 'Name not set' }}
              </span>
              <span class="profile-email">{{ auth.user.email }}</span>
            </div>
          </div>
        </div>
      </section>

      <section class="settings-group">
        <h2 class="group-title">Preferences</h2>
        <div class="card group-card">
          <div class="row row--stack">
            <div class="row-copy">
              <span class="row-label">Default currency</span>
              <span class="row-hint">Totals and conversions across the app use this currency.</span>
            </div>
            <select v-model="defaultCurrency" class="row-select" aria-label="Default currency" @change="saveDefaultCurrency">
              <option v-for="c in currenciesStore.currencies" :key="c.code" :value="c.code">
                {{ c.code }} ({{ c.symbol }})
              </option>
            </select>
          </div>
          <div class="row">
            <div class="row-copy">
              <span class="row-label">Manage currencies</span>
              <span class="row-hint">Add or remove currencies from the Currency page.</span>
            </div>
            <router-link to="/converter" class="link-btn">
              Open converter
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </router-link>
          </div>
          <div class="row" v-if="biometricSupported">
            <div class="row-copy">
              <span class="row-label">App lock</span>
              <span class="row-hint">Use fingerprint or face to unlock.</span>
            </div>
            <button
              class="toggle-btn"
              :class="{ active: biometricEnabled }"
              :disabled="biometricLoading"
              role="switch"
              :aria-checked="biometricEnabled ? 'true' : 'false'"
              aria-label="App lock"
              @click="toggleBiometric"
            >
              <span class="toggle-knob" />
            </button>
          </div>
        </div>
      </section>

      <section class="settings-group">
        <h2 class="group-title">Export</h2>
        <div class="card group-card">
          <div class="row row--stack">
            <div class="row-copy">
              <span class="row-label">Transactions as CSV</span>
              <span class="row-hint">A spreadsheet of your loaded transactions.</span>
            </div>
            <button class="row-btn" @click="exportCSV">Export CSV</button>
          </div>
          <div class="row row--stack">
            <div class="row-copy">
              <span class="row-label">Full backup as JSON</span>
              <span class="row-hint">Accounts, cards, assets, categories, labels and transactions.</span>
            </div>
            <button class="row-btn" @click="exportJSON">Export JSON</button>
          </div>
        </div>
      </section>

      <section class="settings-group">
        <h2 class="group-title">Session</h2>
        <div class="card group-card danger-card">
          <div class="row row--stack">
            <div class="row-copy">
              <span class="row-label danger-label">Sign out</span>
              <span class="row-hint">End your session on this device.</span>
            </div>
            <button class="btn-danger row-btn" @click="handleLogout">Sign out</button>
          </div>
        </div>
      </section>
    </div>
  </AppShell>
</template>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 760px;
  min-width: 0;
}

.settings-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.group-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
  padding: 0 8px;
  letter-spacing: 0;
}

.group-card {
  overflow: hidden;
  border-radius: var(--radius);
}

/* Rows: label + description on the left, control on the right. */
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 16px;
  padding: 16px 20px;
  min-width: 0;
}

.row + .row,
.profile-row + .row {
  border-top: 1px solid var(--border-color);
}

.row-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 220px;
  min-width: 0;
}

.row-label {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
}

.row-hint {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.45;
}

.row-select {
  width: auto;
  min-width: 170px;
  max-width: 100%;
  padding-top: 10px;
  padding-bottom: 10px;
  font-weight: 600;
}

.row-btn {
  padding: 9px 18px;
  font-size: 0.86rem;
  flex-shrink: 0;
}

/* Account */
.profile-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  min-width: 0;
}

.profile-avatar {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-dim);
}

.profile-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.profile-name {
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.profile-name.is-unset {
  color: var(--text-muted);
}

.profile-email {
  font-size: 0.85rem;
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

/* Link to the converter page, styled as a soft accent pill. */
.link-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px 9px 18px;
  border-radius: var(--radius-pill);
  background: var(--accent-dim);
  color: var(--accent);
  font-weight: 700;
  font-size: 0.86rem;
  white-space: nowrap;
  transition: background-color var(--transition);
}

.link-btn:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 24%, transparent);
}

/* Toggle switch */
.toggle-btn {
  position: relative;
  width: 50px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--border-light);
  flex-shrink: 0;
}

.toggle-btn:hover {
  background: var(--border-light);
}

.toggle-btn.active,
.toggle-btn.active:hover {
  background: var(--accent);
}

.toggle-btn:active:not(:disabled) {
  transform: none;
}

.toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--text-primary);
  box-shadow: 0 2px 6px rgba(2, 6, 16, 0.25);
  transition: transform var(--transition), background-color var(--transition);
}

.toggle-btn.active .toggle-knob {
  transform: translateX(20px);
  background: var(--accent-ink);
}

.toggle-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Session group: separated from the rest with a soft red tint. */
.danger-card {
  background: color-mix(in srgb, var(--expense) 5%, var(--bg-secondary));
  border-color: color-mix(in srgb, var(--expense) 20%, transparent);
}

.danger-label {
  color: var(--expense);
}

@media (max-width: 560px) {
  .row {
    padding: 14px 16px;
  }

  .profile-row {
    padding: 16px;
  }

  /* Wide controls drop below their label and fill the row. */
  .row--stack {
    flex-direction: column;
    align-items: stretch;
  }

  .row--stack .row-copy {
    flex-basis: auto;
  }

  .row--stack .row-select,
  .row--stack .row-btn {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .toggle-knob {
    transition: none;
  }
}
</style>
