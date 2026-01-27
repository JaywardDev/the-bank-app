alter table public.players
  add column if not exists get_out_of_jail_free_count integer not null default 0;
