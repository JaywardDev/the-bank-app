alter table public.games
add column if not exists created_by uuid;
