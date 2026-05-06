create or replace function public.validate_and_renew_ai_turn_lock(
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
  update public.ai_turn_locks lock_row
  set state_version = p_state_version,
      expires_at = now() + make_interval(secs => greatest(coalesce(p_lock_ttl_seconds, 90), 1))
  from public.game_state state_row
  where lock_row.game_id = p_game_id
    and lock_row.player_id = p_player_id
    and lock_row.lock_token = p_lock_token
    and lock_row.expires_at > now()
    and state_row.game_id = lock_row.game_id
    and state_row.current_player_id = p_player_id
    and state_row.version = p_state_version;

  return found;
end;
$$;

grant execute on function public.validate_and_renew_ai_turn_lock(uuid, uuid, integer, uuid, integer)
  to service_role;