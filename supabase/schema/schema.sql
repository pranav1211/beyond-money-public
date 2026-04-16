-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.accounts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['savings'::text, 'cash'::text, 'wallet'::text])),
  currency text DEFAULT 'INR'::text,
  current_balance numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT accounts_pkey PRIMARY KEY (id),
  CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.assets (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['fd'::text, 'rd'::text, 'investment'::text, 'cash'::text, 'other'::text])),
  principal_amount numeric,
  current_value numeric,
  interest_rate numeric,
  maturity_date date,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT assets_pkey PRIMARY KEY (id),
  CONSTRAINT assets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.categories (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['income'::text, 'expense'::text])),
  color text DEFAULT '#6366f1'::text,
  icon text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT categories_pkey PRIMARY KEY (id),
  CONSTRAINT categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.credit_cards (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  bank text,
  last_four text,
  credit_limit numeric,
  current_balance numeric DEFAULT 0,
  bill_amount numeric,
  due_date date,
  statement_date integer CHECK (statement_date >= 1 AND statement_date <= 31),
  created_at timestamp with time zone DEFAULT now(),
  expiry_date date,
  expiry_month text,
  CONSTRAINT credit_cards_pkey PRIMARY KEY (id),
  CONSTRAINT credit_cards_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.cc_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credit_card_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT ''::text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone DEFAULT now(),
  is_paid boolean DEFAULT false,
  paid_date date,
  CONSTRAINT cc_expenses_pkey PRIMARY KEY (id),
  CONSTRAINT cc_expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT cc_expenses_credit_card_id_fkey FOREIGN KEY (credit_card_id) REFERENCES public.credit_cards(id)
);

CREATE TABLE public.exchange_rate_cache (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  from_currency text NOT NULL,
  to_currency text NOT NULL,
  rate numeric NOT NULL,
  fetched_at timestamp with time zone DEFAULT now(),
  CONSTRAINT exchange_rate_cache_pkey PRIMARY KEY (id)
);

CREATE TABLE public.labels (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#6366f1'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT labels_pkey PRIMARY KEY (id),
  CONSTRAINT labels_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  service_name text NOT NULL,
  category text DEFAULT 'other'::text CHECK (category = ANY (ARRAY['tech'::text, 'entertainment'::text, 'productivity'::text, 'finance'::text, 'other'::text])),
  billing_cycle text DEFAULT 'monthly'::text CHECK (billing_cycle = ANY (ARRAY['monthly'::text, 'quarterly'::text, 'yearly'::text])),
  amount numeric NOT NULL DEFAULT 0,
  currency text DEFAULT 'INR'::text,
  next_payment_date date,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.transactions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  type text NOT NULL CHECK (type = ANY (ARRAY['income'::text, 'expense'::text, 'transfer'::text])),
  amount numeric NOT NULL,
  currency text DEFAULT 'INR'::text,
  amount_inr numeric,
  account_id uuid,
  credit_card_id uuid,
  category_id uuid,
  description text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id),
  CONSTRAINT transactions_credit_card_id_fkey FOREIGN KEY (credit_card_id) REFERENCES public.credit_cards(id),
  CONSTRAINT transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);

CREATE TABLE public.transaction_labels (
  transaction_id uuid NOT NULL,
  label_id uuid NOT NULL,
  CONSTRAINT transaction_labels_pkey PRIMARY KEY (transaction_id, label_id),
  CONSTRAINT transaction_labels_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id),
  CONSTRAINT transaction_labels_label_id_fkey FOREIGN KEY (label_id) REFERENCES public.labels(id)
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table accounts enable row level security;
alter table credit_cards enable row level security;
alter table assets enable row level security;
alter table categories enable row level security;
alter table labels enable row level security;
alter table transactions enable row level security;
alter table transaction_labels enable row level security;

-- Policy: users can only see and touch their own data
create policy "own data only" on accounts for all using (auth.uid() = user_id);
create policy "own data only" on credit_cards for all using (auth.uid() = user_id);
create policy "own data only" on assets for all using (auth.uid() = user_id);
create policy "own data only" on categories for all using (auth.uid() = user_id);
create policy "own data only" on labels for all using (auth.uid() = user_id);
create policy "own data only" on transactions for all using (auth.uid() = user_id);

-- Transaction labels policy via join
create policy "own transaction labels" on transaction_labels for all
using (
  exists (
    select 1 from transactions t
    where t.id = transaction_labels.transaction_id
    and t.user_id = auth.uid()
  )
);

-- ============================================================
-- Restrict sign-ups to allowed emails
-- ============================================================

create or replace function public.restrict_to_owner()
returns trigger as $$
begin
  if new.email not in ('you@example.com', 'another@example.com') then
    raise exception 'Unauthorized';
  end if;
  return new;
end;
$$ language plpgsql security definer;
