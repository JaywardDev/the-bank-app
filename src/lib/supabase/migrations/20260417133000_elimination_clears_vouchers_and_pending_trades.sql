create or replace function public.on_player_eliminated_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_eliminated is true and coalesce(old.is_eliminated, false) is false then
    new.free_build_tokens := 0;
    new.free_upgrade_tokens := 0;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_players_elimination_cleanup_before on public.players;
create trigger trg_players_elimination_cleanup_before
before update of is_eliminated on public.players
for each row
execute function public.on_player_eliminated_cleanup();

create or replace function public.on_player_eliminated_cancel_pending_trades()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_eliminated is true and coalesce(old.is_eliminated, false) is false then
    update public.trade_proposals
      set status = 'CANCELLED'
      where game_id = new.game_id
        and status = 'PENDING'
        and (
          proposer_player_id = new.id
          or counterparty_player_id = new.id
        );
  end if;

  return null;
end;
$$;

drop trigger if exists trg_players_elimination_cancel_pending_trades_after on public.players;
create trigger trg_players_elimination_cancel_pending_trades_after
after update of is_eliminated on public.players
for each row
execute function public.on_player_eliminated_cancel_pending_trades();

revoke all on function public.on_player_eliminated_cleanup() from public;
revoke all on function public.on_player_eliminated_cancel_pending_trades() from public;
