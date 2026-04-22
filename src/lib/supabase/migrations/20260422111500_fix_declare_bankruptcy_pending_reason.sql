-- 1) Drop existing function (required due to param name change)
drop function if exists public.declare_bankruptcy(uuid, uuid, integer, uuid, integer);

-- 2) Recreate function with safe fallback for pending_action.reason
create function public.declare_bankruptcy(
  game_id uuid,
  player_id uuid,
  expected_version integer,
  actor_user_id uuid,
  starting_cash_input integer default null
)
returns table (
  game_state jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  state_row public.game_state%rowtype;
  player_row public.players%rowtype;
  next_player_row public.players%rowtype;
  winner_row public.players%rowtype;
  pending_action jsonb;
  pending_reason text;
  starting_cash integer;
  current_balance integer;
  returned_property_ids integer[];
  next_version integer;
  active_remaining_count integer;
  game_is_over boolean;
  standings_payload jsonb := '[]'::jsonb;
begin
  select *
    into state_row
    from public.game_state
    where game_state.game_id = declare_bankruptcy.game_id
    for update;

  if not found then
    raise exception using message = 'GAME_STATE_NOT_FOUND', errcode = 'P0001';
  end if;

  if expected_version is null or state_row.version <> expected_version then
    raise exception using message = 'VERSION_MISMATCH', errcode = 'P0001';
  end if;

  pending_action := state_row.pending_action;

  if pending_action is null or pending_action ->> 'type' <> 'INSOLVENCY_RECOVERY' then
    raise exception using message = 'NO_PENDING_INSOLVENCY', errcode = 'P0001';
  end if;

  if coalesce(pending_action ->> 'player_id', '') <> player_id::text then
    raise exception using message = 'WRONG_PLAYER', errcode = 'P0001';
  end if;

  -- ✅ FIX: safe fallback instead of failing on null/empty reason
  pending_reason := coalesce(nullif(pending_action ->> 'reason', ''), 'UNKNOWN');

  select *
    into player_row
    from public.players
    where players.id = declare_bankruptcy.player_id
      and players.game_id = declare_bankruptcy.game_id
    for update;

  if not found then
    raise exception using message = 'PLAYER_NOT_FOUND', errcode = 'P0001';
  end if;

  select coalesce(starting_cash_input, games.starting_cash, 0)
    into starting_cash
    from public.games
    where games.id = declare_bankruptcy.game_id;

  current_balance := coalesce((state_row.balances ->> player_id::text)::integer, starting_cash, 0);

  select coalesce(array_agg(property_ownership.tile_index order by property_ownership.tile_index), '{}'::integer[])
    into returned_property_ids
    from public.property_ownership
    where property_ownership.game_id = declare_bankruptcy.game_id
      and property_ownership.owner_player_id = declare_bankruptcy.player_id;

  update public.property_ownership
    set owner_player_id = null,
        collateral_loan_id = null,
        purchase_mortgage_id = null,
        houses = 0
    where property_ownership.game_id = declare_bankruptcy.game_id
      and property_ownership.owner_player_id = declare_bankruptcy.player_id;

  update public.player_loans
    set status = 'defaulted',
        updated_at = now()
    where player_loans.game_id = declare_bankruptcy.game_id
      and player_loans.player_id = declare_bankruptcy.player_id
      and player_loans.status = 'active';

  update public.purchase_mortgages
    set status = 'defaulted',
        updated_at = now()
    where purchase_mortgages.game_id = declare_bankruptcy.game_id
      and purchase_mortgages.player_id = declare_bankruptcy.player_id
      and purchase_mortgages.status = 'active';

  update public.players
    set is_eliminated = true,
        eliminated_at = now(),
        is_in_jail = false,
        jail_turns_remaining = 0
    where players.id = declare_bankruptcy.player_id
    returning * into player_row;

  select count(*)
    into active_remaining_count
    from public.players
    where players.game_id = declare_bankruptcy.game_id
      and players.id <> declare_bankruptcy.player_id
      and players.is_eliminated = false;

  game_is_over := active_remaining_count <= 1;

  if not game_is_over then
    select *
      into next_player_row
      from public.players
      where players.game_id = declare_bankruptcy.game_id
        and players.id <> declare_bankruptcy.player_id
        and players.is_eliminated = false
      order by players.created_at asc nulls last, players.id asc
      limit 1;
  end if;

  if game_is_over then
    select *
      into winner_row
      from public.players
      where players.game_id = declare_bankruptcy.game_id
        and players.id <> declare_bankruptcy.player_id
        and players.is_eliminated = false
      limit 1;
  end if;

  next_version := state_row.version + 1;

  insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
  values (
    declare_bankruptcy.game_id,
    next_version,
    'BANKRUPTCY',
    jsonb_build_object(
      'player_id', player_id,
      'cash_before', current_balance,
      'cash_after', -1,
      'reason', pending_reason,
      'returned_property_ids', to_jsonb(returned_property_ids)
    ),
    now(),
    actor_user_id
  );

  update public.game_state
    set pending_action = null,
        current_player_id = case when game_is_over then winner_row.id else next_player_row.id end,
        turn_phase = 'AWAITING_ROLL',
        version = next_version,
        updated_at = now()
    where game_state.game_id = declare_bankruptcy.game_id
    returning * into state_row;

  if game_is_over then
    update public.games
      set status = 'ended'
      where games.id = declare_bankruptcy.game_id;
  end if;

  return query select to_jsonb(state_row);
end;
$$;

-- 3) Re-grant permissions
grant execute on function public.declare_bankruptcy(
  uuid,
  uuid,
  integer,
  uuid,
  integer
) to service_role;