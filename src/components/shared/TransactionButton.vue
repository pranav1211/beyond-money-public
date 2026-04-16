<script setup>
defineProps({
  label: { type: String, default: 'New Transaction' },
})

const emit = defineEmits(['click'])
</script>

<template>
  <div class="txn-container" @click="emit('click')">
    <div class="txn-left-side">
      <div class="txn-card">
        <div class="txn-card-line"></div>
        <div class="txn-buttons"></div>
      </div>
      <div class="txn-post">
        <div class="txn-post-line"></div>
        <div class="txn-screen">
          <div class="txn-dollar">$</div>
        </div>
        <div class="txn-numbers"></div>
        <div class="txn-numbers-line2"></div>
      </div>
    </div>
    <div class="txn-right-side">
      <div class="txn-new">{{ label }}</div>
      <svg viewBox="0 0 451.846 451.847" height="512" width="512" class="txn-arrow">
        <path fill="#484f58" d="M345.441 248.292L151.154 442.573c-12.359 12.365-32.397 12.365-44.75 0-12.354-12.354-12.354-32.391 0-44.744L278.318 225.92 106.409 54.017c-12.354-12.359-12.354-32.394 0-44.748 12.354-12.359 32.391-12.359 44.75 0l194.287 194.284c6.177 6.18 9.262 14.271 9.262 22.366 0 8.099-3.091 16.196-9.267 22.373z"></path>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.txn-container {
  background-color: var(--bg-secondary);
  display: flex;
  width: 380px;
  max-width: 100%;
  height: 100px;
  position: relative;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  cursor: pointer;
  overflow: hidden;
}

.txn-container:hover {
  border-color: var(--accent);
}

.txn-container:hover .txn-left-side {
  width: 100%;
}

.txn-left-side {
  background: linear-gradient(135deg, var(--accent), #3fb950);
  width: 110px;
  height: 100px;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  flex-shrink: 0;
  overflow: hidden;
}

.txn-right-side {
  width: calc(100% - 110px);
  display: flex;
  align-items: center;
  overflow: hidden;
  cursor: pointer;
  justify-content: space-between;
  white-space: nowrap;
}

.txn-right-side:hover {
  background: var(--bg-elevated);
}

.txn-arrow {
  width: 16px;
  height: 16px;
  margin-right: 16px;
}

.txn-new {
  font-size: 1.1rem;
  font-weight: 600;
  margin-left: 20px;
  color: var(--text-primary);
}

.txn-card {
  width: 60px;
  height: 40px;
  background-color: rgba(255,255,255,0.3);
  border-radius: 6px;
  position: absolute;
  display: flex;
  z-index: 10;
  flex-direction: column;
  align-items: center;
  box-shadow: 6px 6px 8px rgba(0,0,0,0.15);
}

.txn-card-line {
  width: 55px;
  height: 11px;
  background-color: rgba(255,255,255,0.5);
  border-radius: 2px;
  margin-top: 6px;
}

.txn-buttons {
  width: 6px;
  height: 6px;
  background-color: rgba(255,255,255,0.6);
  box-shadow: 0 -8px 0 0 rgba(255,255,255,0.5), 0 8px 0 0 rgba(255,255,255,0.7);
  border-radius: 50%;
  margin-top: 5px;
  transform: rotate(90deg);
  margin: 8px 0 0 -25px;
}


.txn-post {
  width: 54px;
  height: 65px;
  background-color: var(--bg-surface);
  position: absolute;
  z-index: 11;
  bottom: 10px;
  top: 100px;
  border-radius: 6px;
  overflow: hidden;
}

.txn-post-line {
  width: 40px;
  height: 7px;
  background-color: var(--border-light);
  position: absolute;
  border-radius: 0 0 3px 3px;
  right: 7px;
  top: 7px;
}

.txn-post-line::before {
  content: "";
  position: absolute;
  width: 40px;
  height: 7px;
  background-color: var(--text-muted);
  top: -7px;
}

.txn-screen {
  width: 40px;
  height: 20px;
  background-color: var(--bg-primary);
  position: absolute;
  top: 19px;
  right: 7px;
  border-radius: 3px;
}

.txn-numbers {
  width: 10px;
  height: 10px;
  background-color: var(--border-color);
  box-shadow: 0 -15px 0 0 var(--border-color), 0 15px 0 0 var(--border-color);
  border-radius: 2px;
  position: absolute;
  transform: rotate(90deg);
  left: 22px;
  top: 45px;
}

.txn-numbers-line2 {
  width: 10px;
  height: 10px;
  background-color: var(--border-light);
  box-shadow: 0 -15px 0 0 var(--border-light), 0 15px 0 0 var(--border-light);
  border-radius: 2px;
  position: absolute;
  transform: rotate(90deg);
  left: 22px;
  top: 58px;
}

.txn-dollar {
  position: absolute;
  font-size: 14px;
  font-weight: 600;
  width: 100%;
  left: 0;
  top: 0;
  color: var(--accent);
  text-align: center;
}

</style>
