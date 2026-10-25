<script setup>
import { computed, reactive, ref, onMounted } from 'vue'
import { useAccountsStore } from '../stores/accounts'
import { useAuthStore } from '../stores/auth'
import { useCurrenciesStore } from '../stores/currencies'
import { useCurrencyStore } from '../stores/currency'
import AppShell from '../components/layout/AppShell.vue'
import ModalWrapper from '../components/shared/ModalWrapper.vue'
import AccountForm from '../components/forms/AccountForm.vue'
import ConfirmDialog from '../components/shared/ConfirmDialog.vue'
import EmptyState from '../components/shared/EmptyState.vue'
import WalletWidget from '../components/shared/WalletWidget.vue'
import CandleLoader from '../components/shared/CandleLoader.vue'

const accountsStore = useAccountsStore()
const auth = useAuthStore()
const currenciesStore = useCurrenciesStore()
const currencyStore = useCurrencyStore()

const showForm = ref(false)
const editingAccount = ref(null)
const deletingId = ref(null)
const revealed = reactive({})

const defaultCode = computed(() => currenciesStore.defaultCurrency?.code || 'INR')

const totalBalance = computed(() =>
  accountsStore.accounts.reduce((sum, account) => {
    const amt = Number(account.current_balance || 0)
    if (account.currency === defaultCode.value) return sum + amt
    return sum + Number(currencyStore.convert(amt, account.currency, defaultCode.value) || amt)
  }, 0)
)

onMounted(async () => {
  await Promise.all([
    accountsStore.fetchAccounts(),
    currenciesStore.fetchCurrencies(),
  ])
  await currencyStore.fetchRate(currenciesStore.codes.length ? currenciesStore.codes : ['INR', 'USD'])
})

function balanceFor(account) {
  return `${currenciesStore.symbolOf(account.currency)}${Number(account.current_balance || 0).toLocaleString('en-IN')}`
}

function toggleReveal(id) {
  revealed[id] = !revealed[id]
}

function revealAll() {
  const next = !accountsStore.accounts.every(a => revealed[a.id])
  accountsStore.accounts.forEach(a => { revealed[a.id] = next })
}

const allRevealed = computed(() =>
  accountsStore.accounts.length > 0 && accountsStore.accounts.every(a => revealed[a.id])
)

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
      <div v-if="accountsStore.loading" class="loader-container">
        <CandleLoader size="md" />
      </div>

      <template v-else-if="!accountsStore.accounts.length">
        <div class="page-actions page-actions--single">
          <button class="btn-primary" @click="openAdd">Add account</button>
        </div>
        <EmptyState title="No accounts" message="Add your first account to start tracking." />
      </template>

      <template v-else>
        <div class="wallet-section">
          <!-- Tapping the wallet does the same as "Show balances". -->
          <WalletWidget
            :accounts="accountsStore.accounts"
            :totalBalance="totalBalance"
            :showTotal="allRevealed"
            @toggle="revealAll"
          />
        </div>

        <div class="page-actions">
          <button class="btn-ghost btn-reveal" :class="{ active: allRevealed }" :aria-pressed="allRevealed" @click="revealAll">
            <svg v-if="allRevealed" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
              <line x1="3" y1="3" x2="21" y2="21"/>
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            {{ allRevealed ? 'Hide balances' : 'Show balances' }}
          </button>
          <button class="btn-primary" @click="openAdd">Add account</button>
        </div>

        <div class="accounts-list">
          <div
            v-for="account in accountsStore.accounts"
            :key="account.id"
            class="account-row"
            :class="{ revealed: revealed[account.id], 'is-inactive': !account.is_active }"
          >
            <div class="account-main">
              <span class="account-icon" aria-hidden="true">
                <svg v-if="account.type === 'cash'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>
                <svg v-else-if="account.type === 'wallet'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-4a2 2 0 0 0 0 4h4v2a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6"/><path d="M21 13v4"/></svg>
                <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h18L12 4 3 10z"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/></svg>
              </span>
              <div class="account-left">
                <strong class="account-name">{{ account.name }}</strong>
                <span class="account-meta">
                  {{ account.type }} · {{ account.currency }}
                  <span v-if="!account.is_active" class="account-status">Inactive</span>
                </span>
              </div>
            </div>
            <div class="account-balance num" :class="{ 'is-negative': Number(account.current_balance) < 0 }">
              <span class="balance-mask" aria-hidden="true">••••••</span>
              <span class="balance-real">{{ balanceFor(account) }}</span>
            </div>
            <button
              class="balance-toggle"
              :class="{ active: revealed[account.id] }"
              @click.stop="toggleReveal(account.id)"
              :title="revealed[account.id] ? 'Hide balance' : 'Show balance'"
              :aria-label="revealed[account.id] ? 'Hide balance' : 'Show balance'"
            >
              <svg class="eye eye-show" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <svg class="eye eye-hide" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
                <line x1="3" y1="3" x2="21" y2="21"/>
              </svg>
            </button>
            <div class="account-actions">
              <button class="btn-action btn-ghost" @click="openEdit(account)">Edit</button>
              <button class="btn-action btn-ghost btn-action-danger" @click="deletingId = account.id">Delete</button>
            </div>
          </div>
        </div>
      </template>

      <ModalWrapper v-if="showForm" @close="showForm = false">
        <h3>{{ editingAccount ? 'Edit' : 'Add' }} account</h3>
        <AccountForm :account="editingAccount" @submit="handleSubmit" @cancel="showForm = false" />
      </ModalWrapper>

      <ConfirmDialog v-if="deletingId" title="Delete account" message="Are you sure you want to delete this account?" @confirm="confirmDelete" @cancel="deletingId = null" />
    </div>
  </AppShell>
</template>

<style scoped>
.accounts-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
  max-width: 100%;
}

/* Under the wallet: two equal buttons, as wide as the wallet on desktop and
   the full width on phones. */
.page-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
}

.page-actions--single {
  grid-template-columns: 1fr;
  max-width: 260px;
}

.page-actions > button {
  width: 100%;
  min-height: 46px;
}

.btn-reveal {
  background: var(--bg-secondary);
  box-shadow: var(--shadow-sm);
}

@media (max-width: 640px) {
  .page-actions {
    max-width: none;
  }
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
}

.btn-ghost:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.page-actions .btn-ghost.active {
  color: var(--accent);
  background: var(--accent-dim);
}

.wallet-section {
  min-width: 0;
  display: flex;
  justify-content: center;
  padding-block: 6px 10px;
}

.accounts-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

/* One soft card per account: identity, balance (with its own reveal), then
   quiet actions. Grid areas let the actions drop to their own row on phones. */
.account-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  grid-template-areas: 'main balance toggle actions';
  align-items: center;
  gap: 12px 16px;
  padding: 16px 18px;
  min-width: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  transition: border-color var(--transition), box-shadow var(--transition);
}

.account-row.revealed {
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 45%, transparent), var(--shadow-sm);
}

.account-main {
  grid-area: main;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.account-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--accent);
  background: var(--accent-dim);
}

.account-row.is-inactive .account-icon {
  color: var(--text-muted);
  background: var(--bg-elevated);
}

.account-left {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.account-name {
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.account-row.is-inactive .account-name {
  color: var(--text-secondary);
}

.account-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: 0.8rem;
  color: var(--text-muted);
  text-transform: capitalize;
}

.account-status {
  padding: 1px 9px;
  border-radius: var(--radius-pill);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: none;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--text-muted) 14%, transparent);
}

/* Mask and figure share one grid cell so the crossfade never shifts layout. */
.account-balance {
  grid-area: balance;
  display: grid;
  justify-items: end;
  align-items: center;
  min-width: 0;
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.2;
  user-select: none;
}

.account-balance .balance-mask,
.account-balance .balance-real {
  grid-area: 1 / 1;
  white-space: nowrap;
  transition: opacity var(--transition), transform var(--transition);
}

.account-balance .balance-mask {
  color: var(--text-muted);
  letter-spacing: 0.08em;
}

.account-balance .balance-real {
  opacity: 0;
  transform: translateY(6px);
  color: var(--text-primary);
}

.account-balance.is-negative .balance-real {
  color: var(--expense);
}

.account-row.revealed .account-balance .balance-mask {
  opacity: 0;
  transform: translateY(-6px);
}

.account-row.revealed .account-balance .balance-real {
  opacity: 1;
  transform: translateY(0);
}

.balance-toggle {
  grid-area: toggle;
  position: relative;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--bg-elevated);
  color: var(--text-muted);
  flex-shrink: 0;
}

.balance-toggle:hover {
  color: var(--accent);
  background: var(--bg-surface);
}

.balance-toggle.active {
  color: var(--accent);
  background: var(--accent-dim);
}

.balance-toggle .eye {
  position: absolute;
  inset: 0;
  margin: auto;
  transition: opacity var(--transition), transform var(--transition);
}

.balance-toggle .eye-hide { opacity: 0; transform: scale(0.6); }
.balance-toggle.active .eye-show { opacity: 0; transform: scale(0.6); }
.balance-toggle.active .eye-hide { opacity: 1; transform: scale(1); }

.account-actions {
  grid-area: actions;
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-action {
  padding: 8px 14px;
  font-size: 0.82rem;
}

.btn-action-danger {
  color: var(--expense);
}

.btn-action-danger:hover {
  color: var(--expense);
  background: color-mix(in srgb, var(--expense) 12%, transparent);
}

.loader-container {
  display: flex;
  justify-content: center;
  padding: 56px 0;
}

/* Phones: name + eye on top, the balance big on its own line, actions below. */
@media (max-width: 640px) {
  .account-row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'main toggle'
      'balance balance'
      'actions actions';
    gap: 12px;
    padding: 16px;
  }

  .account-balance {
    justify-items: start;
    font-size: 1.5rem;
    letter-spacing: -0.02em;
  }

  .account-balance .balance-real {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .account-actions {
    padding-top: 10px;
    border-top: 1px solid var(--border-color);
  }

  .account-actions .btn-action {
    flex: 1 1 0;
  }
}
</style>
