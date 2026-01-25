alter table public.game_state
  add column if not exists chance_index integer not null default 0,
  add column if not exists community_index integer not null default 0;
