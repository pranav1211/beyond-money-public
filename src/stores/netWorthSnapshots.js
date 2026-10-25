import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
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

    const { data, error } = await supabase
      .from('networth_snapshots')
      .select('*')
      .order('month')
    // Missing table (migration not applied yet) or any error → keep cache/empty;
    // reconstruction still renders the chart.
    if (!error && data) {
      snapshots.value = data
      loaded.value = true
      idbSet('netWorthSnapshots', snapshots.value)
    }
    return snapshots.value
  }

  // Upsert the given month's real (market-value) net worth. Online-only.
  async function captureCurrent({ month, net_worth, accounts = 0, assets = 0, loans = 0, credit_cards = 0 }) {
    if (!navigator.onLine || !month) return null
    const uid = useAuthStore().user?.id
    if (!uid) return null

    const round = (v) => Math.round(Number(v || 0) * 100) / 100
    const row = {
      user_id: uid,
      month,
      net_worth: round(net_worth),
      accounts: round(accounts),
      assets: round(assets),
      loans: round(loans),
      credit_cards: round(credit_cards),
      captured_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('networth_snapshots')
      .upsert(row, { onConflict: 'user_id,month' })
      .select()
      .single()
    if (error || !data) return null

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
