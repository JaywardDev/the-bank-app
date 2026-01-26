create table if not exists public.player_loans (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  collateral_tile_index integer not null,
  principal integer not null,
  rate_per_turn numeric not null,
  term_turns integer not null,
  turns_remaining integer not null,
  payment_per_turn integer not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists player_loans_game_id_idx
  on public.player_loans(game_id);

create index if not exists player_loans_player_id_idx
  on public.player_loans(player_id);

create index if not exists player_loans_status_idx
  on public.player_loans(status);

alter table public.property_ownership
  add column if not exists collateral_loan_id uuid references public.player_loans(id);

alter table public.game_state
  alter column rules set default '{"freeParkingJackpotEnabled": false, "loanCollateralEnabled": true, "collateralLtv": 0.5, "loanRatePerTurn": 0.008, "loanTermTurns": 10}'::jsonb;

alter table public.player_loans enable row level security;

drop policy if exists "player_loans_select_all" on public.player_loans;
create policy "player_loans_select_all"
  on public.player_loans
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.players
      where players.game_id = player_loans.game_id
        and players.user_id = auth.uid()
    )
  );

drop policy if exists "player_loans_insert_service_role" on public.player_loans;
create policy "player_loans_insert_service_role"
  on public.player_loans
  for insert
  to service_role
  with check (true);

drop policy if exists "player_loans_update_service_role" on public.player_loans;
create policy "player_loans_update_service_role"
  on public.player_loans
  for update
  to service_role
  using (true);
