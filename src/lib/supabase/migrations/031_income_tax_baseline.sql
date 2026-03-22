alter table public.game_state
  add column if not exists income_tax_baseline_cash_by_player jsonb not null default '{}'::jsonb;
