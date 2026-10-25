import { createRouter, createWebHistory } from 'vue-router'

// Login + Dashboard are the cold-start landing surfaces, so they stay in the
// main bundle for instant first paint. Every other view is code-split into its
// own chunk and loaded on demand — this keeps the startup bundle (and its
// parse/eval cost on mobile) small. The service worker caches each chunk the
// first time it's fetched, so they stay available offline after one visit.
import LoginView from '../views/LoginView.vue'
import DashboardView from '../views/DashboardView.vue'

const routes = [
  { path: '/login', name: 'Login', component: LoginView, meta: { public: true } },
  { path: '/', name: 'Dashboard', component: DashboardView },
  { path: '/transactions', name: 'Transactions', component: () => import('../views/TransactionsView.vue') },
  { path: '/transactions/add', name: 'Add Transaction', component: () => import('../views/AddTransactionView.vue') },
  { path: '/accounts', name: 'Accounts', component: () => import('../views/AccountsView.vue') },
  { path: '/credit-cards', name: 'Credit Cards', component: () => import('../views/CreditCardsView.vue') },
  { path: '/assets', name: 'Assets', component: () => import('../views/AssetsView.vue') },
  { path: '/subscriptions', name: 'Subscriptions', component: () => import('../views/SubscriptionsView.vue') },
  { path: '/loans', name: 'Loans', component: () => import('../views/LoansView.vue') },
  { path: '/net-worth', name: 'Net Worth', component: () => import('../views/NetWorthView.vue') },
  { path: '/organize', name: 'Labels & Categories', component: () => import('../views/OrganizeView.vue') },
  { path: '/labels', redirect: '/organize?tab=labels' },
  { path: '/categories', redirect: '/organize?tab=categories' },
  { path: '/converter', name: 'Converter', component: () => import('../views/ConverterView.vue') },
  { path: '/sync', name: 'Sync', component: () => import('../views/PendingView.vue') },
  { path: '/pending', redirect: '/sync' },
  { path: '/settings', name: 'Settings', component: () => import('../views/SettingsView.vue') },
  { path: '/month-report/:month?', name: 'Month Report', component: () => import('../views/MonthReportView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
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
