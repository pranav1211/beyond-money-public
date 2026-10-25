<script setup>
// Beyond Money's own icon set: 24px grid, 1.8px round strokes. Each icon may
// carry one soft-filled shape (class "tint") that picks up the accent when the
// parent sets `--icon-tint`, which gives the duotone look on the active nav item.
// Inline SVG keeps every icon in the bundle, so they render offline.
defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 20 },
})
</script>

<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <!-- Dashboard: a soft gauge -->
    <template v-if="name === 'dashboard'">
      <path class="tint" d="M4.5 16a7.5 7.5 0 0 1 15 0z" />
      <path d="M4.5 16a7.5 7.5 0 0 1 15 0" />
      <path d="M12 16l3.6-3.6" />
      <circle cx="12" cy="16" r="1.3" />
      <path d="M4 19.5h16" />
    </template>

    <!-- Transactions: two rounded flows passing each other -->
    <template v-else-if="name === 'transactions'">
      <path d="M4.5 8.5h11a3 3 0 0 0 0-6" />
      <path d="M13 6l2.5 2.5L13 11" />
      <path d="M19.5 15.5h-11a3 3 0 0 0 0 6" />
      <path d="M11 13l-2.5 2.5L11 18" />
    </template>

    <!-- Accounts: a wallet with a clasp -->
    <template v-else-if="name === 'accounts'">
      <path d="M5 7.5V7a2.5 2.5 0 0 1 2.5-2.5h8.5A2 2 0 0 1 18 6.5v1" />
      <rect class="tint" x="3.5" y="7.5" width="17" height="12" rx="3.2" />
      <rect x="3.5" y="7.5" width="17" height="12" rx="3.2" />
      <path d="M20.5 11.5h-3.2a1.8 1.8 0 0 0 0 3.6h3.2" />
    </template>

    <!-- Credit cards: two stacked cards -->
    <template v-else-if="name === 'cards'">
      <path d="M6.5 5.5h11a3 3 0 0 1 3 3" />
      <rect class="tint" x="3.5" y="8.5" width="15" height="10.5" rx="2.6" />
      <rect x="3.5" y="8.5" width="15" height="10.5" rx="2.6" />
      <path d="M3.5 12.5h15" />
      <path d="M7 16h2.5" />
    </template>

    <!-- Assets: a sprout in a pot -->
    <template v-else-if="name === 'assets'">
      <path class="tint" d="M7.5 14.5h9l-1.2 5.5H8.7z" />
      <path d="M7.5 14.5h9l-1.2 5.5H8.7z" />
      <path d="M12 14.5V9.5" />
      <path d="M12 11c0-3.3 2.2-5.5 5.5-5.5 0 3.3-2.2 5.5-5.5 5.5z" />
      <path d="M12 12.5c0-2.6-1.8-4.3-4.5-4.3 0 2.6 1.8 4.3 4.5 4.3z" />
    </template>

    <!-- Subscriptions: a repeating loop around a day mark -->
    <template v-else-if="name === 'subscriptions'">
      <path d="M19.8 13a8 8 0 1 1-2.2-6.9" />
      <path d="M19.6 3.6v3.6H16" />
      <circle class="tint" cx="12" cy="12.5" r="3.2" />
      <circle cx="12" cy="12.5" r="3.2" />
    </template>

    <!-- Loans: money passed between two people -->
    <template v-else-if="name === 'loans'">
      <circle class="tint" cx="6" cy="14" r="2.6" />
      <circle cx="6" cy="14" r="2.6" />
      <circle cx="18" cy="14" r="2.6" />
      <path d="M8 8.5c2.4-2.4 5.6-2.4 8 0" />
      <path d="M14.2 6.7L16 8.5l-2.4.6" />
      <path d="M3.5 20.5c.6-1.4 1.5-2 2.5-2s1.9.6 2.5 2M15.5 20.5c.6-1.4 1.5-2 2.5-2s1.9.6 2.5 2" />
    </template>

    <!-- Net worth: a summit with a flag -->
    <template v-else-if="name === 'networth'">
      <path class="tint" d="M3 19.5l5.5-7.5 3.5 4.3 2.6-3.3 6.4 6.5z" />
      <path d="M3 19.5l5.5-7.5 3.5 4.3 2.6-3.3 6.4 6.5z" />
      <path d="M14.6 13V4.5" />
      <path d="M14.6 4.5l4 1.6-4 1.6" />
    </template>

    <!-- Labels & categories: a tag with a hole -->
    <template v-else-if="name === 'labels'">
      <path class="tint" d="M3.5 11.4V5a1.5 1.5 0 0 1 1.5-1.5h6.4a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.8l-6.2 6.2a2 2 0 0 1-2.8 0l-7-7a2.6 2.6 0 0 1-.5-1.9z" />
      <path d="M3.5 11.4V5a1.5 1.5 0 0 1 1.5-1.5h6.4a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.8l-6.2 6.2a2 2 0 0 1-2.8 0l-7-7a2.6 2.6 0 0 1-.5-1.9z" />
      <circle cx="8" cy="8" r="1.4" />
    </template>

    <!-- Currency: a globe -->
    <template v-else-if="name === 'currency'">
      <circle class="tint" cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.4 3.4 5.3 3.4 8.5s-1 6.1-3.4 8.5c-2.4-2.4-3.4-5.3-3.4-8.5s1-6.1 3.4-8.5z" />
    </template>

    <!-- Sync: a cloud with up and down arrows -->
    <template v-else-if="name === 'sync'">
      <path class="tint" d="M7 18.5a4.2 4.2 0 0 1-.6-8.36 5.8 5.8 0 0 1 11.1 1.06A3.7 3.7 0 0 1 17 18.5z" />
      <path d="M7 18.5a4.2 4.2 0 0 1-.6-8.36 5.8 5.8 0 0 1 11.1 1.06A3.7 3.7 0 0 1 17 18.5" />
      <path d="M10 16.5v-5M8.4 13l1.6-1.6 1.6 1.6" />
      <path d="M14 11.5v5M12.4 15l1.6 1.6 1.6-1.6" />
    </template>

    <!-- Settings: two sliders -->
    <template v-else-if="name === 'settings'">
      <path d="M4 7.5h8.5M17.5 7.5H20M4 16.5h2.5M11.5 16.5H20" />
      <circle class="tint" cx="15" cy="7.5" r="2.5" />
      <circle cx="15" cy="7.5" r="2.5" />
      <circle cx="9" cy="16.5" r="2.5" />
    </template>

    <!-- Install: a phone receiving a download -->
    <template v-else-if="name === 'install'">
      <rect class="tint" x="6.5" y="2.5" width="11" height="19" rx="3" />
      <rect x="6.5" y="2.5" width="11" height="19" rx="3" />
      <path d="M12 7.5v6.5M9.5 11.5L12 14l2.5-2.5" />
      <path d="M10.5 18.5h3" />
    </template>

    <!-- Installed: a phone with a check -->
    <template v-else-if="name === 'installed'">
      <rect class="tint" x="6.5" y="2.5" width="11" height="19" rx="3" />
      <rect x="6.5" y="2.5" width="11" height="19" rx="3" />
      <path d="M9.5 11.5l1.8 1.8 3.4-3.8" />
      <path d="M10.5 18.5h3" />
    </template>

    <!-- Sign out: leaving through a door -->
    <template v-else-if="name === 'signout'">
      <path d="M13.5 4h3.5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3.5" />
      <path d="M9.5 8L5.5 12l4 4" />
      <path d="M5.5 12h9" />
    </template>

    <!-- Menu: three soft lines, the last one shorter -->
    <template v-else-if="name === 'menu'">
      <path d="M4.5 7h15M4.5 12h15M4.5 17h9" />
    </template>

    <!-- Close -->
    <template v-else-if="name === 'close'">
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </template>

    <!-- Plus -->
    <template v-else-if="name === 'plus'">
      <path d="M12 5.5v13M5.5 12h13" />
    </template>
  </svg>
</template>

<style scoped>
.app-icon {
  display: block;
  flex-shrink: 0;
}

.app-icon .tint {
  fill: var(--icon-tint, transparent);
  stroke: none;
}
</style>
