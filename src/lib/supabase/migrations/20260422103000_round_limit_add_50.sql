alter table public.games
drop constraint if exists games_round_limit_check;

alter table public.games
add constraint games_round_limit_check
check (round_limit in (50, 100, 150, 200, 300));
