alter table public.player_loans
  add column if not exists remaining_principal integer;

update public.player_loans
  set remaining_principal = principal
  where remaining_principal is null;

alter table public.player_loans
  alter column remaining_principal set not null;

alter table public.player_loans
  alter column remaining_principal set default 0;

create or replace function public.take_collateral_loan(
  game_id uuid,
  player_id uuid,
  tile_index integer,
  expected_version integer,
  tile_price integer,
  tile_type text,
  tile_id text,
  actor_user_id uuid
)
returns table (
  game_state jsonb,
  property_ownership jsonb,
  player_loan jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  state_row public.game_state%rowtype;
  ownership_row public.property_ownership%rowtype;
  loan_row public.player_loans%rowtype;
  starting_cash integer;
  loan_enabled boolean;
  collateral_ltv numeric;
  rate_per_turn numeric;
  term_turns integer;
  principal integer;
  payment_per_turn integer;
  current_balance integer;
  updated_balance integer;
  new_version integer;
  denomination numeric;
begin
  if tile_index is null then
    raise exception using message = 'INVALID_TILE', errcode = 'P0001';
  end if;

  select *
    into state_row
    from public.game_state
    where game_state.game_id = take_collateral_loan.game_id
    for update;

  if not found then
    raise exception using message = 'GAME_STATE_NOT_FOUND', errcode = 'P0001';
  end if;

  if expected_version is null or state_row.version <> expected_version then
    raise exception using message = 'VERSION_MISMATCH', errcode = 'P0001';
  end if;

  loan_enabled := coalesce((state_row.rules ->> 'loanCollateralEnabled')::boolean, false);
  if loan_enabled is not true then
    raise exception using message = 'COLLATERAL_DISABLED', errcode = 'P0001';
  end if;

  if tile_type is null or tile_type not in ('PROPERTY', 'RAIL', 'UTILITY') then
    raise exception using message = 'TILE_NOT_OWNABLE', errcode = 'P0001';
  end if;

  if tile_price is null or tile_price <= 0 then
    raise exception using message = 'INVALID_PRICE', errcode = 'P0001';
  end if;

  select *
    into ownership_row
    from public.property_ownership
    where property_ownership.game_id = take_collateral_loan.game_id
      and property_ownership.tile_index = take_collateral_loan.tile_index
    for update;

  if not found then
    raise exception using message = 'PROPERTY_NOT_OWNED', errcode = 'P0001';
  end if;

  if ownership_row.owner_player_id <> player_id then
    raise exception using message = 'NOT_OWNER', errcode = 'P0001';
  end if;

  if ownership_row.collateral_loan_id is not null then
    raise exception using message = 'ALREADY_COLLATERALIZED', errcode = 'P0001';
  end if;

  if exists (
    select 1
      from public.player_loans
      where player_loans.game_id = take_collateral_loan.game_id
        and player_loans.collateral_tile_index = take_collateral_loan.tile_index
        and player_loans.status = 'active'
  ) then
    raise exception using message = 'ALREADY_COLLATERALIZED', errcode = 'P0001';
  end if;

  collateral_ltv := coalesce((state_row.rules ->> 'collateralLtv')::numeric, 0.5);
  rate_per_turn := coalesce((state_row.rules ->> 'loanRatePerTurn')::numeric, 0.008);
  term_turns := coalesce((state_row.rules ->> 'loanTermTurns')::integer, 10);

  principal := round(tile_price * collateral_ltv)::integer;
  if principal <= 0 then
    raise exception using message = 'INVALID_PRICE', errcode = 'P0001';
  end if;

  if principal <= 0 or term_turns <= 0 then
    payment_per_turn := 0;
  elsif rate_per_turn <= 0 then
    payment_per_turn := round(principal::numeric / term_turns)::integer;
  else
    denomination := 1 - power(1 + rate_per_turn, -term_turns);
    if denomination <= 0 then
      payment_per_turn := round(principal::numeric / term_turns)::integer;
    else
      payment_per_turn := round((principal * rate_per_turn) / denomination)::integer;
    end if;
  end if;

  insert into public.player_loans (
    game_id,
    player_id,
    collateral_tile_index,
    principal,
    remaining_principal,
    rate_per_turn,
    term_turns,
    turns_remaining,
    payment_per_turn,
    status
  ) values (
    take_collateral_loan.game_id,
    take_collateral_loan.player_id,
    take_collateral_loan.tile_index,
    principal,
    principal,
    rate_per_turn,
    term_turns,
    term_turns,
    payment_per_turn,
    'active'
  )
  returning * into loan_row;

  update public.property_ownership
    set collateral_loan_id = loan_row.id
    where id = ownership_row.id
    returning * into ownership_row;

  select games.starting_cash
    into starting_cash
    from public.games
    where games.id = take_collateral_loan.game_id;

  current_balance := coalesce((state_row.balances ->> player_id::text)::integer, starting_cash, 0);
  updated_balance := current_balance + principal;
  new_version := state_row.version + 1;

  update public.game_state
    set balances = jsonb_set(
          coalesce(state_row.balances, '{}'::jsonb),
          array[player_id::text],
          to_jsonb(updated_balance),
          true
        ),
        version = new_version,
        updated_at = now()
    where game_state.game_id = take_collateral_loan.game_id
    returning * into state_row;

  insert into public.game_events (
    game_id,
    version,
    event_type,
    payload,
    created_at,
    created_by
  ) values (
    take_collateral_loan.game_id,
    new_version,
    'COLLATERAL_LOAN_TAKEN',
    jsonb_build_object(
      'player_id', player_id,
      'tile_index', tile_index,
      'tile_id', tile_id,
      'principal', principal,
      'rate_per_turn', rate_per_turn,
      'term_turns', term_turns,
      'payment_per_turn', payment_per_turn
    ),
    now(),
    actor_user_id
  );

  return query
    select to_jsonb(state_row), to_jsonb(ownership_row), to_jsonb(loan_row);
exception
  when unique_violation then
    raise exception using message = 'ALREADY_COLLATERALIZED', errcode = 'P0001';
end;
$$;

create or replace function public.payoff_collateral_loan(
  game_id uuid,
  player_id uuid,
  loan_id uuid,
  expected_version integer,
  actor_user_id uuid
)
returns table (
  game_state jsonb,
  property_ownership jsonb,
  player_loan jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  state_row public.game_state%rowtype;
  ownership_row public.property_ownership%rowtype;
  loan_row public.player_loans%rowtype;
  starting_cash integer;
  payoff_amount integer;
  current_balance integer;
  updated_balance integer;
  new_version integer;
begin
  if loan_id is null then
    raise exception using message = 'INVALID_LOAN', errcode = 'P0001';
  end if;

  select *
    into state_row
    from public.game_state
    where game_state.game_id = payoff_collateral_loan.game_id
    for update;

  if not found then
    raise exception using message = 'GAME_STATE_NOT_FOUND', errcode = 'P0001';
  end if;

  if expected_version is null or state_row.version <> expected_version then
    raise exception using message = 'VERSION_MISMATCH', errcode = 'P0001';
  end if;

  select *
    into loan_row
    from public.player_loans
    where player_loans.id = payoff_collateral_loan.loan_id
    for update;

  if not found then
    raise exception using message = 'LOAN_NOT_FOUND', errcode = 'P0001';
  end if;

  if loan_row.game_id <> payoff_collateral_loan.game_id
    or loan_row.player_id <> payoff_collateral_loan.player_id then
    raise exception using message = 'LOAN_NOT_FOUND', errcode = 'P0001';
  end if;

  if loan_row.status <> 'active' then
    raise exception using message = 'LOAN_NOT_ACTIVE', errcode = 'P0001';
  end if;

  select *
    into ownership_row
    from public.property_ownership
    where property_ownership.game_id = payoff_collateral_loan.game_id
      and property_ownership.tile_index = loan_row.collateral_tile_index
    for update;

  if not found then
    raise exception using message = 'COLLATERAL_NOT_FOUND', errcode = 'P0001';
  end if;

  if ownership_row.collateral_loan_id <> loan_row.id then
    raise exception using message = 'COLLATERAL_NOT_LINKED', errcode = 'P0001';
  end if;

  payoff_amount := loan_row.remaining_principal;
  if payoff_amount is null then
    payoff_amount := 0;
  end if;

  select games.starting_cash
    into starting_cash
    from public.games
    where games.id = payoff_collateral_loan.game_id;

  current_balance := coalesce((state_row.balances ->> player_id::text)::integer, starting_cash, 0);
  if current_balance < payoff_amount then
    raise exception using message = 'INSUFFICIENT_FUNDS', errcode = 'P0001';
  end if;

  updated_balance := current_balance - payoff_amount;
  new_version := state_row.version + 1;

  update public.player_loans
    set status = 'paid',
        turns_remaining = 0,
        remaining_principal = 0,
        updated_at = now()
    where id = loan_row.id
    returning * into loan_row;

  update public.property_ownership
    set collateral_loan_id = null
    where id = ownership_row.id
    returning * into ownership_row;

  update public.game_state
    set balances = jsonb_set(
          coalesce(state_row.balances, '{}'::jsonb),
          array[player_id::text],
          to_jsonb(updated_balance),
          true
        ),
        version = new_version,
        updated_at = now()
    where game_state.game_id = payoff_collateral_loan.game_id
    returning * into state_row;

  insert into public.game_events (
    game_id,
    version,
    event_type,
    payload,
    created_at,
    created_by
  ) values (
    payoff_collateral_loan.game_id,
    new_version,
    'LOAN_PAID_OFF',
    jsonb_build_object(
      'loan_id', loan_row.id,
      'tile_index', loan_row.collateral_tile_index,
      'amount', payoff_amount
    ),
    now(),
    actor_user_id
  );

  return query
    select to_jsonb(state_row), to_jsonb(ownership_row), to_jsonb(loan_row);
end;
$$;

grant execute on function public.take_collateral_loan(
  uuid,
  uuid,
  integer,
  integer,
  integer,
  text,
  text,
  uuid
) to service_role;

grant execute on function public.payoff_collateral_loan(
  uuid,
  uuid,
  uuid,
  integer,
  uuid
) to service_role;
