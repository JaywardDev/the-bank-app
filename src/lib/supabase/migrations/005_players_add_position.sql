alter table public.players
  add column if not exists position integer not null default 0;
