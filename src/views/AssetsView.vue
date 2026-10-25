<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAssetsStore } from '../stores/assets'
import { useAccountsStore } from '../stores/accounts'
import { useTransactionsStore } from '../stores/transactions'
import { useAuthStore } from '../stores/auth'
import { useCurrenciesStore } from '../stores/currencies'
import { useCurrencyStore } from '../stores/currency'
import { useCategoriesStore } from '../stores/categories'
import { formatDate } from '../lib/dateFormat'
import { toCurrency, defaultCurrencyCode, defaultCurrencySymbol } from '../lib/money'
import { ASSET_GROUPS, metaFor } from '../lib/assetTypes'
import { INVESTING_CATEGORIES } from '../lib/investment'
import { resolvePrice } from '../lib/stockPrices'
import AppShell from '../components/layout/AppShell.vue'
import ModalWrapper from '../components/shared/ModalWrapper.vue'
import AssetForm from '../components/forms/AssetForm.vue'
import SellAssetForm from '../components/forms/SellAssetForm.vue'
import BuyAssetForm from '../components/forms/BuyAssetForm.vue'
import ConfirmDialog from '../components/shared/ConfirmDialog.vue'
import EmptyState from '../components/shared/EmptyState.vue'
import CandleLoader from '../components/shared/CandleLoader.vue'

const assetsStore = useAssetsStore()
const accountsStore = useAccountsStore()
const transactionsStore = useTransactionsStore()
const auth = useAuthStore()
const currenciesStore = useCurrenciesStore()
const currencyStore = useCurrencyStore()
const categoriesStore = useCategoriesStore()

const showForm = ref(false)
const editingAsset = ref(null)
const sellingAsset = ref(null)
const buyingAsset = ref(null)   // holding being added to (buy-more)
const showBuy = ref(false)      // buy modal open (new or existing)
const deletingId = ref(null)
const collapsedGroups = ref(new Set())
const expandedLots = ref(new Set())
const activeTab = ref('stock')
const refreshingPrices = ref(false)
const priceMsg = ref('')

const defaultCode = computed(() => defaultCurrencyCode())
const defaultSymbol = computed(() => defaultCurrencySymbol())

function valueInDefault(asset) {
  return toCurrency(asset.current_value || 0, asset.currency || defaultCode.value, defaultCode.value)
}

function principalInDefault(asset) {
  return toCurrency(asset.principal_amount || 0, asset.currency || defaultCode.value, defaultCode.value)
}

const totalValue = computed(() =>
  assetsStore.assets.reduce((sum, a) => sum + valueInDefault(a), 0)
)

const totalPrincipal = computed(() =>
  assetsStore.assets.reduce((sum, a) => sum + principalInDefault(a), 0)
)

const totalGrowth = computed(() => {
  if (!totalPrincipal.value) return 0
  return (((totalValue.value - totalPrincipal.value) / totalPrincipal.value) * 100).toFixed(2)
})

// ───── Tabs: Stocks / Mutual Funds / Other ─────
const stockAssets = computed(() => assetsStore.assets.filter(a => a.type === 'stock'))
const fundAssets = computed(() => assetsStore.assets.filter(a => a.type === 'mutual_fund'))
const otherAssets = computed(() => assetsStore.assets.filter(a => a.type !== 'stock' && a.type !== 'mutual_fund'))

const tabs = computed(() => [
  { key: 'stock', label: 'Stocks', count: stockAssets.value.length },
  { key: 'mutual_fund', label: 'Mutual Funds', count: fundAssets.value.length },
  { key: 'other', label: 'Other', count: otherAssets.value.length },
])

function tabTotals(list) {
  const invested = list.reduce((s, a) => s + principalInDefault(a), 0)
  const value = list.reduce((s, a) => s + valueInDefault(a), 0)
  const returns = value - invested
  const pct = invested ? (returns / invested) * 100 : 0
  return { invested, value, returns, pct }
}

const activeList = computed(() =>
  activeTab.value === 'stock' ? stockAssets.value
    : activeTab.value === 'mutual_fund' ? fundAssets.value
      : otherAssets.value
)
const activeTotals = computed(() => tabTotals(activeList.value))

// "Other" tab keeps the grouped/collapsible view (ASSET_GROUPS minus the two
// promoted types). Stocks/MF tabs render as a single flat grid.
const groupedOther = computed(() => {
  const map = new Map(ASSET_GROUPS.map(g => [g.code, []]))
  for (const a of otherAssets.value) {
    const g = metaFor(a.type).group
    if (!map.has(g)) map.set(g, [])
    map.get(g).push(a)
  }
  return ASSET_GROUPS
    .map(g => ({ ...g, items: map.get(g.code) || [] }))
    .filter(g => g.items.length)
})

const displayGroups = computed(() => {
  if (activeTab.value === 'other') return groupedOther.value.map(g => ({ ...g, flat: false }))
  if (!activeList.value.length) return []
  return [{ code: activeTab.value, label: '', flat: true, items: activeList.value }]
})

// Fetch live prices for stocks that have a symbol, cache-first (once/day).
async function refreshPrices() {
  const list = stockAssets.value.filter(a => a.symbol)
  if (!list.length) { priceMsg.value = 'Add a ticker symbol (e.g. RELIANCE.NS) to a stock to fetch its price.'; return }
  if (!navigator.onLine) { priceMsg.value = 'Offline — showing last known prices.'; return }
  refreshingPrices.value = true
  priceMsg.value = ''
  let updated = 0
  let failed = 0
  for (const asset of list) {
    const quote = await resolvePrice(asset.symbol)
    if (!quote || !Number.isFinite(quote.price)) { failed++; continue }
    // Setting unit_price lets normalizeAsset recompute current_value
    // (= quantity × unit_price) while preserving lots/principal.
    await assetsStore.updateAsset(asset.id, {
      ...asset,
      unit_price: quote.price,
      price_updated_at: new Date().toISOString(),
    })
    updated++
  }
  refreshingPrices.value = false
  priceMsg.value = failed
    ? `Updated ${updated}, ${failed} failed — check the symbol suffix (.NS / .BO).`
    : `Updated ${updated} ${updated === 1 ? 'price' : 'prices'}.`
}

onMounted(async () => {
  await Promise.all([
    assetsStore.fetchAssets(),
    accountsStore.fetchAccounts(),
    // Hydrate the transactions store (cache-first) so the sell flow appends to
    // the full set — addTransaction's idbSet rewrites the whole store, and
    // writing a partial in-memory list would clobber the cached transactions.
    transactionsStore.fetchTransactions(),
    currenciesStore.fetchCurrencies(),
    categoriesStore.fetchCategories(),
  ])
  await currencyStore.fetchRate(currenciesStore.codes.length ? currenciesStore.codes : ['INR', 'USD'])
})

function openAdd() {
  editingAsset.value = null
  showForm.value = true
}

function openEdit(asset) {
  editingAsset.value = asset
  showForm.value = true
}

function openSell(asset) {
  sellingAsset.value = asset
}

async function handleSubmit(data) {
  if (editingAsset.value) {
    await assetsStore.updateAsset(editingAsset.value.id, data)
  } else {
    await assetsStore.addAsset({ ...data, user_id: auth.user.id })
  }
  showForm.value = false
}

// Selling records the return of invested capital and the profit as two
// separate incomings (a realized loss becomes an expense), then shrinks or
// removes the asset. Every generated transaction is categorised (Capital
// Returned / Realized Gain / Realized Loss) — no null-category rows.
async function handleSell(d) {
  const userId = auth.user.id
  const code = d.asset.currency || 'INR'
  const target = defaultCode.value

  const [capitalCat, gainCat, lossCat] = await Promise.all([
    categoriesStore.ensureCategory(INVESTING_CATEGORIES.capital, userId),
    categoriesStore.ensureCategory(INVESTING_CATEGORIES.gain, userId),
    categoriesStore.ensureCategory(INVESTING_CATEGORIES.loss, userId),
  ])

  const baseTx = {
    currency: code,
    default_currency: target,
    account_id: d.accountId,
    date: d.date,
    notes: null,
    user_id: userId,
    labels: [],
  }

  if (d.costBasis > 0) {
    await transactionsStore.addTransaction({
      ...baseTx,
      type: 'income',
      category_id: capitalCat?.id || null,
      amount: d.costBasis,
      amount_default: round2(toCurrency(d.costBasis, code, target)),
      description: `Sold ${d.asset.name} · Capital${d.charges > 0 ? ` · ${d.charges} charges deducted` : ''}`,
    })
  }

  if (d.profit > 0) {
    await transactionsStore.addTransaction({
      ...baseTx,
      type: 'income',
      category_id: gainCat?.id || null,
      amount: d.profit,
      amount_default: round2(toCurrency(d.profit, code, target)),
      description: `Sold ${d.asset.name} · Profit`,
    })
  } else if (d.profit < 0) {
    const loss = Math.abs(d.profit)
    await transactionsStore.addTransaction({
      ...baseTx,
      type: 'expense',
      category_id: lossCat?.id || null,
      amount: loss,
      amount_default: round2(toCurrency(loss, code, target)),
      description: `Sold ${d.asset.name} · Loss`,
    })
  }

  if (d.fullySold) {
    await assetsStore.deleteAsset(d.asset.id)
  } else {
    const payload = { ...d.asset }
    if (d.remainingLots) {
      payload.lots = d.remainingLots
    } else {
      payload.lots = null
      payload.quantity = d.remainingQty
    }
    await assetsStore.updateAsset(d.asset.id, payload)
  }

  sellingAsset.value = null
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100 }

function openBuy(asset = null) {
  buyingAsset.value = asset
  showBuy.value = true
}

function closeBuy() {
  showBuy.value = false
  buyingAsset.value = null
}

// Buying records ONE atomic operation: the holding/lot is created (or extended)
// AND a single "Investment" expense for the amount actually debited is written,
// which moves the funding account by the same amount. Charges are folded into
// the lot's cost basis (unit_cost = settlement / qty) so the broker balance and
// the cost basis always tie out — no more traded-vs-settlement paise drift.
async function handleBuy(d) {
  const userId = auth.user.id
  const code = d.currency || 'INR'
  const target = defaultCode.value

  const investCat = await categoriesStore.ensureCategory(INVESTING_CATEGORIES.buy, userId)

  // Lot is valued at the traded price — charges are a cost of the trade, not
  // part of the share price. They live on the expense's description instead.
  const lot = {
    quantity: d.quantity,
    unit_cost: d.price,
    purchased_at: d.date,
    note: null,
  }

  if (d.isExisting && d.asset) {
    const existing = d.asset
    const priorLots = existing.lots && existing.lots.length
      ? existing.lots
      : (Number(existing.quantity)
        ? [{ quantity: Number(existing.quantity), unit_cost: Number(existing.unit_cost) || 0, purchased_at: existing.created_at || null }]
        : [])
    await assetsStore.updateAsset(existing.id, { ...existing, lots: [...priorLots, lot] })
  } else {
    await assetsStore.addAsset({
      user_id: userId,
      name: d.name,
      type: d.type,
      symbol: d.symbol,
      currency: code,
      unit_price: d.price,
      lots: [lot],
    })
  }

  await transactionsStore.addTransaction({
    type: 'expense',
    currency: code,
    default_currency: target,
    account_id: d.accountId,
    category_id: investCat?.id || null,
    amount: d.settlement,
    amount_default: round2(toCurrency(d.settlement, code, target)),
    date: d.date,
    description: `Bought ${d.name} · ${d.quantity} @ ${d.price}${d.charges > 0 ? ` · incl. ${d.charges} charges` : ''}`,
    notes: null,
    user_id: userId,
    labels: [],
  })

  closeBuy()
}

async function confirmDelete() {
  await assetsStore.deleteAsset(deletingId.value)
  deletingId.value = null
}

function growth(asset) {
  if (!asset.principal_amount) return 0
  return (((asset.current_value - asset.principal_amount) / asset.principal_amount) * 100).toFixed(2)
}

function isPositive(asset) {
  return Number(asset.current_value || 0) >= Number(asset.principal_amount || 0)
}

function pnlAbs(asset) {
  return Number(asset.current_value || 0) - Number(asset.principal_amount || 0)
}

function pnlPctNum(asset) {
  const p = Number(asset.principal_amount || 0)
  if (!p) return 0
  return (pnlAbs(asset) / p) * 100
}

function shapeOf(asset) {
  return metaFor(asset.type).shape
}

function lotPnl(asset, lot) {
  const price = Number(asset.unit_price)
  if (!Number.isFinite(price) || price <= 0) return null
  const q = Number(lot.quantity) || 0
  const c = Number(lot.unit_cost) || 0
  if (!q) return null
  return (price - c) * q
}

function lotPnlPct(asset, lot) {
  const price = Number(asset.unit_price)
  const c = Number(lot.unit_cost) || 0
  if (!Number.isFinite(price) || price <= 0 || !c) return null
  return ((price - c) / c) * 100
}

// Fund lots store the invested amount as quantity (with unit_cost 1).
function fundLotAmount(lot) {
  return (Number(lot.quantity) || 0) * (Number(lot.unit_cost) || 1)
}

function fmtNative(amount, code) {
  return `${currenciesStore.symbolOf(code)}${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function fmtNativeSigned(amount, code) {
  const n = Number(amount || 0)
  const sign = n >= 0 ? '+' : '−'
  return `${sign}${currenciesStore.symbolOf(code)}${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function fmtSignedPct(n) {
  if (!Number.isFinite(n)) return '0%'
  const sign = n >= 0 ? '+' : '−'
  return `${sign}${Math.abs(n).toFixed(2)}%`
}

function fmtDefault(amount) {
  return `${defaultSymbol.value}${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function fmtDefaultSigned(amount) {
  const n = Number(amount || 0)
  const sign = n >= 0 ? '+' : '−'
  return `${sign}${defaultSymbol.value}${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function fmtAsOf(iso) {
  if (!iso) return ''
  try { return formatDate(iso) } catch { return '' }
}

function toggleGroup(code) {
  if (collapsedGroups.value.has(code)) collapsedGroups.value.delete(code)
  else collapsedGroups.value.add(code)
  collapsedGroups.value = new Set(collapsedGroups.value)
}

function toggleLots(id) {
  if (expandedLots.value.has(id)) expandedLots.value.delete(id)
  else expandedLots.value.add(id)
  expandedLots.value = new Set(expandedLots.value)
}
</script>

<template>
  <AppShell>
    <div class="assets-page fade-in">
      <div v-if="assetsStore.loading" class="loader-container">
        <CandleLoader size="md" />
      </div>

      <template v-else-if="!assetsStore.assets.length">
        <div class="page-header">
          <button class="btn-primary" @click="openAdd">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add asset
          </button>
        </div>
        <EmptyState title="No assets" message="Add your first asset to start tracking." />
      </template>

      <template v-else>
        <!-- Portfolio hero: big total, soft growth pill, then small stat tiles. -->
        <div class="hero-card card">
          <div class="hero-top">
            <div class="hero-copy">
              <span class="hero-label">Total asset value</span>
              <div class="hero-row">
                <span class="hero-value num">{{ fmtDefault(totalValue) }}</span>
                <span class="pill" :class="totalGrowth >= 0 ? 'pill--pos' : 'pill--neg'">
                  {{ fmtSignedPct(Number(totalGrowth)) }}
                </span>
              </div>
              <span class="hero-sub">Valued in {{ defaultCode }} at live rates</span>
            </div>
            <div class="hero-actions">
              <button class="btn-buy" @click="openBuy(null)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>
                Buy
              </button>
              <button class="btn-primary" @click="openAdd">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add asset
              </button>
            </div>
          </div>

          <div class="hero-stats">
            <div class="stat stat--invest">
              <span class="stat-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20v-7" /><path d="M12 14c0-3.5 2.4-6 6-6 0 3.5-2.4 6-6 6z" /><path d="M12 16c0-2.8-2-4.6-4.8-4.6 0 2.8 2 4.6 4.8 4.6z" /></svg>
              </span>
              <span class="stat-label">Total invested</span>
              <span class="stat-value num">{{ fmtDefault(totalPrincipal) }}</span>
            </div>
            <div class="stat" :class="totalGrowth >= 0 ? 'stat--gain' : 'stat--loss'">
              <span class="stat-icon" aria-hidden="true">
                <svg v-if="totalGrowth >= 0" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></svg>
                <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 7 9 13 13 9 21 17" /><polyline points="14 17 21 17 21 10" /></svg>
              </span>
              <span class="stat-label">Overall growth</span>
              <span class="stat-value num" :class="totalGrowth >= 0 ? 'text-income' : 'text-expense'">
                {{ fmtDefaultSigned(totalValue - totalPrincipal) }}
              </span>
            </div>
            <div class="stat stat--count">
              <span class="stat-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 8l9 5 9-5-9-5z" /><path d="m3 13 9 5 9-5" /></svg>
              </span>
              <span class="stat-label">Assets</span>
              <span class="stat-value num">{{ assetsStore.assets.length }}</span>
            </div>
          </div>
        </div>

        <!-- Tab bar -->
        <div class="asset-tabs" role="tablist">
          <button
            v-for="t in tabs"
            :key="t.key"
            class="asset-tab"
            :class="{ active: activeTab === t.key }"
            role="tab"
            :aria-selected="activeTab === t.key"
            @click="activeTab = t.key"
          >
            {{ t.label }}<span class="asset-tab-count num">{{ t.count }}</span>
          </button>
        </div>

        <!-- Per-tab summary (Stocks & Mutual Funds) -->
        <div v-if="activeTab !== 'other'" class="tab-summary card">
          <div class="ts-grid">
            <div class="ts-cell">
              <span class="ts-label">Current value</span>
              <span class="ts-value num">{{ fmtDefault(activeTotals.value) }}</span>
            </div>
            <div class="ts-cell">
              <span class="ts-label">Total invested</span>
              <span class="ts-value num">{{ fmtDefault(activeTotals.invested) }}</span>
            </div>
            <div class="ts-cell">
              <span class="ts-label">Total returns</span>
              <span class="ts-value num" :class="activeTotals.returns >= 0 ? 'text-income' : 'text-expense'">
                {{ fmtDefaultSigned(activeTotals.returns) }}
                <span class="ts-pct">{{ fmtSignedPct(activeTotals.pct) }}</span>
              </span>
            </div>
          </div>
          <div v-if="activeTab === 'stock'" class="ts-foot">
            <span v-if="priceMsg" class="price-msg">{{ priceMsg }}</span>
            <button
              class="btn-refresh"
              :disabled="refreshingPrices"
              @click="refreshPrices"
            >
              {{ refreshingPrices ? 'Refreshing…' : '↻ Refresh prices' }}
            </button>
          </div>
        </div>

        <EmptyState
          v-if="!displayGroups.length"
          :title="`No ${activeTab === 'stock' ? 'stocks' : activeTab === 'mutual_fund' ? 'mutual funds' : 'other assets'} yet`"
          message="Add one with the button above."
        />

        <div v-for="group in displayGroups" :key="group.code" class="group-section">
          <button v-if="!group.flat" class="group-header" @click="toggleGroup(group.code)">
            <span class="group-caret" :class="{ open: !collapsedGroups.has(group.code) }">›</span>
            <span class="group-label">{{ group.label }}</span>
            <span class="group-count num">{{ group.items.length }}</span>
          </button>

          <div v-if="group.flat || !collapsedGroups.has(group.code)" class="assets-grid">
            <div v-for="asset in group.items" :key="asset.id" class="asset-card card" :class="`shape-${shapeOf(asset)}`">
              <div class="asset-card-top">
                <div class="asset-icon">{{ metaFor(asset.type).icon }}</div>
                <div class="asset-info">
                  <h3 class="asset-name">{{ asset.name }}</h3>
                  <span class="asset-sub">
                    {{ metaFor(asset.type).label }}
                    <template v-if="asset.symbol"> · {{ asset.symbol }}</template>
                    <template v-if="asset.provider"> · {{ asset.provider }}</template>
                  </span>
                </div>
              </div>

              <!-- CASH: just the amount -->
              <template v-if="shapeOf(asset) === 'cash'">
                <div class="value-block">
                  <span class="value-label">Balance</span>
                  <span class="value-big num">{{ fmtNative(asset.current_value, asset.currency) }}</span>
                  <span v-if="(asset.currency || defaultCode) !== defaultCode" class="val-converted num">
                    ≈ {{ fmtDefault(valueInDefault(asset)) }}
                  </span>
                </div>
              </template>

              <!-- HOLDING: current value + gain/loss + stats + lots -->
              <template v-else-if="shapeOf(asset) === 'holding'">
                <div class="value-block">
                  <span class="value-label">Current value</span>
                  <div class="value-row">
                    <span class="value-big num">{{ fmtNative(asset.current_value, asset.currency) }}</span>
                    <span class="growth-pill" :class="isPositive(asset) ? 'growth-up' : 'growth-down'">
                      {{ fmtSignedPct(pnlPctNum(asset)) }}
                    </span>
                  </div>
                  <span v-if="(asset.currency || defaultCode) !== defaultCode" class="val-converted num">
                    ≈ {{ fmtDefault(valueInDefault(asset)) }}
                  </span>
                  <div class="pnl-row" :class="isPositive(asset) ? 'pnl-up' : 'pnl-down'">
                    <span class="pnl-label">Gain / loss</span>
                    <span class="pnl-value num">{{ fmtNativeSigned(pnlAbs(asset), asset.currency) }}</span>
                  </div>
                </div>

                <div class="hold-stats">
                  <div class="hs-cell">
                    <span class="hs-label">{{ metaFor(asset.type).unitsLabel || 'Qty' }}</span>
                    <span class="hs-value num">{{ Number(asset.quantity || 0).toLocaleString('en-IN', { maximumFractionDigits: 4 }) }}</span>
                  </div>
                  <div class="hs-cell">
                    <span class="hs-label">Avg cost</span>
                    <span class="hs-value num">{{ asset.unit_cost ? fmtNative(asset.unit_cost, asset.currency) : '—' }}</span>
                  </div>
                  <div class="hs-cell">
                    <span class="hs-label">Last price</span>
                    <span class="hs-value num">{{ asset.unit_price ? fmtNative(asset.unit_price, asset.currency) : '—' }}</span>
                  </div>
                </div>

                <span v-if="asset.type === 'stock' && asset.price_updated_at" class="price-asof">
                  Price as of {{ fmtAsOf(asset.price_updated_at) }}
                </span>

                <button v-if="asset.lots?.length" type="button" class="lots-toggle" @click="toggleLots(asset.id)">
                  <span class="lots-toggle-caret" :class="{ open: expandedLots.has(asset.id) }">›</span>
                  {{ asset.lots.length }} {{ asset.lots.length === 1 ? 'lot' : 'lots' }}
                </button>

                <div v-if="asset.lots?.length && expandedLots.has(asset.id)" class="lots-detail">
                  <div v-for="(lot, i) in asset.lots" :key="i" class="lot-detail-row">
                    <div class="ldr-left">
                      <span class="ldr-qty num">{{ Number(lot.quantity).toLocaleString('en-IN', { maximumFractionDigits: 4 }) }}</span>
                      <span class="ldr-mult">@</span>
                      <span class="ldr-cost num">{{ fmtNative(lot.unit_cost, asset.currency) }}</span>
                      <span v-if="lot.purchased_at" class="ldr-date">· {{ formatDate(lot.purchased_at) }}</span>
                    </div>
                    <span
                      class="ldr-pnl num"
                      :class="lotPnl(asset, lot) == null ? 'pnl-muted' : (lotPnl(asset, lot) >= 0 ? 'pnl-up' : 'pnl-down')"
                    >
                      <template v-if="lotPnl(asset, lot) == null">—</template>
                      <template v-else>
                        {{ fmtNativeSigned(lotPnl(asset, lot), asset.currency) }}
                        <span class="ldr-pnl-pct">{{ fmtSignedPct(lotPnlPct(asset, lot)) }}</span>
                      </template>
                    </span>
                  </div>
                </div>
              </template>

              <!-- FUND: mutual fund — folio value + invested + SIP lots -->
              <template v-else-if="shapeOf(asset) === 'fund'">
                <div class="value-block">
                  <span class="value-label">Folio value</span>
                  <div class="value-row">
                    <span class="value-big num">{{ fmtNative(asset.current_value, asset.currency) }}</span>
                    <span class="growth-pill" :class="isPositive(asset) ? 'growth-up' : 'growth-down'">
                      {{ fmtSignedPct(pnlPctNum(asset)) }}
                    </span>
                  </div>
                  <span v-if="(asset.currency || defaultCode) !== defaultCode" class="val-converted num">
                    ≈ {{ fmtDefault(valueInDefault(asset)) }}
                  </span>
                  <div class="pnl-row" :class="isPositive(asset) ? 'pnl-up' : 'pnl-down'">
                    <span class="pnl-label">Gain / loss</span>
                    <span class="pnl-value num">{{ fmtNativeSigned(pnlAbs(asset), asset.currency) }}</span>
                  </div>
                </div>

                <div class="hold-stats hold-stats--2">
                  <div class="hs-cell">
                    <span class="hs-label">Invested</span>
                    <span class="hs-value num">{{ fmtNative(asset.principal_amount, asset.currency) }}</span>
                  </div>
                  <div class="hs-cell">
                    <span class="hs-label">Investments</span>
                    <span class="hs-value num">{{ asset.lots?.length || 0 }}</span>
                  </div>
                </div>

                <button v-if="asset.lots?.length" type="button" class="lots-toggle" @click="toggleLots(asset.id)">
                  <span class="lots-toggle-caret" :class="{ open: expandedLots.has(asset.id) }">›</span>
                  {{ asset.lots.length }} {{ asset.lots.length === 1 ? 'investment' : 'investments' }}
                </button>

                <div v-if="asset.lots?.length && expandedLots.has(asset.id)" class="lots-detail">
                  <div v-for="(lot, i) in asset.lots" :key="i" class="lot-detail-row">
                    <div class="ldr-left">
                      <span class="ldr-cost num">{{ fmtNative(fundLotAmount(lot), asset.currency) }}</span>
                      <span v-if="lot.purchased_at" class="ldr-date">· {{ formatDate(lot.purchased_at) }}</span>
                    </div>
                  </div>
                </div>
              </template>

              <!-- DEPOSIT / PROPERTY / SIMPLE -->
              <template v-else>
                <div class="value-block">
                  <span class="value-label">{{ shapeOf(asset) === 'property' ? 'Market value' : 'Current value' }}</span>
                  <div class="value-row">
                    <span class="value-big num">{{ fmtNative(asset.current_value, asset.currency) }}</span>
                    <span class="growth-pill" :class="isPositive(asset) ? 'growth-up' : 'growth-down'">
                      {{ fmtSignedPct(pnlPctNum(asset)) }}
                    </span>
                  </div>
                  <span v-if="(asset.currency || defaultCode) !== defaultCode" class="val-converted num">
                    ≈ {{ fmtDefault(valueInDefault(asset)) }}
                  </span>
                  <div v-if="Number(asset.principal_amount)" class="pnl-row" :class="isPositive(asset) ? 'pnl-up' : 'pnl-down'">
                    <span class="pnl-label">Gain / loss</span>
                    <span class="pnl-value num">{{ fmtNativeSigned(pnlAbs(asset), asset.currency) }}</span>
                  </div>
                </div>

                <div class="hold-stats hold-stats--1">
                  <div class="hs-cell">
                    <span class="hs-label">{{ shapeOf(asset) === 'property' ? 'Purchase price' : 'Principal' }}</span>
                    <span class="hs-value num">{{ fmtNative(asset.principal_amount, asset.currency) }}</span>
                  </div>
                </div>
              </template>

              <div v-if="asset.interest_rate || asset.maturity_date || asset.tags?.length" class="asset-meta">
                <div v-if="asset.interest_rate" class="meta-pill">
                  <span class="meta-label">Rate</span>
                  <span class="meta-value num">{{ asset.interest_rate }}%</span>
                </div>
                <div v-if="asset.maturity_date" class="meta-pill">
                  <span class="meta-label">{{ shapeOf(asset) === 'property' ? 'Purchased' : 'Maturity' }}</span>
                  <span class="meta-value">{{ formatDate(asset.maturity_date) }}</span>
                </div>
                <template v-if="asset.tags?.length">
                  <div v-for="t in asset.tags" :key="t" class="meta-pill tag-pill">
                    <span class="meta-value">#{{ t }}</span>
                  </div>
                </template>
              </div>

              <div v-if="asset.notes" class="asset-notes">{{ asset.notes }}</div>

              <div class="asset-actions">
                <button v-if="shapeOf(asset) === 'holding'" class="btn-action btn-action-buy" @click="openBuy(asset)">Buy more</button>
                <button v-if="shapeOf(asset) !== 'cash'" class="btn-action" @click="openSell(asset)">Sell</button>
                <span class="actions-spacer"></span>
                <button class="btn-action btn-ghost" @click="openEdit(asset)">Edit</button>
                <button class="btn-action btn-danger" @click="deletingId = asset.id">Delete</button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <ModalWrapper v-if="showForm" @close="showForm = false">
        <h3>{{ editingAsset ? 'Edit' : 'Add' }} asset</h3>
        <AssetForm :asset="editingAsset" @submit="handleSubmit" @cancel="showForm = false" />
      </ModalWrapper>

      <ModalWrapper v-if="sellingAsset" @close="sellingAsset = null">
        <h3>Sell {{ sellingAsset.name }}</h3>
        <SellAssetForm :asset="sellingAsset" :accounts="accountsStore.accounts" @submit="handleSell" @cancel="sellingAsset = null" />
      </ModalWrapper>

      <ModalWrapper v-if="showBuy" @close="closeBuy">
        <h3>{{ buyingAsset ? `Buy more ${buyingAsset.name}` : 'Buy holding' }}</h3>
        <BuyAssetForm
          :asset="buyingAsset"
          :accounts="accountsStore.accounts"
          :default-currency="defaultCode"
          @submit="handleBuy"
          @cancel="closeBuy"
        />
      </ModalWrapper>

      <ConfirmDialog v-if="deletingId" title="Delete asset" message="Are you sure you want to delete this asset?" @confirm="confirmDelete" @cancel="deletingId = null" />
    </div>
  </AppShell>
</template>

<style scoped>
.assets-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
  max-width: 100%;
}

.page-header {
  display: flex;
  justify-content: flex-end;
}

.loader-container {
  display: flex;
  justify-content: center;
  padding: 56px 0;
}

/* ───── Portfolio hero ───── */
.hero-card {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  background: var(--bg-accent), var(--bg-secondary);
  border-radius: var(--radius-lg);
  min-width: 0;
  /* Stat tiles react to the card's own width, like the dashboard summary. */
  container-type: inline-size;
  container-name: assethero;
}

.hero-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.hero-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.hero-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
}

.hero-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.hero-value {
  font-size: clamp(1.9rem, 7cqi, 2.6rem);
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.025em;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.hero-sub {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.pill {
  font-size: 0.78rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  white-space: nowrap;
}

.pill--pos {
  color: var(--income);
  background: color-mix(in srgb, var(--income) 14%, transparent);
}

.pill--neg {
  color: var(--expense);
  background: color-mix(in srgb, var(--expense) 14%, transparent);
}

.hero-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-buy:hover {
  background: var(--bg-surface);
}

.hero-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.stat {
  --tone: var(--accent);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 16px;
  min-width: 0;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
}

.stat--invest { --tone: var(--info); }
.stat--gain { --tone: var(--income); }
.stat--loss { --tone: var(--expense); }

.stat-icon {
  width: 30px;
  height: 30px;
  margin-bottom: 10px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 16%, transparent);
}

.stat-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.stat-value {
  font-size: clamp(1rem, 3.6cqi, 1.3rem);
  font-weight: 600;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.stat-value.text-income { color: var(--income); }
.stat-value.text-expense { color: var(--expense); }

@container assethero (max-width: 520px) {
  .hero-stats {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .stat {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 12px;
    padding: 12px 14px;
  }

  .stat-icon {
    margin-bottom: 0;
  }

  .stat-value {
    text-align: right;
  }
}

/* ───── Tabs: a pill segmented control ───── */
.asset-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--bg-elevated);
  border-radius: var(--radius-pill);
  overflow-x: auto;
  scrollbar-width: none;
}

.asset-tabs::-webkit-scrollbar { display: none; }

.asset-tab {
  flex: 1;
  gap: 8px;
  white-space: nowrap;
  padding: 9px 16px;
  background: transparent;
  border: 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 700;
}

.asset-tab:hover { color: var(--text-primary); background: transparent; }

.asset-tab.active {
  background: var(--bg-secondary);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}

.asset-tab-count {
  font-size: 0.72rem;
  font-weight: 600;
  min-width: 22px;
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  background: var(--bg-surface);
  color: var(--text-muted);
}

.asset-tab.active .asset-tab-count {
  background: var(--accent-dim);
  color: var(--accent);
}

/* ───── Per-tab summary ───── */
.tab-summary {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 22px;
  min-width: 0;
  container-type: inline-size;
  container-name: tabsummary;
}

.ts-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.ts-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ts-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.ts-value {
  display: inline-flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.ts-value.text-income { color: var(--income); }
.ts-value.text-expense { color: var(--expense); }

.ts-pct {
  font-size: 0.78rem;
  font-weight: 700;
  opacity: 0.85;
}

.ts-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 14px;
  border-top: 1px solid var(--border-color);
}

.price-msg {
  flex: 1 1 200px;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.btn-refresh {
  padding: 8px 16px;
  background: var(--accent-dim);
  color: var(--accent);
  font-size: 0.82rem;
  white-space: nowrap;
}

.btn-refresh:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 24%, transparent);
}

@container tabsummary (max-width: 480px) {
  .ts-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .ts-cell {
    flex-direction: row;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    padding: 10px 0;
  }

  .ts-cell + .ts-cell {
    border-top: 1px solid var(--border-color);
  }

  .ts-value {
    font-size: 1.02rem;
    justify-content: flex-end;
    text-align: right;
  }

  .btn-refresh {
    flex: 1 1 100%;
  }
}

/* ───── Groups (Other tab) ───── */
.group-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.group-header {
  justify-content: flex-start;
  gap: 10px;
  padding: 8px 14px 8px 10px;
  background: transparent;
  color: var(--text-secondary);
  font-family: var(--font-display);
  font-weight: 600;
}

.group-header:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.group-caret {
  display: inline-block;
  width: 14px;
  font-size: 1.1rem;
  line-height: 1;
  transition: transform var(--transition);
}

.group-caret.open { transform: rotate(90deg); }

.group-label { flex: 1; text-align: left; }

.group-count {
  padding: 1px 9px;
  border-radius: var(--radius-pill);
  background: var(--bg-elevated);
  color: var(--text-muted);
  font-size: 0.72rem;
}

/* ───── Holding cards ───── */
.assets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: 16px;
}

.asset-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  min-width: 0;
  overflow: hidden;
}

.asset-card-top {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.asset-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--accent-dim);
  color: var(--accent);
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 0.78rem;
  flex-shrink: 0;
}

.asset-info { flex: 1; min-width: 0; }

.asset-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.asset-sub {
  display: block;
  font-size: 0.8rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Current value first and biggest, then the gain/loss. */
.value-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.value-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.value-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  min-width: 0;
}

.value-big {
  font-size: 1.6rem;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.val-converted {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.growth-pill {
  font-size: 0.76rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  white-space: nowrap;
}

.growth-up {
  color: var(--income);
  background: color-mix(in srgb, var(--income) 14%, transparent);
}

.growth-down {
  color: var(--expense);
  background: color-mix(in srgb, var(--expense) 14%, transparent);
}

.pnl-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 8px;
  margin-top: 4px;
  min-width: 0;
}

.pnl-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.pnl-value {
  font-size: 0.95rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.pnl-row.pnl-up .pnl-value { color: var(--income); }
.pnl-row.pnl-down .pnl-value { color: var(--expense); }

/* Secondary figures: small label/value tiles. */
.hold-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.hold-stats--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.hold-stats--1 { grid-template-columns: minmax(0, 1fr); }

.hs-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  min-width: 0;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
}

.hold-stats--1 .hs-cell {
  flex-direction: row;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.hs-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
}

.hs-value {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.price-asof {
  margin-top: -8px;
  font-size: 0.75rem;
  color: var(--text-muted);
}

/* ───── Lot toggle + breakdown ───── */
.lots-toggle {
  align-self: flex-start;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 600;
  margin: -6px 0 -6px -6px;
}

.lots-toggle:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.lots-toggle-caret {
  display: inline-block;
  font-size: 0.95rem;
  line-height: 1;
  transition: transform var(--transition);
}

.lots-toggle-caret.open { transform: rotate(90deg); }

.lots-detail {
  display: flex;
  flex-direction: column;
  padding: 4px 14px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
}

.lot-detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  font-size: 0.8rem;
}

.lot-detail-row + .lot-detail-row {
  border-top: 1px solid var(--border-color);
}

.ldr-left {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
  color: var(--text-secondary);
}

.ldr-qty { font-weight: 600; color: var(--text-primary); }
.ldr-mult { color: var(--text-muted); }
.ldr-cost { color: var(--text-primary); }
.ldr-date { color: var(--text-muted); font-size: 0.75rem; }

.ldr-pnl {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-weight: 600;
  white-space: nowrap;
}

.ldr-pnl.pnl-up { color: var(--income); }
.ldr-pnl.pnl-down { color: var(--expense); }
.ldr-pnl.pnl-muted { color: var(--text-muted); }
.ldr-pnl-pct { font-size: 0.72rem; opacity: 0.8; }

/* ───── Meta pills + notes ───── */
.asset-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  background: var(--bg-elevated);
}

.meta-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
}

.meta-value {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.tag-pill { background: var(--accent-dim); }
.tag-pill .meta-value { color: var(--accent); }

.asset-notes {
  font-size: 0.82rem;
  color: var(--text-muted);
  line-height: 1.5;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

/* ───── Actions: quiet pills, Delete in danger tint ───── */
.asset-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: auto;
}

.actions-spacer { flex: 1; }

.btn-action {
  padding: 8px 14px;
  font-size: 0.82rem;
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

.btn-action:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.btn-action-buy {
  background: var(--accent-dim);
  color: var(--accent);
}

.btn-action-buy:hover {
  background: color-mix(in srgb, var(--accent) 24%, transparent);
  color: var(--accent);
}

.btn-ghost { background: transparent; }

.btn-action.btn-danger {
  color: var(--expense);
  background: color-mix(in srgb, var(--expense) 10%, transparent);
}

.btn-action.btn-danger:hover {
  background: color-mix(in srgb, var(--expense) 18%, transparent);
}

@media (max-width: 768px) {
  .hero-card {
    padding: 20px;
  }

  /* Actions get their own full-width row under the total on phones. */
  .hero-actions {
    width: 100%;
  }

  .hero-actions button {
    flex: 1 1 0;
  }
}

@media (max-width: 480px) {
  .hero-card,
  .asset-card {
    padding: 16px;
  }

  .tab-summary {
    padding: 14px 16px;
  }

  .asset-tab {
    padding: 8px 12px;
    font-size: 0.85rem;
  }

  .value-big {
    font-size: 1.4rem;
  }

  .asset-actions .btn-action {
    flex: 1 1 auto;
  }

  .actions-spacer {
    display: none;
  }
}
</style>
