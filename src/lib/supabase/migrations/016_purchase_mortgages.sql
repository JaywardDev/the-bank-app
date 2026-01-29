create table if not exists public.purchase_mortgages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  tile_index integer not null,
  principal_original integer not null,
  principal_remaining integer not null,
  rate_per_turn numeric not null,
  term_turns integer not null,
  turns_elapsed integer not null default 0,
  accrued_interest_unpaid integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists purchase_mortgages_game_id_idx
  on public.purchase_mortgages(game_id);

create index if not exists purchase_mortgages_player_id_idx
  on public.purchase_mortgages(player_id);

create index if not exists purchase_mortgages_status_idx
  on public.purchase_mortgages(status);

alter table public.property_ownership
  add column if not exists purchase_mortgage_id uuid references public.purchase_mortgages(id);

alter table public.purchase_mortgages enable row level security;

drop policy if exists "purchase_mortgages_select_all" on public.purchase_mortgages;
create policy "purchase_mortgages_select_all"
  on public.purchase_mortgages
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.players
      where players.game_id = purchase_mortgages.game_id
        and players.user_id = auth.uid()
    )
  );

drop policy if exists "purchase_mortgages_insert_service_role" on public.purchase_mortgages;
create policy "purchase_mortgages_insert_service_role"
  on public.purchase_mortgages
  for insert
  to service_role
  with check (true);

drop policy if exists "purchase_mortgages_update_service_role" on public.purchase_mortgages;
create policy "purchase_mortgages_update_service_role"
  on public.purchase_mortgages
  for update
  to service_role
  using (true);
