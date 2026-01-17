-- Enable Row Level Security
alter table public.games enable row level security;
alter table public.players enable row level security;

-- Allow members to read games
drop policy if exists "games_select_all" on public.games;
create policy "games_select_all"
on public.games
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.players
    where players.game_id = games.id
      and players.user_id = auth.uid()
  )
);

-- Allow users to create games as themselves
drop policy if exists "games_insert_all" on public.games;
create policy "games_insert_all"
on public.games
for insert
to anon, authenticated
with check (created_by = auth.uid());

-- Allow members to read players in the same game
drop policy if exists "players_select_all" on public.players;
create policy "players_select_all"
on public.players
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.players as membership
    where membership.game_id = players.game_id
      and membership.user_id = auth.uid()
  )
);

-- Allow users to insert their own player rows
drop policy if exists "players_insert_all" on public.players;
create policy "players_insert_all"
on public.players
for insert
to anon, authenticated
with check (user_id = auth.uid());
