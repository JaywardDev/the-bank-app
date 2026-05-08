alter table public.game_state
  add column if not exists last_economic_boom_round integer;
