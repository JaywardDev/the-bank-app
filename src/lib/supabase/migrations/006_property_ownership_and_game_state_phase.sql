create table if not exists public.property_ownership (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  tile_index integer not null,
  owner_player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (game_id, tile_index)
);

create index if not exists property_ownership_game_id_idx
  on public.property_ownership(game_id);

create index if not exists property_ownership_tile_index_idx
  on public.property_ownership(tile_index);

create index if not exists property_ownership_owner_player_id_idx
  on public.property_ownership(owner_player_id);

alter table public.game_state
  add column if not exists turn_phase text not null default 'AWAITING_ROLL',
  add column if not exists pending_action jsonb;

alter table public.property_ownership enable row level security;

drop policy if exists "property_ownership_select_all" on public.property_ownership;
create policy "property_ownership_select_all"
  on public.property_ownership
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.players
      where players.game_id = property_ownership.game_id
        and players.user_id = auth.uid()
    )
  );

drop policy if exists "property_ownership_insert_service_role" on public.property_ownership;
create policy "property_ownership_insert_service_role"
  on public.property_ownership
  for insert
  to service_role
  with check (true);
