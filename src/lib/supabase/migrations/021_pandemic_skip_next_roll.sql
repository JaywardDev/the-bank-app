alter table public.game_state
  add column if not exists skip_next_roll_by_player jsonb not null default '{}';
