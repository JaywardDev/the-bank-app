alter table public.game_state
  add column if not exists active_macro_effects jsonb not null default '[]';
