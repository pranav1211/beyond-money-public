<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAssetsStore } from '../stores/assets'
import { useAuthStore } from '../stores/auth'
import { formatDate } from '../lib/dateFormat'
import AppShell from '../components/layout/AppShell.vue'
import ModalWrapper from '../components/shared/ModalWrapper.vue'
import AssetForm from '../components/forms/AssetForm.vue'
import ConfirmDialog from '../components/shared/ConfirmDialog.vue'
import EmptyState from '../components/shared/EmptyState.vue'
import CandleLoader from '../components/shared/CandleLoader.vue'

const assetsStore = useAssetsStore()
const auth = useAuthStore()

const showForm = ref(false)
const editingAsset = ref(null)
const deletingId = ref(null)

const totalValue = computed(() =>
  assetsStore.assets.reduce((sum, a) => sum + a.current_value, 0)
)

const totalPrincipal = computed(() =>
  assetsStore.assets.reduce((sum, a) => sum + a.principal_amount, 0)
)

const totalGrowth = computed(() => {
  if (!totalPrincipal.value) return 0
  return (((totalValue.value - totalPrincipal.value) / totalPrincipal.value) * 100).toFixed(2)
})

onMounted(() => {
  assetsStore.fetchAssets()
})

function openAdd() {
  editingAsset.value = null
  showForm.value = true
}

function openEdit(asset) {
  editingAsset.value = asset
  showForm.value = true
}

async function handleSubmit(data) {
  if (editingAsset.value) {
    await assetsStore.updateAsset(editingAsset.value.id, data)
  } else {
    await assetsStore.addAsset({ ...data, user_id: auth.user.id })
  }
  showForm.value = false
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
  return asset.current_value >= asset.principal_amount
}

function typeIcon(type) {
  const icons = {
    fd: 'FD', rd: 'RD', gold: 'Au', stocks: 'ST',
    mutual_fund: 'MF', ppf: 'PP', nps: 'NP',
    real_estate: 'RE', crypto: 'CR', bonds: 'BD',
  }
  return icons[type?.toLowerCase()] || type?.slice(0, 2)?.toUpperCase() || '?'
}
</script>

<template>
  <AppShell>
    <div class="assets-page fade-in">
      <!-- Loading -->
      <div v-if="assetsStore.loading" class="loader-container">
        <CandleLoader size="md" />
      </div>

      <!-- Empty -->
      <template v-else-if="!assetsStore.assets.length">
        <div class="page-header">
          <button class="btn-primary" @click="openAdd">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Asset
          </button>
        </div>
        <EmptyState title="No assets" message="Add your first asset to start tracking." />
      </template>

      <template v-else>
        <!-- Hero Card with Add button -->
        <div class="hero-card">
          <div class="hero-top">
            <div>
              <div class="hero-label">Total Asset Value</div>
              <div class="hero-value">&#8377;{{ totalValue.toLocaleString('en-IN') }}</div>
            </div>
            <button class="btn-primary" @click="openAdd">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Asset
            </button>
          </div>
          <div class="hero-bottom">
            <div class="hero-stat">
              <span class="hero-stat-label">Total Invested</span>
              <span class="hero-stat-value">&#8377;{{ totalPrincipal.toLocaleString('en-IN') }}</span>
            </div>
            <div class="hero-stat">
              <span class="hero-stat-label">Overall Growth</span>
              <span class="hero-stat-value" :class="totalGrowth >= 0 ? 'text-income' : 'text-expense'">
                {{ totalGrowth }}%
              </span>
            </div>
            <div class="hero-stat">
              <span class="hero-stat-label">Assets</span>
              <span class="hero-stat-value">{{ assetsStore.assets.length }}</span>
            </div>
          </div>
        </div>

        <!-- Asset Grid -->
        <div class="assets-grid">
          <div v-for="asset in assetsStore.assets" :key="asset.id" class="asset-card">
            <div class="asset-card-top">
              <div class="asset-icon">{{ typeIcon(asset.type) }}</div>
              <div class="asset-info">
                <h3 class="asset-name">{{ asset.name }}</h3>
              </div>
              <span class="growth-badge" :class="isPositive(asset) ? 'growth-up' : 'growth-down'">
                {{ growth(asset) }}%
              </span>
            </div>

            <div class="asset-values">
              <div class="asset-val-row">
                <span class="val-label">Principal</span>
                <span class="val-amount">&#8377;{{ asset.principal_amount.toLocaleString('en-IN') }}</span>
              </div>
              <div class="asset-val-row">
                <span class="val-label">Current Value</span>
                <span class="val-amount val-current" :class="isPositive(asset) ? 'text-income' : 'text-expense'">
                  &#8377;{{ asset.current_value.toLocaleString('en-IN') }}
                </span>
              </div>
            </div>

            <div class="asset-meta">
              <div v-if="asset.interest_rate" class="meta-pill">
                <span class="meta-label">Rate</span>
                <span class="meta-value">{{ asset.interest_rate }}%</span>
              </div>
              <div v-if="asset.maturity_date" class="meta-pill">
                <span class="meta-label">Maturity</span>
                <span class="meta-value">{{ formatDate(asset.maturity_date) }}</span>
              </div>
            </div>

            <div v-if="asset.notes" class="asset-notes">{{ asset.notes }}</div>

            <div class="asset-actions">
              <button class="btn-action" @click="openEdit(asset)">Edit</button>
              <button class="btn-action btn-action-danger" @click="deletingId = asset.id">Delete</button>
            </div>
          </div>
        </div>
      </template>

      <!-- Modal -->
      <ModalWrapper v-if="showForm" @close="showForm = false">
        <h3>{{ editingAsset ? 'Edit' : 'Add' }} Asset</h3>
        <AssetForm :asset="editingAsset" @submit="handleSubmit" @cancel="showForm = false" />
      </ModalWrapper>

      <ConfirmDialog v-if="deletingId" title="Delete Asset" message="Are you sure you want to delete this asset?" @confirm="confirmDelete" @cancel="deletingId = null" />
    </div>
  </AppShell>
</template>

<style scoped>
.assets-page {
}

.page-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 20px;
}

.loader-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
}

.hero-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 32px;
  margin-bottom: 24px;
  box-shadow: var(--card-shadow);
  position: relative;
  overflow: hidden;
}

.hero-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--accent), var(--income), var(--info));
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

.hero-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 16px;
}

.hero-label {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.hero-value {
  font-size: 2.5rem;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -1px;
  font-variant-numeric: tabular-nums;
}

.hero-bottom {
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
  padding-top: 20px;
  border-top: 1px solid var(--border-color);
}

.hero-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hero-stat-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.hero-stat-value {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.text-income { color: var(--income); }
.text-expense { color: var(--expense); }

.assets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.asset-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 20px;
  transition: all var(--transition);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.asset-card:hover {
  border-color: var(--border-light);
}

.asset-card-top {
  display: flex;
  align-items: center;
  gap: 12px;
}

.asset-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  background: var(--accent-dim);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.8rem;
  flex-shrink: 0;
}

.asset-info {
  flex: 1;
  min-width: 0;
}

.asset-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.growth-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 20px;
  flex-shrink: 0;
}

.growth-up {
  background: rgba(63, 185, 80, 0.12);
  color: var(--income);
}

.growth-down {
  background: rgba(248, 81, 73, 0.12);
  color: var(--expense);
}

.asset-values {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.asset-val-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.val-label {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.val-amount {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.val-current {
  font-size: 1.05rem;
  font-weight: 700;
}

.asset-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.meta-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  padding: 4px 12px;
}

.meta-label {
  font-size: 0.68rem;
  color: var(--text-muted);
  text-transform: uppercase;
}

.meta-value {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.asset-notes {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.5;
  white-space: pre-line;
}

.asset-actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

.btn-action {
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.78rem;
  padding: 6px 12px;
  transition: all var(--transition);
}

.btn-action:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.btn-action-danger {
  color: var(--expense);
}

@media (max-width: 768px) {
  .assets-grid {
    grid-template-columns: 1fr;
  }

  .hero-value {
    font-size: 1.8rem;
  }

  .hero-card {
    padding: 20px;
  }
}
</style>
