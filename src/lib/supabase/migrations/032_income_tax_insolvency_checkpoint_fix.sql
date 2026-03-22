create or replace function public.confirm_insolvency_payment(
  game_id uuid,
  player_id uuid,
  expected_version integer,
  actor_user_id uuid,
  starting_cash_input integer default null,
  macro_interest_delta_input numeric default 0
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
  loan_row public.player_loans%rowtype;
  ownership_row public.property_ownership%rowtype;
  pending_action jsonb;
  pending_reason text;
  pending_amount integer;
  pending_tile_index integer;
  pending_tile_id text;
  pending_label text;
  pending_tax_kind text;
  payee_id uuid;
  starting_cash integer;
  actor_balance integer;
  payee_balance integer;
  updated_balances jsonb;
  updated_income_tax_baseline jsonb;
  remaining_principal integer;
  remaining_principal_after integer;
  turns_remaining_after integer;
  loan_status text;
  next_version integer;
  principal_remaining integer;
begin
  select *
    into state_row
    from public.game_state
    where game_state.game_id = confirm_insolvency_payment.game_id
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

  select *
    into player_row
    from public.players
    where players.id = confirm_insolvency_payment.player_id
      and players.game_id = confirm_insolvency_payment.game_id
    for update;

  if not found then
    raise exception using message = 'PLAYER_NOT_FOUND', errcode = 'P0001';
  end if;

  select coalesce(starting_cash_input, games.starting_cash, 0)
    into starting_cash
    from public.games
    where games.id = confirm_insolvency_payment.game_id;

  pending_reason := pending_action ->> 'reason';
  pending_amount := (pending_action ->> 'amount_due')::integer;
  pending_tile_index := nullif(pending_action ->> 'tile_index', '')::integer;
  pending_tile_id := pending_action ->> 'tile_id';
  pending_label := pending_action ->> 'label';
  pending_tax_kind := pending_action ->> 'tax_kind';
  payee_id := nullif(pending_action ->> 'owed_to_player_id', '')::uuid;

  if pending_reason is null or pending_amount is null or pending_amount < 0 then
    raise exception using message = 'INVALID_PENDING_INSOLVENCY', errcode = 'P0001';
  end if;

  actor_balance := coalesce((state_row.balances ->> player_id::text)::integer, starting_cash, 0);
  if actor_balance < pending_amount then
    raise exception using message = 'INSUFFICIENT_FUNDS', errcode = 'P0001';
  end if;

  updated_balances := jsonb_set(
    coalesce(state_row.balances, '{}'::jsonb),
    array[player_id::text],
    to_jsonb(actor_balance - pending_amount),
    true
  );
  updated_income_tax_baseline := coalesce(state_row.income_tax_baseline_cash_by_player, '{}'::jsonb);

  if pending_reason = 'PAY_RENT' then
    if payee_id is null then
      raise exception using message = 'MISSING_PAYEE', errcode = 'P0001';
    end if;

    payee_balance := coalesce((updated_balances ->> payee_id::text)::integer, starting_cash, 0);
    updated_balances := jsonb_set(
      updated_balances,
      array[payee_id::text],
      to_jsonb(payee_balance + pending_amount),
      true
    );
  elsif pending_reason = 'COLLATERAL_LOAN_PAYMENT' then
    if pending_tile_index is null then
      raise exception using message = 'LOAN_NOT_FOUND', errcode = 'P0001';
    end if;

    select *
      into loan_row
      from public.player_loans
      where player_loans.game_id = confirm_insolvency_payment.game_id
        and player_loans.player_id = confirm_insolvency_payment.player_id
        and player_loans.collateral_tile_index = pending_tile_index
        and player_loans.status = 'active'
      order by player_loans.created_at desc
      limit 1
      for update;

    if not found then
      raise exception using message = 'LOAN_NOT_FOUND', errcode = 'P0001';
    end if;

    remaining_principal := coalesce(loan_row.remaining_principal, loan_row.principal, 0);
    remaining_principal_after := greatest(0, remaining_principal - pending_amount);
    turns_remaining_after := greatest(0, coalesce(loan_row.turns_remaining, 0) - 1);
    loan_status := case
      when turns_remaining_after = 0 or remaining_principal_after = 0 then 'paid'
      else 'active'
    end;

    update public.player_loans
      set remaining_principal = remaining_principal_after,
          turns_remaining = turns_remaining_after,
          status = loan_status,
          updated_at = now()
      where player_loans.id = loan_row.id
      returning * into loan_row;

    if loan_status = 'paid' then
      update public.property_ownership
        set collateral_loan_id = null
        where property_ownership.game_id = confirm_insolvency_payment.game_id
          and property_ownership.tile_index = pending_tile_index
          and property_ownership.owner_player_id = confirm_insolvency_payment.player_id
          and property_ownership.collateral_loan_id = loan_row.id
        returning * into ownership_row;
    end if;
  elsif pending_reason = 'MACRO_INTEREST_SURCHARGE' then
    if pending_tile_index is not null then
      select *
        into loan_row
        from public.player_loans
        where player_loans.game_id = confirm_insolvency_payment.game_id
          and player_loans.player_id = confirm_insolvency_payment.player_id
          and player_loans.collateral_tile_index = pending_tile_index
          and player_loans.status = 'active'
        order by player_loans.created_at desc
        limit 1
        for update;
    end if;
    principal_remaining := case
      when found then coalesce(loan_row.remaining_principal, loan_row.principal, 0)
      else null
    end;
  elsif pending_reason not in ('PAY_TAX', 'JAIL_PAY_FINE', 'CARD_PAY') then
    raise exception using message = 'UNSUPPORTED_REASON', errcode = 'P0001';
  end if;

  if pending_reason = 'PAY_TAX' and pending_tax_kind = 'INCOME_TAX' then
    updated_income_tax_baseline := jsonb_set(
      updated_income_tax_baseline,
      array[player_id::text],
      to_jsonb(actor_balance - pending_amount),
      true
    );
  end if;

  next_version := state_row.version;

  if pending_reason = 'PAY_RENT' then
    next_version := next_version + 1;
    insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
    values (
      confirm_insolvency_payment.game_id,
      next_version,
      'PAY_RENT',
      jsonb_build_object(
        'tile_index', pending_tile_index,
        'tile_id', pending_tile_id,
        'from_player_id', player_id,
        'to_player_id', payee_id,
        'amount', pending_amount
      ),
      now(),
      actor_user_id
    );

    next_version := next_version + 1;
    insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
    values (
      confirm_insolvency_payment.game_id,
      next_version,
      'CASH_DEBIT',
      jsonb_build_object(
        'player_id', player_id,
        'amount', pending_amount,
        'reason', 'PAY_RENT',
        'tile_index', pending_tile_index
      ),
      now(),
      actor_user_id
    );

    next_version := next_version + 1;
    insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
    values (
      confirm_insolvency_payment.game_id,
      next_version,
      'CASH_CREDIT',
      jsonb_build_object(
        'player_id', payee_id,
        'amount', pending_amount,
        'reason', 'PAY_RENT',
        'tile_index', pending_tile_index
      ),
      now(),
      actor_user_id
    );
  elsif pending_reason = 'PAY_TAX' then
    next_version := next_version + 1;
    insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
    values (
      confirm_insolvency_payment.game_id,
      next_version,
      'PAY_TAX',
      jsonb_build_object(
        'tile_index', pending_tile_index,
        'tile_name', pending_label,
        'amount', pending_amount,
        'payer_player_id', player_id,
        'payer_display_name', player_row.display_name
      ),
      now(),
      actor_user_id
    );

    next_version := next_version + 1;
    insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
    values (
      confirm_insolvency_payment.game_id,
      next_version,
      'CASH_DEBIT',
      jsonb_build_object(
        'player_id', player_id,
        'amount', pending_amount,
        'reason', 'PAY_TAX',
        'tile_index', pending_tile_index
      ),
      now(),
      actor_user_id
    );
  elsif pending_reason = 'JAIL_PAY_FINE' then
    next_version := next_version + 1;
    insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
    values (
      confirm_insolvency_payment.game_id,
      next_version,
      'JAIL_PAY_FINE',
      jsonb_build_object(
        'player_id', player_id,
        'player_name', player_row.display_name,
        'amount', pending_amount
      ),
      now(),
      actor_user_id
    );

    next_version := next_version + 1;
    insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
    values (
      confirm_insolvency_payment.game_id,
      next_version,
      'CASH_DEBIT',
      jsonb_build_object(
        'player_id', player_id,
        'amount', pending_amount,
        'reason', 'JAIL_PAY_FINE'
      ),
      now(),
      actor_user_id
    );
  elsif pending_reason = 'CARD_PAY' then
    next_version := next_version + 1;
    insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
    values (
      confirm_insolvency_payment.game_id,
      next_version,
      'CARD_PAY',
      jsonb_build_object(
        'player_id', player_id,
        'player_name', player_row.display_name,
        'card_title', pending_label,
        'card_kind', 'PAY',
        'amount', pending_amount
      ),
      now(),
      actor_user_id
    );

    next_version := next_version + 1;
    insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
    values (
      confirm_insolvency_payment.game_id,
      next_version,
      'CASH_DEBIT',
      jsonb_build_object(
        'player_id', player_id,
        'amount', pending_amount,
        'reason', 'CARD_PAY'
      ),
      now(),
      actor_user_id
    );
  elsif pending_reason = 'COLLATERAL_LOAN_PAYMENT' then
    next_version := next_version + 1;
    insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
    values (
      confirm_insolvency_payment.game_id,
      next_version,
      'COLLATERAL_LOAN_PAYMENT',
      jsonb_build_object(
        'player_id', player_id,
        'tile_index', pending_tile_index,
        'amount', pending_amount,
        'turns_remaining_after', turns_remaining_after
      ),
      now(),
      actor_user_id
    );

    next_version := next_version + 1;
    insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
    values (
      confirm_insolvency_payment.game_id,
      next_version,
      'CASH_DEBIT',
      jsonb_build_object(
        'player_id', player_id,
        'amount', pending_amount,
        'reason', 'COLLATERAL_LOAN_PAYMENT',
        'tile_index', pending_tile_index,
        'loan_id', loan_row.id
      ),
      now(),
      actor_user_id
    );
  elsif pending_reason = 'MACRO_INTEREST_SURCHARGE' then
    next_version := next_version + 1;
    insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
    values (
      confirm_insolvency_payment.game_id,
      next_version,
      'CASH_DEBIT',
      jsonb_build_object(
        'player_id', player_id,
        'amount', pending_amount,
        'reason', 'MACRO_INTEREST_SURCHARGE',
        'loan_id', case when loan_row.id is not null then loan_row.id else null end,
        'tile_index', pending_tile_index,
        'principal_remaining', principal_remaining,
        'macro_interest_delta_per_turn', coalesce(macro_interest_delta_input, 0)
      ),
      now(),
      actor_user_id
    );

    next_version := next_version + 1;
    insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
    values (
      confirm_insolvency_payment.game_id,
      next_version,
      'MACRO_INTEREST_SURCHARGE',
      jsonb_build_object(
        'player_id', player_id,
        'loan_id', case when loan_row.id is not null then loan_row.id else null end,
        'tile_index', pending_tile_index,
        'amount', pending_amount,
        'principal_remaining', principal_remaining,
        'macro_interest_delta_per_turn', coalesce(macro_interest_delta_input, 0)
      ),
      now(),
      actor_user_id
    );
  end if;

  next_version := next_version + 1;
  insert into public.game_events (game_id, version, event_type, payload, created_at, created_by)
  values (
    confirm_insolvency_payment.game_id,
    next_version,
    'INSOLVENCY_RECOVERY_COMPLETED',
    jsonb_build_object(
      'player_id', player_id,
      'amount_due', pending_amount,
      'reason', pending_reason,
      'owed_to_player_id', payee_id,
      'tile_index', pending_tile_index,
      'tile_id', pending_tile_id,
      'label', pending_label
    ),
    now(),
    actor_user_id
  );

  update public.game_state
    set balances = updated_balances,
        income_tax_baseline_cash_by_player = updated_income_tax_baseline,
        pending_action = null,
        version = next_version,
        updated_at = now()
    where game_state.game_id = confirm_insolvency_payment.game_id
    returning * into state_row;

  return query select to_jsonb(state_row);
end;
$$;

grant execute on function public.confirm_insolvency_payment(
  uuid,
  uuid,
  integer,
  uuid,
  integer,
  numeric
) to service_role;
