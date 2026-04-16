# Beyond Money

Personal finance tracker to track income, expenses, credit cards, assets, subscriptions, and net worth — all in one place. Beyond Money is designed around simplicity and control. Every major feature flows naturally from a central dashboard, letting you monitor, record, and analyze your finances without friction. Built personally for me, available to everyone to explore.


## Disclaimer

Beyond Money is an educational and informational project designed to help users better understand personal finance concepts and tools.

This application does **not** provide financial, investment, tax, or legal advice. Any information, calculations, forecasts, or recommendations shown in this project should not be considered professional advice or a substitute for consulting a qualified financial advisor.

Users should conduct their own research and consult licensed professionals before making any financial decisions. Use of this project is entirely at your own risk.

The creators and contributors of Beyond Money are not responsible for any financial losses, decisions, or outcomes resulting from the use of this software.

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
- **Mobile** — Made responsive for mobile use and various screen sizes
- **App Lock** — Using your own device fingerprint, screen lock or face id lock the app for maximum privacy. For Desktops a Passkey is created (Can be enabled via Settings)

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
## Preview

## Dashboard

![Dashboard](https://content.beyondmebtw.com/assets/projects/bmoney/1dashboarddesk.webp)

The home base. At a glance, you can see your **latest transactions**, your **current net worth**, and a **month-based breakdown** of income vs. expenses — everything you need to understand where you stand financially, right now.

## Transactions

![Transactions](https://content.beyondmebtw.com/assets/projects/bmoney/2transactionsdesk.webp)

A full history of your financial activity. Browse through all past transactions and filter by date, type, category, account, label, or any combination of parameters to find exactly what you're looking for.

### Adding a Transaction

![Add Transaction](https://content.beyondmebtw.com/assets/projects/bmoney/2transactionsadddesk.png)

Log any financial event — **incoming money**, **expenses**, or **transfers between accounts**. Transfers allow for seamless management across multiple accounts without double-counting. Each entry supports custom labels and descriptions so you can record context that matters to you.

## Accounts

![Accounts](https://content.beyondmebtw.com/assets/projects/bmoney/3accountsdesk.webp)

Add and manage your **cash and bank accounts**, each displayed as a distinct card. View current balances, edit account details, and add new accounts as needed — keeping all your money in one organized view.

## Credit Cards

![Credit Cards](https://content.beyondmebtw.com/assets/projects/bmoney/4creditcardsdesk.webp)

Track your credit cards and their usage by logging transactions against them. Set **due dates** for each card to stay on top of billing cycles. The **Pay Bill** feature is transaction-based — it records the payment as a financial entry rather than functioning as an actual payment processor.

### Credit Card Payment History

![CC History](https://content.beyondmebtw.com/assets/projects/bmoney/4cchistorydesk.webp)

Review a complete history of previously recorded card payments, giving you a clear picture of past billing and repayment patterns.

## Assets

![Assets](https://content.beyondmebtw.com/assets/projects/bmoney/5assetsdesk.webp)

Monitor financial assets such as **stocks, fixed deposits (FDs), loans**, and other holdings in a structured, easy-to-read view. Keep tabs on what you own and what you owe, all in one place.

## Subscriptions

![Subscriptions](https://content.beyondmebtw.com/assets/projects/bmoney/6subscriptionsdesk.webp)

Stay on top of recurring expenses by managing all your **active subscriptions** in one dedicated space. Track costs, renewal cycles, and avoid surprise charges.

## Net Worth

![Net Worth](https://content.beyondmebtw.com/assets/projects/bmoney/7networthsdesk.webp)

A consolidated view of your **total net worth**, factoring in all assets and liabilities. Understand the full picture of your financial health beyond just day-to-day cash flow.

## Categories & Labels

| Categories | Labels |
|---|---|
| ![Categories](https://content.beyondmebtw.com/assets/projects/bmoney/8categoriesdesk.webp) | ![Labels](https://content.beyondmebtw.com/assets/projects/bmoney/8labelsdesk.webp) |

Create and manage **custom categories and labels** tailored to how you think about your money. Organize transactions your way, with as much or as little granularity as you prefer.

## Currency Converter

![Currency Converter](https://content.beyondmebtw.com/assets/projects/bmoney/9converterdesk.webp)

A built-in **currency monitoring and conversion tool** to support international usability. Quickly reference exchange rates without leaving the app.

## Sync

![Sync](https://content.beyondmebtw.com/assets/projects/bmoney/10syncdesk.webp)

A dedicated sync page to ensure your data is always up to date and that the local cache reflects the latest version. Manual sync control gives you direct accessibility and confidence that nothing is out of date.

## Settings

![Settings](https://content.beyondmebtw.com/assets/projects/bmoney/11settingsdesk.webp)

Configure the app to your preferences:
- **App Lock** — secure access to your financial data
- **Currency Preference** — set your default display currency
- **Data Export** — export everything as a **CSV** or **JSON** file for external use or backup

## License

This project is licensed under the **MIT License**:
- **[MIT License](LICENSE)**: A permissive license allowing free use, modification, and distribution for both personal and commercial purposes, with attribution.

For more details, see the [MIT License](LICENSE) file included in this repository.
