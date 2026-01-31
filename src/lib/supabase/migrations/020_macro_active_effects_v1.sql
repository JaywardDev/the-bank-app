alter table public.game_state
  add column if not exists active_macro_effects_v1 jsonb not null default '[]';
