alter table public.games
add column if not exists game_mode text not null default 'classic'
  check (game_mode in ('classic', 'round_mode'));

alter table public.games
add column if not exists round_limit integer
  check (round_limit in (100, 150, 200, 300));

alter table public.games
drop constraint if exists games_round_mode_config_check;

alter table public.games
add constraint games_round_mode_config_check
check (
  (game_mode = 'classic' and round_limit is null)
  or (game_mode = 'round_mode' and round_limit is not null)
);
