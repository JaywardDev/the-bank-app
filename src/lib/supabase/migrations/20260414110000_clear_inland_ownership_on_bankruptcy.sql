begin;

create or replace function public.declare_bankruptcy(
  game_id uuid,
  target_player_id uuid,
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
  next_inland_explored_cells jsonb := '[]'::jsonb;
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

  if coalesce(pending_action ->> 'player_id', '') <> target_player_id::text then
    raise exception using message = 'WRONG_PLAYER', errcode = 'P0001';
  end if;

  pending_reason := pending_action ->> 'reason';
  if pending_reason is null then
    raise exception using message = 'INVALID_PENDING_INSOLVENCY', errcode = 'P0001';
  end if;

  select *
    into player_row
    from public.players
    where players.id = declare_bankruptcy.target_player_id
      and players.game_id = declare_bankruptcy.game_id
    for update;

  if not found then
    raise exception using message = 'PLAYER_NOT_FOUND', errcode = 'P0001';
  end if;

  select coalesce(starting_cash_input, games.starting_cash, 0)
    into starting_cash
    from public.games
    where games.id = declare_bankruptcy.game_id;

  current_balance := coalesce((state_row.balances ->> target_player_id::text)::integer, starting_cash, 0);

  select coalesce(array_agg(property_ownership.tile_index order by property_ownership.tile_index), '{}'::integer[])
    into returned_property_ids
    from public.property_ownership
    where property_ownership.game_id = declare_bankruptcy.game_id
      and property_ownership.owner_player_id = declare_bankruptcy.target_player_id;

  select coalesce(
    jsonb_agg(
      case
        when cell ->> 'ownerPlayerId' = target_player_id::text then
          jsonb_set(cell, '{ownerPlayerId}', 'null'::jsonb, true)
        else
          cell
      end
      order by ordinality_value
    ),
    '[]'::jsonb
  )
    into next_inland_explored_cells
    from jsonb_array_elements(coalesce(state_row.inland_explored_cells, '[]'::jsonb)) with ordinality as inland_cells(cell, ordinality_value);

  update public.property_ownership
    set owner_player_id = null,
        collateral_loan_id = null,
        purchase_mortgage_id = null,
        houses = 0
    where property_ownership.game_id = declare_bankruptcy.game_id
      and property_ownership.owner_player_id = declare_bankruptcy.target_player_id;

  update public.player_loans
    set status = 'defaulted',
        updated_at = now()
    where player_loans.game_id = declare_bankruptcy.game_id
      and player_loans.player_id = declare_bankruptcy.target_player_id
      and player_loans.status = 'active';

  update public.purchase_mortgages
    set status = 'defaulted',
        updated_at = now()
    where purchase_mortgages.game_id = declare_bankruptcy.game_id
      and purchase_mortgages.player_id = declare_bankruptcy.target_player_id
      and purchase_mortgages.status = 'active';

  update public.players
    set position = player_row.position,
        is_in_jail = false,
        jail_turns_remaining = 0,
        is_eliminated = true,
        eliminated_at = now()
    where players.id = declare_bankruptcy.target_player_id
    returning * into player_row;

  select count(*)
    into active_remaining_count
    from public.players
    where players.game_id = declare_bankruptcy.game_id
      and players.id <> declare_bankruptcy.target_player_id
      and players.is_eliminated = false;

  game_is_over := active_remaining_count <= 1;

  select *
    into next_player_row
    from public.players
    where players.game_id = declare_bankruptcy.game_id
      and players.id <> declare_bankruptcy.target_player_id
      and players.is_eliminated = false
    order by case when players.created_at > player_row.created_at then 0 else 1 end,
             players.created_at asc
    limit 1;

  if game_is_over and active_remaining_count = 1 then
    select *
      into winner_row
      from public.players
      where players.game_id = declare_bankruptcy.game_id
        and players.id <> declare_bankruptcy.target_player_id
        and players.is_eliminated = false
      limit 1;
  end if;

  if game_is_over then
    with player_financials as (
      select
        p.id as pf_player_id,
        p.display_name as pf_player_name,
        coalesce((state_row.balances ->> p.id::text)::integer, starting_cash, 0) as pf_cash,
        coalesce(po.owned_count, 0) as pf_owned_count,
        coalesce(po.owned_value, 0) as pf_owned_value,
        coalesce(pl.liability_count, 0) + coalesce(pm.liability_count, 0) as pf_liability_count,
        coalesce(pl.liability_total, 0) + coalesce(pm.liability_total, 0) as pf_liability_total,
        p.is_eliminated as pf_is_eliminated,
        p.eliminated_at as pf_eliminated_at
      from public.players as p
      left join (
        select
          po.owner_player_id as player_id,
          count(*)::integer as owned_count,
          coalesce(sum(bt.price), 0)::integer as owned_value
        from public.property_ownership as po
        join public.board_tiles as bt
          on bt.tile_index = po.tile_index
        where po.game_id = declare_bankruptcy.game_id
          and po.owner_player_id is not null
        group by po.owner_player_id
      ) as po on po.player_id = p.id
      left join (
        select
          pl.player_id as player_id,
          count(*)::integer as liability_count,
          coalesce(sum(coalesce(pl.remaining_principal, pl.principal)), 0)::integer as liability_total
        from public.player_loans as pl
        where pl.game_id = declare_bankruptcy.game_id
          and pl.status = 'active'
        group by pl.player_id
      ) as pl on pl.player_id = p.id
      left join (
        select
          pm.player_id as player_id,
          count(*)::integer as liability_count,
          coalesce(sum(coalesce(pm.principal_remaining, 0) + coalesce(pm.accrued_interest_unpaid, 0)), 0)::integer as liability_total
        from public.purchase_mortgages as pm
        where pm.game_id = declare_bankruptcy.game_id
          and pm.status = 'active'
        group by pm.player_id
      ) as pm on pm.player_id = p.id
      where p.game_id = declare_bankruptcy.game_id
    ),
    ranked as (
      select
        pf.pf_player_id as ranked_player_id,
        coalesce(pf.pf_player_name, 'Unknown player') as ranked_player_name,
        pf.pf_cash as ranked_cash,
        (pf.pf_cash + pf.pf_owned_value - pf.pf_liability_total) as ranked_net_worth,
        pf.pf_owned_count as ranked_owned_count,
        pf.pf_liability_count as ranked_liability_count,
        pf.pf_is_eliminated as ranked_is_eliminated,
        row_number() over (
          order by
            pf.pf_is_eliminated asc,
            coalesce(pf.pf_eliminated_at, 'infinity'::timestamptz) asc,
            (pf.pf_cash + pf.pf_owned_value - pf.pf_liability_total) desc,
            pf.pf_owned_count desc,
            coalesce(pf.pf_player_name, 'Unknown player') asc
        ) as ranked_rank
      from player_financials as pf
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'playerId', ranked.ranked_player_id,
          'playerName', ranked.ranked_player_name,
          'rank', ranked.ranked_rank,
          'cash', ranked.ranked_cash,
          'netWorth', ranked.ranked_net_worth,
          'isWinner', ranked.ranked_player_id = winner_row.id,
          'isEliminated', ranked.ranked_is_eliminated,
          'ownedCount', ranked.ranked_owned_count,
          'liabilityCount', ranked.ranked_liability_count
        )
        order by ranked.ranked_rank
      ),
      '[]'::jsonb
    )
      into standings_payload
      from ranked;
  end if;

  next_version := state_row.version + 1;
  insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
  values (
    declare_bankruptcy.game_id,
    next_version,
    'BANKRUPTCY',
    jsonb_build_object(
      'player_id', target_player_id,
      'cash_before', current_balance,
      'cash_after', -1,
      'reason', pending_reason,
      'returned_property_ids', to_jsonb(returned_property_ids)
    ),
    now(),
    actor_user_id
  );

  if not game_is_over and next_player_row.id is not null then
    next_version := next_version + 1;
    insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
    values (
      declare_bankruptcy.game_id,
      next_version,
      'END_TURN',
      jsonb_build_object(
        'from_player_id', target_player_id,
        'from_player_name', player_row.display_name,
        'to_player_id', next_player_row.id,
        'to_player_name', next_player_row.display_name
      ),
      now(),
      actor_user_id
    );
  end if;

  if game_is_over then
    next_version := next_version + 1;
    insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
    values (
      declare_bankruptcy.game_id,
      next_version,
      'GAME_OVER',
      jsonb_build_object(
        'winner_player_id', winner_row.id,
        'winner_player_name', winner_row.display_name,
        'reason', 'BANKRUPTCY',
        'standings', standings_payload
      ),
      now(),
      actor_user_id
    );
  end if;

  update public.game_state
    set balances = jsonb_set(
          coalesce(state_row.balances, '{}'::jsonb),
          array[target_player_id::text],
          to_jsonb(0),
          true
        ),
        current_player_id = case when game_is_over then winner_row.id else next_player_row.id end,
        last_roll = null,
        doubles_count = 0,
        turn_phase = case
          when game_is_over then 'AWAITING_ROLL'
          when coalesce(next_player_row.is_in_jail, false) then 'AWAITING_JAIL_DECISION'
          else 'AWAITING_ROLL'
        end,
        pending_action = null,
        inland_explored_cells = next_inland_explored_cells,
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

grant execute on function public.declare_bankruptcy(
  uuid,
  uuid,
  integer,
  uuid,
  integer
) to service_role;

commit;
