# Beyond Money

Personal finance tracker PWA built with Vue 3 + Supabase. Track income, expenses, credit cards, assets, subscriptions, and net worth — all in one place.

## Features

- **Accounts** — manage savings, cash, and wallet balances
- **Transactions** — income, expenses, and transfers with categories and labels
- **Credit Cards** — track cards, billing cycles, and per-card expenses
- **Assets** — FDs, RDs, investments, PPF, and more
- **Subscriptions** — recurring services with billing cycle tracking
- **Net Worth** — overview across all accounts and assets
- **Multi-Currency** — live exchange rates via Open Exchange Rates API
- **Offline-First** — IndexedDB cache + sync queue, works without internet
- **PWA** — installable on mobile and desktop
- **App Lock** — Using your own device fingerprint, screen lock or face id lock the app for maximum privacy (Can be enabled via Settings)

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Vue 3, Pinia, Vue Router, Vite |
| Charts | Chart.js + vue-chartjs |
| Backend / DB | Supabase (Postgres + Auth + RLS) |
| Auth | Google OAuth via Supabase |
| Offline | IndexedDB + Service Worker |
| Currency | Open Exchange Rates API |

## Getting Started

### Prerequisites

- Node.js 18+
- A free [Supabase](https://supabase.com) account
- A Google Cloud project (for OAuth)
- An [Open Exchange Rates](https://openexchangerates.org) account (free tier)

### Step 1 — Clone and install

```bash
git clone https://github.com/your-username/beyond-money.git
cd beyond-money
npm install
```

### Step 2 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** and **anon key** from **Settings → API**

### Step 3 — Set up the database

1. Open **SQL Editor** in your Supabase dashboard
2. Copy and run [`supabase/schema/schema.sql`](supabase/schema/schema.sql)
   > Run tables in dependency order. Tables without foreign key dependencies go first: `accounts`, `categories`, `labels`, `credit_cards`, `exchange_rate_cache`. Then the rest: `cc_expenses`, `transactions`, `transaction_labels`, `assets`, `subscriptions`.
3. The schema file includes RLS policies — every user-scoped table is locked down so users can only access their own data
4. At the end of that SQL file is a function to edit the users. Edit the `restrict_to_owner()` function at the bottom of the schema and replace the placeholder emails with the Google account(s) you want to allow

### Step 4 — Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or use an existing one)
3. Go to **APIs & Services → Credentials**
4. Create an **OAuth 2.0 Client ID** (type: Web application)
5. Add this as an authorized redirect URI:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
6. Copy the **Client ID** and **Client Secret**
7. In Supabase, go to **Authentication → Providers → Google**
8. Enable it and paste your Client ID and Client Secret

### Step 5 — Environment variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_EXCHANGE_RATES_APP_ID=your-openexchangerates-app-id
```

### Step 6 — Run

```bash
npm run dev
```

Open the URL shown in your terminal. Sign in with Google, and you're in.

## Project Structure

```
beyond-money/
├── src/
│   ├── components/       # Vue components
│   ├── composables/      # Shared logic (useAuth, useSupabase, etc.)
│   ├── views/            # Page-level components
│   ├── stores/           # Pinia stores
│   ├── router/           # Vue Router config
│   ├── lib/              # Supabase client, utilities
│   └── version.js        # App version
├── supabase/
│   ├── schema/
│       └── schema.sql    # Full database schema + RLS policies
├── public/               # Static assets + PWA manifest
└── vite.config.js
```

## Database

Full schema with RLS: [`supabase/schema/schema.sql`](supabase/schema/schema.sql)

| Table | Description |
|-------|-------------|
| `accounts` | Bank accounts, cash, wallets |
| `assets` | FDs, RDs, investments, other assets |
| `categories` | Income/expense categories |
| `credit_cards` | Credit card details and billing info |
| `cc_expenses` | Expenses tied to a credit card |
| `transactions` | Core financial transactions |
| `labels` | User-defined tags for transactions |
| `transaction_labels` | Many-to-many join (transactions ↔ labels) |
| `subscriptions` | Recurring service subscriptions |
| `exchange_rate_cache` | Cached currency rates (not user-scoped) |

```
auth.users
  ├── accounts
  ├── assets
  ├── categories
  ├── credit_cards
  │     └── cc_expenses
  ├── transactions
  │     └── transaction_labels ↔ labels
  ├── labels
  └── subscriptions

exchange_rate_cache (standalone)
```

## Build

```bash
npm run build      # Production build → dist/
npm run preview    # Preview the build locally
```

## License

This project is licensed under the **MIT License**:
- **[MIT License](LICENSE)**: A permissive license allowing free use, modification, and distribution for both personal and commercial purposes, with attribution.

For more details, see the [MIT License](LICENSE) file included in this repository.