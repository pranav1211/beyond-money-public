import { computed } from 'vue'
import { useAccountsStore } from '../stores/accounts'
import { useAssetsStore } from '../stores/assets'
import { useCreditCardsStore } from '../stores/creditCards'
import { useCcExpensesStore } from '../stores/ccExpenses'

export function useNetWorth() {
  const accountsStore = useAccountsStore()
  const assetsStore = useAssetsStore()
  const creditCardsStore = useCreditCardsStore()
  const ccExpensesStore = useCcExpensesStore()

  const loading = computed(() =>
    accountsStore.loading || assetsStore.loading || creditCardsStore.loading || ccExpensesStore.loading
  )

  const totalAccounts = computed(() =>
    accountsStore.accounts.reduce((sum, a) => sum + Number(a.current_balance || 0), 0)
  )

  const totalAssets = computed(() =>
    assetsStore.assets.reduce((sum, a) => sum + Number(a.current_value || 0), 0)
  )

  const totalCreditCards = computed(() =>
    creditCardsStore.creditCards.reduce((sum, c) => sum + ccExpensesStore.totalForCard(c.id), 0)
  )

  const netWorth = computed(() =>
    totalAccounts.value + totalAssets.value - totalCreditCards.value
  )

  const components = computed(() => {
    const items = []
    accountsStore.accounts.forEach(a =>
      items.push({ name: a.name, value: Number(a.current_balance || 0), type: 'Account' })
    )
    assetsStore.assets.forEach(a =>
      items.push({ name: a.name, value: Number(a.current_value || 0), type: 'Asset' })
    )
    creditCardsStore.creditCards.forEach(c =>
      items.push({ name: c.name, value: -ccExpensesStore.totalForCard(c.id), type: 'Credit Card' })
    )
    return items
  })

  const positiveComponents = computed(() =>
    components.value.filter(c => c.value > 0)
  )

  async function fetchAll() {
    await Promise.all([
      accountsStore.fetchAccounts(),
      assetsStore.fetchAssets(),
      creditCardsStore.fetchCreditCards(),
      ccExpensesStore.fetchExpenses(),
    ])
  }

  return {
    loading,
    totalAccounts,
    totalAssets,
    totalCreditCards,
    netWorth,
    components,
    positiveComponents,
    fetchAll,
  }
}
