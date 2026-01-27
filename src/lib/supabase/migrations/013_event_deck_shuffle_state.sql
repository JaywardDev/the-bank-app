alter table public.game_state
  add column if not exists chance_order integer[] null,
  add column if not exists community_order integer[] null,
  add column if not exists chance_draw_ptr integer not null default 0,
  add column if not exists community_draw_ptr integer not null default 0,
  add column if not exists chance_seed text null,
  add column if not exists community_seed text null,
  add column if not exists chance_reshuffle_count integer not null default 0,
  add column if not exists community_reshuffle_count integer not null default 0;
