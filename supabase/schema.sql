-- Pokreni ceo fajl u Supabase Dashboard > SQL Editor

create table if not exists public.user_finance_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  app_data jsonb not null default '{"profile":{"name":"Korisnik","monthlyIncomeGoal":0},"transactions":[],"budgets":[],"goals":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_finance_data enable row level security;

drop policy if exists "Users can read own finance data" on public.user_finance_data;
create policy "Users can read own finance data"
on public.user_finance_data
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own finance data" on public.user_finance_data;
create policy "Users can insert own finance data"
on public.user_finance_data
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own finance data" on public.user_finance_data;
create policy "Users can update own finance data"
on public.user_finance_data
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own finance data" on public.user_finance_data;
create policy "Users can delete own finance data"
on public.user_finance_data
for delete
using (auth.uid() = user_id);

create index if not exists user_finance_data_updated_at_idx
on public.user_finance_data(updated_at desc);
