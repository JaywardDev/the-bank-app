alter table public.game_state
add column if not exists betting_market_state jsonb not null default '{}'::jsonb;
