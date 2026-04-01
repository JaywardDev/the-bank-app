alter table public.game_state
  add column if not exists inland_explored_cells jsonb not null default '[]'::jsonb;
