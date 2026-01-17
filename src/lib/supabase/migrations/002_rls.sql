-- Enable Row Level Security
alter table public.games enable row level security;
alter table public.players enable row level security;

-- Allow anyone (anon + authenticated) to read games
drop policy if exists "games_select_all" on public.games;
create policy "games_select_all"
on public.games
for select
to anon, authenticated
using (true);

-- Allow anyone (anon + authenticated) to create games
drop policy if exists "games_insert_all" on public.games;
create policy "games_insert_all"
on public.games
for insert
to anon, authenticated
with check (true);

-- Allow anyone to read players (for lobby display)
drop policy if exists "players_select_all" on public.players;
create policy "players_select_all"
on public.players
for select
to anon, authenticated
using (true);

-- Allow anyone to join a game
drop policy if exists "players_insert_all" on public.players;
create policy "players_insert_all"
on public.players
for insert
to anon, authenticated
with check (true);
