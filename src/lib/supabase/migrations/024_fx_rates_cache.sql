create table if not exists public.fx_rates (
  pair text primary key,
  rate numeric not null,
  as_of_date date not null,
  source text not null default 'stooq',
  updated_at timestamptz not null default now()
);

alter table public.fx_rates enable row level security;

drop policy if exists "fx_rates_select_authenticated" on public.fx_rates;
create policy "fx_rates_select_authenticated"
on public.fx_rates
for select
to authenticated
using (true);

drop policy if exists "fx_rates_insert_service_role" on public.fx_rates;
create policy "fx_rates_insert_service_role"
on public.fx_rates
for insert
to service_role
with check (true);

drop policy if exists "fx_rates_update_service_role" on public.fx_rates;
create policy "fx_rates_update_service_role"
on public.fx_rates
for update
to service_role
using (true)
with check (true);
