alter table public.game_state
  add column if not exists free_parking_pot integer not null default 0,
  add column if not exists rules jsonb not null default '{"freeParkingJackpotEnabled": false}'::jsonb;
