import { createRouter, createWebHistory } from 'vue-router'

import LoginView from '../views/LoginView.vue'
import DashboardView from '../views/DashboardView.vue'
import TransactionsView from '../views/TransactionsView.vue'
import AddTransactionView from '../views/AddTransactionView.vue'
import AccountsView from '../views/AccountsView.vue'
import CreditCardsView from '../views/CreditCardsView.vue'
import AssetsView from '../views/AssetsView.vue'
import NetWorthView from '../views/NetWorthView.vue'
import OrganizeView from '../views/OrganizeView.vue'
import ConverterView from '../views/ConverterView.vue'
import SettingsView from '../views/SettingsView.vue'
import SubscriptionsView from '../views/SubscriptionsView.vue'
import PendingView from '../views/PendingView.vue'

const routes = [
  { path: '/login', name: 'Login', component: LoginView, meta: { public: true } },
  { path: '/', name: 'Dashboard', component: DashboardView },
  { path: '/transactions', name: 'Transactions', component: TransactionsView },
  { path: '/transactions/add', name: 'Add Transaction', component: AddTransactionView },
  { path: '/accounts', name: 'Accounts', component: AccountsView },
  { path: '/credit-cards', name: 'Credit Cards', component: CreditCardsView },
  { path: '/assets', name: 'Assets', component: AssetsView },
  { path: '/subscriptions', name: 'Subscriptions', component: SubscriptionsView },
  { path: '/net-worth', name: 'Net Worth', component: NetWorthView },
  { path: '/organize', name: 'Labels & Categories', component: OrganizeView },
  { path: '/labels', redirect: '/organize?tab=labels' },
  { path: '/categories', redirect: '/organize?tab=categories' },
  { path: '/converter', name: 'Converter', component: ConverterView },
  { path: '/sync', name: 'Sync', component: PendingView },
  { path: '/pending', redirect: '/sync' },
  { path: '/settings', name: 'Settings', component: SettingsView },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

let authStoreInstance = null

async function getAuthStore() {
  if (!authStoreInstance) {
    const { useAuthStore } = await import('../stores/auth')
    authStoreInstance = useAuthStore()
  }
  return authStoreInstance
}

router.beforeEach(async (to) => {
  if (to.meta.public) return true
  const auth = await getAuthStore()
  await auth.waitForInit()
  if (!auth.session) return { name: 'Login' }
  return true
})

export default router
