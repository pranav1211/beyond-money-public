<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  Tooltip,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
} from 'chart.js'
import { useTransactionsStore } from '../stores/transactions'
import { useNetWorth } from '../composables/useNetWorth'
import { formatDefault, defaultCurrencySymbol, defaultCurrencyCode } from '../lib/money'
import { localMonth } from '../lib/dateFormat'
import AppShell from '../components/layout/AppShell.vue'
import CandleLoader from '../components/shared/CandleLoader.vue'

ChartJS.register(Tooltip, CategoryScale, LinearScale, PointElement, LineElement, Filler)

const transactionsStore = useTransactionsStore()
const {
  loading: nwLoading,
  totalCreditCards,
  netWorth,
  components,
  positiveComponents,
  netWorthHistory,
  fetchAll,
  captureSnapshot,
} = useNetWorth()

const loading = computed(() => nwLoading.value || transactionsStore.loading)

onMounted(async () => {
  await Promise.all([
    fetchAll(),
    transactionsStore.fetchTransactions(),
  ])
  // Record this month's real net worth so the chart has true history going
  // forward. Not awaited — it's online-only and best-effort.
  captureSnapshot()
})

// ── Formatting helpers ──────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function splitMonth(ym) {
  const [y, m] = String(ym).split('-').map(Number)
  return { y, m }
}

function monthLabel(ym) {
  const { y, m } = splitMonth(ym)
  return `${MONTHS[m - 1]} ${y}`
}

function monthLong(ym) {
  const { y, m } = splitMonth(ym)
  return `${MONTHS_LONG[m - 1]} ${y}`
}

function monthTick(ym, withYear) {
  const { y, m } = splitMonth(ym)
  return withYear ? `${MONTHS[m - 1]} ’${String(y).slice(-2)}` : MONTHS[m - 1]
}

function fmtPct(p) {
  if (p === null || p === undefined || !Number.isFinite(p)) return ''
  const abs = Math.abs(p)
  if (abs > 0 && abs < 1) return '<1%'
  if (abs > 99 && abs < 100) return '>99%'
  return `${Math.round(abs)}%`
}

// One decimal for small moves (3.2%), whole numbers above 10%.
function fmtPctFine(p) {
  if (p === null || p === undefined || !Number.isFinite(p)) return ''
  const abs = Math.abs(p)
  if (abs > 0 && abs < 0.1) return '<0.1%'
  return abs < 10 ? `${abs.toFixed(1)}%` : `${Math.round(abs)}%`
}

// Compact money for axis ticks: ₹18.4L, ₹1.2Cr, ₹50K (INR) or $1.2M / $50K —
// keeps the y-axis readable instead of dumping raw 7-digit numbers.
function compactMoney(n) {
  const sym = defaultCurrencySymbol()
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  const trim = (x, d) => String(Number(x.toFixed(d)))
  let out
  if (defaultCurrencyCode() === 'INR') {
    if (abs >= 1e7) out = trim(abs / 1e7, abs >= 1e8 ? 1 : 2) + 'Cr'
    else if (abs >= 1e5) out = trim(abs / 1e5, 1) + 'L'
    else if (abs >= 1e3) out = trim(abs / 1e3, abs >= 1e4 ? 0 : 1) + 'K'
    else out = String(Math.round(abs))
  } else {
    if (abs >= 1e9) out = trim(abs / 1e9, 1) + 'B'
    else if (abs >= 1e6) out = trim(abs / 1e6, 1) + 'M'
    else if (abs >= 1e3) out = trim(abs / 1e3, abs >= 1e4 ? 0 : 1) + 'K'
    else out = String(Math.round(abs))
  }
  return `${sign}${sym}${out}`
}

// ── Own / owe split (sums of the composable's components) ───────────────────

const TYPE_ORDER = ['Account', 'Asset', 'Loan', 'Credit Card']
const TYPE_META = {
  Account: { label: 'Accounts', tone: 'var(--info)', one: 'account', many: 'accounts' },
  Asset: { label: 'Assets', tone: 'var(--accent)', one: 'holding', many: 'holdings' },
  Loan: { label: 'Lent out', tone: 'var(--warning)', one: 'person', many: 'people' },
  'Credit Card': { label: 'Credit cards', tone: 'var(--expense)', one: 'card', many: 'cards' },
}

function countLabel(type, n) {
  const meta = TYPE_META[type]
  return `${n} ${n === 1 ? meta.one : meta.many}`
}

// Gross of everything with a positive value (accounts, assets, money lent out).
const ownTotal = computed(() => positiveComponents.value.reduce((s, c) => s + c.value, 0))
// Everything negative: credit card dues, plus any overdrawn account.
const oweTotal = computed(() =>
  components.value.reduce((s, c) => (c.value < 0 ? s - c.value : s), 0)
)

function sharePct(value) {
  return ownTotal.value > 0 ? (value / ownTotal.value) * 100 : 0
}

const allocation = computed(() =>
  TYPE_ORDER.slice(0, 3)
    .map(type => {
      const items = positiveComponents.value.filter(c => c.type === type)
      const value = items.reduce((s, c) => s + c.value, 0)
      return { type, ...TYPE_META[type], value, count: items.length, pct: sharePct(value) }
    })
    .filter(g => g.value > 0)
)

const owedCards = computed(() => components.value.filter(c => c.type === 'Credit Card' && c.value < 0).length)
const owedOther = computed(() => components.value.some(c => c.type !== 'Credit Card' && c.value < 0))
const owedLabel = computed(() => (owedOther.value ? 'Owed' : 'Credit cards'))
const owedPct = computed(() => (ownTotal.value > 0 ? (oweTotal.value / ownTotal.value) * 100 : 100))

const componentGroups = computed(() =>
  TYPE_ORDER
    .map(type => {
      const items = components.value
        .filter(c => c.type === type)
        .map(c => ({ ...c, share: c.value > 0 && ownTotal.value > 0 ? sharePct(c.value) : null }))
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      return { type, ...TYPE_META[type], items, total: items.reduce((s, c) => s + c.value, 0) }
    })
    .filter(g => g.items.length)
)

// ── History-derived figures ─────────────────────────────────────────────────

// The current month's point is the live net worth (market values, today's
// balances), so the hero figure, the change pill, "Highest" and the chart's
// last point can't disagree. Past months stay as recorded or rebuilt.
const hist = computed(() => {
  const h = netWorthHistory.value
  if (!h.length) return h
  const last = h[h.length - 1]
  if (last.month !== localMonth()) return h
  return [...h.slice(0, -1), { ...last, value: netWorth.value }]
})

// Month-end vs the month before, straight from the chart's own series so the
// pill and the graph always agree.
const monthChange = computed(() => {
  const h = hist.value
  if (h.length < 2) return null
  const cur = h[h.length - 1]
  const prev = h[h.length - 2]
  const amount = cur.value - prev.value
  const pct = Math.abs(prev.value) >= 1 ? (amount / Math.abs(prev.value)) * 100 : null
  return {
    amount,
    pct,
    prevMonth: prev.month,
    // Comparing a market-value capture against a month rebuilt at cost.
    estimatedPrev: cur.source === 'snapshot' && prev.source === 'reconstructed',
  }
})

const peak = computed(() => {
  const h = hist.value
  if (h.length < 2) return null
  let best = h[0]
  for (const p of h) if (p.value >= best.value) best = p
  return { ...best, isLatest: best.month === h[h.length - 1].month }
})

const insights = computed(() => {
  const out = []
  const h = hist.value
  const own = ownTotal.value
  const last = h[h.length - 1]

  // 1. Trend over up to 6 months, with the average monthly change.
  const span = Math.min(6, h.length - 1)
  if (span >= 2) {
    const from = h[h.length - 1 - span]
    const diff = last.value - from.value
    const avg = diff / span
    const flat = Math.abs(diff) < 1
    out.push({
      key: 'trend',
      icon: diff < 0 ? 'down' : 'up',
      tone: flat ? 'info' : diff > 0 ? 'income' : 'expense',
      label: `Last ${span} months`,
      title: flat
        ? `Flat over ${span} months`
        : `${diff > 0 ? 'Up' : 'Down'} ${formatDefault(Math.abs(diff))} in ${span} months`,
      sub: flat
        ? `About the same as ${monthLabel(from.month)}`
        : `About ${formatDefault(Math.round(avg), { signed: true })} a month since ${monthLabel(from.month)}`,
    })
  }

  // 2. Consistency: how many of the last (up to) 12 months grew.
  // Skipped when nothing grew: "Grew in 0 of 12 months" says nothing useful
  // and reads as a scolding; the next insight takes its slot.
  const n = Math.min(12, h.length - 1)
  const recent = n >= 3 ? h.slice(-(n + 1)) : []
  let ups = 0
  let best = null
  for (let i = 1; i < recent.length; i++) {
    const d = recent[i].value - recent[i - 1].value
    if (d > 0) ups++
    if (!best || d > best.d) best = { d, month: recent[i].month }
  }
  if (n >= 3 && ups > 0) {
    out.push({
      key: 'streak',
      icon: 'bars',
      tone: ups * 2 >= n ? 'income' : 'warning',
      label: 'Consistency',
      title: `Grew in ${ups} of the last ${n} months`,
      sub: best && best.d > 0
        ? `Best: ${formatDefault(Math.round(best.d), { signed: true })} in ${monthLabel(best.month)}`
        : 'No month-on-month growth yet',
    })
  }

  // 3. Card dues as a share of everything owned.
  const cards = totalCreditCards.value
  if (components.value.some(c => c.type === 'Credit Card')) {
    if (cards < 1) {
      out.push({ key: 'debt', icon: 'card', tone: 'income', label: 'Card dues', title: 'Nothing owed on cards', sub: 'Every credit card balance is clear' })
    } else if (own > 0) {
      const ratio = (cards / own) * 100
      const tone = ratio < 10 ? 'income' : ratio < 30 ? 'warning' : 'expense'
      const word = ratio < 10 ? 'comfortable' : ratio < 30 ? 'worth watching' : 'on the high side'
      out.push({
        key: 'debt',
        icon: 'card',
        tone,
        label: 'Card dues',
        title: `Card dues are ${fmtPct(ratio)} of what you own`,
        sub: `${formatDefault(cards)} owed · ${word}`,
      })
    } else {
      out.push({ key: 'debt', icon: 'card', tone: 'expense', label: 'Card dues', title: `${formatDefault(cards)} owed on cards`, sub: 'Nothing on the other side yet' })
    }
  }

  // 4. Biggest single holding.
  const top = [...positiveComponents.value].sort((a, b) => b.value - a.value)[0]
  if (top && own > 0) {
    out.push({
      key: 'top',
      icon: 'top',
      tone: 'accent',
      label: 'Biggest holding',
      title: `${top.name} holds ${fmtPct(sharePct(top.value))}`,
      sub: `${formatDefault(top.value)} · ${{ Account: 'Account', Asset: 'Asset', Loan: 'Lent out' }[top.type] || top.type}`,
    })
  }

  // 5. Liquid vs invested vs lent out (fills in when history is short).
  if (own > 0) {
    const part = type => positiveComponents.value.filter(c => c.type === type).reduce((s, c) => s + c.value, 0)
    const cash = part('Account')
    const invested = part('Asset')
    const lent = part('Loan')
    const rest = []
    if (invested > 0) rest.push(`${fmtPct(sharePct(invested))} invested`)
    if (lent > 0) rest.push(`${fmtPct(sharePct(lent))} lent out`)
    out.push({
      key: 'cash',
      icon: 'cash',
      tone: 'info',
      label: 'Ready cash',
      title: cash > 0 ? `${fmtPct(sharePct(cash))} is cash in accounts` : 'No cash in accounts',
      sub: rest.length ? rest.join(' · ') : 'Nothing invested or lent out',
    })
  }

  return out.slice(0, 4)
})

const ICONS = {
  up: ['M3 17l6-6 4 4 8-8', 'M15 7h6v6'],
  down: ['M3 7l6 6 4-4 8 8', 'M15 17h6v-6'],
  bars: ['M5 20v-8', 'M12 20V5', 'M19 20v-5'],
  card: ['M3 8a2.5 2.5 0 0 1 2.5-2.5h13A2.5 2.5 0 0 1 21 8v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16z', 'M3 10.5h18', 'M7 15h3'],
  top: ['M21 12a9 9 0 1 1-9-9', 'M12 3a9 9 0 0 1 9 9h-9z'],
  cash: ['M4 7.5h14.5A1.5 1.5 0 0 1 20 9v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z', 'M4 7.5 15 4.5v3', 'M16 13.5h.01'],
}

// ── History chart ───────────────────────────────────────────────────────────

const RANGES = [
  { key: '6m', label: '6M', months: 6 },
  { key: '1y', label: '1Y', months: 12 },
  { key: 'all', label: 'All', months: Infinity },
]
const range = ref('all')

const availableRanges = computed(() =>
  RANGES.filter(r => !Number.isFinite(r.months) || r.months < hist.value.length)
)

const visibleHistory = computed(() => {
  const r = RANGES.find(x => x.key === range.value) || RANGES[2]
  return Number.isFinite(r.months) ? hist.value.slice(-r.months) : hist.value
})

const rangeChange = computed(() => {
  const v = visibleHistory.value
  if (v.length < 2) return null
  return { amount: v[v.length - 1].value - v[0].value, months: v.length - 1 }
})

const hasSnapshots = computed(() => visibleHistory.value.some(p => p.source === 'snapshot'))
const hasReconstructed = computed(() => visibleHistory.value.some(p => p.source !== 'snapshot'))

const reducedMotion = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false

// Chart colours come from the design tokens at runtime so the canvas follows
// light/dark. A MutationObserver on <html data-theme> bumps the tick when the
// theme flips, which re-reads the tokens and re-renders the chart.
const themeTick = ref(0)
let themeObserver = null

onMounted(() => {
  if (typeof MutationObserver === 'undefined') return
  themeObserver = new MutationObserver(() => { themeTick.value++ })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
})

onBeforeUnmount(() => {
  themeObserver?.disconnect()
  themeObserver = null
})

const tokens = computed(() => {
  void themeTick.value
  const cs = getComputedStyle(document.documentElement)
  const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback
  return {
    light: document.documentElement.getAttribute('data-theme') === 'light',
    accent: v('--accent', '#5fe0c3'),
    text: v('--text-primary', '#f2f5fa'),
    muted: v('--text-muted', '#8494ad'),
    grid: v('--border-color', 'rgba(148, 170, 204, 0.10)'),
    borderLight: v('--border-light', 'rgba(148, 170, 204, 0.22)'),
    card: v('--bg-secondary', '#111c2e'),
    surface: v('--bg-surface', '#1d2c44'),
    display: v('--font-display', 'Sora, sans-serif'),
    body: v('--font-body', 'Manrope, sans-serif'),
  }
})

// Canvas can't take color-mix(), so tint hex / rgb tokens by hand.
function withAlpha(color, a) {
  const c = String(color).trim()
  let m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (m) {
    let hex = m[1]
    if (hex.length === 3) hex = hex.split('').map(x => x + x).join('')
    const n = parseInt(hex, 16)
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
  }
  m = c.match(/^rgba?\(([^)]+)\)$/i)
  if (m) {
    const [r, g, b] = m[1].split(/[\s,/]+/).filter(Boolean)
    return `rgba(${r}, ${g}, ${b}, ${a})`
  }
  return c
}

function areaGradient(chart, color, strength) {
  const { ctx, chartArea } = chart
  if (!chartArea) return withAlpha(color, strength / 3)
  const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
  g.addColorStop(0, withAlpha(color, strength))
  g.addColorStop(0.65, withAlpha(color, strength / 4))
  g.addColorStop(1, withAlpha(color, 0))
  return g
}

// Faint dashed guide under the hovered month.
const crosshairPlugin = {
  id: 'nwCrosshair',
  beforeDatasetsDraw(chart, _args, opts) {
    const active = chart.tooltip?.getActiveElements?.() || []
    if (!active.length || !chart.chartArea) return
    const x = active[0].element.x
    const { top, bottom } = chart.chartArea
    const { ctx } = chart
    ctx.save()
    ctx.strokeStyle = opts?.color || 'rgba(128, 128, 128, 0.3)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, bottom)
    ctx.stroke()
    ctx.restore()
  },
}
const chartPlugins = [crosshairPlugin]

// Each month is computed on its own (see netWorthHistory in useNetWorth) —
// snapshot if one was captured that month, otherwise reconstructed from the
// ledger. Captured months get a small dot; the latest month a ringed point.
const lineData = computed(() => {
  const t = tokens.value
  const h = visibleHistory.value
  const last = h.length - 1
  return {
    labels: h.map(p => p.month),
    datasets: [{
      label: 'Net worth',
      data: h.map(p => Math.round(p.value)),
      borderColor: t.accent,
      borderWidth: 2.5,
      tension: 0.35,
      fill: 'start',
      backgroundColor: (ctx) => areaGradient(ctx.chart, t.accent, t.light ? 0.2 : 0.3),
      pointRadius: h.map((p, i) => (i === last ? 5 : p.source === 'snapshot' ? 2.5 : 0)),
      pointHoverRadius: h.map((_, i) => (i === last ? 7 : 5)),
      pointBackgroundColor: t.accent,
      pointBorderColor: h.map((_, i) => (i === last ? t.card : t.accent)),
      pointBorderWidth: h.map((_, i) => (i === last ? 3 : 0)),
      pointHoverBackgroundColor: t.accent,
      pointHoverBorderColor: t.card,
      pointHoverBorderWidth: 3,
    }],
  }
})

const lineOptions = computed(() => {
  const t = tokens.value
  const tipBg = t.light ? t.text : t.surface
  const tipText = t.light ? t.card : t.text
  const tipMuted = t.light ? withAlpha(t.card, 0.7) : t.muted
  const tickFont = { family: t.display, size: 11, weight: '500' }

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: reducedMotion ? false : { duration: 650, easing: 'easeOutCubic' },
    interaction: { intersect: false, mode: 'index' },
    layout: { padding: { top: 12, right: 10, left: 0, bottom: 0 } },
    plugins: {
      legend: { display: false },
      nwCrosshair: { color: t.borderLight },
      tooltip: {
        backgroundColor: tipBg,
        titleColor: tipMuted,
        bodyColor: tipText,
        footerColor: tipMuted,
        borderColor: t.light ? 'transparent' : t.borderLight,
        borderWidth: t.light ? 0 : 1,
        cornerRadius: 14,
        padding: { x: 14, y: 10 },
        caretSize: 6,
        caretPadding: 10,
        displayColors: false,
        titleFont: { family: t.body, size: 11, weight: '600' },
        titleMarginBottom: 4,
        bodyFont: { family: t.display, size: 15, weight: '600' },
        footerFont: { family: t.body, size: 11, weight: '500' },
        footerMarginTop: 6,
        callbacks: {
          title: (items) => {
            const p = visibleHistory.value[items[0]?.dataIndex]
            return p ? monthLong(p.month) : ''
          },
          label: (ctx) => formatDefault(ctx.parsed.y),
          footer: (items) => {
            const i = items[0]?.dataIndex
            const v = visibleHistory.value
            const p = v[i]
            if (!p) return ''
            const full = hist.value
            const fi = full.length - v.length + i
            const prev = fi > 0 ? full[fi - 1] : null
            const lines = []
            if (prev) lines.push(`${formatDefault(Math.round(p.value - prev.value), { signed: true })} vs ${monthLabel(prev.month)}`)
            lines.push(p.source === 'snapshot' ? 'Captured at market value' : 'Rebuilt from records, at cost')
            return lines
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: t.muted,
          font: tickFont,
          maxRotation: 0,
          autoSkip: true,
          autoSkipPadding: 18,
          padding: 6,
          callback(value, index) {
            const ym = this.getLabelForValue(value)
            return monthTick(ym, index === 0 || String(ym).endsWith('-01'))
          },
        },
      },
      y: {
        grace: '6%',
        grid: { color: t.grid, drawTicks: false },
        border: { display: false },
        ticks: {
          color: t.muted,
          font: tickFont,
          padding: 10,
          maxTicksLimit: 5,
          callback: (value) => compactMoney(value),
        },
      },
    },
  }
})
</script>

<template>
  <AppShell>
    <div class="networth-page fade-in">
      <CandleLoader v-if="loading" size="lg" />

      <template v-else>
        <!-- Hero -->
        <section class="hero">
          <div class="hero-main">
            <span class="hero-label">Net worth</span>
            <h1 class="hero-amount num" :class="{ 'is-negative': netWorth < 0 }">
              {{ formatDefault(netWorth) }}
            </h1>
            <div class="hero-meta">
              <template v-if="monthChange">
                <span
                  class="pill"
                  :class="Math.abs(monthChange.amount) < 1 ? 'pill--flat' : monthChange.amount > 0 ? 'pill--pos' : 'pill--neg'"
                >
                  <svg v-if="Math.abs(monthChange.amount) >= 1" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path :d="monthChange.amount > 0 ? 'M12 19V5M6.5 10.5 12 5l5.5 5.5' : 'M12 5v14M6.5 13.5 12 19l5.5-5.5'" />
                  </svg>
                  <span class="num">{{ Math.abs(monthChange.amount) < 1 ? 'No change' : formatDefault(Math.round(monthChange.amount), { signed: true }) }}</span>
                  <span v-if="monthChange.pct !== null && Math.abs(monthChange.amount) >= 1" class="num pill-pct">{{ fmtPctFine(monthChange.pct) }}</span>
                </span>
                <span class="hero-meta-text">
                  vs {{ monthLabel(monthChange.prevMonth) }}<template v-if="monthChange.estimatedPrev">, estimated at cost</template>
                </span>
              </template>
              <span v-else-if="hist.length === 1" class="hero-meta-text">Your first month on record</span>
            </div>
            <p v-if="peak" class="hero-peak">
              <template v-if="peak.isLatest">Your highest month-end so far</template>
              <template v-else>Highest: <span class="num">{{ formatDefault(peak.value) }}</span> in {{ monthLabel(peak.month) }}</template>
            </p>
          </div>

          <div class="hero-side">
            <div class="hero-stat">
              <span class="stat-label">You own</span>
              <span class="hero-stat-value num">{{ formatDefault(ownTotal) }}</span>
            </div>
            <div class="hero-stat">
              <span class="stat-label">You owe</span>
              <span class="hero-stat-value num" :class="{ 'is-owed': oweTotal >= 1 }">{{ formatDefault(-oweTotal) }}</span>
            </div>
          </div>
        </section>

        <!-- Insights -->
        <section v-if="insights.length" class="panel">
          <div class="panel-head">
            <h3 class="panel-title">Insights</h3>
          </div>
          <div class="insight-grid">
            <article v-for="tile in insights" :key="tile.key" class="insight" :class="`tone-${tile.tone}`">
              <span class="insight-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path v-for="d in ICONS[tile.icon]" :key="d" :d="d" />
                </svg>
              </span>
              <span class="insight-label">{{ tile.label }}</span>
              <p class="insight-title">{{ tile.title }}</p>
              <p class="insight-sub">{{ tile.sub }}</p>
            </article>
          </div>
        </section>

        <div class="analysis-grid">
          <!-- History -->
          <section class="panel history-panel">
            <div class="panel-head">
              <div class="panel-head-copy">
                <h3 class="panel-title">Net worth over time</h3>
                <span
                  v-if="rangeChange"
                  class="panel-sub"
                  :class="{ up: rangeChange.amount >= 1, down: rangeChange.amount <= -1 }"
                >
                  <template v-if="Math.abs(rangeChange.amount) < 1">Flat over {{ rangeChange.months }} {{ rangeChange.months === 1 ? 'month' : 'months' }}</template>
                  <template v-else>
                    {{ rangeChange.amount > 0 ? 'Up' : 'Down' }} <span class="num">{{ formatDefault(Math.abs(Math.round(rangeChange.amount))) }}</span>
                    over {{ rangeChange.months }} {{ rangeChange.months === 1 ? 'month' : 'months' }}
                  </template>
                </span>
              </div>
              <div v-if="availableRanges.length > 1" class="range-switch" role="group" aria-label="Chart range">
                <button
                  v-for="r in availableRanges"
                  :key="r.key"
                  type="button"
                  class="range-btn"
                  :class="{ active: range === r.key }"
                  :aria-pressed="range === r.key"
                  @click="range = r.key"
                >{{ r.label }}</button>
              </div>
            </div>

            <div
              class="chart-wrap"
              role="img"
              :aria-label="lineData.labels.length ? `Net worth by month, ${monthLabel(visibleHistory[0].month)} to ${monthLabel(visibleHistory[visibleHistory.length - 1].month)}` : 'No history yet'"
            >
              <Line v-if="lineData.labels.length" :data="lineData" :options="lineOptions" :plugins="chartPlugins" />
              <p v-else class="empty-text">Not enough data yet</p>
            </div>

            <div v-if="lineData.labels.length" class="chart-foot">
              <div class="chart-keys">
                <span v-if="hasSnapshots" class="chart-key"><i class="key-dot"></i>Captured at market value</span>
                <span v-if="hasReconstructed" class="chart-key"><i class="key-line"></i>Rebuilt from records</span>
              </div>
              <p class="chart-note">Month-end values. Past months are rebuilt from your records with investments at cost; months captured since v2.9.0 use their actual market value.</p>
            </div>
          </section>

          <!-- Composition -->
          <section class="panel composition-panel">
            <div class="panel-head">
              <h3 class="panel-title">Composition</h3>
            </div>

            <template v-if="allocation.length || oweTotal >= 1">
              <div class="alloc">
                <div class="alloc-caption">
                  <span>What you own</span>
                  <span class="num">{{ formatDefault(ownTotal) }}</span>
                </div>
                <div
                  class="alloc-bar"
                  role="img"
                  :aria-label="allocation.map(g => `${g.label} ${fmtPct(g.pct)}`).join(', ') || 'Nothing owned yet'"
                >
                  <span
                    v-for="g in allocation"
                    :key="g.type"
                    class="alloc-seg"
                    :style="{ flexGrow: g.pct, '--tone': g.tone }"
                    :title="`${g.label}: ${formatDefault(g.value)} (${fmtPct(g.pct)})`"
                  ></span>
                </div>

                <template v-if="oweTotal >= 1">
                  <div class="alloc-caption">
                    <span>What you owe</span>
                    <span class="num is-owed">{{ formatDefault(-oweTotal) }}</span>
                  </div>
                  <div class="alloc-bar alloc-bar--track" role="img" :aria-label="`Owed is ${fmtPct(owedPct)} of what you own`">
                    <span class="alloc-seg alloc-seg--owe" :style="{ width: Math.min(owedPct, 100) + '%' }"></span>
                  </div>
                </template>
              </div>

              <ul class="alloc-legend">
                <li v-for="g in allocation" :key="g.type" :style="{ '--tone': g.tone }">
                  <i class="legend-dot"></i>
                  <span class="legend-copy">
                    <span class="legend-name">{{ g.label }}</span>
                    <span class="legend-sub">{{ countLabel(g.type, g.count) }}</span>
                  </span>
                  <span class="legend-figures">
                    <span class="legend-value num">{{ formatDefault(g.value) }}</span>
                    <span class="legend-pct num">{{ fmtPct(g.pct) }}</span>
                  </span>
                </li>
                <li v-if="oweTotal >= 1" class="is-owe" style="--tone: var(--expense)">
                  <i class="legend-dot"></i>
                  <span class="legend-copy">
                    <span class="legend-name">{{ owedLabel }}</span>
                    <span class="legend-sub">{{ owedOther ? 'Cards and overdrawn accounts' : countLabel('Credit Card', owedCards) }}</span>
                  </span>
                  <span class="legend-figures">
                    <span class="legend-value num is-owed">{{ formatDefault(-oweTotal) }}</span>
                    <span class="legend-pct num">{{ ownTotal > 0 ? `${fmtPct(owedPct)} of owned` : '' }}</span>
                  </span>
                </li>
              </ul>
            </template>
            <p v-else class="empty-text">Add an account or asset to see how it's split</p>
          </section>
        </div>

        <!-- Components -->
        <section class="panel">
          <div class="panel-head">
            <h3 class="panel-title">Components</h3>
            <span v-if="components.length" class="panel-count">{{ components.length }} {{ components.length === 1 ? 'item' : 'items' }}</span>
          </div>

          <div v-if="componentGroups.length" class="groups">
            <div v-for="g in componentGroups" :key="g.type" class="group" :style="{ '--tone': g.tone }">
              <div class="group-head">
                <span class="type-pill">{{ g.label }}</span>
                <span class="group-count">{{ g.items.length }}</span>
                <span class="group-total num" :class="{ 'is-owed': g.total <= -1 }">{{ formatDefault(g.total) }}</span>
              </div>
              <ul class="rows">
                <li v-for="(item, i) in g.items" :key="`${g.type}-${i}`" class="row">
                  <span class="row-name">{{ item.name }}</span>
                  <span
                    class="row-value num"
                    :class="{ 'is-owed': item.value <= -1, 'is-zero': Math.abs(item.value) < 1 }"
                  >{{ formatDefault(item.value) }}</span>
                  <span v-if="item.share !== null" class="row-share">
                    <span class="share-track"><span class="share-fill" :style="{ width: Math.max(item.share, 1.5) + '%' }"></span></span>
                    <span class="share-pct num">{{ fmtPct(item.share) }}</span>
                  </span>
                  <span v-else-if="item.value <= -1" class="row-note">Owed</span>
                </li>
              </ul>
            </div>
          </div>
          <p v-else class="empty-text">Nothing to show yet</p>
        </section>
      </template>
    </div>
  </AppShell>
</template>

<style scoped>
.networth-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
  max-width: 100%;
  container-type: inline-size;
  container-name: nwpage;
}

/* Shared surfaces */
.panel,
.hero {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 24px;
  min-width: 0;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.panel-head-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.panel-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.panel-sub {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.panel-sub.up { color: var(--income); }
.panel-sub.down { color: var(--expense); }

.panel-count {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  padding-top: 2px;
}

.stat-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.is-owed { color: var(--expense); }

.empty-text {
  color: var(--text-muted);
  font-size: 0.9rem;
  text-align: center;
  padding: 40px 0;
}

/* Hero */
.hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px 32px;
  flex-wrap: wrap;
  padding: 28px;
  background: var(--bg-accent), var(--bg-secondary);
}

.hero-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 300px;
  min-width: 0;
}

.hero-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
}

.hero-amount {
  font-size: clamp(2.2rem, 8cqi, 3.4rem);
  font-weight: 600;
  line-height: 1.08;
  letter-spacing: -0.03em;
  color: var(--text-primary);
  margin: 0 0 6px;
  overflow-wrap: anywhere;
}

.hero-amount.is-negative { color: var(--expense); }

.hero-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
}

.hero-meta-text {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  font-size: 0.82rem;
  font-weight: 700;
  white-space: nowrap;
}

.pill-pct {
  opacity: 0.85;
}

.pill-pct::before {
  content: '\00B7';
  margin-right: 6px;
}

.pill--pos {
  color: var(--income);
  background: color-mix(in srgb, var(--income) 14%, transparent);
}

.pill--neg {
  color: var(--expense);
  background: color-mix(in srgb, var(--expense) 14%, transparent);
}

.pill--flat {
  color: var(--text-secondary);
  background: var(--bg-elevated);
}

.hero-peak {
  margin: 6px 0 0;
  font-size: 0.82rem;
  color: var(--text-muted);
}

.hero-peak .num {
  color: var(--text-secondary);
  font-weight: 600;
}

.hero-side {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  flex: 0 1 340px;
  min-width: 0;
}

.hero-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 14px 16px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  min-width: 0;
}

.hero-stat-value {
  font-size: 1.12rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hero-stat-value.is-owed { color: var(--expense); }

/* Insights */
.insight-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.insight {
  --tone: var(--accent);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 16px;
  min-width: 0;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
}

.tone-income { --tone: var(--income); }
.tone-expense { --tone: var(--expense); }
.tone-warning { --tone: var(--warning); }
.tone-info { --tone: var(--info); }
.tone-accent { --tone: var(--accent); }

.insight-icon {
  width: 30px;
  height: 30px;
  margin-bottom: 10px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 16%, transparent);
}

.insight-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
}

.insight-title {
  margin: 0;
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.insight-sub {
  margin: 2px 0 0;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--text-muted);
}

/* History + composition */
.analysis-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.range-switch {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: var(--radius-pill);
  background: var(--bg-elevated);
}

.range-btn {
  padding: 5px 12px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.range-btn:hover {
  background: transparent;
  color: var(--text-primary);
}

.range-btn.active {
  background: var(--bg-surface);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}

.chart-wrap {
  position: relative;
  height: 280px;
  min-width: 0;
}

.chart-foot {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chart-keys {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
}

.chart-key {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.key-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
}

.key-line {
  width: 16px;
  height: 2.5px;
  border-radius: var(--radius-pill);
  background: var(--accent);
}

.chart-note {
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.45;
  color: var(--text-muted);
}

/* Composition */
.alloc {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.alloc-caption {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.alloc-caption .num {
  font-size: 0.95rem;
  color: var(--text-primary);
}

.alloc-caption .num.is-owed { color: var(--expense); }

.alloc-bar {
  display: flex;
  gap: 3px;
  height: 14px;
  border-radius: var(--radius-pill);
  overflow: hidden;
  margin-bottom: 6px;
}

.alloc-bar--track {
  height: 8px;
  background: var(--bg-elevated);
}

.alloc-seg {
  flex: 0 1 0;
  min-width: 6px;
  height: 100%;
  border-radius: 4px;
  background: var(--tone);
}

.alloc-seg--owe {
  flex: none;
  min-width: 4px;
  border-radius: var(--radius-pill);
  background: var(--expense);
}

.alloc-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.alloc-legend li {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--tone);
}

.legend-copy,
.legend-figures {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.legend-figures {
  align-items: flex-end;
  text-align: right;
}

.legend-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.legend-sub,
.legend-pct {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.legend-value {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.legend-value.is-owed { color: var(--expense); }

/* Components */
.groups {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
  gap: 16px 24px;
  align-items: start;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px 6px;
}

.type-pill {
  display: inline-block;
  padding: 3px 11px;
  border-radius: var(--radius-pill);
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 14%, transparent);
  white-space: nowrap;
}

.group-count {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
}

.group-total {
  margin-left: auto;
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.group-total.is-owed { color: var(--expense); }

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 12px;
  row-gap: 6px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  transition: background-color var(--transition);
}

.row:hover {
  background: var(--bg-elevated);
}

.row-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-value {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-primary);
  text-align: right;
  white-space: nowrap;
}

.row-value.is-owed { color: var(--expense); }
.row-value.is-zero { color: var(--text-muted); }

.row-share {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 3.2em;
  align-items: center;
  gap: 10px;
}

.share-track {
  height: 5px;
  border-radius: var(--radius-pill);
  background: var(--bg-elevated);
  overflow: hidden;
}

.row:hover .share-track {
  background: var(--bg-surface);
}

.share-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--tone);
}

.share-pct {
  font-size: 0.74rem;
  color: var(--text-muted);
  text-align: right;
}

.row-note {
  grid-column: 1 / -1;
  font-size: 0.74rem;
  color: var(--text-muted);
}

/* Responsive (container = the page column, so the sidebar is accounted for) */
@container nwpage (max-width: 980px) {
  .analysis-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .insight-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container nwpage (max-width: 560px) {
  .panel {
    padding: 18px;
    gap: 16px;
  }

  .hero {
    padding: 22px 18px;
  }

  .hero-side {
    flex-basis: 100%;
  }

  .insight-grid {
    gap: 8px;
  }

  .insight {
    padding: 14px;
  }

  .insight-icon {
    margin-bottom: 8px;
  }

  .insight-title {
    font-size: 0.92rem;
  }

  .chart-wrap {
    height: 230px;
  }

  .row,
  .group-head {
    padding-left: 8px;
    padding-right: 8px;
  }
}

@container nwpage (max-width: 330px) {
  .insight-grid,
  .hero-side {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
