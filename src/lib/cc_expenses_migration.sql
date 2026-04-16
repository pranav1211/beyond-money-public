-- Run this in Supabase SQL Editor to create the cc_expenses table

create table if not exists public.cc_expenses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  credit_card_id uuid references public.credit_cards(id) on delete cascade not null,
  amount numeric not null default 0,
  description text not null default '',
  date date not null default current_date,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.cc_expenses enable row level security;

-- RLS policies (same pattern as other tables)
create policy "Users can view own cc_expenses"
  on public.cc_expenses for select
  using (auth.uid() = user_id);

create policy "Users can insert own cc_expenses"
  on public.cc_expenses for insert
  with check (auth.uid() = user_id);

create policy "Users can update own cc_expenses"
  on public.cc_expenses for update
  using (auth.uid() = user_id);

create policy "Users can delete own cc_expenses"
  on public.cc_expenses for delete
  using (auth.uid() = user_id);
