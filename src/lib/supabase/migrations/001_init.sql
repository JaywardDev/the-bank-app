create extension if not exists pgcrypto;

create table public.games (
  id uuid primary key default gen_random_uuid(),
  join_code text unique not null,
  status text not null default 'lobby',
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  unique (game_id, user_id)
);