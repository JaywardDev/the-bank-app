alter table public.trade_proposals
  add column if not exists offer_free_build_tokens integer not null default 0,
  add column if not exists request_free_build_tokens integer not null default 0,
  add column if not exists offer_free_upgrade_tokens integer not null default 0,
  add column if not exists request_free_upgrade_tokens integer not null default 0;
