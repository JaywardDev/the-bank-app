alter table public.players
  add column if not exists tax_exemption_pass_count integer not null default 0;
