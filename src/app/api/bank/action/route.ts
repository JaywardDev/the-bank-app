import { NextResponse } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

const supabaseUrl = SUPABASE_URL;
const supabaseAnonKey = SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  action?: "START_GAME" | "ROLL_DICE" | "END_TURN";
  expectedVersion?: number;
};

type SupabaseUser = {
  id: string;
  email: string | null;
};

type GameRow = {
  id: string;
  starting_cash: number | null;
  created_by: string | null;
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
  current_player_user_id: string | null;
  balances: Record<string, number> | null;
  last_roll: number | null;
};

const isConfigured = () =>
  Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey);

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
  if (!body.gameId || !body.action) {
    return NextResponse.json(
      { error: "Missing gameId or action." },
      { status: 400 },
    );
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

  const [game] = await fetchFromSupabase<GameRow[]>(
    `games?select=id,starting_cash,created_by&id=eq.${gameId}&limit=1`,
    { method: "GET" },
  );

  if (!game) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  const players = await fetchFromSupabase<PlayerRow[]>(
    `players?select=id,user_id,display_name,created_at&game_id=eq.${gameId}&order=created_at.asc`,
    { method: "GET" },
  );

  const [gameState] = await fetchFromSupabase<GameStateRow[]>(
    `game_state?select=game_id,version,current_player_user_id,balances,last_roll&game_id=eq.${gameId}&limit=1`,
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

    const startingCash = game.starting_cash ?? 1500;
    const balances = players.reduce<Record<string, number>>((acc, player) => {
      acc[player.id] = startingCash;
      return acc;
    }, {});

    const [updatedState] = await fetchFromSupabaseWithService<GameStateRow[]>(
      "game_state?on_conflict=game_id",
      {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates, return=representation",
        },
        body: JSON.stringify({
          game_id: gameId,
          version: nextVersion,
          current_player_user_id: players[0].user_id,
          balances,
          last_roll: null,
          updated_at: new Date().toISOString(),
        }),
      },
    );

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

  if (!gameState) {
    return NextResponse.json(
      { error: "Game has not started yet." },
      { status: 400 },
    );
  }

  const currentPlayer = players.find(
    (player) => player.user_id === gameState.current_player_user_id,
  );

  if (!currentPlayer) {
    return NextResponse.json(
      { error: "Current player is missing." },
      { status: 400 },
    );
  }

  if (currentPlayer.user_id !== user.id) {
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
      (player) => player.user_id === gameState.current_player_user_id,
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
          current_player_user_id: nextPlayer.user_id,
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
}
