alter table public.property_ownership
  add column if not exists acquired_round integer;

create or replace function public.property_ownership_sync_acquired_round()
returns trigger
language plpgsql
as $$
declare
  state_round integer;
begin
  if new.owner_player_id is null then
    new.acquired_round := null;
    return new;
  end if;

  if tg_op = 'INSERT' or new.owner_player_id is distinct from old.owner_player_id then
    if new.acquired_round is null then
      select rounds_elapsed
        into state_round
        from public.game_state
        where game_state.game_id = new.game_id
        limit 1;

      new.acquired_round := coalesce(state_round, 0);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_property_ownership_sync_acquired_round on public.property_ownership;

create trigger trg_property_ownership_sync_acquired_round
before insert or update of owner_player_id, acquired_round
on public.property_ownership
for each row
execute function public.property_ownership_sync_acquired_round();
