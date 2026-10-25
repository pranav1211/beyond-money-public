import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getAdapter } from '../lib/storage'
import { newId } from '../lib/storage/ids'
import { idbGet, idbSet } from '../lib/idb'
import { useAuthStore } from './auth'

// Monthly point-in-time net-worth captures. This is AUXILIARY, derived data —
// not a core ledger entity — so unlike accounts/transactions it does NOT use the
// offline sync queue. Reads are IndexedDB-first (instant, offline-safe); the
// capture write is online-only best-effort (skipped offline, retried on the next
// visit) and every failure is swallowed so a missing table or a slow backend can
// never break the Net Worth page. History for months without a snapshot is
// reconstructed from the ledger in useNetWorth.
export const useNetWorthSnapshotsStore = defineStore('netWorthSnapshots', () => {
  const snapshots = ref([])
  const loaded = ref(false)

  async function fetchSnapshots(force = false) {
    if (loaded.value && !force) return snapshots.value

    if (!loaded.value) {
      const cached = await idbGet('netWorthSnapshots')
      if (cached.length) {
        snapshots.value = cached
        loaded.value = true
      }
    }

    if (!navigator.onLine) return snapshots.value

    // Missing table (migration not applied yet) or any error → keep cache/empty;
    // reconstruction still renders the chart.
    try {
      const data = await getAdapter().list('networth_snapshots', { orderBy: [['month', 'asc']] })
      snapshots.value = data
      loaded.value = true
      idbSet('netWorthSnapshots', snapshots.value)
    } catch { /* keep cache */ }
    return snapshots.value
  }

  // Upsert the given month's real (market-value) net worth. Online-only.
  async function captureCurrent({ month, net_worth, accounts = 0, assets = 0, loans = 0, credit_cards = 0 }) {
    if (!navigator.onLine || !month) return null
    const uid = useAuthStore().user?.id
    if (!uid) return null

    const round = (v) => Math.round(Number(v || 0) * 100) / 100
    const row = {
      // Keep the month's existing id; adapters without generated keys need one.
      id: snapshots.value.find(s => s.month === month)?.id || newId(),
      user_id: uid,
      month,
      net_worth: round(net_worth),
      accounts: round(accounts),
      assets: round(assets),
      loans: round(loans),
      credit_cards: round(credit_cards),
      captured_at: new Date().toISOString(),
    }

    let data
    try {
      data = await getAdapter().upsert('networth_snapshots', row, ['user_id', 'month'])
    } catch { return null }
    if (!data) return null

    const i = snapshots.value.findIndex(s => s.month === data.month)
    if (i >= 0) snapshots.value[i] = data
    else snapshots.value.push(data)
    idbSet('netWorthSnapshots', snapshots.value)
    return data
  }

  function $reset() {
    snapshots.value = []
    loaded.value = false
  }

  return { snapshots, loaded, fetchSnapshots, captureCurrent, $reset }
})
