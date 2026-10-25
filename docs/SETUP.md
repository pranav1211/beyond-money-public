# Setup guide

How to run your own copy of Beyond Money.

These steps use **Supabase**, the built-in storage adapter, which gives you a database, Google sign-in and row-level security in one free project. Supabase isn't required: the app talks to storage through a small adapter interface, so you can keep your data somewhere else instead. See [Using other storage](#using-other-storage) at the end.

## Prerequisites

- Node.js 18+
- A free [Supabase](https://supabase.com) account (for the default Supabase adapter)
- A Google Cloud project (for Google sign-in through Supabase)
- An [Open Exchange Rates](https://openexchangerates.org) account (free tier)

## Step 1 — Clone and install

```bash
git clone https://github.com/pranav1211/beyond-money-public.git
cd beyond-money-public
npm install
```

## Step 2 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** and **anon key** from **Settings → API**

## Step 3 — Set up the database

1. Open [`supabase/schema/schema.sql`](../supabase/schema/schema.sql) and **edit the email allowlist in section 6** (`restrict_to_owner`). Put in the Google account(s) that should be able to sign in. Anyone else is rejected, and if you leave the placeholders, every sign-in fails with "Database error saving new user".
2. In your Supabase dashboard, open **SQL Editor**, paste the whole file and run it.

The file is the complete, current schema in one piece: tables, indexes, Row Level Security policies (every user only ever sees their own rows), and the sign-in allowlist. It's safe to run again, which is also how you upgrade: if you set up an older version, run the latest file and it adds whatever is missing without touching your data.

## Step 4 — Set up Google OAuth

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

## Step 5 — Environment variables

Create a `.env` file in the project root (it is git-ignored, never commit it):

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_EXCHANGE_RATES_APP_ID=your-openexchangerates-app-id
```

Optional:
- `VITE_APP_BASE=/some/path/` if you serve the app from a sub-path
- `VITE_STORAGE=<name>` to use a different storage adapter (default `supabase`)

## Step 6 (optional) — Live stock prices

Stock holdings can refresh their price from Yahoo Finance through a small Supabase Edge Function. It needs no keys:

```bash
npx supabase functions deploy stock-quote --project-ref <your-project-ref>
```

Skip this and everything else still works; you can enter prices by hand.

## Step 7 — Run

```bash
npm run dev
```

Open the URL shown in your terminal. Sign in with Google, and you're in.

To build for production, run `npm run build` and serve the `dist/` folder. The [README](../README.md#build-and-test) lists the build and test commands.

## Using other storage

To keep your data somewhere other than Supabase (your own server, Firebase, PocketBase, a file in cloud storage, …), write an adapter for it:

1. Follow [`ADAPTERS.md`](ADAPTERS.md), the complete specification. It's written so you can hand it to an AI assistant as-is.
2. Put the adapter in `src/lib/storage/adapters/<name>.js` and check it with `ADAPTER=src/lib/storage/adapters/<name>.js npm run test:adapter`.
3. Set `VITE_STORAGE=<name>` in `.env`.

Then follow the steps above, skipping the Supabase-specific ones (2, 3, 4 and 6); you still need Step 1, the exchange-rates key from Step 5, and Step 7. Without an adapter that provides sign-in, the app uses a single local user per browser.
