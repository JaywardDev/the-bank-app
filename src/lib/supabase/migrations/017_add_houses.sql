alter table public.property_ownership
  add column if not exists houses integer not null default 0;
