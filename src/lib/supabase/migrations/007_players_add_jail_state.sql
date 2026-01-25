alter table public.players
  add column if not exists is_in_jail boolean not null default false,
  add column if not exists jail_turns_remaining integer not null default 0;
