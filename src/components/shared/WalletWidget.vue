<script setup>
import { computed } from 'vue'
import { useCurrenciesStore } from '../../stores/currencies'

// The stacked-cards wallet on the Accounts page. The pocket shows the total;
// tapping the wallet emits `toggle`, which the page wires to the same action
// as "Show balances". (The old tap-to-open overlay was dropped in 3.0; the
// account list below already shows each balance.)
const props = defineProps({
  accounts: { type: Array, default: () => [] },
  totalBalance: { type: Number, default: 0 },
  // When true the pocket reveals the actual total.
  showTotal: { type: Boolean, default: false },
})

const emit = defineEmits(['toggle'])

const currenciesStore = useCurrenciesStore()

const COLORS = ['#635bff', '#9bd86a', '#e8453c']

// Fixed decorative placeholder cards in the stack.
const PLACEHOLDER_COUNT = 3

// Compact wallet dimensions.
const CARD_H = 108
const STACK_OFFSET = 10

// Hug the cards: bottom card sits 28px from the bottom, the stack rises by
// (count-1)*offset, and the top card adds CARD_H. Small breathing room on top.
const STACK_BOTTOM = 28
const TOP_PADDING = 8
const stackedHeight = STACK_BOTTOM + (PLACEHOLDER_COUNT - 1) * STACK_OFFSET + CARD_H + TOP_PADDING

const defaultSymbol = computed(() => currenciesStore.defaultCurrency?.symbol || '₹')

const totalFormatted = computed(() =>
  `${defaultSymbol.value}${Number(props.totalBalance || 0).toLocaleString('en-IN')}`
)

function placeholderBottom(index) {
  // Index 0 is the topmost card in the stack.
  return STACK_BOTTOM + (PLACEHOLDER_COUNT - 1 - index) * STACK_OFFSET
}

function placeholderZIndex(index) {
  return 10 + index * 2
}
</script>

<template>
  <div
    class="wallet"
    :class="{ 'show-total': showTotal }"
    :style="{ height: stackedHeight + 'px' }"
    role="button"
    tabindex="0"
    :aria-pressed="showTotal"
    :aria-label="showTotal ? `Total balance ${totalFormatted}. Hide balances` : 'Show balances'"
    @click="emit('toggle')"
    @keydown.enter.prevent="emit('toggle')"
    @keydown.space.prevent="emit('toggle')"
  >
    <div class="wallet-back" :style="{ height: (stackedHeight - 22) + 'px' }"></div>

    <div
      v-for="i in PLACEHOLDER_COUNT"
      :key="'ph-' + i"
      class="card-slot"
      :style="{
        bottom: placeholderBottom(i - 1) + 'px',
        zIndex: placeholderZIndex(i - 1),
        background: COLORS[(i - 1) % COLORS.length],
      }"
    >
      <div class="card-top">
        <span class="placeholder-line"></span>
        <div class="chip"></div>
      </div>
      <div class="card-bottom">
        <span class="placeholder-line short"></span>
      </div>
    </div>

    <div class="pocket">
      <svg class="pocket-svg" viewBox="0 0 260 124" fill="none" preserveAspectRatio="none" aria-hidden="true">
        <path d="M 0 14 C 0 8, 4 8, 8 8 C 15 8, 18 18, 30 18 L 230 18 C 242 18, 245 8, 252 8 C 256 8, 260 8, 260 14 L 260 92 C 260 118, 244 124, 230 124 L 30 124 C 16 124, 0 118, 0 92 Z" fill="#1e341e"></path>
        <path d="M 6 16 C 6 12, 9 12, 12 12 C 18 12, 21 21, 30 21 L 230 21 C 239 21, 242 12, 248 12 C 251 12, 254 12, 254 16 L 254 92 C 254 114, 240 116, 230 116 L 30 116 C 20 116, 6 116, 6 92 Z" stroke="#3d5635" stroke-width="1.2" stroke-dasharray="5 3"></path>
      </svg>
      <div class="pocket-content">
        <div class="pocket-amount">
          <div class="balance-stars" aria-hidden="true">••••••</div>
          <div class="balance-total">{{ totalFormatted }}</div>
        </div>
        <div class="pocket-label">Total balance · {{ accounts.length }} account{{ accounts.length === 1 ? '' : 's' }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wallet {
  position: relative;
  width: 260px;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  margin: 0 auto;
  cursor: pointer;
  border-radius: 20px 20px 48px 48px;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.wallet:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}

/* Press feedback, like the app's buttons. */
.wallet:active .pocket {
  transform: scale(0.985);
}

.wallet-back {
  position: absolute;
  bottom: 0;
  width: 260px;
  background: #1e341e;
  border-radius: 18px 18px 48px 48px;
  z-index: 5;
  box-shadow: inset 0 20px 28px rgba(0, 0, 0, 0.4), inset 0 4px 12px rgba(0, 0, 0, 0.5);
}

.card-slot {
  position: absolute;
  width: 232px;
  height: 108px;
  left: 14px;
  border-radius: 14px;
  padding: 14px;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.28), 0 -3px 12px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: #fff;
  transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}

/* A small lift on hover: the cards peek a little further out of the pocket. */
.wallet:hover .card-slot:nth-child(2) { transform: translateY(-4px); }
.wallet:hover .card-slot:nth-child(3) { transform: translateY(-3px); }
.wallet:hover .card-slot:nth-child(4) { transform: translateY(-2px); }

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chip {
  width: 28px;
  height: 20px;
  background: rgba(255, 255, 255, 0.22);
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.placeholder-line {
  display: block;
  width: 60%;
  height: 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.35);
}

.placeholder-line.short { width: 40%; }

.card-bottom {
  display: flex;
  justify-content: flex-start;
  align-items: flex-end;
}

.pocket {
  position: absolute;
  bottom: 0;
  width: 260px;
  height: 124px;
  z-index: 40;
  filter: drop-shadow(0 12px 18px rgba(20, 40, 20, 0.38));
  pointer-events: none;
  transform-origin: bottom center;
  transition: transform 0.12s ease;
}

.pocket-svg {
  width: 100%;
  height: 100%;
}

.pocket-content {
  position: absolute;
  top: 32px;
  width: 100%;
  text-align: center;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.pocket-amount {
  position: relative;
  height: 28px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.balance-stars {
  color: #839e7b;
  font-size: 20px;
  letter-spacing: 4px;
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.balance-total {
  position: absolute;
  color: #b4d2aa;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.3s ease, transform 0.3s ease;
  white-space: nowrap;
}

.wallet.show-total .balance-stars {
  opacity: 0;
  transform: translateY(-6px);
}

.wallet.show-total .balance-total {
  opacity: 1;
  transform: translateY(0);
}

.pocket-label {
  color: #7d9876;
  font-size: 11.5px;
  font-weight: 600;
}

@media (max-width: 480px) {
  .wallet, .wallet-back, .pocket { width: 240px; }
  .card-slot { width: 212px; }
}

@media (prefers-reduced-motion: reduce) {
  .card-slot,
  .balance-stars,
  .balance-total {
    transition: none;
  }
}
</style>
