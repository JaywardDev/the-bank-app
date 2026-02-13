alter table public.games
add column if not exists base_currency text not null default 'USD';

comment on column public.games.base_currency is 'Base cash currency used in game_state.balances (e.g. USD/PHP/NZD).';

update public.games
set base_currency = case
  when lower(coalesce(board_pack_id, '')) in ('classic-ph', 'philippines-hard') then 'PHP'
  when lower(coalesce(board_pack_id, '')) = 'new-zealand' then 'NZD'
  else 'USD'
end;

create or replace function public.trade_player_asset(
  p_player_id uuid,
  p_symbol text,
  p_side text,
  p_qty numeric,
  p_trading_fee_rate numeric,
  p_capital_gains_tax_rate numeric,
  p_allow_short_selling boolean default false
)
returns table (
  out_symbol text,
  out_side text,
  out_qty numeric,
  out_price numeric,
  out_fee numeric,
  out_tax numeric,
  out_new_cash_balance numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  player_row public.players%rowtype;
  state_row public.game_state%rowtype;
  holding_row public.player_holdings%rowtype;
  market_price numeric;
  current_balance numeric;
  starting_cash integer;
  base_currency text;
  fx_rate numeric;
  usd_to_base_rate numeric;
  cost numeric;
  proceeds numeric;
  cost_basis numeric;
  realized_gain numeric;
  realized_gain_local numeric;
  tax_amount numeric;
  tax_amount_local numeric;
  fee_amount numeric;
  fee_amount_local numeric;
  total_debit numeric;
  total_credit numeric;
  total_debit_base numeric;
  total_credit_base numeric;
  next_holding_qty numeric;
  next_avg_cost numeric;
  normalized_symbol text;
  normalized_side text;
begin
  normalized_symbol := upper(trim(coalesce(p_symbol, '')));
  normalized_side := upper(trim(coalesce(p_side, '')));

  if normalized_symbol not in ('SPY', 'BTC', 'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'TSLA') then
    raise exception using message = 'INVALID_SYMBOL', errcode = 'P0001';
  end if;

  if normalized_side not in ('BUY', 'SELL') then
    raise exception using message = 'INVALID_SIDE', errcode = 'P0001';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception using message = 'INVALID_QTY', errcode = 'P0001';
  end if;

  select *
    into player_row
    from public.players as p
    where p.id = p_player_id
    for update;

  if not found then
    raise exception using message = 'PLAYER_NOT_FOUND', errcode = 'P0001';
  end if;

  select *
    into state_row
    from public.game_state as gs
    where gs.game_id = player_row.game_id
    for update;

  if not found then
    raise exception using message = 'GAME_STATE_NOT_FOUND', errcode = 'P0001';
  end if;

  select g.starting_cash, upper(coalesce(g.base_currency, 'USD'))
    into starting_cash, base_currency
    from public.games as g
    where g.id = player_row.game_id;

  if base_currency = 'USD' then
    usd_to_base_rate := 1;
  elsif base_currency = 'PHP' then
    select fr.rate
      into fx_rate
      from public.fx_rates as fr
      where fr.pair = 'USDPHP'
      order by fr.as_of_date desc nulls last, fr.updated_at desc
      limit 1;

    if fx_rate is null or fx_rate <= 0 then
      raise exception using message = 'FX_NOT_FOUND', errcode = 'P0001';
    end if;

    usd_to_base_rate := fx_rate;
  elsif base_currency = 'NZD' then
    select fr.rate
      into fx_rate
      from public.fx_rates as fr
      where fr.pair = 'NZDUSD'
      order by fr.as_of_date desc nulls last, fr.updated_at desc
      limit 1;

    if fx_rate is null or fx_rate <= 0 then
      raise exception using message = 'FX_NOT_FOUND', errcode = 'P0001';
    end if;

    usd_to_base_rate := 1 / fx_rate;
  else
    usd_to_base_rate := 1;
  end if;

  current_balance := coalesce((state_row.balances ->> p_player_id::text)::numeric, starting_cash::numeric, 0::numeric);

  select mp.price
    into market_price
    from public.market_prices as mp
    where mp.symbol = normalized_symbol;

  if market_price is null then
    raise exception using message = 'PRICE_NOT_FOUND', errcode = 'P0001';
  end if;

  select *
    into holding_row
    from public.player_holdings as ph
    where ph.player_id = p_player_id
      and ph.symbol = normalized_symbol
    for update;

  if normalized_side = 'BUY' then
    cost := p_qty * market_price;
    fee_amount := cost * p_trading_fee_rate;
    total_debit := cost + fee_amount;
    total_debit_base := total_debit * usd_to_base_rate;

    if current_balance < total_debit_base then
      raise exception using message = 'INSUFFICIENT_CASH', errcode = 'P0001';
    end if;

    next_holding_qty := coalesce(holding_row.qty, 0) + p_qty;
    if next_holding_qty <= 0 then
      raise exception using message = 'INVALID_HOLDINGS_QTY', errcode = 'P0001';
    end if;

    next_avg_cost := (
      (coalesce(holding_row.qty, 0) * coalesce(holding_row.avg_cost_local, 0)) +
      (p_qty * market_price)
    ) / next_holding_qty;

    insert into public.player_holdings (player_id, symbol, qty, avg_cost_local, updated_at)
    values (p_player_id, normalized_symbol, next_holding_qty, next_avg_cost, now())
    on conflict (player_id, symbol)
    do update
      set qty = excluded.qty,
          avg_cost_local = excluded.avg_cost_local,
          updated_at = now();

    current_balance := current_balance - total_debit_base;
    tax_amount := 0;
    tax_amount_local := 0;
    realized_gain := null;
    realized_gain_local := null;
    fee_amount_local := fee_amount * usd_to_base_rate;
  else
    if not found then
      holding_row.qty := 0;
      holding_row.avg_cost_local := 0;
    end if;

    if (not p_allow_short_selling) and p_qty > coalesce(holding_row.qty, 0) then
      raise exception using message = 'INSUFFICIENT_HOLDINGS', errcode = 'P0001';
    end if;

    proceeds := p_qty * market_price;
    fee_amount := proceeds * p_trading_fee_rate;
    cost_basis := p_qty * coalesce(holding_row.avg_cost_local, 0);
    realized_gain := proceeds - fee_amount - cost_basis;
    tax_amount := greatest(realized_gain, 0) * p_capital_gains_tax_rate;
    total_credit := proceeds - fee_amount - tax_amount;
    total_credit_base := total_credit * usd_to_base_rate;

    current_balance := current_balance + total_credit_base;

    next_holding_qty := coalesce(holding_row.qty, 0) - p_qty;
    if next_holding_qty = 0 then
      next_avg_cost := 0;
    else
      next_avg_cost := coalesce(holding_row.avg_cost_local, 0);
    end if;

    if next_holding_qty < 0 and not p_allow_short_selling then
      raise exception using message = 'INSUFFICIENT_HOLDINGS', errcode = 'P0001';
    end if;

    insert into public.player_holdings (player_id, symbol, qty, avg_cost_local, updated_at)
    values (p_player_id, normalized_symbol, next_holding_qty, next_avg_cost, now())
    on conflict (player_id, symbol)
    do update
      set qty = excluded.qty,
          avg_cost_local = excluded.avg_cost_local,
          updated_at = now();

    fee_amount_local := fee_amount * usd_to_base_rate;
    realized_gain_local := realized_gain * usd_to_base_rate;
    tax_amount_local := tax_amount * usd_to_base_rate;
  end if;

  update public.game_state as gs
    set balances = jsonb_set(
      coalesce(state_row.balances, '{}'::jsonb),
      array[p_player_id::text],
      to_jsonb(current_balance),
      true
    ),
    updated_at = now()
    where gs.game_id = player_row.game_id;

  insert into public.player_trades (
    player_id,
    symbol,
    side,
    qty,
    price_local,
    fee_local,
    realized_gain_local,
    tax_local
  ) values (
    p_player_id,
    normalized_symbol,
    normalized_side,
    p_qty,
    market_price,
    fee_amount_local,
    realized_gain_local,
    tax_amount_local
  );

  return query
    select
      normalized_symbol as out_symbol,
      normalized_side as out_side,
      p_qty as out_qty,
      market_price as out_price,
      fee_amount as out_fee,
      tax_amount as out_tax,
      current_balance as out_new_cash_balance;
end;
$$;
