create table if not exists public.player_holdings (
  player_id uuid not null references public.players(id) on delete cascade,
  symbol text not null,
  qty numeric not null default 0,
  avg_cost_local numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (player_id, symbol)
);

alter table public.player_holdings enable row level security;

drop policy if exists "player_holdings_select_authenticated" on public.player_holdings;
create policy "player_holdings_select_authenticated"
on public.player_holdings
for select
to authenticated
using (true);

drop policy if exists "player_holdings_insert_service_role" on public.player_holdings;
create policy "player_holdings_insert_service_role"
on public.player_holdings
for insert
to service_role
with check (true);

drop policy if exists "player_holdings_update_service_role" on public.player_holdings;
create policy "player_holdings_update_service_role"
on public.player_holdings
for update
to service_role
using (true)
with check (true);

create table if not exists public.player_trades (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  symbol text not null,
  side text not null check (side in ('BUY','SELL')),
  qty numeric not null,
  price_local numeric not null,
  fee_local numeric not null,
  realized_gain_local numeric,
  tax_local numeric,
  created_at timestamptz not null default now()
);

alter table public.player_trades enable row level security;

drop policy if exists "player_trades_select_authenticated" on public.player_trades;
create policy "player_trades_select_authenticated"
on public.player_trades
for select
to authenticated
using (true);

drop policy if exists "player_trades_insert_service_role" on public.player_trades;
create policy "player_trades_insert_service_role"
on public.player_trades
for insert
to service_role
with check (true);

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
  symbol text,
  side text,
  qty numeric,
  price numeric,
  fee numeric,
  tax numeric,
  new_cash_balance numeric
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
  cost numeric;
  proceeds numeric;
  cost_basis numeric;
  realized_gain numeric;
  tax_amount numeric;
  fee_amount numeric;
  total_debit numeric;
  total_credit numeric;
  next_holding_qty numeric;
  next_avg_cost numeric;
  normalized_symbol text;
  normalized_side text;
begin
  normalized_symbol := upper(trim(coalesce(p_symbol, '')));
  normalized_side := upper(trim(coalesce(p_side, '')));

  if normalized_symbol not in ('SPY', 'BTC') then
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
    from public.players
    where id = p_player_id
    for update;

  if not found then
    raise exception using message = 'PLAYER_NOT_FOUND', errcode = 'P0001';
  end if;

  select *
    into state_row
    from public.game_state
    where game_id = player_row.game_id
    for update;

  if not found then
    raise exception using message = 'GAME_STATE_NOT_FOUND', errcode = 'P0001';
  end if;

  select games.starting_cash
    into starting_cash
    from public.games
    where id = player_row.game_id;

  current_balance := coalesce((state_row.balances ->> p_player_id::text)::numeric, starting_cash::numeric, 0::numeric);

  select market_prices.price
    into market_price
    from public.market_prices
    where market_prices.symbol = normalized_symbol;

  if market_price is null then
    raise exception using message = 'PRICE_NOT_FOUND', errcode = 'P0001';
  end if;

  select *
    into holding_row
    from public.player_holdings
    where player_holdings.player_id = p_player_id
      and player_holdings.symbol = normalized_symbol
    for update;

  if normalized_side = 'BUY' then
    cost := p_qty * market_price;
    fee_amount := cost * p_trading_fee_rate;
    total_debit := cost + fee_amount;

    if current_balance < total_debit then
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

    current_balance := current_balance - total_debit;
    tax_amount := 0;
    realized_gain := null;
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

    current_balance := current_balance + total_credit;

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
  end if;

  update public.game_state
    set balances = jsonb_set(
      coalesce(state_row.balances, '{}'::jsonb),
      array[p_player_id::text],
      to_jsonb(current_balance),
      true
    ),
    updated_at = now()
    where game_id = player_row.game_id;

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
    fee_amount,
    realized_gain,
    tax_amount
  );

  return query
    select normalized_symbol, normalized_side, p_qty, market_price, fee_amount, tax_amount, current_balance;
end;
$$;
