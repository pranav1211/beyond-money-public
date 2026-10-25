# Beyond Money — V 3.0.1

Personal finance tracker to track income, expenses, credit cards, loans, assets, subscriptions, and net worth — all in one place.
Beyond Money is designed around simplicity and control. Every major feature flows naturally from a central dashboard, letting you monitor, record, and analyze your finances without friction.
Built personally for me, available to everyone to explore.


## Disclaimer

Beyond Money is an educational and informational project designed to help users better understand personal finance concepts and tools.

This application does **not** provide financial, investment, tax, or legal advice. Any information, calculations, forecasts, or recommendations shown in this project should not be considered professional advice or a substitute for consulting a qualified financial advisor.

Users should conduct their own research and consult licensed professionals before making any financial decisions. Use of this project is entirely at your own risk.

The creators and contributors of Beyond Money are not responsible for any financial losses, decisions, or outcomes resulting from the use of this software.

## Features

- **Dashboard** — what's left this month, money in / spent / invested, net worth at a glance, recent transactions
- **Accounts** — savings, cash, and wallet balances
- **Transactions** — income, expenses, and transfers with categories and labels; grouped by day on mobile
- **Credit Cards** — cards shown as card faces, per-card expenses, partial payments, utilization, due dates
- **Loans** — money lent, organised by person. Record any payment and it settles their oldest loans first, settle everything at once, or pay one specific loan
- **Assets** — FDs, RDs, mutual funds, stocks (multi-lot), gold, PPF, and more, with optional live stock prices
- **Subscriptions** — recurring services with due and overdue tracking
- **Net Worth** — month-by-month history, change vs last month, insights, and an allocation breakdown
- **Month Report** — a full monthly breakdown you can save as a PDF
- **Multi-Currency** — live exchange rates via Open Exchange Rates
- **Offline-First** — every page and every add / edit / delete works offline; changes sync when you're back online
- **PWA** — installable on mobile and desktop
- **App Lock** — lock the app with your device fingerprint, face, or screen lock (a passkey on desktop). Enable it in Settings
- **Light & dark themes**

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Vue 3, Pinia, Vue Router, Vite |
| Charts | Chart.js + vue-chartjs, hand-drawn SVG |
| Backend / DB | Supabase (Postgres + Auth + RLS) |
| Auth | Google OAuth via Supabase |
| Offline | IndexedDB + Service Worker (whole app pre-cached) |
| Currency | Open Exchange Rates API |
| Stock prices | Supabase Edge Function (optional) |
| Fonts | Manrope + Sora, bundled with the app |

## Changelog

View the changelog here : [Changelog](https://github.com/pranav1211/beyond-money-public/blob/main/changelog.md)

## Getting Started

### Prerequisites

- Node.js 18+
- A free [Supabase](https://supabase.com) account
- A Google Cloud project (for OAuth)
- An [Open Exchange Rates](https://openexchangerates.org) account (free tier)

### Step 1 — Clone and install

```bash
git clone https://github.com/pranav1211/beyond-money-public.git
cd beyond-money-public
npm install
```

### Step 2 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** and **anon key** from **Settings → API**

### Step 3 — Set up the database

1. Open [`supabase/schema/schema.sql`](supabase/schema/schema.sql) and **edit the email allowlist in section 6** (`restrict_to_owner`). Put in the Google account(s) that should be able to sign in. Anyone else is rejected, and if you leave the placeholders, every sign-in fails with "Database error saving new user".
2. In your Supabase dashboard, open **SQL Editor**, paste the whole file and run it.

The file is the complete, current schema in one piece: tables, indexes, Row Level Security policies (every user only ever sees their own rows), and the sign-in allowlist. It's safe to run again, which is also how you upgrade: if you set up an older version, run the latest file and it adds whatever is missing without touching your data.

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

Create a `.env` file in the project root (it is git-ignored, never commit it):

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_EXCHANGE_RATES_APP_ID=your-openexchangerates-app-id
```

Optional: `VITE_APP_BASE=/some/path/` if you serve the app from a sub-path.

### Step 6 (optional) — Live stock prices

Stock holdings can refresh their price from Yahoo Finance through a small Supabase Edge Function. It needs no keys:

```bash
npx supabase functions deploy stock-quote --project-ref <your-project-ref>
```

Skip this and everything else still works; you can enter prices by hand.

### Step 7 — Run

```bash
npm run dev
```

Open the URL shown in your terminal. Sign in with Google, and you're in.

## Project Structure

```
beyond-money-public/
├── src/
│   ├── components/       # Vue components (dashboard, forms, layout, shared, transactions)
│   ├── composables/      # Shared logic (net worth, biometric lock, submit guard, …)
│   ├── views/            # Page-level components
│   ├── stores/           # Pinia stores (IndexedDB-first, with an offline sync queue)
│   ├── router/           # Vue Router config (routes are code-split)
│   ├── lib/              # Supabase client, IndexedDB, money, loans, dates
│   └── version.js        # App version
├── supabase/
│   ├── schema/
│   │   └── schema.sql    # Complete database schema (re-runnable)
│   └── functions/
│       └── stock-quote/  # Optional edge function for live stock prices
├── test/
│   └── offline-e2e.mjs   # Offline end-to-end test (headless Chrome)
├── public/               # Static assets, logo, PWA manifest, service worker
└── vite.config.js        # Also injects the build ID + pre-cache list into the service worker
```

## Database

Complete schema: [`supabase/schema/schema.sql`](supabase/schema/schema.sql)

| Table | Description |
|-------|-------------|
| `accounts` | Bank accounts, cash, wallets |
| `categories` | Income/expense categories |
| `labels` | User-defined tags |
| `currencies` | Currencies you use, and your default |
| `credit_cards` | Card details, billing info, partial payments |
| `cc_expenses` | Purchases on a credit card |
| `cc_expense_labels` | Labels on card purchases |
| `assets` | FDs, RDs, funds, stocks, gold, other assets |
| `subscriptions` | Recurring services |
| `transactions` | Income, expenses, transfers, loans and repayments |
| `transaction_labels` | Labels on transactions |
| `networth_snapshots` | Month-end net worth, so history stays fixed |
| `exchange_rate_cache` | Shared exchange-rate cache (not per-user) |
| `stock_price_cache` | Shared stock-price cache (not per-user) |

```
auth.users
  ├── accounts
  ├── categories
  ├── labels
  ├── currencies
  ├── credit_cards
  │     └── cc_expenses ── cc_expense_labels ↔ labels
  ├── assets
  ├── subscriptions
  ├── transactions ── transaction_labels ↔ labels
  │     └── (lend_repayment) loan_id → transactions
  └── networth_snapshots

exchange_rate_cache, stock_price_cache (shared)
```

## Build and test

```bash
npm run build         # Production build → dist/
npm run preview       # Preview the build locally
npm run test:offline  # Offline end-to-end test (run after a build)
```

The offline test opens the built app in headless Chrome, goes offline, adds a transaction and checks it is saved and queued for sync. It looks for Chrome in the usual places; point it elsewhere with `CHROME_BIN=/path/to/chrome`.

## Preview

> The screenshots below show the 2.x design. The 3.0 redesign keeps the same pages with a new look.

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

![Net Worth](https://content.beyondmebtw.com/assets/projects/bmoney/7networthdesk.webp)

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

Beyond Money is licensed under the **[PolyForm Noncommercial License 1.0.0](LICENSE)**.

- **Free for non-commercial use:** personal use, study, research, hobby projects, and use by charities, schools and similar organisations.
- **Credit is required:** any copy or modified version you share must include the license and the `Required Notice` line crediting Pranav Veeraghanta as the author.
- **No commercial use** without permission. That includes selling it, offering it as a paid service, or using it inside a business. To ask about commercial use, contact the author through [GitHub](https://github.com/pranav1211).

Versions up to 2.1.5 were released under the MIT License; that license still applies to those versions.
