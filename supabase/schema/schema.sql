-- ============================================================================
-- Beyond Money: database schema (current as of app v3.0.1)
--
-- One file, no version history. It is safe to run more than once:
--   * New project: run it once in the Supabase SQL Editor.
--   * Existing project from an older version: run it again. Missing tables,
--     columns, indexes and policies are added; existing data is kept.
--
-- BEFORE YOU RUN IT: edit the email allowlist in section 6 (restrict_to_owner).
-- Only those Google accounts will be able to sign in. If you skip this, every
-- sign-in fails with "Database error saving new user".
-- ============================================================================


-- ============================================================================
-- 1. Tables (in dependency order)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  type text NOT NULL,
  currency text DEFAULT 'INR',
  current_balance numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT accounts_pkey PRIMARY KEY (id),
  CONSTRAINT accounts_type_check CHECK (type IN ('savings', 'cash', 'wallet'))
);

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  type text NOT NULL,
  color text DEFAULT '#6366f1',
  icon text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT categories_pkey PRIMARY KEY (id),
  CONSTRAINT categories_type_check CHECK (type IN ('income', 'expense'))
);

CREATE TABLE IF NOT EXISTS public.labels (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  color text DEFAULT '#6366f1',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT labels_pkey PRIMARY KEY (id)
);

-- The currencies a user works with; one row per code, one marked default.
CREATE TABLE IF NOT EXISTS public.currencies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  code text NOT NULL,
  name text,
  symbol text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT currencies_pkey PRIMARY KEY (id),
  CONSTRAINT currencies_user_code_uniq UNIQUE (user_id, code)
);

CREATE TABLE IF NOT EXISTS public.credit_cards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  bank text,
  last_four text,
  credit_limit numeric,
  current_balance numeric DEFAULT 0,
  -- Amount already paid toward the current bill (partial / early payment).
  -- Display-only offset: net due = unpaid card expenses - prepaid_amount.
  prepaid_amount numeric NOT NULL DEFAULT 0,
  currency text DEFAULT 'INR',
  bill_amount numeric,
  due_date date,
  statement_date integer,
  expiry_date date,
  expiry_month text,                    -- 'YYYY-MM'
  created_at timestamptz DEFAULT now(),
  CONSTRAINT credit_cards_pkey PRIMARY KEY (id),
  CONSTRAINT credit_cards_statement_date_check CHECK (statement_date >= 1 AND statement_date <= 31)
);

-- Individual purchases on a card. is_paid/paid_date mark them archived when
-- the bill is paid.
CREATE TABLE IF NOT EXISTS public.cc_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  credit_card_id uuid NOT NULL REFERENCES public.credit_cards(id),
  amount numeric NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  date date NOT NULL DEFAULT CURRENT_DATE,
  is_paid boolean DEFAULT false,
  paid_date date,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT cc_expenses_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.cc_expense_labels (
  cc_expense_id uuid NOT NULL REFERENCES public.cc_expenses(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES public.labels(id) ON DELETE CASCADE,
  CONSTRAINT cc_expense_labels_pkey PRIMARY KEY (cc_expense_id, label_id)
);

CREATE TABLE IF NOT EXISTS public.assets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  type text NOT NULL,
  currency text DEFAULT 'INR',
  principal_amount numeric,
  current_value numeric,
  quantity numeric,
  unit_cost numeric,
  unit_price numeric,
  price_updated_at timestamptz,
  symbol text,                          -- market ticker, e.g. RELIANCE.NS
  liquidity text,
  provider text,
  tags text[],
  lots jsonb,                           -- per-purchase lots for stocks / funds
  interest_rate numeric,
  maturity_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT assets_pkey PRIMARY KEY (id),
  CONSTRAINT assets_type_check CHECK (type IN (
    'cash', 'fd', 'rd', 'savings_bond', 'security_deposit',
    'ppf', 'nps',
    'mutual_fund', 'etf', 'stock',
    'gold', 'silver', 'crypto',
    'real_estate', 'vehicle', 'collectible',
    'loan_receivable', 'investment', 'other'
  )),
  CONSTRAINT assets_liquidity_check CHECK (liquidity IS NULL OR liquidity IN ('liquid', 'locked', 'illiquid'))
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  service_name text NOT NULL,
  category text DEFAULT 'other',
  billing_cycle text DEFAULT 'monthly',
  amount numeric NOT NULL DEFAULT 0,
  currency text DEFAULT 'INR',
  next_payment_date date,
  notes text,
  is_active boolean DEFAULT true,
  is_paid boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT subscriptions_category_check CHECK (category IN ('tech', 'entertainment', 'productivity', 'finance', 'other')),
  CONSTRAINT subscriptions_billing_cycle_check CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly'))
);

-- Money movements. Lending:
--   'lend'            money lent out; borrower_name says to whom.
--   'lend_repayment'  money coming back. loan_id set = paid toward that one
--                     loan; loan_id null = paid by the person, applied to their
--                     oldest loans first (computed in the app, src/lib/loans.js).
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  date date NOT NULL DEFAULT CURRENT_DATE,
  type text NOT NULL,
  amount numeric NOT NULL,
  currency text DEFAULT 'INR',
  amount_default numeric,               -- amount in default_currency when saved
  default_currency text DEFAULT 'INR',
  account_id uuid REFERENCES public.accounts(id),
  credit_card_id uuid REFERENCES public.credit_cards(id),
  category_id uuid REFERENCES public.categories(id),
  description text,
  notes text,
  borrower_name text,
  loan_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_type_check CHECK (type IN ('income', 'expense', 'transfer', 'lend', 'lend_repayment'))
);

CREATE TABLE IF NOT EXISTS public.transaction_labels (
  transaction_id uuid NOT NULL REFERENCES public.transactions(id),
  label_id uuid NOT NULL REFERENCES public.labels(id),
  CONSTRAINT transaction_labels_pkey PRIMARY KEY (transaction_id, label_id)
);

-- Month-end net worth, captured once a month so past months stay fixed
-- (months before the first capture are rebuilt from the ledger in the app).
CREATE TABLE IF NOT EXISTS public.networth_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month text NOT NULL,                  -- 'YYYY-MM'
  net_worth numeric NOT NULL DEFAULT 0,
  accounts numeric NOT NULL DEFAULT 0,
  assets numeric NOT NULL DEFAULT 0,
  loans numeric NOT NULL DEFAULT 0,
  credit_cards numeric NOT NULL DEFAULT 0,
  captured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT networth_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT networth_snapshots_user_month_key UNIQUE (user_id, month)
);

-- Shared caches (not per-user): exchange rates and stock prices.
CREATE TABLE IF NOT EXISTS public.exchange_rate_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  from_currency text NOT NULL,
  to_currency text NOT NULL,
  rate numeric NOT NULL,
  fetched_at timestamptz DEFAULT now(),
  CONSTRAINT exchange_rate_cache_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.stock_price_cache (
  symbol text NOT NULL,
  price numeric,
  currency text,
  fetched_at timestamptz DEFAULT now(),
  CONSTRAINT stock_price_cache_pkey PRIMARY KEY (symbol)
);


-- ============================================================================
-- 2. Upgrades for databases created by older versions
--    (no-ops on a new project)
-- ============================================================================

-- Old versions stored the converted amount as amount_inr.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'amount_inr'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'amount_default'
  ) THEN
    ALTER TABLE public.transactions RENAME COLUMN amount_inr TO amount_default;
  END IF;
END $$;

-- Columns added after a table was first created.
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS amount_default numeric;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS default_currency text DEFAULT 'INR';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS borrower_name text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS loan_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS currency text DEFAULT 'INR';
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS quantity numeric;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS unit_cost numeric;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS unit_price numeric;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS price_updated_at timestamptz;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS symbol text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS liquidity text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS lots jsonb;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS interest_rate numeric;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS maturity_date date;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.credit_cards ADD COLUMN IF NOT EXISTS prepaid_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.credit_cards ADD COLUMN IF NOT EXISTS currency text DEFAULT 'INR';
ALTER TABLE public.credit_cards ADD COLUMN IF NOT EXISTS bill_amount numeric;
ALTER TABLE public.credit_cards ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.credit_cards ADD COLUMN IF NOT EXISTS statement_date integer;
ALTER TABLE public.credit_cards ADD COLUMN IF NOT EXISTS expiry_date date;
ALTER TABLE public.credit_cards ADD COLUMN IF NOT EXISTS expiry_month text;

ALTER TABLE public.cc_expenses ADD COLUMN IF NOT EXISTS is_paid boolean DEFAULT false;
ALTER TABLE public.cc_expenses ADD COLUMN IF NOT EXISTS paid_date date;
ALTER TABLE public.cc_expenses ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS is_paid boolean DEFAULT false;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS icon text;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Backfill defaults on rows that predate those columns.
UPDATE public.transactions SET default_currency = 'INR' WHERE default_currency IS NULL;
UPDATE public.assets SET currency = 'INR' WHERE currency IS NULL;
UPDATE public.credit_cards SET currency = 'INR' WHERE currency IS NULL;
UPDATE public.subscriptions SET is_paid = false WHERE is_paid IS NULL;

-- Allowed values that grew over time (old tables keep their old check, so
-- replace it with the current one).
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('income', 'expense', 'transfer', 'lend', 'lend_repayment'));

ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_type_check;
ALTER TABLE public.assets ADD CONSTRAINT assets_type_check CHECK (type IN (
  'cash', 'fd', 'rd', 'savings_bond', 'security_deposit',
  'ppf', 'nps',
  'mutual_fund', 'etf', 'stock',
  'gold', 'silver', 'crypto',
  'real_estate', 'vehicle', 'collectible',
  'loan_receivable', 'investment', 'other'
));

ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_liquidity_check;
ALTER TABLE public.assets ADD CONSTRAINT assets_liquidity_check
  CHECK (liquidity IS NULL OR liquidity IN ('liquid', 'locked', 'illiquid'));


-- ============================================================================
-- 3. Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS transactions_loan_id_idx ON public.transactions(loan_id);
CREATE INDEX IF NOT EXISTS transactions_borrower_name_idx ON public.transactions(borrower_name) WHERE borrower_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS cc_expenses_category_id_idx ON public.cc_expenses(category_id);
CREATE INDEX IF NOT EXISTS cc_expense_labels_label_id_idx ON public.cc_expense_labels(label_id);
CREATE INDEX IF NOT EXISTS networth_snapshots_user_id_idx ON public.networth_snapshots(user_id);


-- ============================================================================
-- 4. Row Level Security: each user sees and changes only their own rows
-- ============================================================================

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_expense_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.networth_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rate_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_price_cache ENABLE ROW LEVEL SECURITY;

-- Tables with a user_id column.
DROP POLICY IF EXISTS "own data only" ON public.accounts;
CREATE POLICY "own data only" ON public.accounts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own data only" ON public.categories;
CREATE POLICY "own data only" ON public.categories FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own data only" ON public.labels;
CREATE POLICY "own data only" ON public.labels FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own data only" ON public.currencies;
CREATE POLICY "own data only" ON public.currencies FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own data only" ON public.credit_cards;
CREATE POLICY "own data only" ON public.credit_cards FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own data only" ON public.cc_expenses;
CREATE POLICY "own data only" ON public.cc_expenses FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own data only" ON public.assets;
CREATE POLICY "own data only" ON public.assets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own data only" ON public.subscriptions;
CREATE POLICY "own data only" ON public.subscriptions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own data only" ON public.transactions;
CREATE POLICY "own data only" ON public.transactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own networth snapshots" ON public.networth_snapshots;
CREATE POLICY "own networth snapshots" ON public.networth_snapshots FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Link tables: allowed when the parent row is yours.
DROP POLICY IF EXISTS "own transaction labels" ON public.transaction_labels;
CREATE POLICY "own transaction labels" ON public.transaction_labels FOR ALL
  USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_labels.transaction_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_labels.transaction_id AND t.user_id = auth.uid()));

DROP POLICY IF EXISTS "own cc expense labels" ON public.cc_expense_labels;
CREATE POLICY "own cc expense labels" ON public.cc_expense_labels FOR ALL
  USING (EXISTS (SELECT 1 FROM public.cc_expenses e WHERE e.id = cc_expense_labels.cc_expense_id AND e.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cc_expenses e WHERE e.id = cc_expense_labels.cc_expense_id AND e.user_id = auth.uid()));

-- Shared caches: any signed-in user may read and refresh them.
DROP POLICY IF EXISTS "authed read" ON public.exchange_rate_cache;
DROP POLICY IF EXISTS "authed write" ON public.exchange_rate_cache;
DROP POLICY IF EXISTS "authed update" ON public.exchange_rate_cache;
DROP POLICY IF EXISTS "authed delete" ON public.exchange_rate_cache;
CREATE POLICY "authed read" ON public.exchange_rate_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "authed write" ON public.exchange_rate_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authed update" ON public.exchange_rate_cache FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authed delete" ON public.exchange_rate_cache FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "authed read" ON public.stock_price_cache;
DROP POLICY IF EXISTS "authed write" ON public.stock_price_cache;
DROP POLICY IF EXISTS "authed update" ON public.stock_price_cache;
DROP POLICY IF EXISTS "authed delete" ON public.stock_price_cache;
CREATE POLICY "authed read" ON public.stock_price_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "authed write" ON public.stock_price_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authed update" ON public.stock_price_cache FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authed delete" ON public.stock_price_cache FOR DELETE TO authenticated USING (true);


-- ============================================================================
-- 5. Comments
-- ============================================================================

COMMENT ON COLUMN public.credit_cards.prepaid_amount IS
  'Amount already paid toward the current outstanding card spend; display-only subtotal offset.';


-- ============================================================================
-- 6. Who can sign in
--    EDIT THE EMAILS BELOW to the Google account(s) allowed to use this app.
--    Anyone else is rejected when they first sign in.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.restrict_to_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF lower(new.email) NOT IN (
    'you@example.com',
    'another@example.com'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS restrict_signups ON auth.users;
CREATE TRIGGER restrict_signups
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.restrict_to_owner();
