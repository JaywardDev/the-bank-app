create table if not exists public.market_prices (
  symbol text primary key,
  price numeric not null,
  as_of_date date not null,
  source text not null default 'stooq',
  updated_at timestamptz not null default now()
);

alter table public.market_prices enable row level security;

drop policy if exists "market_prices_select_authenticated" on public.market_prices;
create policy "market_prices_select_authenticated"
on public.market_prices
for select
to authenticated
using (true);

drop policy if exists "market_prices_insert_service_role" on public.market_prices;
create policy "market_prices_insert_service_role"
on public.market_prices
for insert
to service_role
with check (true);

drop policy if exists "market_prices_update_service_role" on public.market_prices;
create policy "market_prices_update_service_role"
on public.market_prices
for update
to service_role
using (true)
with check (true);
