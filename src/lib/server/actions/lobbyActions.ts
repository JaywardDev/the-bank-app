import { NextResponse } from "next/server";
import {
  DEFAULT_BOARD_PACK_ECONOMY,
  defaultBoardPackId,
  getBoardPackById,
} from "@/lib/boardPacks";
import { getRules } from "@/lib/rules";

type GameModeConfig = "classic" | "round_mode";

type LobbyActionRequest = {
  action?: string;
  gameId?: string;
  playerName?: string;
  joinCode?: string;
  displayName?: string;
  boardPackId?: string;
  gameMode?: GameModeConfig;
  roundLimit?: number;
};

type SupabaseUser = {
  id: string;
};

type GameRow = {
  id: string;
  join_code: string | null;
  status: string | null;
  created_at: string | null;
  created_by: string | null;
  board_pack_id: string | null;
  game_mode: GameModeConfig | null;
  round_limit: number | null;
};

type PlayerRow = {
  id: string;
  user_id: string;
  display_name: string | null;
  created_at: string | null;
  position: number;
  is_in_jail: boolean;
  jail_turns_remaining: number;
  get_out_of_jail_free_count: number;
  tax_exemption_pass_count: number;
  free_build_tokens: number;
  free_upgrade_tokens: number;
  is_eliminated: boolean;
  eliminated_at: string | null;
};

type HandleLobbyActionParams = {
  body: LobbyActionRequest;
  user: SupabaseUser;
  fetchFromSupabaseWithService: <T>(path: string, options: RequestInit) => Promise<T | null>;
  loadOwnershipByTile: (gameId: string) => Promise<Record<number, unknown>>;
  createJoinCode: () => string;
  isRoundLimitOption: (value: unknown) => boolean;
};

export const handleLobbyAction = async ({
  body,
  user,
  fetchFromSupabaseWithService,
  loadOwnershipByTile,
  createJoinCode,
  isRoundLimitOption,
}: HandleLobbyActionParams): Promise<NextResponse | null> => {
  if (body.action === "CREATE_GAME") {
    if (!body.playerName?.trim()) {
      return NextResponse.json(
        { error: "Missing playerName." },
        { status: 400 },
      );
    }

    const boardPack = getBoardPackById(body.boardPackId);

    const resolvedBoardPackId = boardPack?.id ?? defaultBoardPackId;
    const resolvedBoardPack = getBoardPackById(resolvedBoardPackId);
    const resolvedEconomy =
      resolvedBoardPack?.economy ?? DEFAULT_BOARD_PACK_ECONOMY;

    const [game] = (await fetchFromSupabaseWithService<GameRow[]>(
      "games?select=id,join_code,created_by,game_mode,round_limit",
      {
        method: "POST",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          join_code: createJoinCode(),
          created_by: user.id,
          board_pack_id: resolvedBoardPackId,
          starting_cash: resolvedEconomy.startingBalance,
          base_currency: resolvedEconomy.currency.code,
          game_mode:
            body.gameMode === "round_mode" ? "round_mode" : "classic",
          round_limit:
            body.gameMode === "round_mode" && isRoundLimitOption(body.roundLimit)
              ? body.roundLimit
              : null,
        }),
      },
    )) ?? [];

    if (!game) {
      return NextResponse.json(
        { error: "Unable to create the game." },
        { status: 500 },
      );
    }

    const [hostPlayer] = (await fetchFromSupabaseWithService<PlayerRow[]>(
      "players?select=id,user_id,display_name,created_at,position,is_in_jail,jail_turns_remaining,get_out_of_jail_free_count,tax_exemption_pass_count,free_build_tokens,free_upgrade_tokens,is_eliminated,eliminated_at",
      {
        method: "POST",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          game_id: game.id,
          user_id: user.id,
          display_name: body.playerName.trim(),
        }),
      },
    )) ?? [];

    if (!hostPlayer) {
      return NextResponse.json(
        { error: "Unable to create the host player." },
        { status: 500 },
      );
    }

    await fetchFromSupabaseWithService(
      "game_state?select=game_id,version,current_player_id,balances,last_roll,doubles_count,rounds_elapsed,last_macro_event_id,active_macro_effects,active_macro_effects_v1,turn_phase,pending_action,pending_card_active,pending_card_deck,pending_card_id,pending_card_title,pending_card_kind,pending_card_payload,pending_card_drawn_by_player_id,pending_card_drawn_at,pending_card_source_tile_index,skip_next_roll_by_player,income_tax_baseline_cash_by_player,betting_market_state,inland_explored_cells,chance_index,community_index,chance_order,community_order,chance_draw_ptr,community_draw_ptr,chance_seed,community_seed,chance_reshuffle_count,community_reshuffle_count,free_parking_pot,rules,auction_active,auction_tile_index,auction_initiator_player_id,auction_current_bid,auction_current_winner_player_id,auction_turn_player_id,auction_turn_ends_at,auction_eligible_player_ids,auction_passed_player_ids,auction_min_increment",
      {
        method: "POST",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          game_id: game.id,
          version: 0,
          current_player_id: null,
          balances: {},
          last_roll: null,
          doubles_count: 0,
          active_macro_effects: [],
          active_macro_effects_v1: [],
          turn_phase: "AWAITING_ROLL",
          pending_action: null,
          free_parking_pot: 0,
          rules: getRules(resolvedBoardPack?.rules),
          income_tax_baseline_cash_by_player: {},
          updated_at: new Date().toISOString(),
        }),
      },
    );

    return NextResponse.json({ gameId: game.id });
  }

  if (body.action === "JOIN_GAME") {
    if (!body.displayName?.trim()) {
      return NextResponse.json(
        { error: "Missing displayName." },
        { status: 400 },
      );
    }

    if (!body.joinCode?.trim()) {
      return NextResponse.json(
        { error: "Missing joinCode." },
        { status: 400 },
      );
    }

    const joinCode = body.joinCode.trim().toUpperCase();

    const [game] = (await fetchFromSupabaseWithService<GameRow[]>(
      `games?select=id,join_code,status,created_at,board_pack_id,created_by,game_mode,round_limit&join_code=eq.${joinCode}&limit=1`,
      { method: "GET" },
    )) ?? [];

    if (!game) {
      return NextResponse.json(
        { error: "No game found for that code." },
        { status: 404 },
      );
    }

    if (game.status !== "lobby") {
      return NextResponse.json(
        { error: "That game is already in progress." },
        { status: 409 },
      );
    }

    const [player] = (await fetchFromSupabaseWithService<PlayerRow[]>(
      "players?select=id,user_id,display_name,created_at,position,is_in_jail,jail_turns_remaining,get_out_of_jail_free_count,tax_exemption_pass_count,free_build_tokens,free_upgrade_tokens,is_eliminated,eliminated_at&on_conflict=game_id,user_id",
      {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates, return=representation",
        },
        body: JSON.stringify({
          game_id: game.id,
          user_id: user.id,
          display_name: body.displayName.trim(),
        }),
      },
    )) ?? [];

    if (!player) {
      return NextResponse.json(
        { error: "Unable to join the game." },
        { status: 500 },
      );
    }

    const players = (await fetchFromSupabaseWithService<PlayerRow[]>(
      `players?select=id,user_id,display_name,created_at,position,is_in_jail,jail_turns_remaining,get_out_of_jail_free_count,tax_exemption_pass_count,free_build_tokens,free_upgrade_tokens,is_eliminated,eliminated_at&game_id=eq.${game.id}&order=created_at.asc`,
      { method: "GET" },
    )) ?? [];
    const ownershipByTile = await loadOwnershipByTile(game.id);

    return NextResponse.json({
      gameId: game.id,
      join_code: game.join_code,
      created_at: game.created_at,
      board_pack_id: game.board_pack_id,
      status: game.status,
      created_by: game.created_by,
      player,
      players,
      ownership: ownershipByTile,
    });
  }

  if (!body.gameId) {
    return null;
  }

  const gameId = body.gameId;

  if (body.action === "LEAVE_GAME") {
    const [game] = (await fetchFromSupabaseWithService<GameRow[]>(
      `games?select=id,status,created_by&id=eq.${gameId}&limit=1`,
      { method: "GET" },
    )) ?? [];

    if (!game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    const [leavingPlayer] = (await fetchFromSupabaseWithService<PlayerRow[]>(
      `players?select=id,user_id,display_name,created_at,position,is_in_jail,jail_turns_remaining,get_out_of_jail_free_count,tax_exemption_pass_count,free_build_tokens,free_upgrade_tokens,is_eliminated,eliminated_at&game_id=eq.${gameId}&user_id=eq.${user.id}&limit=1`,
      { method: "GET" },
    )) ?? [];

    const [gameState] = (await fetchFromSupabaseWithService<Array<{ version: number }>>(
      `game_state?select=version&game_id=eq.${gameId}&limit=1`,
      { method: "GET" },
    )) ?? [];

    const [latestEvent] = (await fetchFromSupabaseWithService<Array<{ version: number }>>(
      `game_events?select=version&game_id=eq.${gameId}&order=version.desc&limit=1`,
      { method: "GET" },
    )) ?? [];

    let eventVersionCursor =
      Math.max(gameState?.version ?? 0, latestEvent?.version ?? 0) + 1;
    const activeGameStatus = (game.status ?? "").toLowerCase();

    const logEventSafely = async (
      eventType: string,
      payload: Record<string, unknown>,
    ) => {
      try {
        await fetchFromSupabaseWithService(
          "game_events",
          {
            method: "POST",
            headers: {
              Prefer: "return=representation",
            },
            body: JSON.stringify({
              game_id: gameId,
              version: eventVersionCursor,
              event_type: eventType,
              payload,
              created_by: user.id,
            }),
          },
        );
        eventVersionCursor += 1;
      } catch {
        // best-effort audit logging only
      }
    };

    if (game.created_by && game.created_by === user.id) {
      const [endedGame] = (await fetchFromSupabaseWithService<GameRow[]>(
        `games?select=id,status&id=eq.${gameId}&status=in.(lobby,in_progress)`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            status: "ended",
          }),
        },
      )) ?? [];

      if (leavingPlayer) {
        await fetchFromSupabaseWithService(
          `players?game_id=eq.${gameId}&user_id=eq.${user.id}`,
          { method: "DELETE" },
        );
      }

      if (leavingPlayer) {
        await logEventSafely("PLAYER_LEFT", {
          user_id: user.id,
          player_id: leavingPlayer.id,
          reason: "host_leave",
        });
      }

      if (endedGame) {
        await logEventSafely("END_GAME", {
          previous_status: game.status,
          reason: "host_leave",
        });
      }

      return NextResponse.json({ ok: true, status: "ended", endedBy: "host_leave" });
    }

    const playersBeforeDelete = (await fetchFromSupabaseWithService<Array<{ id: string }>>(
      `players?select=id&game_id=eq.${gameId}`,
      { method: "GET" },
    )) ?? [];

    if (leavingPlayer) {
      await fetchFromSupabaseWithService(
        `players?game_id=eq.${gameId}&user_id=eq.${user.id}`,
        { method: "DELETE" },
      );
    }

    if (leavingPlayer) {
      await logEventSafely("PLAYER_LEFT", {
        user_id: user.id,
        player_id: leavingPlayer.id,
        player_count_before_leave: playersBeforeDelete.length,
      });
    }

    const remainingPlayers = (await fetchFromSupabaseWithService<Array<{ id: string }>>(
      `players?select=id&game_id=eq.${gameId}`,
      { method: "GET" },
    )) ?? [];

    if (remainingPlayers.length === 0 && ["lobby", "in_progress"].includes(activeGameStatus)) {
      const [endedGame] = (await fetchFromSupabaseWithService<GameRow[]>(
        `games?select=id,status&id=eq.${gameId}&status=in.(lobby,in_progress)`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            status: "ended",
          }),
        },
      )) ?? [];

      if (endedGame) {
        await logEventSafely("AUTO_END_EMPTY", {
          previous_status: game.status,
          reason: "empty_table",
        });
        return NextResponse.json({ ok: true, status: "ended", endedBy: "empty_table" });
      }
    }

    return NextResponse.json({ ok: true });
  }

  if (body.action === "UPDATE_GAME_SETTINGS") {
    const [settingsGame] = (await fetchFromSupabaseWithService<GameRow[]>(
      `games?select=id,status,created_by,game_mode,round_limit&id=eq.${gameId}&limit=1`,
      { method: "GET" },
    )) ?? [];

    if (!settingsGame) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    if (settingsGame.created_by && settingsGame.created_by !== user.id) {
      return NextResponse.json(
        { error: "Only the host can update game settings." },
        { status: 403 },
      );
    }

    if (settingsGame.status !== "lobby") {
      return NextResponse.json(
        { error: "Settings can only be changed in the lobby." },
        { status: 409 },
      );
    }

    const gameMode: GameModeConfig =
      body.gameMode === "round_mode" ? "round_mode" : "classic";
    const roundLimit = gameMode === "round_mode"
      ? (isRoundLimitOption(body.roundLimit) ? body.roundLimit : null)
      : null;

    if (gameMode === "round_mode" && roundLimit === null) {
      return NextResponse.json(
        { error: "Round mode requires a valid round limit." },
        { status: 400 },
      );
    }

    const [updatedGame] = (await fetchFromSupabaseWithService<GameRow[]>(
      `games?select=id,game_mode,round_limit&id=eq.${gameId}&status=eq.lobby`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          game_mode: gameMode,
          round_limit: roundLimit,
        }),
      },
    )) ?? [];

    if (!updatedGame) {
      return NextResponse.json({ error: "Unable to update settings." }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      gameMode: updatedGame.game_mode,
      roundLimit: updatedGame.round_limit,
    });
  }

  return null;
};
