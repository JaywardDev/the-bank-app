create or replace function public.start_game_if_all_ready_atomic(
  p_game_id uuid,
  p_actor_user_id uuid default null
)
returns table (
  started boolean,
  status text,
  rejection_reason text,
  next_version integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_actor_player_id uuid;
  v_total_players integer;
  v_all_ready boolean;
  v_starting_player_id uuid;
  v_game_state public.game_state%rowtype;
  v_latest_event_version integer;
  v_next_version integer;
  v_starting_cash integer;
  v_balances jsonb;
  v_player_order jsonb;
  v_chance_seed text;
  v_community_seed text;
  v_chance_order integer[];
  v_community_order integer[];
  v_default_chance_deck_size integer := 16;
  v_default_community_deck_size integer := 16;
begin
  if p_game_id is null then
    raise exception using message = 'INVALID_INPUT', errcode = 'P0001';
  end if;

  select *
    into v_game
    from public.games
    where id = p_game_id
    for update;

  if not found then
    raise exception using message = 'GAME_NOT_FOUND', errcode = 'P0001';
  end if;

  if v_game.status <> 'lobby' then
    return query select false, coalesce(v_game.status, 'unknown'), 'NOT_LOBBY', null::integer;
    return;
  end if;

  select id
    into v_actor_player_id
    from public.players
    where game_id = p_game_id
      and user_id = coalesce(p_actor_user_id, auth.uid())
    for update;

  if v_actor_player_id is null then
    return query select false, v_game.status, 'NOT_MEMBER', null::integer;
    return;
  end if;

  select count(*), coalesce(bool_and(lobby_ready), false)
    into v_total_players, v_all_ready
    from (
      select lobby_ready
      from public.players
      where game_id = p_game_id
      for update
    ) locked_players;

  if v_total_players = 0 then
    return query select false, v_game.status, 'NO_PLAYERS', null::integer;
    return;
  end if;

  if not v_all_ready then
    return query select false, v_game.status, 'NOT_ALL_READY', null::integer;
    return;
  end if;

  select id
    into v_starting_player_id
    from public.players
    where game_id = p_game_id
    order by created_at asc, id asc
    limit 1;

  if v_starting_player_id is null then
    return query select false, v_game.status, 'NO_PLAYERS', null::integer;
    return;
  end if;

  select *
    into v_game_state
    from public.game_state
    where game_id = p_game_id
    for update;

  select version
    into v_latest_event_version
    from public.game_events
    where game_id = p_game_id
    order by version desc
    limit 1;

  v_next_version := greatest(coalesce(v_game_state.version, 0), coalesce(v_latest_event_version, 0)) + 1;
  v_starting_cash := coalesce(v_game.starting_cash, 0);

  select coalesce(jsonb_object_agg(id::text, to_jsonb(v_starting_cash)), '{}'::jsonb)
    into v_balances
    from public.players
    where game_id = p_game_id;

  select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'name', display_name
        )
        order by created_at asc, id asc
      ),
      '[]'::jsonb
    )
    into v_player_order
    from public.players
    where game_id = p_game_id;

  v_chance_seed := encode(gen_random_bytes(16), 'hex');
  v_community_seed := encode(gen_random_bytes(16), 'hex');

  select coalesce(array_agg(idx order by random()), '{}'::integer[])
    into v_chance_order
    from generate_series(0, v_default_chance_deck_size - 1) as idx;

  select coalesce(array_agg(idx order by random()), '{}'::integer[])
    into v_community_order
    from generate_series(0, v_default_community_deck_size - 1) as idx;

  insert into public.game_state (
    game_id,
    version,
    current_player_id,
    balances,
    doubles_count,
    rounds_elapsed,
    turn_phase,
    pending_action,
    last_roll,
    updated_at,
    skip_next_roll_by_player,
    income_tax_baseline_cash_by_player,
    chance_index,
    community_index,
    chance_draw_ptr,
    community_draw_ptr,
    chance_reshuffle_count,
    community_reshuffle_count,
    chance_seed,
    community_seed,
    chance_order,
    community_order,
    last_macro_event_id,
    active_macro_effects,
    active_macro_effects_v1
  ) values (
    p_game_id,
    v_next_version,
    v_starting_player_id,
    v_balances,
    0,
    0,
    'AWAITING_ROLL',
    null,
    null,
    now(),
    '{}'::jsonb,
    v_balances,
    0,
    0,
    0,
    0,
    0,
    0,
    v_chance_seed,
    v_community_seed,
    v_chance_order,
    v_community_order,
    null,
    '[]'::jsonb,
    '[]'::jsonb
  )
  on conflict (game_id)
  do update
    set version = excluded.version,
        current_player_id = excluded.current_player_id,
        balances = excluded.balances,
        doubles_count = excluded.doubles_count,
        rounds_elapsed = excluded.rounds_elapsed,
        turn_phase = excluded.turn_phase,
        pending_action = excluded.pending_action,
        last_roll = excluded.last_roll,
        updated_at = excluded.updated_at,
        skip_next_roll_by_player = excluded.skip_next_roll_by_player,
        income_tax_baseline_cash_by_player = excluded.income_tax_baseline_cash_by_player,
        chance_index = excluded.chance_index,
        community_index = excluded.community_index,
        chance_draw_ptr = excluded.chance_draw_ptr,
        community_draw_ptr = excluded.community_draw_ptr,
        chance_reshuffle_count = excluded.chance_reshuffle_count,
        community_reshuffle_count = excluded.community_reshuffle_count,
        chance_seed = excluded.chance_seed,
        community_seed = excluded.community_seed,
        chance_order = excluded.chance_order,
        community_order = excluded.community_order,
        last_macro_event_id = excluded.last_macro_event_id,
        active_macro_effects = excluded.active_macro_effects,
        active_macro_effects_v1 = excluded.active_macro_effects_v1;

  update public.games
    set status = 'in_progress'
    where id = p_game_id;

  insert into public.game_events (
    game_id,
    version,
    event_type,
    payload,
    created_by
  ) values (
    p_game_id,
    v_next_version,
    'START_GAME',
    jsonb_build_object(
      'starting_cash', v_starting_cash,
      'player_order', v_player_order
    ),
    coalesce(p_actor_user_id, auth.uid())
  )
  on conflict (game_id, version)
  do nothing;

  return query select true, 'in_progress', null::text, v_next_version;
end;
$$;

grant execute on function public.start_game_if_all_ready_atomic(uuid, uuid)
  to authenticated, service_role;
