create table if not exists public.trade_proposals (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  proposer_player_id uuid not null references public.players(id) on delete cascade,
  counterparty_player_id uuid not null references public.players(id) on delete cascade,
  offer_cash integer not null default 0,
  offer_tile_indices integer[] not null default '{}'::integer[],
  request_cash integer not null default 0,
  request_tile_indices integer[] not null default '{}'::integer[],
  snapshot jsonb not null default '[]'::jsonb,
  status text not null default 'PENDING',
  created_at timestamptz not null default now()
);

create index if not exists trade_proposals_game_id_idx
  on public.trade_proposals(game_id);

create index if not exists trade_proposals_proposer_player_id_idx
  on public.trade_proposals(proposer_player_id);

create index if not exists trade_proposals_counterparty_player_id_idx
  on public.trade_proposals(counterparty_player_id);

create index if not exists trade_proposals_status_idx
  on public.trade_proposals(status);

alter table public.trade_proposals enable row level security;

drop policy if exists "trade_proposals_select_all" on public.trade_proposals;
create policy "trade_proposals_select_all"
  on public.trade_proposals
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.players
      where players.game_id = trade_proposals.game_id
        and players.user_id = auth.uid()
    )
  );

drop policy if exists "trade_proposals_insert_service_role" on public.trade_proposals;
create policy "trade_proposals_insert_service_role"
  on public.trade_proposals
  for insert
  to service_role
  with check (true);

drop policy if exists "trade_proposals_update_service_role" on public.trade_proposals;
create policy "trade_proposals_update_service_role"
  on public.trade_proposals
  for update
  to service_role
  using (true);

alter publication supabase_realtime add table public.trade_proposals;
