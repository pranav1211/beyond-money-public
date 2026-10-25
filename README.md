# Beyond Money — V 3.1.0

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
- **Accounts** — savings, cash, and wallet balances, hidden until you choose to show them
- **Transactions** — income, expenses, and transfers with categories and labels, plus search and filters; grouped by day on mobile
- **Credit Cards** — cards shown as card faces, per-card expenses, net due after part payments, credit left, utilization, due dates and payment history
- **Loans** — money lent, organised by person. Record any payment and it settles their oldest loans first, settle everything at once, or pay one specific loan
- **Assets** — FDs, RDs, mutual funds, stocks (multi-lot), gold, PPF, and more, with optional live stock prices
- **Subscriptions** — recurring services in any currency, with paid, due-soon and overdue tracking
- **Net Worth** — month-by-month history, change vs last month, insights, and an allocation breakdown
- **Month Report** — a full monthly breakdown with insights and trends, which you can save as a PDF
- **Categories & Labels** — organise income and expenses your way
- **Multi-Currency** — any currencies you use with a default for totals; live rates from Open Exchange Rates, kept on the device so conversions work offline
- **Offline-First** — every page and every add / edit / delete works offline; changes are queued on the device and sync in order when you're back online
- **Storage Adapters** — Supabase by default, or write an adapter for your own storage ([details](#storage))
- **PWA** — installable on mobile and desktop
- **App Lock** — lock the app with your device fingerprint, face, or screen lock (a passkey on desktop). Enable it in Settings
- **Light & dark themes**

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Vue 3, Pinia, Vue Router, Vite |
| Charts | Chart.js + vue-chartjs, hand-drawn SVG |
| Backend / DB | Supabase (Postgres + Auth + RLS) by default; swappable via [storage adapters](#storage) |
| Auth | Google OAuth via Supabase |
| Offline | IndexedDB + Service Worker (whole app pre-cached) |
| Currency | Open Exchange Rates API |
| Stock prices | Supabase Edge Function (optional) |
| Fonts | Manrope + Sora, bundled with the app |

## Changelog

View the changelog here : [Changelog](https://github.com/pranav1211/beyond-money-public/blob/main/changelog.md)

## Getting Started

These steps set up the app with **Supabase**, the built-in [storage adapter](#storage). Supabase isn't required: to keep your data somewhere else, write an adapter for your storage ([`docs/ADAPTERS.md`](docs/ADAPTERS.md)), set `VITE_STORAGE` in `.env`, and skip the Supabase-specific steps (2, 3, 4 and 6).

### Prerequisites

- Node.js 18+
- A free [Supabase](https://supabase.com) account (for the default Supabase adapter)
- A Google Cloud project (for Google sign-in through Supabase)
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

Optional: `VITE_APP_BASE=/some/path/` if you serve the app from a sub-path, and `VITE_STORAGE=<name>` to use a different [storage adapter](#storage) (default `supabase`).

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
│   ├── lib/
│   │   ├── storage/      # Storage socket: adapter interface, Supabase adapter, local-first collections
│   │   └── …             # IndexedDB, money, loans, dates
│   └── version.js        # App version
├── supabase/
│   ├── schema/
│   │   └── schema.sql    # Complete database schema (re-runnable)
│   └── functions/
│       └── stock-quote/  # Optional edge function for live stock prices
├── docs/
│   └── ADAPTERS.md       # How to write a storage adapter
├── test/
│   ├── offline-e2e.mjs   # Offline end-to-end test (headless Chrome)
│   └── adapter/          # Storage adapter contract test + in-memory reference adapter
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
npm run test:adapter  # Storage adapter contract test (no build needed)
```

The offline test opens the built app in headless Chrome and goes offline. It adds a transaction through the form, then creates an account, a card and a label, adds, edits and deletes transactions and card expenses against them, and finally replays the sync queue to check everything would reach storage correctly. It looks for Chrome in the usual places; point it elsewhere with `CHROME_BIN=/path/to/chrome`.

## Storage

The app keeps your data on the device (IndexedDB) and syncs it to a backend through one small interface, the **storage adapter**. Supabase is the built-in adapter, and the setup steps above are all you need for it.

To keep your data somewhere else (your own server, Firebase, PocketBase, a file in cloud storage, …) you can write an adapter for it: one file in `src/lib/storage/adapters/` with seven methods. The app already handles offline use, the sync queue, retries, ids and all calculations, so an adapter only stores rows and returns them.

- [`docs/ADAPTERS.md`](docs/ADAPTERS.md) is the complete specification: the interface, the rules an adapter must follow, the data model, optional extras (sign-in, shared exchange rates, stock prices) and which kinds of storage fit. It's written so you can hand it to an AI assistant as-is.
- `npm run test:adapter` checks an adapter against it: `ADAPTER=src/lib/storage/adapters/<name>.js npm run test:adapter`.
- Select it with `VITE_STORAGE=<name>` in `.env`.

Only the Supabase adapter is maintained here. Without an adapter that provides sign-in, the app uses a single local user per browser.

## Preview

> Screenshots use sample data.

![Beyond Money](https://content.beyondmebtw.com/assets/projects/bmoney/00-landing.webp)

## Dashboard

![Dashboard](https://content.beyondmebtw.com/assets/projects/bmoney/01-dashboard.webp)

The home base. What's left this month, money in, spent and invested with the change from last month, **net worth broken down by holding**, and the latest transactions. The full month report is one tap away.

## Transactions

![Transactions](https://content.beyondmebtw.com/assets/projects/bmoney/02-transactions.webp)

Every transaction in one list. **Search**, or **filter** by year, month, account, type, category or label. Loans and repayments are tagged with the person they belong to.

### Adding a Transaction

![Add Transaction](https://content.beyondmebtw.com/assets/projects/bmoney/03-add-transaction.webp)

Log **income, expenses, transfers, loans and repayments**. Amounts can be entered in any of your currencies with a live conversion, and labels like *Reimbursable* or *Work* add context.

## Accounts

![Accounts](https://content.beyondmebtw.com/assets/projects/bmoney/04-accounts.webp)

Bank accounts, cash and wallets, with the **combined total in the wallet** up top. Balances stay hidden until you choose to show them.

## Credit Cards

![Credit Cards](https://content.beyondmebtw.com/assets/projects/bmoney/05-credit-cards.webp)

Each card shows its **net due after part payments**, the **credit left** against its limit, utilization and the due date. Paying the bill archives that cycle's expenses into the card's payment history. Payments are recorded as transactions; the app doesn't move money.

## Loans

![Loans](https://content.beyondmebtw.com/assets/projects/bmoney/06-loans.webp)

Money lent, **organised by person**. A payment from someone settles their oldest loans first, or can go toward one specific loan, and people who have paid everything back move to the *Settled* tab.

## Assets

![Assets](https://content.beyondmebtw.com/assets/projects/bmoney/07-assets.webp)

Stocks, mutual funds, FDs, RDs, PPF, gold and more. Stocks are tracked across **multiple purchase lots** and can refresh to **live market prices**, with the gain or loss for every holding.

## Subscriptions

![Subscriptions](https://content.beyondmebtw.com/assets/projects/bmoney/08-subscriptions.webp)

Recurring services with their monthly cost. Each one shows whether it's **paid, due soon or overdue**, and they can be billed in any currency.

## Net Worth

![Net Worth](https://content.beyondmebtw.com/assets/projects/bmoney/09-net-worth.webp)

Net worth over time, the change from last month, what you own against what you owe, and **insights** such as your growth streak and biggest holding. Month-end values are saved, so past months stay fixed.

## Month Report

![Month Report](https://content.beyondmebtw.com/assets/projects/bmoney/10-month-report.webp)

A full breakdown of any month: income, expenses, net and savings rate, auto-generated insights, cash flow, and six-month trends for spending and net worth. It can be **saved as a PDF**.

## Categories & Labels

![Categories & Labels](https://content.beyondmebtw.com/assets/projects/bmoney/11-labels-categories.webp)

**Categories** for income and expenses, and **labels** for anything that cuts across them, organised your way.

## Currency

![Currency](https://content.beyondmebtw.com/assets/projects/bmoney/12-currency.webp)

Add the currencies you use, pick a **default** for totals, and convert between them at **live rates**. Rates are kept on the device, so conversions work offline.

## Sync

![Sync](https://content.beyondmebtw.com/assets/projects/bmoney/13-sync.webp)

Built to work **offline**. Every change is saved on the device first and queued here until it syncs, in order, once you're back online. The whole app and all your data can be cached for use without a connection.

## Settings

![Settings](https://content.beyondmebtw.com/assets/projects/bmoney/14-settings.webp)

Configure the app to your preferences:
- **Default currency** — the currency totals and conversions use
- **App Lock** — fingerprint or face to unlock
- **Data Export** — transactions as a **CSV**, or a full backup as **JSON**

## License

All versions of Beyond Money are licensed under the **[PolyForm Noncommercial License 1.0.0](LICENSE)**.

- **Free for non-commercial use:** personal use, study, research, hobby projects, and use by charities, schools and similar organisations.
- **Credit is required:** any copy or modified version you share must include the license and the `Required Notice` line crediting Pranav Veeraghanta as the author.
- **No commercial use** without permission. That includes selling it, offering it as a paid service, or using it inside a business. To ask about commercial use, contact the author through [GitHub](https://github.com/pranav1211).
