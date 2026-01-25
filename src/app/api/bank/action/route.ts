import { NextResponse } from "next/server";
import {
  chanceCards,
  communityCards,
  defaultBoardPackId,
  getBoardPackById,
} from "@/lib/boardPacks";
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

type BaseActionRequest = {
  gameId?: string;
  playerName?: string;
  joinCode?: string;
  displayName?: string;
  boardPackId?: string;
  expectedVersion?: number;
};

type BankActionRequest =
  | (BaseActionRequest & {
      action?: Exclude<
        | "CREATE_GAME"
        | "JOIN_GAME"
        | "START_GAME"
        | "END_GAME"
        | "ROLL_DICE"
        | "END_TURN"
        | "DECLINE_PROPERTY"
        | "BUY_PROPERTY"
        | "JAIL_PAY_FINE"
        | "JAIL_ROLL_FOR_DOUBLES",
        "DECLINE_PROPERTY" | "BUY_PROPERTY"
      >;
      tileIndex?: number;
    })
  | (BaseActionRequest & {
      action: "DECLINE_PROPERTY" | "BUY_PROPERTY";
      tileIndex: number;
    });

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
  position: number;
  is_in_jail: boolean;
  jail_turns_remaining: number;
};

type GameStateRow = {
  game_id: string;
  version: number;
  // References players.id (not auth user_id).
  current_player_id: string | null;
  balances: Record<string, number> | null;
  last_roll: number | null;
  doubles_count: number | null;
  turn_phase: string | null;
  pending_action: Record<string, unknown> | null;
  chance_index: number | null;
  community_index: number | null;
  free_parking_pot: number | null;
  rules: { freeParkingJackpotEnabled?: boolean } | null;
};

type OwnershipRow = {
  tile_index: number;
  owner_player_id: string;
};

type OwnershipByTile = Record<number, { owner_player_id: string }>;

type TileInfo = {
  tile_id: string;
  type: string;
  index: number;
  name: string;
  price?: number;
  baseRent?: number;
  taxAmount?: number;
};

type DiceEventPayload = {
  player_id: string;
  player_name: string | null;
  roll: number;
  dice: number[];
  doubles_count?: number;
  rolls_this_turn?: number;
};

const PASS_START_SALARY = 200;
const JAIL_FINE_AMOUNT = 50;
const OWNABLE_TILE_TYPES = new Set(["PROPERTY", "RAIL", "UTILITY"]);
const DEFAULT_RULES = { freeParkingJackpotEnabled: false };
const RAIL_RENT_BY_COUNT = [0, 25, 50, 100, 200];

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

const loadOwnershipByTile = async (
  gameId: string,
): Promise<OwnershipByTile> => {
  const ownershipRows = await fetchFromSupabaseWithService<OwnershipRow[]>(
    `property_ownership?select=tile_index,owner_player_id&game_id=eq.${gameId}`,
    { method: "GET" },
  );

  return ownershipRows.reduce<OwnershipByTile>((acc, row) => {
    acc[row.tile_index] = { owner_player_id: row.owner_player_id };
    return acc;
  }, {});
};

const emitGameEvent = async (
  gameId: string,
  version: number,
  eventType: string,
  payload: Record<string, unknown>,
  userId: string,
) => {
  await fetchFromSupabaseWithService(
    "game_events",
    {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        game_id: gameId,
        version,
        event_type: eventType,
        payload,
        created_by: userId,
      }),
    },
  );
};

const emitGameEvents = async (
  gameId: string,
  startVersion: number,
  events: Array<{ event_type: string; payload: Record<string, unknown> }>,
  userId: string,
) => {
  let version = startVersion;
  for (const event of events) {
    await emitGameEvent(gameId, version, event.event_type, event.payload, userId);
    version += 1;
  }
};

const resolveTile = (tile: TileInfo, player: PlayerRow) => {
  const basePayload = {
    player_id: player.id,
    tile_id: tile.tile_id,
    tile_type: tile.type,
    tile_index: tile.index,
  };

  switch (tile.type) {
    case "PROPERTY":
    case "RAIL":
    case "UTILITY":
      return { event_type: "LAND_PROPERTY", payload: basePayload };
    case "TAX":
      return { event_type: "LAND_TAX", payload: basePayload };
    case "EVENT":
      return { event_type: "LAND_EVENT", payload: basePayload };
    case "JAIL":
      return { event_type: "LAND_JAIL", payload: basePayload };
    case "GO_TO_JAIL":
      return { event_type: "LAND_GO_TO_JAIL", payload: basePayload };
    case "START":
      return { event_type: "LAND_START", payload: basePayload };
    case "FREE_PARKING":
      return { event_type: "LAND_FREE_PARKING", payload: basePayload };
    default:
      console.info("[Bank] Unhandled tile type", tile);
      return null;
  }
};

const getEventDeckForTile = (tile: TileInfo) => {
  const tileId = tile.tile_id.toLowerCase();
  const tileName = tile.name.toLowerCase();
  if (tileId.includes("chance") || tileName.includes("chance")) {
    return {
      deck: "CHANCE",
      cards: chanceCards,
      indexKey: "chance_index" as const,
    };
  }
  if (tileId.includes("community") || tileName.includes("community")) {
    return {
      deck: "COMMUNITY",
      cards: communityCards,
      indexKey: "community_index" as const,
    };
  }
  return null;
};

const getNumberPayload = (
  payload: Record<string, unknown>,
  key: string,
): number | null => {
  const value = payload[key];
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const getRules = (rules: GameStateRow["rules"]) => ({
  ...DEFAULT_RULES,
  ...(rules ?? {}),
});

const countOwnedTilesByType = (
  boardTiles: TileInfo[],
  ownershipByTile: OwnershipByTile,
  ownerId: string,
  tileType: string,
) =>
  boardTiles.filter(
    (tile) =>
      tile.type === tileType &&
      ownershipByTile[tile.index]?.owner_player_id === ownerId,
  ).length;

const calculateRent = ({
  tile,
  ownerId,
  currentPlayerId,
  boardTiles,
  ownershipByTile,
  diceTotal,
}: {
  tile: TileInfo;
  ownerId: string | null;
  currentPlayerId: string;
  boardTiles: TileInfo[];
  ownershipByTile: OwnershipByTile;
  diceTotal?: number | null;
}) => {
  if (!ownerId || ownerId === currentPlayerId) {
    return { amount: 0, meta: null };
  }

  if (tile.type === "RAIL") {
    const railCount = countOwnedTilesByType(
      boardTiles,
      ownershipByTile,
      ownerId,
      "RAIL",
    );
    const amount = RAIL_RENT_BY_COUNT[railCount] ?? 0;
    return {
      amount,
      meta: {
        rent_type: "RAIL",
        railroads_owned: railCount,
      },
    };
  }

  if (tile.type === "UTILITY") {
    const utilityCount = countOwnedTilesByType(
      boardTiles,
      ownershipByTile,
      ownerId,
      "UTILITY",
    );
    const multiplier = utilityCount >= 2 ? 10 : 4;
    const total = diceTotal ?? 0;
    return {
      amount: multiplier * total,
      meta: {
        rent_type: "UTILITY",
        utilities_owned: utilityCount,
        dice_total: total,
        multiplier,
      },
    };
  }

  return {
    amount: tile.baseRent ?? 0,
    meta: {
      rent_type: "PROPERTY",
    },
  };
};

const applyGoSalary = ({
  player,
  balances,
  startingCash,
  events,
  alreadyCollected,
  reason,
}: {
  player: PlayerRow;
  balances: Record<string, number>;
  startingCash: number;
  events: Array<{ event_type: string; payload: Record<string, unknown> }>;
  alreadyCollected: boolean;
  reason: "PASS_START" | "LAND_GO";
}) => {
  if (alreadyCollected) {
    return { balances, balancesChanged: false, alreadyCollected };
  }
  const currentBalance = balances[player.id] ?? startingCash;
  const updatedBalances = {
    ...balances,
    [player.id]: currentBalance + PASS_START_SALARY,
  };
  events.push({
    event_type: "COLLECT_GO",
    payload: {
      player_id: player.id,
      player_name: player.display_name,
      amount: PASS_START_SALARY,
      reason,
    },
  });
  return { balances: updatedBalances, balancesChanged: true, alreadyCollected: true };
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

    const body = (await request.json()) as BankActionRequest;
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
        "players?select=id,user_id,display_name,created_at,position,is_in_jail,jail_turns_remaining",
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
        "game_state?select=game_id,version,current_player_id,balances,last_roll,doubles_count,turn_phase,pending_action,chance_index,community_index,free_parking_pot,rules",
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
            turn_phase: "AWAITING_ROLL",
            pending_action: null,
            free_parking_pot: 0,
            rules: DEFAULT_RULES,
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
        "players?select=id,user_id,display_name,created_at,position,is_in_jail,jail_turns_remaining&on_conflict=game_id,user_id",
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
        `players?select=id,user_id,display_name,created_at,position,is_in_jail,jail_turns_remaining&game_id=eq.${game.id}&order=created_at.asc`,
        { method: "GET" },
      );
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
      `games?select=id,join_code,starting_cash,created_by,status,board_pack_id&id=eq.${gameId}&limit=1`,
      { method: "GET" },
    );

    if (!game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    const players = await fetchFromSupabaseWithService<PlayerRow[]>(
      `players?select=id,user_id,display_name,created_at,position,is_in_jail,jail_turns_remaining&game_id=eq.${gameId}&order=created_at.asc`,
      { method: "GET" },
    );

    const [gameState] = await fetchFromSupabaseWithService<GameStateRow[]>(
      `game_state?select=game_id,version,current_player_id,balances,last_roll,doubles_count,turn_phase,pending_action,chance_index,community_index,free_parking_pot,rules&game_id=eq.${gameId}&limit=1`,
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
    const rules = getRules(gameState?.rules);

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
        `${supabaseUrl}/rest/v1/game_state?on_conflict=game_id&select=game_id,version,current_player_id,balances,last_roll,doubles_count,turn_phase,pending_action,chance_index,community_index`,
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
            doubles_count: 0,
            turn_phase: "AWAITING_ROLL",
            pending_action: null,
            chance_index: 0,
            community_index: 0,
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
      if (gameState.pending_action) {
        return NextResponse.json(
          { error: "Pending decision must be resolved." },
          { status: 409 },
        );
      }

      if (gameState.turn_phase === "AWAITING_JAIL_DECISION") {
        return NextResponse.json(
          { error: "Resolve jail before rolling." },
          { status: 409 },
        );
      }

      const doublesCount = gameState?.doubles_count ?? 0;

      if (gameState.last_roll != null && doublesCount === 0) {
        return NextResponse.json(
          { error: "You have already rolled this turn." },
          { status: 409 },
        );
      }

      const dieOne = Math.floor(Math.random() * 6) + 1;
      const dieTwo = Math.floor(Math.random() * 6) + 1;
      const rollTotal = dieOne + dieTwo;
      const isDouble = dieOne === dieTwo;
      const nextDoublesCount = isDouble ? doublesCount + 1 : 0;
      const boardPack = getBoardPackById(game.board_pack_id);
      const boardTiles = boardPack?.tiles ?? [];
      const boardSize = boardTiles.length > 0 ? boardTiles.length : 40;
      const currentPosition = Number.isFinite(currentPlayer.position)
        ? currentPlayer.position
        : 0;
      const newPosition = (currentPosition + rollTotal) % boardSize;
      const passedStart = currentPosition + rollTotal >= boardSize;
      const landingTile = boardTiles[newPosition] ?? {
        index: newPosition,
        tile_id: `tile-${newPosition}`,
        type: "PROPERTY",
        name: `Tile ${newPosition}`,
      };
      const ownershipByTile = await loadOwnershipByTile(gameId);
      let jailTile =
        landingTile.type === "GO_TO_JAIL"
          ? boardTiles.find((tile) => tile.type === "JAIL") ?? {
              index: 10,
              tile_id: "jail",
              type: "JAIL",
              name: "Jail",
            }
          : null;
      const resolvedTile = jailTile ?? landingTile;
      let finalPosition = resolvedTile.index;
      let shouldSendToJail = landingTile.type === "GO_TO_JAIL" && Boolean(jailTile);
      let activeLandingTile = landingTile;
      let activeResolvedTile = resolvedTile;
      const balances = gameState?.balances ?? {};
      let updatedBalances = balances;
      let balancesChanged = false;
      let goSalaryAwarded = false;
      let nextChanceIndex = gameState?.chance_index ?? 0;
      let nextCommunityIndex = gameState?.community_index ?? 0;

      if (isDouble && nextDoublesCount >= 3) {
        const jailTile =
          boardTiles.find((tile) => tile.type === "JAIL") ?? {
            index: 10,
            tile_id: "jail",
            type: "JAIL",
            name: "Jail",
          };
        const currentIndex = players.findIndex(
          (player) => player.id === gameState.current_player_id,
        );
        const nextIndex =
          currentIndex === -1 ? 0 : (currentIndex + 1) % players.length;
        const nextPlayer = players[nextIndex];
        const events: Array<{
          event_type: string;
          payload: Record<string, unknown>;
        }> = [
          {
            event_type: "ROLL_DICE",
            payload: {
              player_id: currentPlayer.id,
              player_name: currentPlayer.display_name,
              roll: rollTotal,
              dice: [dieOne, dieTwo],
            } satisfies DiceEventPayload,
          },
          {
            event_type: "ROLLED_DOUBLE",
            payload: {
              player_id: currentPlayer.id,
              player_name: currentPlayer.display_name,
              roll: rollTotal,
              dice: [dieOne, dieTwo],
              doubles_count: nextDoublesCount,
            } satisfies DiceEventPayload,
          },
          {
            event_type: "GO_TO_JAIL",
            payload: {
              player_id: currentPlayer.id,
              player_name: currentPlayer.display_name,
              tile_id: jailTile.tile_id,
              tile_name: jailTile.name,
              tile_index: jailTile.index,
            },
          },
          {
            event_type: "END_TURN",
            payload: {
              from_player_id: currentPlayer.id,
              from_player_name: currentPlayer.display_name,
              to_player_id: nextPlayer.id,
              to_player_name: nextPlayer.display_name,
            },
          },
        ];
        const finalVersion = currentVersion + events.length;

        const [updatedState] = await fetchFromSupabaseWithService<GameStateRow[]>(
          `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
          {
            method: "PATCH",
            headers: {
              Prefer: "return=representation",
            },
            body: JSON.stringify({
              version: finalVersion,
              current_player_id: nextPlayer.id,
              last_roll: null,
              doubles_count: 0,
              turn_phase: nextPlayer.is_in_jail
                ? "AWAITING_JAIL_DECISION"
                : "AWAITING_ROLL",
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

        const [updatedPlayer] = await fetchFromSupabaseWithService<PlayerRow[]>(
          `players?id=eq.${currentPlayer.id}`,
          {
            method: "PATCH",
            headers: {
              Prefer: "return=representation",
            },
            body: JSON.stringify({
              position: jailTile.index,
              is_in_jail: true,
              jail_turns_remaining: 3,
            }),
          },
        );

        if (!updatedPlayer) {
          return NextResponse.json(
            { error: "Unable to move player to jail." },
            { status: 500 },
          );
        }

        await emitGameEvents(gameId, currentVersion + 1, events, user.id);

        return NextResponse.json({ gameState: updatedState });
      }

      const events: Array<{
        event_type: string;
        payload: Record<string, unknown>;
      }> = [
        {
          event_type: "ROLL_DICE",
          payload: {
            player_id: currentPlayer.id,
            player_name: currentPlayer.display_name,
            roll: rollTotal,
            dice: [dieOne, dieTwo],
          } satisfies DiceEventPayload,
        },
      ];

      if (isDouble) {
        events.push({
          event_type: "ROLLED_DOUBLE",
          payload: {
            player_id: currentPlayer.id,
            player_name: currentPlayer.display_name,
            roll: rollTotal,
            dice: [dieOne, dieTwo],
            doubles_count: nextDoublesCount,
          } satisfies DiceEventPayload,
        });
      }

      events.push({
        event_type: "MOVE_PLAYER",
        payload: {
          player_id: currentPlayer.id,
          from: currentPosition,
          to: newPosition,
          roll_total: rollTotal,
          dice: [dieOne, dieTwo],
          passedStart,
          tile_id: landingTile.tile_id,
          tile_name: landingTile.name,
        },
      });

      if (passedStart || landingTile.type === "START") {
        const reason = passedStart ? "PASS_START" : "LAND_GO";
        const goResult = applyGoSalary({
          player: currentPlayer,
          balances: updatedBalances,
          startingCash: game.starting_cash ?? 0,
          events,
          alreadyCollected: goSalaryAwarded,
          reason,
        });
        updatedBalances = goResult.balances;
        balancesChanged = balancesChanged || goResult.balancesChanged;
        goSalaryAwarded = goResult.alreadyCollected;
      }

      events.push({
        event_type: "LAND_ON_TILE",
        payload: {
          player_id: currentPlayer.id,
          tile_id: landingTile.tile_id,
          tile_type: landingTile.type,
          tile_index: landingTile.index,
        },
      });

      const resolutionEvent = resolveTile(landingTile, currentPlayer);
      if (resolutionEvent) {
        events.push({
          event_type: resolutionEvent.event_type,
          payload: resolutionEvent.payload,
        });
      }
      let cardTriggeredGoToJail = false;
      const eventDeck =
        landingTile.type === "EVENT" ? getEventDeckForTile(landingTile) : null;
      if (eventDeck && eventDeck.cards.length > 0) {
        const currentIndex =
          eventDeck.indexKey === "chance_index"
            ? nextChanceIndex
            : nextCommunityIndex;
        const card = eventDeck.cards[currentIndex % eventDeck.cards.length];
        if (eventDeck.indexKey === "chance_index") {
          nextChanceIndex = currentIndex + 1;
        } else {
          nextCommunityIndex = currentIndex + 1;
        }

        events.push({
          event_type: "DRAW_CARD",
          payload: {
            player_id: currentPlayer.id,
            player_name: currentPlayer.display_name,
            deck: eventDeck.deck,
            card_id: card.id,
            card_title: card.title,
            card_kind: card.kind,
            draw_index: currentIndex,
          },
        });

        if (card.kind === "PAY" || card.kind === "RECEIVE") {
          const amount =
            getNumberPayload(card.payload as Record<string, unknown>, "amount") ?? 0;
          const currentBalance =
            updatedBalances[currentPlayer.id] ?? game.starting_cash ?? 0;
          updatedBalances = {
            ...updatedBalances,
            [currentPlayer.id]:
              card.kind === "PAY"
                ? currentBalance - amount
                : currentBalance + amount,
          };
          if (amount !== 0) {
            balancesChanged = true;
          }
          events.push({
            event_type: card.kind === "PAY" ? "CARD_PAY" : "CARD_RECEIVE",
            payload: {
              player_id: currentPlayer.id,
              player_name: currentPlayer.display_name,
              card_id: card.id,
              card_title: card.title,
              card_kind: card.kind,
              amount,
            },
          });
        }

        if (card.kind === "MOVE_TO" || card.kind === "MOVE_REL") {
          const payload = card.payload as Record<string, unknown>;
          const targetIndex =
            card.kind === "MOVE_TO"
              ? getNumberPayload(payload, "tile_index")
              : null;
          const spaces =
            card.kind === "MOVE_REL" ? getNumberPayload(payload, "spaces") : null;
          const cardFromIndex = activeResolvedTile.index;
          const rawIndex =
            card.kind === "MOVE_TO" && targetIndex !== null
              ? targetIndex
              : card.kind === "MOVE_REL" && spaces !== null
                ? cardFromIndex + spaces
                : null;
          if (rawIndex !== null) {
            const normalizedIndex =
              ((rawIndex % boardSize) + boardSize) % boardSize;
            const cardLandingTile = boardTiles[normalizedIndex] ?? {
              index: normalizedIndex,
              tile_id: `tile-${normalizedIndex}`,
              type: "PROPERTY",
              name: `Tile ${normalizedIndex}`,
            };
            const cardPassedStart =
              card.kind === "MOVE_TO"
                ? normalizedIndex < cardFromIndex
                : spaces !== null
                  ? spaces > 0 && cardFromIndex + spaces >= boardSize
                  : false;
            const cardJailTile =
              cardLandingTile.type === "GO_TO_JAIL"
                ? boardTiles.find((tile) => tile.type === "JAIL") ?? {
                    index: 10,
                    tile_id: "jail",
                    type: "JAIL",
                    name: "Jail",
                  }
                : null;
            const cardResolvedTile = cardJailTile ?? cardLandingTile;
            jailTile = cardJailTile ?? jailTile;
            shouldSendToJail =
              cardLandingTile.type === "GO_TO_JAIL" && Boolean(cardJailTile);
            activeLandingTile = cardLandingTile;
            activeResolvedTile = cardResolvedTile;
            finalPosition = cardResolvedTile.index;
            events.push({
              event_type: card.kind === "MOVE_TO" ? "CARD_MOVE_TO" : "CARD_MOVE_REL",
              payload: {
                player_id: currentPlayer.id,
                player_name: currentPlayer.display_name,
                card_id: card.id,
                card_title: card.title,
                card_kind: card.kind,
                from_tile_index: cardFromIndex,
                to_tile_index: cardLandingTile.index,
                passed_start: cardPassedStart,
              },
            });

            events.push({
              event_type: "MOVE_PLAYER",
              payload: {
                player_id: currentPlayer.id,
                from: cardFromIndex,
                to: cardLandingTile.index,
                passedStart: cardPassedStart,
                tile_id: cardLandingTile.tile_id,
                tile_name: cardLandingTile.name,
                reason: "CARD",
                card_id: card.id,
              },
            });

            if (cardPassedStart || cardLandingTile.type === "START") {
              const reason = cardPassedStart ? "PASS_START" : "LAND_GO";
              const goResult = applyGoSalary({
                player: currentPlayer,
                balances: updatedBalances,
                startingCash: game.starting_cash ?? 0,
                events,
                alreadyCollected: goSalaryAwarded,
                reason,
              });
              updatedBalances = goResult.balances;
              balancesChanged = balancesChanged || goResult.balancesChanged;
              goSalaryAwarded = goResult.alreadyCollected;
            }

            events.push({
              event_type: "LAND_ON_TILE",
              payload: {
                player_id: currentPlayer.id,
                tile_id: cardLandingTile.tile_id,
                tile_type: cardLandingTile.type,
                tile_index: cardLandingTile.index,
              },
            });

            const cardResolutionEvent = resolveTile(
              cardLandingTile,
              currentPlayer,
            );
            if (cardResolutionEvent) {
              events.push({
                event_type: cardResolutionEvent.event_type,
                payload: cardResolutionEvent.payload,
              });
            }

            if (cardLandingTile.type === "GO_TO_JAIL" && cardJailTile) {
              cardTriggeredGoToJail = true;
              events.push({
                event_type: "GO_TO_JAIL",
                payload: {
                  from_tile_index: cardLandingTile.index,
                  to_jail_tile_index: cardJailTile.index,
                  player_id: currentPlayer.id,
                  display_name: currentPlayer.display_name,
                },
              });
            }
          }
        }

        if (card.kind === "GO_TO_JAIL") {
          const cardFromIndex = activeResolvedTile.index;
          const cardJailTile =
            boardTiles.find((tile) => tile.type === "JAIL") ?? {
              index: 10,
              tile_id: "jail",
              type: "JAIL",
              name: "Jail",
            };
          activeLandingTile = cardJailTile;
          activeResolvedTile = cardJailTile;
          finalPosition = cardJailTile.index;
          shouldSendToJail = true;
          jailTile = cardJailTile;
          cardTriggeredGoToJail = true;

          events.push({
            event_type: "CARD_GO_TO_JAIL",
            payload: {
              player_id: currentPlayer.id,
              player_name: currentPlayer.display_name,
              card_id: card.id,
              card_title: card.title,
              card_kind: card.kind,
              from_tile_index: cardFromIndex,
              to_jail_tile_index: cardJailTile.index,
            },
          });

          events.push(
            {
              event_type: "MOVE_PLAYER",
              payload: {
                player_id: currentPlayer.id,
                from: cardFromIndex,
                to: cardJailTile.index,
                tile_id: cardJailTile.tile_id,
                tile_name: cardJailTile.name,
                reason: "CARD",
                card_id: card.id,
              },
            },
            {
              event_type: "LAND_ON_TILE",
              payload: {
                player_id: currentPlayer.id,
                tile_id: cardJailTile.tile_id,
                tile_type: cardJailTile.type,
                tile_index: cardJailTile.index,
              },
            },
          );

          const cardResolutionEvent = resolveTile(cardJailTile, currentPlayer);
          if (cardResolutionEvent) {
            events.push({
              event_type: cardResolutionEvent.event_type,
              payload: cardResolutionEvent.payload,
            });
          }

          events.push({
            event_type: "GO_TO_JAIL",
            payload: {
              from_tile_index: cardFromIndex,
              to_jail_tile_index: cardJailTile.index,
              player_id: currentPlayer.id,
              display_name: currentPlayer.display_name,
            },
          });
        }
      }

      const ownership = ownershipByTile[activeLandingTile.index];
      const isOwnableTile = OWNABLE_TILE_TYPES.has(activeLandingTile.type);
      const rentOwnerId =
        isOwnableTile && ownership ? ownership.owner_player_id : null;
      const rentCalculation = calculateRent({
        tile: activeLandingTile,
        ownerId: rentOwnerId,
        currentPlayerId: currentPlayer.id,
        boardTiles,
        ownershipByTile,
        // TODO: allow card-triggered utility rolls to override this dice total.
        diceTotal: rollTotal,
      });
      const rentAmount = rentCalculation.amount;
      const shouldPayRent = rentAmount > 0 && Boolean(rentOwnerId);
      const isUnownedOwnableTile = isOwnableTile && !ownership;
      const isTaxTile = activeLandingTile.type === "TAX";
      const taxAmount = isTaxTile ? activeLandingTile.taxAmount ?? 0 : 0;
      const shouldPayTax = isTaxTile && taxAmount > 0;
      const isFreeParking = activeLandingTile.type === "FREE_PARKING";

      if (activeLandingTile.type === "GO_TO_JAIL" && jailTile && !cardTriggeredGoToJail) {
        events.push({
          event_type: "GO_TO_JAIL",
          payload: {
            from_tile_index: activeLandingTile.index,
            to_jail_tile_index: jailTile.index,
            player_id: currentPlayer.id,
            display_name: currentPlayer.display_name,
          },
        });
      }

      if (shouldPayRent && rentOwnerId && rentOwnerId !== currentPlayer.id) {
        const payerBalance =
          updatedBalances[currentPlayer.id] ?? game.starting_cash ?? 0;
        const ownerBalance =
          updatedBalances[rentOwnerId] ?? game.starting_cash ?? 0;
        updatedBalances = {
          ...updatedBalances,
          [currentPlayer.id]: payerBalance - rentAmount,
          [rentOwnerId]: ownerBalance + rentAmount,
        };
        balancesChanged = true;
        const rentPayload: Record<string, unknown> = {
          tile_index: activeLandingTile.index,
          tile_id: activeLandingTile.tile_id,
          tile_type: activeLandingTile.type,
          from_player_id: currentPlayer.id,
          to_player_id: rentOwnerId,
          amount: rentAmount,
        };
        if (rentCalculation.meta) {
          Object.assign(rentPayload, rentCalculation.meta);
        }
        events.push({
          event_type: "PAY_RENT",
          payload: rentPayload,
        });
      }

      if (shouldPayTax) {
        const payerBalance =
          updatedBalances[currentPlayer.id] ?? game.starting_cash ?? 0;
        updatedBalances = {
          ...updatedBalances,
          [currentPlayer.id]: payerBalance - taxAmount,
        };
        balancesChanged = true;
        events.push(
          {
            event_type: "PAY_TAX",
            payload: {
              tile_index: activeLandingTile.index,
              tile_name: activeLandingTile.name,
              amount: taxAmount,
              payer_player_id: currentPlayer.id,
              payer_display_name: currentPlayer.display_name,
            },
          },
          {
            event_type: "CASH_DEBIT",
            payload: {
              player_id: currentPlayer.id,
              amount: taxAmount,
              reason: "PAY_TAX",
              tile_index: activeLandingTile.index,
            },
          },
        );
        // TODO: If rules.freeParkingJackpotEnabled, route taxAmount into free_parking_pot.
      }

      if (isFreeParking && rules.freeParkingJackpotEnabled) {
        // TODO: Pay out free_parking_pot and reset to 0 when jackpot is enabled.
      }

      const pendingPurchaseAction =
        isUnownedOwnableTile && !(shouldSendToJail && jailTile)
        ? {
            type: "BUY_PROPERTY",
            tile_index: activeLandingTile.index,
            price: activeLandingTile.price ?? 0,
          }
        : null;

      if (pendingPurchaseAction) {
        events.push({
          event_type: "OFFER_PURCHASE",
          payload: {
            player_id: currentPlayer.id,
            tile_id: activeLandingTile.tile_id,
            tile_name: activeLandingTile.name,
            tile_index: activeLandingTile.index,
            price: pendingPurchaseAction.price,
          },
        });
      }

      events.push({
        event_type: "MOVE_RESOLVED",
        payload: {
          player_id: currentPlayer.id,
          tile_id: activeResolvedTile.tile_id,
          tile_type: activeResolvedTile.type,
          tile_index: activeResolvedTile.index,
        },
      });

      if (isDouble && !pendingPurchaseAction && !(shouldSendToJail && jailTile)) {
        events.push({
          event_type: "ALLOW_EXTRA_ROLL",
          payload: {
            player_id: currentPlayer.id,
            player_name: currentPlayer.display_name,
            doubles_count: nextDoublesCount,
          },
        });
      }

      const finalVersion = currentVersion + events.length;
      const [updatedState] = await fetchFromSupabaseWithService<GameStateRow[]>(
        `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            version: finalVersion,
            last_roll: rollTotal,
            doubles_count: nextDoublesCount,
            ...(balancesChanged ? { balances: updatedBalances } : {}),
            ...(nextChanceIndex !== (gameState?.chance_index ?? 0)
              ? { chance_index: nextChanceIndex }
              : {}),
            ...(nextCommunityIndex !== (gameState?.community_index ?? 0)
              ? { community_index: nextCommunityIndex }
              : {}),
            ...(pendingPurchaseAction
              ? {
                  turn_phase: "AWAITING_DECISION",
                  pending_action: pendingPurchaseAction,
                }
              : {}),
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

      const [updatedPlayer] = await fetchFromSupabaseWithService<PlayerRow[]>(
        `players?id=eq.${currentPlayer.id}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            position: finalPosition,
            is_in_jail: Boolean(shouldSendToJail && jailTile),
            jail_turns_remaining: shouldSendToJail && jailTile ? 3 : 0,
          }),
        },
      );

      if (!updatedPlayer) {
        return NextResponse.json(
          { error: "Unable to update player position." },
          { status: 500 },
        );
      }

      await emitGameEvents(gameId, currentVersion + 1, events, user.id);

      return NextResponse.json({ gameState: updatedState });
    }

    if (body.action === "DECLINE_PROPERTY") {
      const pendingAction = gameState.pending_action as
        | {
            type?: unknown;
            tile_index?: unknown;
          }
        | null;

      if (!pendingAction || pendingAction.type !== "BUY_PROPERTY") {
        return NextResponse.json(
          { error: "No pending property decision." },
          { status: 409 },
        );
      }

      if (!Number.isInteger(body.tileIndex)) {
        return NextResponse.json(
          { error: "Invalid tileIndex." },
          { status: 400 },
        );
      }

      if (pendingAction.tile_index !== body.tileIndex) {
        return NextResponse.json(
          { error: "Pending decision does not match that tile." },
          { status: 409 },
        );
      }

      const currentIndex = players.findIndex(
        (player) => player.id === gameState.current_player_id,
      );
      const nextIndex =
        currentIndex === -1 ? 0 : (currentIndex + 1) % players.length;
      const nextPlayer = players[nextIndex];
      const events: Array<{
        event_type: string;
        payload: Record<string, unknown>;
      }> = [
        {
          event_type: "DECLINE_PROPERTY",
          payload: {
            player_id: currentPlayer.id,
            player_name: currentPlayer.display_name,
            tile_index: body.tileIndex,
          },
        },
        {
          event_type: "END_TURN",
          payload: {
            from_player_id: currentPlayer.id,
            from_player_name: currentPlayer.display_name,
            to_player_id: nextPlayer.id,
            to_player_name: nextPlayer.display_name,
          },
        },
      ];
      const finalVersion = currentVersion + events.length;

      const [updatedState] = await fetchFromSupabaseWithService<GameStateRow[]>(
        `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            version: finalVersion,
            current_player_id: nextPlayer.id,
            last_roll: null,
            doubles_count: 0,
            turn_phase: nextPlayer.is_in_jail
              ? "AWAITING_JAIL_DECISION"
              : "AWAITING_ROLL",
            pending_action: null,
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

      await emitGameEvents(gameId, currentVersion + 1, events, user.id);

      return NextResponse.json({ gameState: updatedState });
    }

    if (body.action === "BUY_PROPERTY") {
      const pendingAction = gameState.pending_action as
        | {
            type?: unknown;
            tile_index?: unknown;
          }
        | null;

      if (!pendingAction || pendingAction.type !== "BUY_PROPERTY") {
        return NextResponse.json(
          { error: "No pending property purchase." },
          { status: 409 },
        );
      }

      const tileIndex = body.tileIndex;
      if (typeof tileIndex !== "number" || !Number.isInteger(tileIndex)) {
        return NextResponse.json(
          { error: "Invalid tileIndex." },
          { status: 400 },
        );
      }

      if (pendingAction.tile_index !== tileIndex) {
        return NextResponse.json(
          { error: "Pending decision does not match that tile." },
          { status: 409 },
        );
      }

      const boardPack = getBoardPackById(game.board_pack_id);
      const boardTiles = boardPack?.tiles ?? [];
      const landingTile = boardTiles.find((tile) => tile.index === tileIndex);

      if (!landingTile) {
        return NextResponse.json(
          { error: "Tile not found on this board." },
          { status: 404 },
        );
      }

      if (!OWNABLE_TILE_TYPES.has(landingTile.type)) {
        return NextResponse.json(
          { error: "Tile is not ownable." },
          { status: 409 },
        );
      }

      const ownershipByTile = await loadOwnershipByTile(gameId);
      if (ownershipByTile[tileIndex]) {
        return NextResponse.json(
          { error: "Property already owned." },
          { status: 409 },
        );
      }

      const price = landingTile.price ?? 0;
      const balances = gameState.balances ?? {};
      const currentBalance =
        balances[currentPlayer.id] ?? game.starting_cash ?? 0;

      if (currentBalance < price) {
        return NextResponse.json(
          { error: "Insufficient cash to buy this property." },
          { status: 409 },
        );
      }

      const updatedBalances = {
        ...balances,
        [currentPlayer.id]: currentBalance - price,
      };

      const ownershipResponse = await fetch(
        `${supabaseUrl}/rest/v1/property_ownership`,
        {
          method: "POST",
          headers: {
            ...bankHeaders,
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            game_id: gameId,
            tile_index: tileIndex,
            owner_player_id: currentPlayer.id,
          }),
        },
      );

      if (!ownershipResponse.ok) {
        const errorText = await ownershipResponse.text();
        if (
          ownershipResponse.status === 409 ||
          errorText.includes("duplicate key value") ||
          errorText.includes("23505")
        ) {
          return NextResponse.json(
            { error: "Property already owned." },
            { status: 409 },
          );
        }

        return NextResponse.json(
          { error: errorText || "Unable to record ownership." },
          { status: 500 },
        );
      }

      const events: Array<{
        event_type: string;
        payload: Record<string, unknown>;
      }> = [
        {
          event_type: "BUY_PROPERTY",
          payload: {
            tile_index: tileIndex,
            price,
            owner_player_id: currentPlayer.id,
          },
        },
        {
          event_type: "CASH_DEBIT",
          payload: {
            player_id: currentPlayer.id,
            amount: price,
            reason: "BUY_PROPERTY",
            tile_index: tileIndex,
          },
        },
      ];
      const finalVersion = currentVersion + events.length;

      const [updatedState] = await fetchFromSupabaseWithService<GameStateRow[]>(
        `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            version: finalVersion,
            balances: updatedBalances,
            turn_phase: "AWAITING_ROLL",
            pending_action: null,
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

      await emitGameEvents(gameId, currentVersion + 1, events, user.id);

      return NextResponse.json({ gameState: updatedState });
    }

    if (body.action === "JAIL_ROLL_FOR_DOUBLES") {
      if (gameState.turn_phase !== "AWAITING_JAIL_DECISION") {
        return NextResponse.json(
          { error: "No jail decision required right now." },
          { status: 409 },
        );
      }

      if (!currentPlayer.is_in_jail) {
        return NextResponse.json(
          { error: "You are not in jail." },
          { status: 409 },
        );
      }

      const dieOne = Math.floor(Math.random() * 6) + 1;
      const dieTwo = Math.floor(Math.random() * 6) + 1;
      const rollTotal = dieOne + dieTwo;
      const dice = [dieOne, dieTwo];
      const isDouble = dieOne === dieTwo;
      const doublesCount = gameState?.doubles_count ?? 0;
      const allowDoublesBonus = false;
      const nextDoublesCount =
        isDouble && allowDoublesBonus ? doublesCount + 1 : 0;
      const turnsRemaining = Math.max(
        0,
        currentPlayer.jail_turns_remaining - 1,
      );
      const shouldReleaseFromJail = isDouble || turnsRemaining === 0;

      if (!shouldReleaseFromJail) {
        const currentIndex = players.findIndex(
          (player) => player.id === gameState.current_player_id,
        );
        const nextIndex =
          currentIndex === -1 ? 0 : (currentIndex + 1) % players.length;
        const nextPlayer = players[nextIndex];
        const events: Array<{
          event_type: string;
          payload: Record<string, unknown>;
        }> = [
          {
            event_type: "ROLL_DICE",
            payload: {
              player_id: currentPlayer.id,
              player_name: currentPlayer.display_name,
              roll: rollTotal,
              dice,
            } satisfies DiceEventPayload,
          },
          {
            event_type: "JAIL_DOUBLES_FAIL",
            payload: {
              player_id: currentPlayer.id,
              player_name: currentPlayer.display_name,
              dice,
              turns_remaining: turnsRemaining,
            },
          },
          {
            event_type: "END_TURN",
            payload: {
              from_player_id: currentPlayer.id,
              from_player_name: currentPlayer.display_name,
              to_player_id: nextPlayer.id,
              to_player_name: nextPlayer.display_name,
            },
          },
        ];
        const finalVersion = currentVersion + events.length;

        const [updatedState] = await fetchFromSupabaseWithService<GameStateRow[]>(
          `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
          {
            method: "PATCH",
            headers: {
              Prefer: "return=representation",
            },
            body: JSON.stringify({
              version: finalVersion,
              current_player_id: nextPlayer.id,
              last_roll: null,
              doubles_count: 0,
              turn_phase: nextPlayer.is_in_jail
                ? "AWAITING_JAIL_DECISION"
                : "AWAITING_ROLL",
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

        const [updatedPlayer] = await fetchFromSupabaseWithService<PlayerRow[]>(
          `players?id=eq.${currentPlayer.id}`,
          {
            method: "PATCH",
            headers: {
              Prefer: "return=representation",
            },
            body: JSON.stringify({
              jail_turns_remaining: turnsRemaining,
            }),
          },
        );

        if (!updatedPlayer) {
          return NextResponse.json(
            { error: "Unable to update jail turns." },
            { status: 500 },
          );
        }

        await emitGameEvents(gameId, currentVersion + 1, events, user.id);

        return NextResponse.json({ gameState: updatedState });
      }

      const boardPack = getBoardPackById(game.board_pack_id);
      const boardTiles = boardPack?.tiles ?? [];
      const boardSize = boardTiles.length > 0 ? boardTiles.length : 40;
      const currentPosition = Number.isFinite(currentPlayer.position)
        ? currentPlayer.position
        : 0;
      const newPosition = (currentPosition + rollTotal) % boardSize;
      const passedStart = currentPosition + rollTotal >= boardSize;
      const landingTile = boardTiles[newPosition] ?? {
        index: newPosition,
        tile_id: `tile-${newPosition}`,
        type: "PROPERTY",
        name: `Tile ${newPosition}`,
      };
      const ownershipByTile = await loadOwnershipByTile(gameId);
      let jailTile =
        landingTile.type === "GO_TO_JAIL"
          ? boardTiles.find((tile) => tile.type === "JAIL") ?? {
              index: 10,
              tile_id: "jail",
              type: "JAIL",
              name: "Jail",
            }
          : null;
      const resolvedTile = jailTile ?? landingTile;
      let finalPosition = resolvedTile.index;
      let shouldSendToJail = landingTile.type === "GO_TO_JAIL" && Boolean(jailTile);
      let activeLandingTile = landingTile;
      let activeResolvedTile = resolvedTile;
      const forcedFine = !isDouble;
      const balances = gameState?.balances ?? {};
      let updatedBalances = balances;
      let balancesChanged = false;
      let goSalaryAwarded = false;
      if (forcedFine) {
        const currentBalance =
          updatedBalances[currentPlayer.id] ?? game.starting_cash ?? 0;
        updatedBalances = {
          ...updatedBalances,
          [currentPlayer.id]: currentBalance - JAIL_FINE_AMOUNT,
        };
        balancesChanged = true;
      }
      let nextChanceIndex = gameState?.chance_index ?? 0;
      let nextCommunityIndex = gameState?.community_index ?? 0;

      const events: Array<{
        event_type: string;
        payload: Record<string, unknown>;
      }> = [
        {
          event_type: "ROLL_DICE",
          payload: {
            player_id: currentPlayer.id,
            player_name: currentPlayer.display_name,
            roll: rollTotal,
            dice,
          } satisfies DiceEventPayload,
        },
      ];

      if (isDouble) {
        events.push(
          {
            event_type: "ROLLED_DOUBLE",
            payload: {
              player_id: currentPlayer.id,
              player_name: currentPlayer.display_name,
              roll: rollTotal,
              dice,
              doubles_count: nextDoublesCount,
            } satisfies DiceEventPayload,
          },
          {
            event_type: "JAIL_DOUBLES_SUCCESS",
            payload: {
              player_id: currentPlayer.id,
              player_name: currentPlayer.display_name,
              dice,
            },
          },
        );
      } else {
        events.push({
          event_type: "JAIL_DOUBLES_FAIL",
          payload: {
            player_id: currentPlayer.id,
            player_name: currentPlayer.display_name,
            dice,
            turns_remaining: turnsRemaining,
          },
        });
      }

      if (forcedFine) {
        events.push(
          {
            event_type: "JAIL_PAY_FINE",
            payload: {
              player_id: currentPlayer.id,
              player_name: currentPlayer.display_name,
              amount: JAIL_FINE_AMOUNT,
              forced: true,
            },
          },
          {
            event_type: "CASH_DEBIT",
            payload: {
              player_id: currentPlayer.id,
              amount: JAIL_FINE_AMOUNT,
              reason: "JAIL_PAY_FINE",
            },
          },
        );
      }

      events.push({
        event_type: "MOVE_PLAYER",
        payload: {
          player_id: currentPlayer.id,
          from: currentPosition,
          to: newPosition,
          roll_total: rollTotal,
          dice,
          passedStart,
          tile_id: landingTile.tile_id,
          tile_name: landingTile.name,
        },
      });

      if (passedStart || landingTile.type === "START") {
        const reason = passedStart ? "PASS_START" : "LAND_GO";
        const goResult = applyGoSalary({
          player: currentPlayer,
          balances: updatedBalances,
          startingCash: game.starting_cash ?? 0,
          events,
          alreadyCollected: goSalaryAwarded,
          reason,
        });
        updatedBalances = goResult.balances;
        balancesChanged = balancesChanged || goResult.balancesChanged;
        goSalaryAwarded = goResult.alreadyCollected;
      }

      events.push({
        event_type: "LAND_ON_TILE",
        payload: {
          player_id: currentPlayer.id,
          tile_id: landingTile.tile_id,
          tile_type: landingTile.type,
          tile_index: landingTile.index,
        },
      });

      const resolutionEvent = resolveTile(landingTile, currentPlayer);
      if (resolutionEvent) {
        events.push({
          event_type: resolutionEvent.event_type,
          payload: resolutionEvent.payload,
        });
      }
      let cardTriggeredGoToJail = false;
      const eventDeck =
        landingTile.type === "EVENT" ? getEventDeckForTile(landingTile) : null;
      if (eventDeck && eventDeck.cards.length > 0) {
        const currentIndex =
          eventDeck.indexKey === "chance_index"
            ? nextChanceIndex
            : nextCommunityIndex;
        const card = eventDeck.cards[currentIndex % eventDeck.cards.length];
        if (eventDeck.indexKey === "chance_index") {
          nextChanceIndex = currentIndex + 1;
        } else {
          nextCommunityIndex = currentIndex + 1;
        }

        events.push({
          event_type: "DRAW_CARD",
          payload: {
            player_id: currentPlayer.id,
            player_name: currentPlayer.display_name,
            deck: eventDeck.deck,
            card_id: card.id,
            card_title: card.title,
            card_kind: card.kind,
            draw_index: currentIndex,
          },
        });

        if (card.kind === "PAY" || card.kind === "RECEIVE") {
          const amount =
            getNumberPayload(card.payload as Record<string, unknown>, "amount") ?? 0;
          const currentBalance =
            updatedBalances[currentPlayer.id] ?? game.starting_cash ?? 0;
          updatedBalances = {
            ...updatedBalances,
            [currentPlayer.id]:
              card.kind === "PAY"
                ? currentBalance - amount
                : currentBalance + amount,
          };
          if (amount !== 0) {
            balancesChanged = true;
          }
          events.push({
            event_type: card.kind === "PAY" ? "CARD_PAY" : "CARD_RECEIVE",
            payload: {
              player_id: currentPlayer.id,
              player_name: currentPlayer.display_name,
              card_id: card.id,
              card_title: card.title,
              card_kind: card.kind,
              amount,
            },
          });
        }

        if (card.kind === "MOVE_TO" || card.kind === "MOVE_REL") {
          const payload = card.payload as Record<string, unknown>;
          const targetIndex =
            card.kind === "MOVE_TO"
              ? getNumberPayload(payload, "tile_index")
              : null;
          const spaces =
            card.kind === "MOVE_REL" ? getNumberPayload(payload, "spaces") : null;
          const cardFromIndex = activeResolvedTile.index;
          const rawIndex =
            card.kind === "MOVE_TO" && targetIndex !== null
              ? targetIndex
              : card.kind === "MOVE_REL" && spaces !== null
                ? cardFromIndex + spaces
                : null;
          if (rawIndex !== null) {
            const normalizedIndex =
              ((rawIndex % boardSize) + boardSize) % boardSize;
            const cardLandingTile = boardTiles[normalizedIndex] ?? {
              index: normalizedIndex,
              tile_id: `tile-${normalizedIndex}`,
              type: "PROPERTY",
              name: `Tile ${normalizedIndex}`,
            };
            const cardPassedStart =
              card.kind === "MOVE_TO"
                ? normalizedIndex < cardFromIndex
                : spaces !== null
                  ? spaces > 0 && cardFromIndex + spaces >= boardSize
                  : false;
            const cardJailTile =
              cardLandingTile.type === "GO_TO_JAIL"
                ? boardTiles.find((tile) => tile.type === "JAIL") ?? {
                    index: 10,
                    tile_id: "jail",
                    type: "JAIL",
                    name: "Jail",
                  }
                : null;
            const cardResolvedTile = cardJailTile ?? cardLandingTile;
            jailTile = cardJailTile ?? jailTile;
            shouldSendToJail =
              cardLandingTile.type === "GO_TO_JAIL" && Boolean(cardJailTile);
            activeLandingTile = cardLandingTile;
            activeResolvedTile = cardResolvedTile;
            finalPosition = cardResolvedTile.index;
            events.push({
              event_type: card.kind === "MOVE_TO" ? "CARD_MOVE_TO" : "CARD_MOVE_REL",
              payload: {
                player_id: currentPlayer.id,
                player_name: currentPlayer.display_name,
                card_id: card.id,
                card_title: card.title,
                card_kind: card.kind,
                from_tile_index: cardFromIndex,
                to_tile_index: cardLandingTile.index,
                passed_start: cardPassedStart,
              },
            });

            events.push({
              event_type: "MOVE_PLAYER",
              payload: {
                player_id: currentPlayer.id,
                from: cardFromIndex,
                to: cardLandingTile.index,
                passedStart: cardPassedStart,
                tile_id: cardLandingTile.tile_id,
                tile_name: cardLandingTile.name,
                reason: "CARD",
                card_id: card.id,
              },
            });

            if (cardPassedStart || cardLandingTile.type === "START") {
              const reason = cardPassedStart ? "PASS_START" : "LAND_GO";
              const goResult = applyGoSalary({
                player: currentPlayer,
                balances: updatedBalances,
                startingCash: game.starting_cash ?? 0,
                events,
                alreadyCollected: goSalaryAwarded,
                reason,
              });
              updatedBalances = goResult.balances;
              balancesChanged = balancesChanged || goResult.balancesChanged;
              goSalaryAwarded = goResult.alreadyCollected;
            }

            events.push({
              event_type: "LAND_ON_TILE",
              payload: {
                player_id: currentPlayer.id,
                tile_id: cardLandingTile.tile_id,
                tile_type: cardLandingTile.type,
                tile_index: cardLandingTile.index,
              },
            });

            const cardResolutionEvent = resolveTile(
              cardLandingTile,
              currentPlayer,
            );
            if (cardResolutionEvent) {
              events.push({
                event_type: cardResolutionEvent.event_type,
                payload: cardResolutionEvent.payload,
              });
            }

            if (cardLandingTile.type === "GO_TO_JAIL" && cardJailTile) {
              cardTriggeredGoToJail = true;
              events.push({
                event_type: "GO_TO_JAIL",
                payload: {
                  from_tile_index: cardLandingTile.index,
                  to_jail_tile_index: cardJailTile.index,
                  player_id: currentPlayer.id,
                  display_name: currentPlayer.display_name,
                },
              });
            }
          }
        }

        if (card.kind === "GO_TO_JAIL") {
          const cardFromIndex = activeResolvedTile.index;
          const cardJailTile =
            boardTiles.find((tile) => tile.type === "JAIL") ?? {
              index: 10,
              tile_id: "jail",
              type: "JAIL",
              name: "Jail",
            };
          activeLandingTile = cardJailTile;
          activeResolvedTile = cardJailTile;
          finalPosition = cardJailTile.index;
          shouldSendToJail = true;
          jailTile = cardJailTile;
          cardTriggeredGoToJail = true;

          events.push({
            event_type: "CARD_GO_TO_JAIL",
            payload: {
              player_id: currentPlayer.id,
              player_name: currentPlayer.display_name,
              card_id: card.id,
              card_title: card.title,
              card_kind: card.kind,
              from_tile_index: cardFromIndex,
              to_jail_tile_index: cardJailTile.index,
            },
          });

          events.push(
            {
              event_type: "MOVE_PLAYER",
              payload: {
                player_id: currentPlayer.id,
                from: cardFromIndex,
                to: cardJailTile.index,
                tile_id: cardJailTile.tile_id,
                tile_name: cardJailTile.name,
                reason: "CARD",
                card_id: card.id,
              },
            },
            {
              event_type: "LAND_ON_TILE",
              payload: {
                player_id: currentPlayer.id,
                tile_id: cardJailTile.tile_id,
                tile_type: cardJailTile.type,
                tile_index: cardJailTile.index,
              },
            },
          );

          const cardResolutionEvent = resolveTile(cardJailTile, currentPlayer);
          if (cardResolutionEvent) {
            events.push({
              event_type: cardResolutionEvent.event_type,
              payload: cardResolutionEvent.payload,
            });
          }

          events.push({
            event_type: "GO_TO_JAIL",
            payload: {
              from_tile_index: cardFromIndex,
              to_jail_tile_index: cardJailTile.index,
              player_id: currentPlayer.id,
              display_name: currentPlayer.display_name,
            },
          });
        }
      }

      const ownership = ownershipByTile[activeLandingTile.index];
      const isOwnableTile = OWNABLE_TILE_TYPES.has(activeLandingTile.type);
      const rentOwnerId =
        isOwnableTile && ownership ? ownership.owner_player_id : null;
      const rentCalculation = calculateRent({
        tile: activeLandingTile,
        ownerId: rentOwnerId,
        currentPlayerId: currentPlayer.id,
        boardTiles,
        ownershipByTile,
        // TODO: allow card-triggered utility rolls to override this dice total.
        diceTotal: rollTotal,
      });
      const rentAmount = rentCalculation.amount;
      const shouldPayRent = rentAmount > 0 && Boolean(rentOwnerId);
      const isUnownedOwnableTile = isOwnableTile && !ownership;
      const isTaxTile = activeLandingTile.type === "TAX";
      const taxAmount = isTaxTile ? activeLandingTile.taxAmount ?? 0 : 0;
      const shouldPayTax = isTaxTile && taxAmount > 0;

      if (activeLandingTile.type === "GO_TO_JAIL" && jailTile && !cardTriggeredGoToJail) {
        events.push({
          event_type: "GO_TO_JAIL",
          payload: {
            from_tile_index: activeLandingTile.index,
            to_jail_tile_index: jailTile.index,
            player_id: currentPlayer.id,
            display_name: currentPlayer.display_name,
          },
        });
      }

      if (shouldPayRent && rentOwnerId && rentOwnerId !== currentPlayer.id) {
        const payerBalance =
          updatedBalances[currentPlayer.id] ?? game.starting_cash ?? 0;
        const ownerBalance =
          updatedBalances[rentOwnerId] ?? game.starting_cash ?? 0;
        updatedBalances = {
          ...updatedBalances,
          [currentPlayer.id]: payerBalance - rentAmount,
          [rentOwnerId]: ownerBalance + rentAmount,
        };
        balancesChanged = true;
        const rentPayload: Record<string, unknown> = {
          tile_index: activeLandingTile.index,
          tile_id: activeLandingTile.tile_id,
          tile_type: activeLandingTile.type,
          from_player_id: currentPlayer.id,
          to_player_id: rentOwnerId,
          amount: rentAmount,
        };
        if (rentCalculation.meta) {
          Object.assign(rentPayload, rentCalculation.meta);
        }
        events.push({
          event_type: "PAY_RENT",
          payload: rentPayload,
        });
      }

      if (shouldPayTax) {
        const payerBalance =
          updatedBalances[currentPlayer.id] ?? game.starting_cash ?? 0;
        updatedBalances = {
          ...updatedBalances,
          [currentPlayer.id]: payerBalance - taxAmount,
        };
        balancesChanged = true;
        events.push(
          {
            event_type: "PAY_TAX",
            payload: {
              tile_index: activeLandingTile.index,
              tile_name: activeLandingTile.name,
              amount: taxAmount,
              payer_player_id: currentPlayer.id,
              payer_display_name: currentPlayer.display_name,
            },
          },
          {
            event_type: "CASH_DEBIT",
            payload: {
              player_id: currentPlayer.id,
              amount: taxAmount,
              reason: "PAY_TAX",
              tile_index: activeLandingTile.index,
            },
          },
        );
        // TODO: If rules.freeParkingJackpotEnabled, route taxAmount into free_parking_pot.
      }

      if (isFreeParking && rules.freeParkingJackpotEnabled) {
        // TODO: Pay out free_parking_pot and reset to 0 when jackpot is enabled.
      }

      const pendingPurchaseAction =
        isUnownedOwnableTile && !(shouldSendToJail && jailTile)
        ? {
            type: "BUY_PROPERTY",
            tile_index: activeLandingTile.index,
            price: activeLandingTile.price ?? 0,
          }
        : null;

      if (pendingPurchaseAction) {
        events.push({
          event_type: "OFFER_PURCHASE",
          payload: {
            player_id: currentPlayer.id,
            tile_id: activeLandingTile.tile_id,
            tile_name: activeLandingTile.name,
            tile_index: activeLandingTile.index,
            price: pendingPurchaseAction.price,
          },
        });
      }

      events.push({
        event_type: "MOVE_RESOLVED",
        payload: {
          player_id: currentPlayer.id,
          tile_id: activeResolvedTile.tile_id,
          tile_type: activeResolvedTile.type,
          tile_index: activeResolvedTile.index,
        },
      });

      if (
        allowDoublesBonus &&
        isDouble &&
        !pendingPurchaseAction &&
        !(shouldSendToJail && jailTile)
      ) {
        events.push({
          event_type: "ALLOW_EXTRA_ROLL",
          payload: {
            player_id: currentPlayer.id,
            player_name: currentPlayer.display_name,
            doubles_count: nextDoublesCount,
          },
        });
      }

      const finalVersion = currentVersion + events.length;
      const [updatedState] = await fetchFromSupabaseWithService<GameStateRow[]>(
        `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            version: finalVersion,
            last_roll: rollTotal,
            doubles_count: nextDoublesCount,
            ...(balancesChanged ? { balances: updatedBalances } : {}),
            ...(nextChanceIndex !== (gameState?.chance_index ?? 0)
              ? { chance_index: nextChanceIndex }
              : {}),
            ...(nextCommunityIndex !== (gameState?.community_index ?? 0)
              ? { community_index: nextCommunityIndex }
              : {}),
            turn_phase: pendingPurchaseAction
              ? "AWAITING_DECISION"
              : "AWAITING_ROLL",
            pending_action: pendingPurchaseAction,
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

      const [updatedPlayer] = await fetchFromSupabaseWithService<PlayerRow[]>(
        `players?id=eq.${currentPlayer.id}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            position: finalPosition,
            is_in_jail: Boolean(shouldSendToJail && jailTile),
            jail_turns_remaining: shouldSendToJail && jailTile ? 3 : 0,
          }),
        },
      );

      if (!updatedPlayer) {
        return NextResponse.json(
          { error: "Unable to update player position." },
          { status: 500 },
        );
      }

      await emitGameEvents(gameId, currentVersion + 1, events, user.id);

      return NextResponse.json({ gameState: updatedState });
    }

    if (body.action === "JAIL_PAY_FINE") {
      if (gameState.turn_phase !== "AWAITING_JAIL_DECISION") {
        return NextResponse.json(
          { error: "No jail decision required right now." },
          { status: 409 },
        );
      }

      if (!currentPlayer.is_in_jail) {
        return NextResponse.json(
          { error: "You are not in jail." },
          { status: 409 },
        );
      }

      const balances = gameState.balances ?? {};
      const currentBalance =
        balances[currentPlayer.id] ?? game.starting_cash ?? 0;
      const updatedBalances = {
        ...balances,
        [currentPlayer.id]: currentBalance - JAIL_FINE_AMOUNT,
      };
      const events: Array<{
        event_type: string;
        payload: Record<string, unknown>;
      }> = [
        {
          event_type: "JAIL_PAY_FINE",
          payload: {
            player_id: currentPlayer.id,
            player_name: currentPlayer.display_name,
            amount: JAIL_FINE_AMOUNT,
          },
        },
        {
          event_type: "CASH_DEBIT",
          payload: {
            player_id: currentPlayer.id,
            amount: JAIL_FINE_AMOUNT,
            reason: "JAIL_PAY_FINE",
          },
        },
      ];
      const finalVersion = currentVersion + events.length;

      const [updatedState] = await fetchFromSupabaseWithService<GameStateRow[]>(
        `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            version: finalVersion,
            balances: updatedBalances,
            turn_phase: "AWAITING_ROLL",
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

      const [updatedPlayer] = await fetchFromSupabaseWithService<PlayerRow[]>(
        `players?id=eq.${currentPlayer.id}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            is_in_jail: false,
            jail_turns_remaining: 0,
          }),
        },
      );

      if (!updatedPlayer) {
        return NextResponse.json(
          { error: "Unable to release player from jail." },
          { status: 500 },
        );
      }

      await emitGameEvents(gameId, currentVersion + 1, events, user.id);

      return NextResponse.json({ gameState: updatedState });
    }

    if (body.action === "END_TURN") {
      if (gameState.pending_action) {
        return NextResponse.json(
          { error: "Pending decision must be resolved." },
          { status: 409 },
        );
      }

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
            doubles_count: 0,
            turn_phase: nextPlayer.is_in_jail
              ? "AWAITING_JAIL_DECISION"
              : "AWAITING_ROLL",
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
