create or replace function public.accept_trade_proposal_atomic(
  p_game_id uuid,
  p_trade_id uuid,
  p_counterparty_player_id uuid,
  p_expected_version integer default null,
  p_actor_user_id uuid default null
)
returns table (
  status text,
  rejection_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  trade_row public.trade_proposals%rowtype;
  state_row public.game_state%rowtype;
  proposer_row public.players%rowtype;
  counterparty_row public.players%rowtype;
  ownership_row public.property_ownership%rowtype;
  snapshot_tile jsonb;
  snapshot_tiles jsonb;
  snapshot_tile_index integer;
  snapshot_collateral_loan_id uuid;
  snapshot_purchase_mortgage_id uuid;
  snapshot_houses integer;
  v_tile_index integer;
  offer_cash integer;
  request_cash integer;
  proposer_balance integer;
  counterparty_balance integer;
  proposer_delta integer;
  counterparty_delta integer;
  offer_free_build_tokens integer;
  offer_free_upgrade_tokens integer;
  request_free_build_tokens integer;
  request_free_upgrade_tokens integer;
  next_proposer_free_build_tokens integer;
  next_proposer_free_upgrade_tokens integer;
  next_counterparty_free_build_tokens integer;
  next_counterparty_free_upgrade_tokens integer;
  stale_reason text;
  event_version integer;
begin
  if p_game_id is null or p_trade_id is null or p_counterparty_player_id is null then
    raise exception using message = 'INVALID_INPUT', errcode = 'P0001';
  end if;

  select *
    into trade_row
    from public.trade_proposals
    where trade_proposals.id = p_trade_id
      and trade_proposals.game_id = p_game_id
    for update;

  if not found then
    raise exception using message = 'TRADE_NOT_FOUND', errcode = 'P0001';
  end if;

  if trade_row.status <> 'PENDING' then
    raise exception using message = 'TRADE_STATUS_INVALID', errcode = 'P0001';
  end if;

  if trade_row.counterparty_player_id <> p_counterparty_player_id then
    raise exception using message = 'ONLY_COUNTERPARTY_CAN_ACCEPT', errcode = 'P0001';
  end if;

  select *
    into state_row
    from public.game_state
    where game_state.game_id = p_game_id
    for update;

  if not found then
    raise exception using message = 'GAME_STATE_NOT_FOUND', errcode = 'P0001';
  end if;

  if p_expected_version is not null and state_row.version <> p_expected_version then
    raise exception using message = 'VERSION_MISMATCH', errcode = 'P0001';
  end if;

  offer_cash := greatest(coalesce(trade_row.offer_cash, 0), 0);
  request_cash := greatest(coalesce(trade_row.request_cash, 0), 0);
  proposer_delta := -offer_cash + request_cash;
  counterparty_delta := -request_cash + offer_cash;

  proposer_balance := coalesce((coalesce(state_row.balances, '{}'::jsonb) ->> trade_row.proposer_player_id::text)::integer, 0);
  counterparty_balance := coalesce((coalesce(state_row.balances, '{}'::jsonb) ->> trade_row.counterparty_player_id::text)::integer, 0);

  if proposer_balance < offer_cash then
    raise exception using message = 'INSUFFICIENT_PROPOSER_CASH', errcode = 'P0001';
  end if;

  if counterparty_balance < request_cash then
    raise exception using message = 'INSUFFICIENT_COUNTERPARTY_CASH', errcode = 'P0001';
  end if;

  select *
    into proposer_row
    from public.players
    where players.game_id = p_game_id
      and players.id = trade_row.proposer_player_id
    for update;

  select *
    into counterparty_row
    from public.players
    where players.game_id = p_game_id
      and players.id = trade_row.counterparty_player_id
    for update;

  if proposer_row.id is null or counterparty_row.id is null then
    raise exception using message = 'TRADE_PLAYERS_NOT_FOUND', errcode = 'P0001';
  end if;

  offer_free_build_tokens := greatest(coalesce(trade_row.offer_free_build_tokens, 0), 0);
  offer_free_upgrade_tokens := greatest(coalesce(trade_row.offer_free_upgrade_tokens, 0), 0);
  request_free_build_tokens := greatest(coalesce(trade_row.request_free_build_tokens, 0), 0);
  request_free_upgrade_tokens := greatest(coalesce(trade_row.request_free_upgrade_tokens, 0), 0);

  if coalesce(proposer_row.free_build_tokens, 0) < offer_free_build_tokens then
    raise exception using message = 'INSUFFICIENT_PROPOSER_BUILD_VOUCHERS', errcode = 'P0001';
  end if;

  if coalesce(proposer_row.free_upgrade_tokens, 0) < offer_free_upgrade_tokens then
    raise exception using message = 'INSUFFICIENT_PROPOSER_UPGRADE_VOUCHERS', errcode = 'P0001';
  end if;

  if coalesce(counterparty_row.free_build_tokens, 0) < request_free_build_tokens then
    raise exception using message = 'INSUFFICIENT_COUNTERPARTY_BUILD_VOUCHERS', errcode = 'P0001';
  end if;

  if coalesce(counterparty_row.free_upgrade_tokens, 0) < request_free_upgrade_tokens then
    raise exception using message = 'INSUFFICIENT_COUNTERPARTY_UPGRADE_VOUCHERS', errcode = 'P0001';
  end if;

  next_proposer_free_build_tokens := coalesce(proposer_row.free_build_tokens, 0) - offer_free_build_tokens + request_free_build_tokens;
  next_proposer_free_upgrade_tokens := coalesce(proposer_row.free_upgrade_tokens, 0) - offer_free_upgrade_tokens + request_free_upgrade_tokens;
  next_counterparty_free_build_tokens := coalesce(counterparty_row.free_build_tokens, 0) - request_free_build_tokens + offer_free_build_tokens;
  next_counterparty_free_upgrade_tokens := coalesce(counterparty_row.free_upgrade_tokens, 0) - request_free_upgrade_tokens + offer_free_upgrade_tokens;

  if next_proposer_free_build_tokens < 0 or next_proposer_free_upgrade_tokens < 0 or next_counterparty_free_build_tokens < 0 or next_counterparty_free_upgrade_tokens < 0 then
    raise exception using message = 'NEGATIVE_VOUCHER_BALANCE', errcode = 'P0001';
  end if;

  stale_reason := null;

  foreach v_tile_index in array coalesce(trade_row.offer_tile_indices, '{}'::integer[]) loop
    select *
      into ownership_row
      from public.property_ownership po
      where po.game_id = p_game_id
        and po.tile_index = v_tile_index
      for update;

    if not found or ownership_row.owner_player_id is null then
      stale_reason := format('Tile %s is no longer owned.', v_tile_index);
      exit;
    end if;

    if ownership_row.owner_player_id <> trade_row.proposer_player_id then
      stale_reason := format('Proposer no longer owns tile %s.', v_tile_index);
      exit;
    end if;
  end loop;

  if stale_reason is null then
    foreach v_tile_index in array coalesce(trade_row.request_tile_indices, '{}'::integer[]) loop
      select *
        into ownership_row
        from public.property_ownership po
        where po.game_id = p_game_id
          and po.tile_index = v_tile_index
        for update;

      if not found or ownership_row.owner_player_id is null then
        stale_reason := format('Tile %s is no longer owned.', v_tile_index);
        exit;
      end if;

      if ownership_row.owner_player_id <> trade_row.counterparty_player_id then
        stale_reason := format('Counterparty no longer owns tile %s.', v_tile_index);
        exit;
      end if;
    end loop;
  end if;

  if jsonb_typeof(trade_row.snapshot) = 'array' then
    snapshot_tiles := trade_row.snapshot;
  elsif jsonb_typeof(trade_row.snapshot) = 'object' then
    snapshot_tiles := coalesce(trade_row.snapshot -> 'tiles', '[]'::jsonb);
  else
    snapshot_tiles := '[]'::jsonb;
  end if;

  if stale_reason is null then
    for snapshot_tile in select value from jsonb_array_elements(snapshot_tiles) loop
      snapshot_tile_index := nullif(snapshot_tile ->> 'tile_index', '')::integer;
      if snapshot_tile_index is null then
        continue;
      end if;

      select *
        into ownership_row
        from public.property_ownership po
        where po.game_id = p_game_id
          and po.tile_index = snapshot_tile_index
        for update;

      if not found then
        stale_reason := format('Tile %s is missing.', snapshot_tile_index);
        exit;
      end if;

      snapshot_collateral_loan_id := nullif(snapshot_tile ->> 'collateral_loan_id', '')::uuid;
      snapshot_purchase_mortgage_id := nullif(snapshot_tile ->> 'purchase_mortgage_id', '')::uuid;
      snapshot_houses := coalesce((snapshot_tile ->> 'houses')::integer, 0);

      if ownership_row.collateral_loan_id is distinct from snapshot_collateral_loan_id then
        stale_reason := format('Trade is out of date: collateral loan changed for tile %s.', snapshot_tile_index);
        exit;
      end if;

      if ownership_row.purchase_mortgage_id is distinct from snapshot_purchase_mortgage_id then
        stale_reason := format('Trade is out of date: mortgage changed for tile %s.', snapshot_tile_index);
        exit;
      end if;

      if coalesce(ownership_row.houses, 0) <> snapshot_houses then
        stale_reason := format('Trade is out of date: houses changed for tile %s.', snapshot_tile_index);
        exit;
      end if;
    end loop;
  end if;

  event_version := state_row.version;

  if stale_reason is not null then
    update public.trade_proposals
      set status = 'REJECTED'
      where id = trade_row.id;

    event_version := event_version + 1;
    insert into public.game_events (
      game_id,
      version,
      event_type,
      payload,
      created_at,
      created_by
    ) values (
      p_game_id,
      event_version,
      'TRADE_REJECTED',
      jsonb_build_object(
        'trade_id', trade_row.id,
        'proposer_player_id', trade_row.proposer_player_id,
        'counterparty_player_id', trade_row.counterparty_player_id,
        'rejected_by_player_id', p_counterparty_player_id,
        'reason', stale_reason
      ),
      now(),
      p_actor_user_id
    );

    update public.game_state
      set version = event_version,
          updated_at = now()
      where game_state.game_id = p_game_id;

    return query
      select 'REJECTED'::text, stale_reason;
    return;
  end if;

  update public.trade_proposals
    set status = 'ACCEPTED'
    where id = trade_row.id;

  update public.players
    set free_build_tokens = next_proposer_free_build_tokens,
        free_upgrade_tokens = next_proposer_free_upgrade_tokens
    where id = proposer_row.id;

  update public.players
    set free_build_tokens = next_counterparty_free_build_tokens,
        free_upgrade_tokens = next_counterparty_free_upgrade_tokens
    where id = counterparty_row.id;

  foreach v_tile_index in array coalesce(trade_row.offer_tile_indices, '{}'::integer[]) loop
    select *
      into ownership_row
      from public.property_ownership po
      where po.game_id = p_game_id
        and po.tile_index = v_tile_index
      for update;

    update public.property_ownership
      set owner_player_id = trade_row.counterparty_player_id,
          acquired_round = coalesce(state_row.rounds_elapsed, 0)
      where id = ownership_row.id;

    if ownership_row.collateral_loan_id is not null then
      update public.player_loans
        set player_id = trade_row.counterparty_player_id
        where player_loans.id = ownership_row.collateral_loan_id
          and player_loans.game_id = p_game_id;
    end if;

    if ownership_row.purchase_mortgage_id is not null then
      update public.purchase_mortgages
        set player_id = trade_row.counterparty_player_id
        where purchase_mortgages.id = ownership_row.purchase_mortgage_id
          and purchase_mortgages.game_id = p_game_id;
    end if;
  end loop;

  foreach v_tile_index in array coalesce(trade_row.request_tile_indices, '{}'::integer[]) loop
    select *
      into ownership_row
      from public.property_ownership po
      where po.game_id = p_game_id
        and po.tile_index = v_tile_index
      for update;

    update public.property_ownership
      set owner_player_id = trade_row.proposer_player_id,
          acquired_round = coalesce(state_row.rounds_elapsed, 0)
      where id = ownership_row.id;

    if ownership_row.collateral_loan_id is not null then
      update public.player_loans
        set player_id = trade_row.proposer_player_id
        where player_loans.id = ownership_row.collateral_loan_id
          and player_loans.game_id = p_game_id;
    end if;

    if ownership_row.purchase_mortgage_id is not null then
      update public.purchase_mortgages
        set player_id = trade_row.proposer_player_id
        where purchase_mortgages.id = ownership_row.purchase_mortgage_id
          and purchase_mortgages.game_id = p_game_id;
    end if;
  end loop;

  update public.game_state
    set balances = jsonb_set(
          jsonb_set(
            coalesce(state_row.balances, '{}'::jsonb),
            array[trade_row.proposer_player_id::text],
            to_jsonb(proposer_balance + proposer_delta),
            true
          ),
          array[trade_row.counterparty_player_id::text],
          to_jsonb(counterparty_balance + counterparty_delta),
          true
        ),
        updated_at = now()
    where game_state.game_id = p_game_id;

  event_version := event_version + 1;
  insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
  values (
    p_game_id,
    event_version,
    'TRADE_ACCEPTED',
    jsonb_build_object(
      'trade_id', trade_row.id,
      'proposer_player_id', trade_row.proposer_player_id,
      'counterparty_player_id', trade_row.counterparty_player_id,
      'offer_cash', offer_cash,
      'offer_free_build_tokens', offer_free_build_tokens,
      'offer_free_upgrade_tokens', offer_free_upgrade_tokens,
      'offer_tile_indices', to_jsonb(coalesce(trade_row.offer_tile_indices, '{}'::integer[])),
      'request_cash', request_cash,
      'request_free_build_tokens', request_free_build_tokens,
      'request_free_upgrade_tokens', request_free_upgrade_tokens,
      'request_tile_indices', to_jsonb(coalesce(trade_row.request_tile_indices, '{}'::integer[]))
    ),
    now(),
    p_actor_user_id
  );

  if offer_cash > 0 then
    event_version := event_version + 1;
    insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
    values (
      p_game_id,
      event_version,
      'CASH_DEBIT',
      jsonb_build_object(
        'player_id', trade_row.proposer_player_id,
        'amount', offer_cash,
        'reason', 'TRADE',
        'counterparty_player_id', trade_row.counterparty_player_id,
        'trade_id', trade_row.id,
        'from_player_id', trade_row.proposer_player_id,
        'to_player_id', trade_row.counterparty_player_id,
        'side', 'OFFER'
      ),
      now(),
      p_actor_user_id
    );

    event_version := event_version + 1;
    insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
    values (
      p_game_id,
      event_version,
      'CASH_CREDIT',
      jsonb_build_object(
        'player_id', trade_row.counterparty_player_id,
        'amount', offer_cash,
        'reason', 'TRADE',
        'counterparty_player_id', trade_row.proposer_player_id,
        'trade_id', trade_row.id,
        'from_player_id', trade_row.proposer_player_id,
        'to_player_id', trade_row.counterparty_player_id,
        'side', 'OFFER'
      ),
      now(),
      p_actor_user_id
    );
  end if;

  if request_cash > 0 then
    event_version := event_version + 1;
    insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
    values (
      p_game_id,
      event_version,
      'CASH_DEBIT',
      jsonb_build_object(
        'player_id', trade_row.counterparty_player_id,
        'amount', request_cash,
        'reason', 'TRADE',
        'counterparty_player_id', trade_row.proposer_player_id,
        'trade_id', trade_row.id,
        'from_player_id', trade_row.counterparty_player_id,
        'to_player_id', trade_row.proposer_player_id,
        'side', 'REQUEST'
      ),
      now(),
      p_actor_user_id
    );

    event_version := event_version + 1;
    insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
    values (
      p_game_id,
      event_version,
      'CASH_CREDIT',
      jsonb_build_object(
        'player_id', trade_row.proposer_player_id,
        'amount', request_cash,
        'reason', 'TRADE',
        'counterparty_player_id', trade_row.counterparty_player_id,
        'trade_id', trade_row.id,
        'from_player_id', trade_row.counterparty_player_id,
        'to_player_id', trade_row.proposer_player_id,
        'side', 'REQUEST'
      ),
      now(),
      p_actor_user_id
    );
  end if;

  foreach v_tile_index in array coalesce(trade_row.offer_tile_indices, '{}'::integer[]) loop
    select *
      into ownership_row
      from public.property_ownership po
      where po.game_id = p_game_id
        and po.tile_index = v_tile_index;

    event_version := event_version + 1;
    insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
    values (
      p_game_id,
      event_version,
      'PROPERTY_TRANSFERRED',
      jsonb_build_object(
        'trade_id', trade_row.id,
        'tile_index', v_tile_index,
        'from_player_id', trade_row.proposer_player_id,
        'to_player_id', trade_row.counterparty_player_id,
        'collateral_loan_id', ownership_row.collateral_loan_id,
        'purchase_mortgage_id', ownership_row.purchase_mortgage_id,
        'houses', coalesce(ownership_row.houses, 0)
      ),
      now(),
      p_actor_user_id
    );

    if ownership_row.collateral_loan_id is not null then
      event_version := event_version + 1;
      insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
      values (
        p_game_id,
        event_version,
        'LOAN_ASSUMED',
        jsonb_build_object(
          'trade_id', trade_row.id,
          'loan_id', ownership_row.collateral_loan_id,
          'tile_index', v_tile_index,
          'from_player_id', trade_row.proposer_player_id,
          'to_player_id', trade_row.counterparty_player_id,
          'loan_type', 'COLLATERAL'
        ),
        now(),
        p_actor_user_id
      );
    end if;

    if ownership_row.purchase_mortgage_id is not null then
      event_version := event_version + 1;
      insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
      values (
        p_game_id,
        event_version,
        'LOAN_ASSUMED',
        jsonb_build_object(
          'trade_id', trade_row.id,
          'loan_id', ownership_row.purchase_mortgage_id,
          'tile_index', v_tile_index,
          'from_player_id', trade_row.proposer_player_id,
          'to_player_id', trade_row.counterparty_player_id,
          'loan_type', 'PURCHASE_MORTGAGE'
        ),
        now(),
        p_actor_user_id
      );
    end if;
  end loop;

  foreach v_tile_index in array coalesce(trade_row.request_tile_indices, '{}'::integer[]) loop
    select *
      into ownership_row
      from public.property_ownership po
      where po.game_id = p_game_id
        and po.tile_index = v_tile_index;

    event_version := event_version + 1;
    insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
    values (
      p_game_id,
      event_version,
      'PROPERTY_TRANSFERRED',
      jsonb_build_object(
        'trade_id', trade_row.id,
        'tile_index', v_tile_index,
        'from_player_id', trade_row.counterparty_player_id,
        'to_player_id', trade_row.proposer_player_id,
        'collateral_loan_id', ownership_row.collateral_loan_id,
        'purchase_mortgage_id', ownership_row.purchase_mortgage_id,
        'houses', coalesce(ownership_row.houses, 0)
      ),
      now(),
      p_actor_user_id
    );

    if ownership_row.collateral_loan_id is not null then
      event_version := event_version + 1;
      insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
      values (
        p_game_id,
        event_version,
        'LOAN_ASSUMED',
        jsonb_build_object(
          'trade_id', trade_row.id,
          'loan_id', ownership_row.collateral_loan_id,
          'tile_index', v_tile_index,
          'from_player_id', trade_row.counterparty_player_id,
          'to_player_id', trade_row.proposer_player_id,
          'loan_type', 'COLLATERAL'
        ),
        now(),
        p_actor_user_id
      );
    end if;

    if ownership_row.purchase_mortgage_id is not null then
      event_version := event_version + 1;
      insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
      values (
        p_game_id,
        event_version,
        'LOAN_ASSUMED',
        jsonb_build_object(
          'trade_id', trade_row.id,
          'loan_id', ownership_row.purchase_mortgage_id,
          'tile_index', v_tile_index,
          'from_player_id', trade_row.counterparty_player_id,
          'to_player_id', trade_row.proposer_player_id,
          'loan_type', 'PURCHASE_MORTGAGE'
        ),
        now(),
        p_actor_user_id
      );
    end if;
  end loop;

  update public.game_state
    set version = event_version,
        updated_at = now()
    where game_state.game_id = p_game_id;

  return query
    select 'ACCEPTED'::text, null::text;
end;
$$;

grant execute on function public.accept_trade_proposal_atomic(uuid, uuid, uuid, integer, uuid)
  to authenticated, service_role;

create or replace function public.adjust_player_construction_vouchers_atomic(
  p_game_id uuid,
  p_player_id uuid,
  p_free_build_tokens_delta integer default 0,
  p_free_upgrade_tokens_delta integer default 0
)
returns table (
  free_build_tokens integer,
  free_upgrade_tokens integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  player_row public.players%rowtype;
  next_free_build_tokens integer;
  next_free_upgrade_tokens integer;
begin
  if p_game_id is null or p_player_id is null then
    raise exception using message = 'INVALID_INPUT', errcode = 'P0001';
  end if;

  select *
    into player_row
    from public.players
    where players.game_id = p_game_id
      and players.id = p_player_id
    for update;

  if not found then
    raise exception using message = 'PLAYER_NOT_FOUND', errcode = 'P0001';
  end if;

  next_free_build_tokens := coalesce(player_row.free_build_tokens, 0) + coalesce(p_free_build_tokens_delta, 0);
  next_free_upgrade_tokens := coalesce(player_row.free_upgrade_tokens, 0) + coalesce(p_free_upgrade_tokens_delta, 0);

  if next_free_build_tokens < 0 then
    raise exception using message = 'INSUFFICIENT_FREE_BUILD_TOKENS', errcode = 'P0001';
  end if;

  if next_free_upgrade_tokens < 0 then
    raise exception using message = 'INSUFFICIENT_FREE_UPGRADE_TOKENS', errcode = 'P0001';
  end if;

  update public.players
    set free_build_tokens = next_free_build_tokens,
        free_upgrade_tokens = next_free_upgrade_tokens
    where players.id = player_row.id
  returning players.free_build_tokens, players.free_upgrade_tokens
    into free_build_tokens, free_upgrade_tokens;

  return next;
end;
$$;

grant execute on function public.adjust_player_construction_vouchers_atomic(uuid, uuid, integer, integer)
  to service_role;
