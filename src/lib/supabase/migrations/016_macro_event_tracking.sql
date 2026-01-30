alter table public.game_state
  add column if not exists rounds_elapsed integer not null default 0,
  add column if not exists last_macro_event_id text;
