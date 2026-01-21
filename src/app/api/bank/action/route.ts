import { NextResponse } from "next/server";
import { defaultBoardPackId, getBoardPackById } from "@/lib/boardPacks";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

const supabaseUrl = (process.env.SUPABASE_URL ?? SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (
  process.env.SUPABASE_ANON_KEY ?? SUPABASE_ANON_KEY ?? ""
).trim();
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

const playerHeaders = {
  apikey: supabaseAnonKey,
  "Content-Type": "application/json",
};

const bankHeaders = {
  apikey: supabaseServiceRoleKey,
  Authorization: `Bearer ${supabaseServiceRoleKey}`,
  "Content-Type": "application/json",
};

type ActionRequest = {
  gameId?: string;
  playerName?: string;
  joinCode?: string;
  displayName?: string;
  boardPackId?: string;
  action?:
    | "CREATE_GAME"
    | "JOIN_GAME"
    | "START_GAME"
    | "END_GAME"
    | "ROLL_DICE"
    | "END_TURN";
  expectedVersion?: number;
};

type SupabaseUser = {
  id: string;
  email: string | null;
};

type GameRow = {
  id: string;
  join_code: string | null;
  status: string | null;
  starting_cash: number | null;
  created_at: string | null;
  created_by: string | null;
  board_pack_id: string | null;
};

type PlayerRow = {
  id: string;
  user_id: string;
  display_name: string | null;
  created_at: string | null;
};

type GameStateRow = {
  game_id: string;
  version: number;
  // References players.id (not auth user_id).
  current_player_id: string | null;
  balances: Record<string, number> | null;
  last_roll: number | null;
};

const isConfigured = () =>
  Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey);

const createJoinCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const segments = Array.from({ length: 6 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)],
  );
  return segments.join("");
};

const fetchUser = async (accessToken: string) => {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      ...playerHeaders,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as SupabaseUser;
};

const fetchFromSupabase = async <T>(
  path: string,
  options: RequestInit,
): Promise<T> => {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...playerHeaders,
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Supabase request failed.");
  }

  return (await response.json()) as T;
};

const fetchFromSupabaseWithService = async <T>(
  path: string,
  options: RequestInit,
): Promise<T> => {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...bankHeaders,
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Supabase request failed.");
  }

  return (await response.json()) as T;
};
const parseBearerToken = (authorization: string | null) => {
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
};

export async function POST(request: Request) {
  try {
    if (!isConfigured()) {
      return NextResponse.json(
        { error: "Supabase is not configured." },
        { status: 500 },
      );
    }

    const token = parseBearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json({ error: "Missing session." }, { status: 401 });
    }

    const user = await fetchUser(token);
    if (!user) {
      return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }

    const body = (await request.json()) as ActionRequest;
    if (!body.action) {
      return NextResponse.json({ error: "Missing action." }, { status: 400 });
    }

    if (body.action === "CREATE_GAME") {
      if (!body.playerName?.trim()) {
        return NextResponse.json(
          { error: "Missing playerName." },
          { status: 400 },
        );
      }

      const boardPack = getBoardPackById(body.boardPackId);

      const [game] = await fetchFromSupabaseWithService<GameRow[]>(
        "games?select=id,join_code,created_by",
        {
          method: "POST",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            join_code: createJoinCode(),
            created_by: user.id,
            board_pack_id: boardPack?.id ?? defaultBoardPackId,
          }),
        },
      );

      if (!game) {
        return NextResponse.json(
          { error: "Unable to create the game." },
          { status: 500 },
        );
      }

      const [hostPlayer] = await fetchFromSupabaseWithService<PlayerRow[]>(
        "players?select=id,user_id,display_name,created_at",
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
      );

      if (!hostPlayer) {
        return NextResponse.json(
          { error: "Unable to create the host player." },
          { status: 500 },
        );
      }

      await fetchFromSupabaseWithService<GameStateRow[]>(
        "game_state?select=game_id,version,current_player_id,balances,last_roll",
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

      const [game] = await fetchFromSupabaseWithService<GameRow[]>(
        `games?select=id,join_code,status,created_at,board_pack_id,created_by&join_code=eq.${joinCode}&limit=1`,
        { method: "GET" },
      );

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

      const [player] = await fetchFromSupabaseWithService<PlayerRow[]>(
        "players?select=id,user_id,display_name,created_at&on_conflict=game_id,user_id",
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
      );

      if (!player) {
        return NextResponse.json(
          { error: "Unable to join the game." },
          { status: 500 },
        );
      }

      const players = await fetchFromSupabaseWithService<PlayerRow[]>(
        `players?select=id,user_id,display_name,created_at&game_id=eq.${game.id}&order=created_at.asc`,
        { method: "GET" },
      );

      return NextResponse.json({
        gameId: game.id,
        join_code: game.join_code,
        created_at: game.created_at,
        board_pack_id: game.board_pack_id,
        status: game.status,
        created_by: game.created_by,
        player,
        players,
      });
    }

    if (!body.gameId) {
      return NextResponse.json({ error: "Missing gameId." }, { status: 400 });
    }

    if (typeof body.expectedVersion !== "number") {
      return NextResponse.json(
        { error: "Missing expectedVersion." },
        { status: 400 },
      );
    }

    if (!Number.isInteger(body.expectedVersion) || body.expectedVersion < 0) {
      return NextResponse.json(
        { error: "Invalid expectedVersion." },
        { status: 400 },
      );
    }

    const gameId = body.gameId;

    const [game] = await fetchFromSupabaseWithService<GameRow[]>(
      `games?select=id,join_code,starting_cash,created_by,status&id=eq.${gameId}&limit=1`,
      { method: "GET" },
    );

    if (!game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    const players = await fetchFromSupabaseWithService<PlayerRow[]>(
      `players?select=id,user_id,display_name,created_at&game_id=eq.${gameId}&order=created_at.asc`,
      { method: "GET" },
    );

    const [gameState] = await fetchFromSupabaseWithService<GameStateRow[]>(
      `game_state?select=game_id,version,current_player_id,balances,last_roll&game_id=eq.${gameId}&limit=1`,
      { method: "GET" },
    );

    if (!players.some((player) => player.user_id === user.id)) {
      return NextResponse.json(
        { error: "You are not a member of this game." },
        { status: 403 },
      );
    }

    const currentVersion = gameState?.version ?? 0;

    if (body.expectedVersion !== currentVersion) {
      return NextResponse.json(
        { error: "Version mismatch." },
        { status: 409 },
      );
    }

    const nextVersion = currentVersion + 1;

    if (body.action === "START_GAME") {
      if (game.created_by && game.created_by !== user.id) {
        return NextResponse.json(
          { error: "Only the host can start the game." },
          { status: 403 },
        );
      }

      if (players.length === 0) {
        return NextResponse.json(
          { error: "Add at least one player before starting." },
          { status: 400 },
        );
      }

      const startingPlayerRowId = players[0]?.id;
      if (!startingPlayerRowId) {
        return NextResponse.json(
          { error: "Unable to determine the starting player." },
          { status: 500 },
        );
      }

      const [startedGame] = await fetchFromSupabaseWithService<GameRow[]>(
        `games?select=id,status&id=eq.${gameId}&status=eq.lobby`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            status: "in_progress",
          }),
        },
      );

      if (!startedGame) {
        const [latestGame] = await fetchFromSupabaseWithService<GameRow[]>(
          `games?select=id,status&id=eq.${gameId}&limit=1`,
          { method: "GET" },
        );

        if (latestGame?.status === "in_progress") {
          return NextResponse.json(
            { error: "Game already started." },
            { status: 409 },
          );
        }

        return NextResponse.json(
          { error: "Game is not in the lobby." },
          { status: 409 },
        );
      }

      const startingCash = game.starting_cash ?? 1500;
      const balances = players.reduce<Record<string, number>>((acc, player) => {
        acc[player.id] = startingCash;
        return acc;
      }, {});

      const upsertResponse = await fetch(
        `${supabaseUrl}/rest/v1/game_state?on_conflict=game_id&select=game_id,version,current_player_id,balances,last_roll`,
        {
          method: "POST",
          headers: {
            ...bankHeaders,
            Prefer: "resolution=merge-duplicates, return=representation",
          },
          body: JSON.stringify({
            game_id: gameId,
            version: nextVersion,
            current_player_id: startingPlayerRowId,
            balances,
            last_roll: null,
            updated_at: new Date().toISOString(),
          }),
        },
      );

      if (!upsertResponse.ok) {
        const errorText = await upsertResponse.text();
        return NextResponse.json(
          { error: errorText || "Unable to update game state." },
          { status: 500 },
        );
      }

      const [updatedState] =
        (await upsertResponse.json()) as GameStateRow[];

      if (!updatedState?.current_player_id) {
        return NextResponse.json(
          { error: "Unable to persist the starting player." },
          { status: 500 },
        );
      }

      await fetchFromSupabaseWithService(
        "game_events",
        {
          method: "POST",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            game_id: gameId,
            version: nextVersion,
            event_type: "START_GAME",
            payload: {
              starting_cash: startingCash,
              player_order: players.map((player) => ({
                id: player.id,
                name: player.display_name,
              })),
            },
            created_by: user.id,
          }),
        },
      );

      return NextResponse.json({ gameState: updatedState });
    }

    if (body.action === "END_GAME") {
      if (game.created_by && game.created_by !== user.id) {
        return NextResponse.json(
          { error: "Only the host can end the session." },
          { status: 403 },
        );
      }

      if (game.status === "ended") {
        return NextResponse.json(
          { error: "Game already ended." },
          { status: 409 },
        );
      }

      const [endedGame] = await fetchFromSupabaseWithService<GameRow[]>(
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
      );

      if (!endedGame) {
        const [latestGame] = await fetchFromSupabaseWithService<GameRow[]>(
          `games?select=id,status&id=eq.${gameId}&limit=1`,
          { method: "GET" },
        );

        if (latestGame?.status === "ended") {
          return NextResponse.json(
            { error: "Game already ended." },
            { status: 409 },
          );
        }

        return NextResponse.json(
          { error: "Game is not active." },
          { status: 409 },
        );
      }

      await fetchFromSupabaseWithService(
        "game_events",
        {
          method: "POST",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            game_id: gameId,
            version: nextVersion,
            event_type: "END_GAME",
            payload: {
              previous_status: game.status,
            },
            created_by: user.id,
          }),
        },
      );

      return NextResponse.json({ status: "ended" });
    }

    if (!gameState) {
      return NextResponse.json(
        { error: "Game has not started yet." },
        { status: 400 },
      );
    }

    if (game.status !== "in_progress") {
      return NextResponse.json(
        { error: "Game is not in progress." },
        { status: 409 },
      );
    }

    const currentPlayer = players.find(
      (player) => player.id === gameState.current_player_id,
    );
    const currentUserPlayer = players.find((player) => player.user_id === user.id);

    if (!currentPlayer) {
      return NextResponse.json(
        { error: "Current player is missing." },
        { status: 400 },
      );
    }

    if (!currentUserPlayer || currentUserPlayer.id !== gameState.current_player_id) {
      return NextResponse.json(
        { error: "It is not your turn." },
        { status: 403 },
      );
    }

    if (body.action === "ROLL_DICE") {
      const dieOne = Math.floor(Math.random() * 6) + 1;
      const dieTwo = Math.floor(Math.random() * 6) + 1;
      const rollTotal = dieOne + dieTwo;

      const [updatedState] = await fetchFromSupabaseWithService<GameStateRow[]>(
        `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            version: nextVersion,
            last_roll: rollTotal,
            updated_at: new Date().toISOString(),
          }),
        },
      );

      if (!updatedState) {
        return NextResponse.json(
          { error: "Version mismatch." },
          { status: 409 },
        );
      }

      await fetchFromSupabaseWithService(
        "game_events",
        {
          method: "POST",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            game_id: gameId,
            version: nextVersion,
            event_type: "ROLL_DICE",
            payload: {
              player_id: currentPlayer.id,
              player_name: currentPlayer.display_name,
              roll: rollTotal,
              dice: [dieOne, dieTwo],
            },
            created_by: user.id,
          }),
        },
      );

      return NextResponse.json({ gameState: updatedState });
    }

    if (body.action === "END_TURN") {
      const currentIndex = players.findIndex(
        (player) => player.id === gameState.current_player_id,
      );
      const nextIndex =
        currentIndex === -1 ? 0 : (currentIndex + 1) % players.length;
      const nextPlayer = players[nextIndex];

      const [updatedState] = await fetchFromSupabaseWithService<GameStateRow[]>(
        `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            version: nextVersion,
            current_player_id: nextPlayer.id,
            last_roll: null,
            updated_at: new Date().toISOString(),
          }),
        },
      );

      if (!updatedState) {
        return NextResponse.json(
          { error: "Version mismatch." },
          { status: 409 },
        );
      }

      await fetchFromSupabaseWithService(
        "game_events",
        {
          method: "POST",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            game_id: gameId,
            version: nextVersion,
            event_type: "END_TURN",
            payload: {
              from_player_id: currentPlayer.id,
              from_player_name: currentPlayer.display_name,
              to_player_id: nextPlayer.id,
              to_player_name: nextPlayer.display_name,
            },
            created_by: user.id,
          }),
        },
      );

      return NextResponse.json({ gameState: updatedState });
    }

    return NextResponse.json(
      { error: "Unsupported action." },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
