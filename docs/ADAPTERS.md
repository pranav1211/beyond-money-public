# Storage adapters

Beyond Money keeps your data on the device (IndexedDB) and syncs it to a
backend through one small interface, the **storage adapter**. Supabase is the
built-in adapter. To keep your data somewhere else, write an adapter for that
storage, check it with `npm run test:adapter`, and point the app at it.

This document is the whole contract. It is written so you can hand it,
unchanged, to an AI assistant along with a description of your storage (see
[Asking an AI to write one](#asking-an-ai-to-write-one) at the end).

We maintain the Supabase adapter only. Adapters you write are yours.

## Contents
- [How it fits together](#how-it-fits-together)
- [Quick start](#quick-start)
- [What the app already does](#what-the-app-already-does)
- [The interface](#the-interface)
- [Rules](#rules)
- [Data model](#data-model)
- [Optional capabilities](#optional-capabilities)
- [Choosing storage](#choosing-storage)
- [Testing](#testing)
- [Worked example: Supabase](#worked-example-supabase)
- [Asking an AI to write one](#asking-an-ai-to-write-one)

## How it fits together

```
 views ─▶ stores ─▶ collection (src/lib/storage/collection.js)
                      │  local state + IndexedDB first, always
                      │
                      ├─ online ──▶ executeOp ─▶ adapter ─▶ your storage
                      └─ offline ─▶ sync queue ─(on reconnect)─▶ executeOp ─▶ adapter
```

- An adapter is one file in `src/lib/storage/adapters/`, for example
  `src/lib/storage/adapters/myserver.js`. Its default export is a function
  that returns the adapter object.
- `VITE_STORAGE=myserver` in `.env` selects it. The default is `supabase`.
- Nothing else in the app talks to storage. Every read and write goes
  through `getAdapter()` in `src/lib/storage/index.js`.

## Quick start

1. Copy [`test/adapter/memory.js`](../test/adapter/memory.js), the smallest
   correct adapter, to `src/lib/storage/adapters/<name>.js`.
2. Replace each method body with calls to your storage, following
   [The interface](#the-interface) and [Rules](#rules).
3. Run `ADAPTER=src/lib/storage/adapters/<name>.js npm run test:adapter`
   until it passes (see [Testing](#testing) for running it against your real
   backend).
4. Set `VITE_STORAGE=<name>` in `.env`, then `npm run dev`.
5. Check offline use: `npm run build && npm run test:offline`, then try it
   by hand. Open the app online once, switch the network off (DevTools →
   Network → Offline), add and edit a few things, switch it back on, and open
   the Sync page. The queue should empty with no failed items.

## What the app already does

Don't rebuild these in an adapter. They happen above it, the same for every
backend.

| Concern | Where it's handled |
|---|---|
| Offline reads | Every page renders from IndexedDB first; the adapter is only asked for fresh data when online. |
| Offline writes | Written to IndexedDB and the sync queue, then replayed through the adapter on reconnect. |
| Retries | A write that throws is queued and retried, up to 5 times, then shown as failed on the Sync page. |
| Ids | Every new row arrives with its final `id` (a UUID) already set. |
| `created_at` | Set by the app on insert. |
| `user_id` | Set by the app on every row, from the signed-in user. |
| Joins | Label links, category names and account names are attached in the app. The adapter returns plain rows. |
| Filtering and sorting for display | Done in the app (for example, a month's transactions). |
| Totals, balances, loans, net worth | Computed in the app from the rows. |
| Exchange rates | Fetched from openexchangerates.org and cached on the device. The `rates` capability only adds a shared cache. |

So an adapter only has to store rows and give them back.

## The interface

All methods are `async`. Rows are plain JSON objects whose keys are the
column names in [Data model](#data-model).

### Required

#### `list(table, { orderBy }?) → row[]`
Every row of `table` that belongs to the signed-in user. The list must be
complete: page internally if your storage limits result sizes.
- `orderBy`: optional `[[column, 'asc' | 'desc'], ...]`. Sort by these, then
  by primary key so the order is stable. Nulls sort last.
- An empty or missing table returns `[]`, not an error.

#### `insert(table, row) → row`
Store a new row. `row.id` is already set. Store it exactly as given.
- **Idempotent:** if a row with that primary key already exists, do nothing
  and don't throw. Keep the existing row; the first write wins.
- Return the stored row (or `row` itself if your storage doesn't echo it).

#### `update(table, id, patch) → row | null`
Merge `patch` into the row with that `id`; fields not in `patch` stay as
they are. Return the updated row, or `null` if no such row exists. A missing
row is not an error.

#### `remove(table, id) → void`
Delete the row with that `id`. Deleting a row that doesn't exist is not an
error.

#### `updateMany(table, ids, patch) → void`
Apply the same `patch` to every row whose `id` is in `ids`. Ids that don't
exist are ignored; an empty `ids` does nothing. (Used to archive a card's
expenses when its bill is paid.)

#### `upsert(table, row, conflictKeys) → row`
Insert `row`, or, if a row with the same values in `conflictKeys` exists,
overwrite that row with `row`'s fields. Return the stored row. The app uses
it once: `upsert('networth_snapshots', row, ['user_id', 'month'])`.

#### `replaceLinks(linkTable, parentCol, parentId, childCol, childIds) → void`
Make `parentId`'s links exactly `childIds`: delete all of its existing rows in
`linkTable`, then add one row `{ [parentCol]: parentId, [childCol]: id }` per
id. Other parents' links are untouched. An empty `childIds` clears them.
Repeating the same call changes nothing. Used for labels:

```js
replaceLinks('transaction_labels', 'transaction_id', txId, 'label_id', [labelA, labelB])
replaceLinks('cc_expense_labels', 'cc_expense_id', expenseId, 'label_id', [])
```

### Optional
`name` (a string for logs), plus the capabilities `auth`, `rates`, `quotes`
and `health`, described in [Optional capabilities](#optional-capabilities).
Leave out any you don't support; the app checks for each one.

## Rules

1. **Throw on failure.** Network errors, timeouts, rejected credentials,
   permission errors and constraint violations must throw (or reject). Never
   return a partial result or swallow an error: the app treats a normal
   return as success and stops retrying.
2. **Not found is not a failure.** `update` returns `null`; `remove` does
   nothing. A queued delete can run after the row is already gone, and that
   must succeed.
3. **Insert is idempotent by primary key.** A write can reach your storage
   and then lose its reply; the app will send it again. A second insert with
   the same id must not create a duplicate or throw.
4. **Every write may arrive more than once.** The same is true of `update`,
   `updateMany`, `upsert`, `remove` and `replaceLinks`. With the semantics
   above they are naturally safe to repeat; don't add behaviour that isn't
   (counters, appending to lists, timestamps of when it was received).
5. **Keep the client's values.** Store `id`, `created_at`, `user_id` and every
   other field exactly as sent. Don't generate a new id.
6. **Lists are complete.** `list()` returns every row the user owns. The app
   replaces its offline copy with the result, so a truncated list deletes
   the missing rows from the device.
7. **Scope to the user.** On storage shared by several people, `list()`
   returns only rows whose `user_id` is the signed-in user, and writes must
   not touch anyone else's rows. Enforce this in the storage itself where you
   can (as Supabase does with row-level security), not just in the adapter.
   Single-person storage can ignore `user_id`.
8. **Return plain data.** Rows must be plain objects (JSON-compatible) and
   must be copies: the app changes objects it reads, and stores them in
   IndexedDB, which can't hold class instances or proxies.
9. **Settle in bounded time.** Every call should succeed or throw within
   about 15 seconds. Some screens wait for a save before moving on, and a
   request that hangs leaves them waiting.
10. **Expect calls only while the browser reports it is online.** Writes made
    while `navigator.onLine` is false are queued and sent on reconnect, even
    if your storage is local and would have worked. Nothing is lost, it's
    just applied later.

## Data model

The authoritative definition, with every type and constraint, is
[`supabase/schema/schema.sql`](../supabase/schema/schema.sql). This section
covers what an adapter needs.

**Values.** Ids are UUID strings. Dates (`date`) are `'YYYY-MM-DD'` strings.
Timestamps (`timestamptz`) are ISO-8601 strings. `numeric` columns are
JavaScript numbers. `tags` is an array of strings; `lots` is an array of
objects. Any column except the primary key may be `null` or missing.

**Primary keys.** `id` for every table, except the two link tables (the pair
of columns) and `stock_price_cache` (`symbol`). `src/lib/storage/tables.js`
exports `primaryKeyOf(table)` if your adapter needs it.

**Required** below means the app always sends a value. Columns are listed in
the order of the schema.

| Table | Columns (required in **bold**) |
|---|---|
| `accounts` | **id**, **user_id**, **name**, **type** (`savings` · `cash` · `wallet`), currency, current_balance, is_active, created_at |
| `categories` | **id**, **user_id**, **name**, **type** (`income` · `expense`), color, icon, created_at |
| `labels` | **id**, **user_id**, **name**, color, created_at |
| `currencies` | **id**, **user_id**, **code**, name, symbol, is_default, created_at. One row per (user_id, code). |
| `credit_cards` | **id**, **user_id**, **name**, bank, last_four, credit_limit, current_balance, prepaid_amount, currency, bill_amount, due_date, statement_date (1–31), expiry_date, expiry_month (`'YYYY-MM'`), created_at |
| `cc_expenses` | **id**, **user_id**, **credit_card_id** → credit_cards, **amount**, **description**, **date**, is_paid, paid_date, category_id → categories, created_at |
| `cc_expense_labels` | **cc_expense_id** → cc_expenses, **label_id** → labels |
| `assets` | **id**, **user_id**, **name**, **type** (see schema), currency, principal_amount, current_value, quantity, unit_cost, unit_price, price_updated_at, symbol, liquidity, provider, tags, lots, interest_rate, maturity_date, notes, created_at |
| `subscriptions` | **id**, **user_id**, **service_name**, category, billing_cycle (`monthly` · `quarterly` · `yearly`), **amount**, currency, next_payment_date, notes, is_active, is_paid, created_at |
| `transactions` | **id**, **user_id**, **date**, **type** (`income` · `expense` · `transfer` · `lend` · `lend_repayment`), **amount**, currency, amount_default, default_currency, account_id → accounts, credit_card_id → credit_cards, category_id → categories, description, notes, borrower_name, loan_id → transactions, created_at |
| `transaction_labels` | **transaction_id** → transactions, **label_id** → labels |
| `networth_snapshots` | **id**, **user_id**, **month** (`'YYYY-MM'`), net_worth, accounts, assets, loans, credit_cards, captured_at. One row per (user_id, month). |

`→` marks a reference to another table's `id`. Writes reach the adapter in
the order they were made, so a parent is inserted before rows that point at
it. (In the rare case a child arrives first, for example right after
reconnecting, and your storage rejects it, the write is queued behind the
parent and retried.) A transaction's or card expense's label links are
cleared before it is deleted. Foreign keys are optional. If you add them, copy the
schema's, including its `ON DELETE` rules.

**Which methods touch which tables**

| Method | Tables |
|---|---|
| `list` | all twelve above |
| `insert`, `update`, `remove` | every table with an `id` |
| `updateMany` | `cc_expenses` |
| `upsert` | `networth_snapshots` |
| `replaceLinks` | `transaction_labels`, `cc_expense_labels` |

If a later version of the app adds a column, your adapter should store
fields it doesn't recognise rather than dropping them. Document stores do
this naturally. With a fixed schema, add the column (the changelog lists
schema changes).

## Optional capabilities

| Capability | What it adds | Without it |
|---|---|---|
| `auth` | Sign-in with accounts (Supabase: Google) | A built-in single local user: "Sign in" creates one for this browser |
| `rates` | Exchange rates shared between your devices | Each device fetches rates itself and caches them for a day |
| `quotes` | Live stock prices for assets | Asset values are entered by hand |
| `health` | Clears the "service degraded" banner when the backend recovers | The banner never shows |

### `auth`
An object implementing this slice of the
[Supabase auth API](https://supabase.com/docs/reference/javascript/auth-api)
(the app was built on it, and `src/stores/auth.js` calls exactly these):

| Method | Returns |
|---|---|
| `getSession()` | `{ data: { session }, error }`. `session` is `null` when signed out, otherwise `{ access_token, refresh_token, expires_at, user: { id, email, user_metadata } }` |
| `onAuthStateChange(cb)` | Calls `cb(event, session)` whenever the session changes. The app acts on `'SIGNED_IN'` and `'SIGNED_OUT'` and takes the new session from any other event. Returns `{ data: { subscription: { unsubscribe } } }` |
| `signInWithOAuth({ provider, options: { redirectTo } })` | Starts sign-in (may redirect away) |
| `signOut()` | `{ error }` |
| `setSession({ access_token, refresh_token })` | `{ data: { session }, error }` (used when switching between saved accounts) |

`user.id` is what the app writes into every row's `user_id`.
[`src/lib/storage/localAuth.js`](../src/lib/storage/localAuth.js), the
built-in fallback, is a complete minimal example.

### `rates`
A cache of exchange rates against USD (`1 USD = rate × to_currency`), shared
by all users of the storage.
- `get(codes) → [{ from_currency: 'USD', to_currency, rate, fetched_at }]`
  for those codes (rows you have; missing codes are simply absent).
- `put(rows)` stores rows of that shape.
- `clear(codes)` deletes them.

### `quotes`
- `fetch(symbol) → { price, currency } | null`: a live price for a Yahoo
  Finance ticker such as `RELIANCE.NS`. `null` if unknown.
- `getCached(symbol) → { symbol, price, currency, fetched_at } | null`
- `putCached(symbol, price, currency)`

Browsers can't call Yahoo Finance directly (CORS), so this needs a server-side
helper. The Supabase adapter uses the `stock-quote` edge function in
`supabase/functions/`.

### `health`
`health() → boolean`: a cheap reachability check. It's only called while the
banner is showing.

## Choosing storage

The adapter is the backend's API from the browser's point of view, so the
storage has to be reachable from a web page, ideally with sign-in.

**Fits well**
- **Hosted databases with a browser SDK and per-user access rules**: Supabase,
  Firebase/Firestore, PocketBase, Appwrite. Use the platform's access rules
  for rule 7.
- **Your own server** exposing a small REST API that mirrors the seven
  methods (for example `GET /tables/:table`, `POST /tables/:table`,
  `PATCH /tables/:table/:id`). The adapter becomes a thin `fetch` wrapper,
  and the server does storage and access control. Handle CORS and
  authentication on the server.
- **A file in cloud storage you sign in to** (one JSON document per user) for
  a single person on one or two devices. `list` reads the file; writes read,
  change and write it back. Use the storage's conditional writes (ETags) so
  two devices don't overwrite each other.

**Works, with limits**
- **Device-only storage (IndexedDB)**: no sync between devices and no backup
  unless you export. The app already keeps an IndexedDB copy, so this mainly
  adds a second local copy. Use a separate database name, never
  `beyond-money`.
- **localStorage**: about 5 MB per site and synchronous. Fine for trying an
  adapter out, too small for years of transactions.

**Doesn't fit**
- **Cookies** (4 KB each, sent with every request) and **sessionStorage**
  (gone when the tab closes).
- **A database's raw connection protocol** (Postgres, MySQL, MongoDB wire
  protocol). Browsers can't open those connections, and the credentials
  would be public. Put a server in front.
- **Anything that needs a secret key in the browser.** Everything in the app
  bundle is public. Use per-user sign-in, or keep the secret on a server.

## Testing

```bash
npm run test:adapter                                          # the memory adapter
ADAPTER=src/lib/storage/adapters/myserver.js npm run test:adapter
```

(On Windows PowerShell: `$env:ADAPTER='src/lib/storage/adapters/myserver.js'; npm run test:adapter`.)

It runs two groups:
1. **Adapter contract**: every method and rule above that can be checked from
   outside: client ids kept, idempotent insert, `update` and `remove` on
   missing rows, `updateMany`, `upsert` on conflict keys, `replaceLinks`,
   `orderBy`, copies, plain data, completeness past 1,000 rows, and the shape
   of any optional capabilities (plus a `rates` round trip).
2. **App write path**: an offline session (rows created, linked, edited and
   deleted before syncing) replayed through the app's own `executeOp`, once
   and with every operation sent twice. This tests the app, so it always uses
   the memory adapter.

**Against your real backend.** `ADAPTER` can point at any module whose
default export returns a ready adapter, so write a small file that signs in a
test user first:

```js
// test/adapter/my-real-backend.js  (keep credentials out of git)
import createAdapter from '../../src/lib/storage/adapters/myserver.js'
export default async function () {
  const adapter = createAdapter()
  await adapter.auth.signInWithPassword({ email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD })
  return adapter
}
```

Set `TEST_USER_ID` to that user's id so test rows pass your access rules. The
contract only touches rows it creates (names start with `__adapter_test__`)
and deletes them at the end. `BULK_ROWS` sets the size of the completeness
check (default 1050); keep it above your storage's page size. Modules are
loaded through Vite, so `import.meta.env` and your `.env` file work as they
do in the app.

Passing the test means the adapter follows the contract. Also run
`npm run test:offline` and the manual check in [Quick start](#quick-start)
step 5.

## Worked example: Supabase

[`src/lib/storage/adapters/supabase.js`](../src/lib/storage/adapters/supabase.js)
is about a hundred lines. How it meets each rule:

| Rule | How |
|---|---|
| Complete lists | `selectAll()` pages through results 1,000 rows at a time and fails the whole read if any page fails. |
| Idempotent insert | `upsert(row, { onConflict: <primary key>, ignoreDuplicates: true })`: a repeated id is ignored. |
| Throw on failure | Every call goes through `check()`, which throws Supabase's `{ error }`. |
| Not found | `update` selects the changed rows and returns the first or `null`; `delete` of nothing succeeds. |
| User scoping | Row-level security policies in the schema (`auth.uid() = user_id`); the adapter doesn't filter. |
| Bounded time | Every request goes through `fetchWithTimeout` (15 s) in `src/lib/supabase.js`. |
| `auth` | Supabase's own auth client. |
| `rates`, `quotes` | The `exchange_rate_cache` and `stock_price_cache` tables, and the `stock-quote` edge function. |
| `health` | `GET /auth/v1/health`. |

## Asking an AI to write one

Give it this file, [`test/adapter/memory.js`](../test/adapter/memory.js),
[`src/lib/storage/adapters/supabase.js`](../src/lib/storage/adapters/supabase.js),
and something like:

> Write a Beyond Money storage adapter for **[your storage: what it is, how
> the browser reaches it, how users sign in]**. Follow docs/ADAPTERS.md
> exactly: put it in `src/lib/storage/adapters/[name].js`, default-export a
> factory, implement the seven required methods and whichever optional
> capabilities my storage supports, and obey every rule in the Rules
> section. Don't change any other file in the app. Then give me the steps
> to run `npm run test:adapter` against it and fix anything that fails.
