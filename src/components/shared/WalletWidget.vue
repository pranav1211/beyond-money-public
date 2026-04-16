<script setup>
import { computed } from 'vue'

const props = defineProps({
  accounts: { type: Array, default: () => [] },
  totalBalance: { type: Number, default: 0 },
})

const COLORS = ['#635bff', '#9bd86a', '#e8453c', '#ff9f43', '#2ed8a3', '#a855f7', '#3b82f6']
const TEXT_COLORS = ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff']

function formatCurrency(account) {
  const symbol = account.currency === 'USD' ? '$' : '₹'
  return `${symbol}${Number(account.current_balance || 0).toLocaleString('en-IN')}`
}

// Dynamic height: base pocket + stacked cards
const walletHeight = computed(() => {
  const count = props.accounts.length
  if (count <= 1) return 260
  // each extra card adds 25px of stack offset
  return 260 + (count - 1) * 25
})

// Each card is positioned from bottom, stacked upward
function cardBottom(index, total) {
  // bottom card sits at 40px above pocket bottom, each one 25px higher
  const base = 40
  const offset = (total - 1 - index) * 25
  return base + offset
}

function cardZIndex(index) {
  return 10 + index * 10
}

function animDelay(index) {
  return `${0.1 + index * 0.08}s`
}
</script>

<template>
  <div class="wallet" :style="{ height: walletHeight + 'px' }">
    <div class="wallet-back" :style="{ height: (walletHeight - 30) + 'px' }"></div>

    <div
      v-for="(account, index) in accounts"
      :key="account.id"
      class="card-slot"
      :style="{
        bottom: cardBottom(index, accounts.length) + 'px',
        zIndex: cardZIndex(index),
        animationDelay: animDelay(index),
      }"
    >
      <div class="card-inner" :style="{ background: COLORS[index % COLORS.length], color: TEXT_COLORS[index % TEXT_COLORS.length] }">
        <div class="card-top">
          <span>{{ account.name }}</span>
          <div class="chip"></div>
        </div>
        <div class="card-bottom">
          <div class="card-info">
            <span class="label">{{ account.type }}</span>
          </div>
          <div class="card-number-wrapper">
            <span class="hidden-stars">{{ formatCurrency(account) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="pocket">
      <svg class="pocket-svg" viewBox="0 0 340 160" fill="none">
        <path d="M 0 20 C 0 10, 5 10, 10 10 C 20 10, 25 25, 40 25 L 300 25 C 315 25, 320 10, 330 10 C 335 10, 340 10, 340 20 L 340 120 C 340 155, 320 160, 300 160 L 40 160 C 20 160, 0 155, 0 120 Z" fill="#1e341e"></path>
        <path d="M 8 22 C 8 16, 12 16, 15 16 C 23 16, 27 29, 40 29 L 300 29 C 313 29, 317 16, 325 16 C 328 16, 332 16, 332 22 L 332 120 C 332 150, 315 152, 300 152 L 40 152 C 25 152, 8 152, 8 120 Z" stroke="#3d5635" stroke-width="1.5" stroke-dasharray="6 4"></path>
      </svg>
      <div class="pocket-content">
        <div style="position: relative; height: 24px; width: 100%;">
          <div class="balance-stars">******</div>
          <div class="balance-real">₹{{ Number(totalBalance || 0).toLocaleString('en-IN') }}</div>
        </div>
        <div style="color: #698263; font-size: 12px; font-weight: 500;">Total Balance</div>
        <div class="eye-icon-wrapper">
          <svg class="eye-icon eye-slash" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
            <line x1="3" y1="3" x2="21" y2="21"></line>
          </svg>
          <svg class="eye-icon eye-open" style="opacity: 0;" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wallet {
  position: relative;
  width: 340px;
  cursor: pointer;
  perspective: 1000px;
  display: flex;
  justify-content: center;
  align-items: flex-end;
}

.wallet-back {
  position: absolute;
  bottom: 0;
  width: 340px;
  background: #1e341e;
  border-radius: 22px 22px 60px 60px;
  z-index: 5;
  box-shadow: inset 0 25px 35px rgba(0,0,0,0.4), inset 0 5px 15px rgba(0,0,0,0.5);
}

.card-slot {
  position: absolute;
  width: 310px;
  height: 140px;
  left: 15px;
  border-radius: 16px;
  box-shadow: inset 0 1px 1px rgba(255,255,255,0.3), 0 -4px 15px rgba(0,0,0,0.1);
  overflow: hidden;
}

.card-inner {
  width: 100%;
  height: 100%;
  padding: 18px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.chip {
  width: 32px;
  height: 24px;
  background: rgba(255,255,255,0.2);
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.1);
}

.card-bottom {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.label {
  font-size: 9px;
  opacity: 0.7;
  text-transform: uppercase;
  display: block;
}

.card-number-wrapper {
  text-align: right;
}

.hidden-stars {
  font-size: 14px;
  letter-spacing: 1px;
  font-family: monospace;
}

.pocket {
  position: absolute;
  bottom: 0;
  width: 340px;
  height: 160px;
  z-index: 40;
  filter: drop-shadow(0 15px 25px rgba(20,40,20,0.4));
}

.pocket-content {
  position: absolute;
  top: 45px;
  width: 100%;
  text-align: center;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.balance-stars {
  color: #839e7b;
  font-size: 24px;
  letter-spacing: 4px;
}

.balance-real {
  color: #a7c59e;
  font-size: 22px;
  font-weight: 600;
  opacity: 0;
  position: absolute;
  top: 0;
  left: 50%;
  transform: translate(-50%, 10px);
}

.eye-icon-wrapper {
  margin-top: 8px;
  height: 20px;
  width: 20px;
  position: relative;
  opacity: 0.3;
}

.eye-icon {
  position: absolute;
  top: 0;
  left: 0;
  stroke: #3be60b;
}

/* Hover: show details */

.wallet:hover .eye-icon-wrapper {
  opacity: 1;
}

.wallet:hover .card-slot {
  transform: translateY(calc(var(--hover-offset, 0) * 1px));
}

.wallet:hover .card-slot:nth-child(2) { transform: translateY(-90px) rotate(-4deg); }
.wallet:hover .card-slot:nth-child(3) { transform: translateY(-70px) rotate(-2deg); }
.wallet:hover .card-slot:nth-child(4) { transform: translateY(-50px) rotate(1deg); }
.wallet:hover .card-slot:nth-child(5) { transform: translateY(-35px) rotate(2deg); }
.wallet:hover .card-slot:nth-child(6) { transform: translateY(-20px) rotate(3deg); }
.wallet:hover .card-slot:nth-child(7) { transform: translateY(-10px); }
.wallet:hover .card-slot:nth-child(8) { transform: translateY(-5px); }

.card-slot:hover {
  z-index: 100 !important;
  transform: translateY(-80px) scale(1.05) rotate(0) !important;
}

.wallet:hover .balance-stars {
  opacity: 0;
}

.wallet:hover .balance-real {
  opacity: 1;
  transform: translate(-50%, 0);
}

.wallet:hover .eye-slash {
  opacity: 0;
  transform: scale(0.5);
}

.wallet:hover .eye-open {
  opacity: 1;
  transform: scale(1.1);
}

@media (max-width: 480px) {
  .wallet {
    width: 300px;
  }
  .wallet-back {
    width: 300px;
  }
  .card-slot {
    width: 270px;
  }
  .pocket {
    width: 300px;
  }
}
</style>
