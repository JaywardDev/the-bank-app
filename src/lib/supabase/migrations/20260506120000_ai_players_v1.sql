alter table public.players
  add column if not exists is_ai boolean not null default false,
  add column if not exists ai_difficulty text null;

alter table public.players
  drop constraint if exists players_ai_difficulty_check;

alter table public.players
  add constraint players_ai_difficulty_check
  check (ai_difficulty is null or ai_difficulty in ('easy', 'medium', 'hard'));

create index if not exists players_game_id_is_ai_idx
  on public.players(game_id, is_ai);

create table if not exists public.ai_turn_locks (
  game_id uuid primary key references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  state_version integer not null,
  lock_token uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create or replace function public.acquire_ai_turn_lock(
  p_game_id uuid,
  p_player_id uuid,
  p_state_version integer,
  p_lock_token uuid,
  p_lock_ttl_seconds integer default 90
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ai_turn_locks (
    game_id,
    player_id,
    state_version,
    lock_token,
    expires_at
  ) values (
    p_game_id,
    p_player_id,
    p_state_version,
    p_lock_token,
    now() + make_interval(secs => greatest(coalesce(p_lock_ttl_seconds, 90), 1))
  )
  on conflict (game_id)
  do update
    set player_id = excluded.player_id,
        state_version = excluded.state_version,
        lock_token = excluded.lock_token,
        expires_at = excluded.expires_at,
        created_at = now()
  where public.ai_turn_locks.expires_at < now();

  return found;
end;
$$;

create or replace function public.release_ai_turn_lock(
  p_game_id uuid,
  p_lock_token uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.ai_turn_locks
  where game_id = p_game_id
    and lock_token = p_lock_token;
end;
$$;

grant execute on function public.acquire_ai_turn_lock(uuid, uuid, integer, uuid, integer)
  to service_role;

grant execute on function public.release_ai_turn_lock(uuid, uuid)
  to service_role;
