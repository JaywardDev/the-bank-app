alter table public.players
  add column if not exists free_build_tokens integer not null default 0,
  add column if not exists free_upgrade_tokens integer not null default 0;
