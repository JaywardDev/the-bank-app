alter table public.games
add column if not exists starting_cash integer not null default 1500;

create table if not exists public.game_state (
  game_id uuid primary key references public.games(id) on delete cascade,
  version integer not null default 0,
  current_player_id uuid references public.players(id),
  balances jsonb not null default '{}'::jsonb,
  last_roll integer,
  updated_at timestamptz not null default now()
);

create table if not exists public.game_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  version integer not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists game_events_game_id_idx
  on public.game_events(game_id, version desc);

alter table public.game_state enable row level security;
alter table public.game_events enable row level security;

create policy "game_state_select_all"
  on public.game_state
  for select
  to anon, authenticated
  using (true);

create policy "game_state_insert_authenticated"
  on public.game_state
  for insert
  to authenticated
  with check (true);

create policy "game_state_update_authenticated"
  on public.game_state
  for update
  to authenticated
  using (true)
  with check (true);

create policy "game_events_select_all"
  on public.game_events
  for select
  to anon, authenticated
  using (true);

create policy "game_events_insert_authenticated"
  on public.game_events
  for insert
  to authenticated
  with check (true);
