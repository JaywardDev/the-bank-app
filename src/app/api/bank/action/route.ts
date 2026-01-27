import { NextResponse } from "next/server";
import {
  chanceCards,
  communityCards,
  defaultBoardPackId,
  getBoardPackById,
} from "@/lib/boardPacks";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { DEFAULT_RULES, getRules } from "@/lib/rules";

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
        | "JAIL_ROLL_FOR_DOUBLES"
        | "USE_GET_OUT_OF_JAIL_FREE",
        "DECLINE_PROPERTY" | "BUY_PROPERTY"
      >;
      tileIndex?: number;
    })
  | (BaseActionRequest & {
      action: "DECLINE_PROPERTY" | "BUY_PROPERTY";
      tileIndex: number;
    })
  | (BaseActionRequest & {
      action: "AUCTION_BID";
      amount: number;
    })
  | (BaseActionRequest & {
      action: "AUCTION_PASS";
    })
  | (BaseActionRequest & {
      action: "TAKE_COLLATERAL_LOAN";
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
  get_out_of_jail_free_count: number;
  is_eliminated: boolean;
  eliminated_at: string | null;
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
  rules: Partial<ReturnType<typeof getRules>> | null;
  auction_active: boolean | null;
  auction_tile_index: number | null;
  auction_initiator_player_id: string | null;
  auction_current_bid: number | null;
  auction_current_winner_player_id: string | null;
  auction_turn_player_id: string | null;
  auction_turn_ends_at: string | null;
  auction_eligible_player_ids: string[] | null;
  auction_passed_player_ids: string[] | null;
  auction_min_increment: number | null;
};

type OwnershipRow = {
  tile_index: number;
  owner_player_id: string | null;
  collateral_loan_id: string | null;
};

type OwnershipByTile = Record<
  number,
  { owner_player_id: string; collateral_loan_id: string | null }
>;

type PlayerLoanRow = {
  id: string;
  game_id: string;
  player_id: string;
  collateral_tile_index: number;
  principal: number;
  rate_per_turn: number;
  term_turns: number;
  turns_remaining: number;
  payment_per_turn: number;
  status: string;
};

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

const parseSupabaseResponse = async <T>(
  response: Response,
  options?: { onErrorMessage?: string },
): Promise<T | null> => {
  if (response.status === 204) {
    return null;
  }

  const bodyText = await response.text();
  if (!response.ok) {
    const defaultMessage = options?.onErrorMessage ?? "Supabase request failed.";
    if (!bodyText) {
      throw new Error(defaultMessage);
    }
    try {
      const parsed = JSON.parse(bodyText) as { message?: string; error?: string };
      if (parsed?.message) {
        throw new Error(parsed.message);
      }
      if (parsed?.error) {
        throw new Error(parsed.error);
      }
    } catch {
      // fallback to raw text
    }
    throw new Error(bodyText || defaultMessage);
  }

  if (!bodyText) {
    return null;
  }

  try {
    return JSON.parse(bodyText) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON.";
    throw new Error(`Supabase returned invalid JSON: ${message}`);
  }
};

const fetchFromSupabase = async <T>(
  path: string,
  options: RequestInit,
): Promise<T | null> => {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...playerHeaders,
      ...(options.headers ?? {}),
    },
  });

  return parseSupabaseResponse<T>(response);
};

const fetchFromSupabaseWithService = async <T>(
  path: string,
  options: RequestInit,
): Promise<T | null> => {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...bankHeaders,
      ...(options.headers ?? {}),
    },
  });

  return parseSupabaseResponse<T>(response);
};

const loadOwnershipByTile = async (
  gameId: string,
): Promise<OwnershipByTile> => {
  const ownershipRows = (await fetchFromSupabaseWithService<OwnershipRow[]>(
    `property_ownership?select=tile_index,owner_player_id,collateral_loan_id&game_id=eq.${gameId}`,
    { method: "GET" },
  )) ?? [];

  return ownershipRows.reduce<OwnershipByTile>((acc, row) => {
    if (row.owner_player_id) {
      acc[row.tile_index] = {
        owner_player_id: row.owner_player_id,
        collateral_loan_id: row.collateral_loan_id ?? null,
      };
    }
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

const getNextActivePlayer = (
  players: PlayerRow[],
  currentPlayerId: string | null,
): PlayerRow | null => {
  if (players.length === 0) {
    return null;
  }
  const startIndex = players.findIndex(
    (player) => player.id === currentPlayerId,
  );
  if (startIndex === -1) {
    return players.find((player) => !player.is_eliminated) ?? null;
  }
  for (let offset = 1; offset <= players.length; offset += 1) {
    const candidate = players[(startIndex + offset) % players.length];
    if (!candidate.is_eliminated) {
      return candidate;
    }
  }
  return null;
};

const getActivePlayersAfterElimination = (
  players: PlayerRow[],
  eliminatedPlayerId: string,
) => players.filter(
  (player) => !player.is_eliminated && player.id !== eliminatedPlayerId,
);

const normalizePlayerIdArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

const getNextEligibleAuctionPlayerId = (
  players: PlayerRow[],
  startingPlayerId: string | null,
  eligibleIds: string[],
  passedIds: Set<string>,
): string | null => {
  if (eligibleIds.length === 0) {
    return null;
  }
  const eligibleSet = new Set(eligibleIds);
  const startIndex = players.findIndex(
    (player) => player.id === startingPlayerId,
  );
  if (startIndex === -1) {
    return (
      players.find(
        (player) =>
          eligibleSet.has(player.id) &&
          !passedIds.has(player.id) &&
          !player.is_eliminated,
      )?.id ?? null
    );
  }
  for (let offset = 1; offset <= players.length; offset += 1) {
    const candidate = players[(startIndex + offset) % players.length];
    if (
      eligibleSet.has(candidate.id) &&
      !passedIds.has(candidate.id) &&
      !candidate.is_eliminated
    ) {
      return candidate.id;
    }
  }
  return null;
};

const resolveBankruptcyIfNeeded = async ({
  gameId,
  gameState,
  players,
  player,
  updatedBalances,
  cashBefore,
  cashAfter,
  reason,
  events,
  currentVersion,
  userId,
  playerPosition,
}: {
  gameId: string;
  gameState: GameStateRow;
  players: PlayerRow[];
  player: PlayerRow;
  updatedBalances: Record<string, number>;
  cashBefore: number;
  cashAfter: number;
  reason: string;
  events: Array<{ event_type: string; payload: Record<string, unknown> }>;
  currentVersion: number;
  userId: string;
  playerPosition: number | null;
}): Promise<{
  handled: boolean;
  updatedState?: GameStateRow;
  error?: string;
}> => {
  if (cashAfter >= 0) {
    return { handled: false };
  }

  const now = new Date().toISOString();
  const activePlayersAfter = getActivePlayersAfterElimination(
    players,
    player.id,
  );
  const nextPlayer = getNextActivePlayer(players, player.id);
  const remainingPlayers = activePlayersAfter.length;
  const winner = remainingPlayers === 1 ? activePlayersAfter[0] : null;
  const gameIsOver = remainingPlayers <= 1;
  const updatedBalancesNormalized = {
    ...updatedBalances,
    [player.id]: 0,
  };

  const ownedRows = (await fetchFromSupabaseWithService<
    Array<{ id: string; tile_index: number }>
  >(
    `property_ownership?select=id,tile_index&game_id=eq.${gameId}&owner_player_id=eq.${player.id}`,
    { method: "GET" },
  )) ?? [];
  const returnedPropertyIds = ownedRows.map((row) => row.tile_index);

  if (ownedRows.length > 0) {
    await fetchFromSupabaseWithService(
      `property_ownership?game_id=eq.${gameId}&owner_player_id=eq.${player.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          owner_player_id: null,
          collateral_loan_id: null,
        }),
      },
    );
  }

  await fetchFromSupabaseWithService(
    `player_loans?game_id=eq.${gameId}&player_id=eq.${player.id}&status=eq.active`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "defaulted",
        updated_at: now,
      }),
    },
  );

  await fetchFromSupabaseWithService(`players?id=eq.${player.id}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      ...(Number.isFinite(playerPosition) ? { position: playerPosition } : {}),
      is_in_jail: false,
      jail_turns_remaining: 0,
      is_eliminated: true,
      eliminated_at: now,
    }),
  });

  const bankruptcyEvents: Array<{
    event_type: string;
    payload: Record<string, unknown>;
  }> = [
    {
      event_type: "BANKRUPTCY",
      payload: {
        player_id: player.id,
        cash_before: cashBefore,
        cash_after: cashAfter,
        reason,
        returned_property_ids: returnedPropertyIds,
      },
    },
  ];

  if (!gameIsOver && nextPlayer) {
    bankruptcyEvents.push({
      event_type: "END_TURN",
      payload: {
        from_player_id: player.id,
        from_player_name: player.display_name,
        to_player_id: nextPlayer.id,
        to_player_name: nextPlayer.display_name,
      },
    });
  }

  if (gameIsOver) {
    bankruptcyEvents.push({
      event_type: "GAME_OVER",
      payload: {
        winner_player_id: winner?.id ?? null,
        winner_player_name: winner?.display_name ?? null,
        reason: "BANKRUPTCY",
      },
    });
  }

  const finalVersion = currentVersion + events.length + bankruptcyEvents.length;
  const nextTurnPhase = nextPlayer?.is_in_jail
    ? "AWAITING_JAIL_DECISION"
    : "AWAITING_ROLL";
  const [updatedState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
    `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        version: finalVersion,
        balances: updatedBalancesNormalized,
        current_player_id: gameIsOver
          ? winner?.id ?? null
          : nextPlayer?.id ?? null,
        last_roll: null,
        doubles_count: 0,
        turn_phase: gameIsOver ? "AWAITING_ROLL" : nextTurnPhase,
        pending_action: null,
        updated_at: now,
      }),
    },
  )) ?? [];

  if (!updatedState) {
    return { handled: true, error: "Version mismatch." };
  }

  await emitGameEvents(
    gameId,
    currentVersion + 1,
    [...events, ...bankruptcyEvents],
    userId,
  );

  if (gameIsOver) {
    await fetchFromSupabaseWithService(`games?id=eq.${gameId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "ended",
      }),
    });
  }

  return { handled: true, updatedState };
};

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

const applyLoanPaymentsForPlayer = async ({
  gameId,
  player,
  balances,
  startingCash,
}: {
  gameId: string;
  player: PlayerRow;
  balances: Record<string, number>;
  startingCash: number;
}) => {
  const activeLoans = (await fetchFromSupabaseWithService<PlayerLoanRow[]>(
    `player_loans?select=id,collateral_tile_index,principal,rate_per_turn,term_turns,turns_remaining,payment_per_turn,status&game_id=eq.${gameId}&player_id=eq.${player.id}&status=eq.active`,
    { method: "GET" },
  )) ?? [];

  if (activeLoans.length === 0) {
    return {
      balances,
      balancesChanged: false,
      events: [] as Array<{ event_type: string; payload: Record<string, unknown> }>,
      bankruptcyCandidate: null as
        | { reason: string; cashBefore: number; cashAfter: number }
        | null,
    };
  }

  let updatedBalances = balances;
  let balancesChanged = false;
  let bankruptcyCandidate: { reason: string; cashBefore: number; cashAfter: number } | null =
    null;
  const events: Array<{ event_type: string; payload: Record<string, unknown> }> = [];

  for (const loan of activeLoans) {
    const paymentAmount = loan.payment_per_turn;
    const currentBalance = updatedBalances[player.id] ?? startingCash;
    const nextBalance = currentBalance - paymentAmount;
    updatedBalances = {
      ...updatedBalances,
      [player.id]: nextBalance,
    };
    if (paymentAmount !== 0) {
      balancesChanged = true;
    }
    if (nextBalance < 0 && !bankruptcyCandidate) {
      bankruptcyCandidate = {
        reason: "COLLATERAL_LOAN_PAYMENT",
        cashBefore: currentBalance,
        cashAfter: nextBalance,
      };
    }

    const turnsRemainingAfter = Math.max(0, loan.turns_remaining - 1);
    const status = turnsRemainingAfter === 0 ? "paid" : "active";

    await fetchFromSupabaseWithService(`player_loans?id=eq.${loan.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        turns_remaining: turnsRemainingAfter,
        status,
        updated_at: new Date().toISOString(),
      }),
    });

    events.push({
      event_type: "COLLATERAL_LOAN_PAYMENT",
      payload: {
        player_id: player.id,
        tile_index: loan.collateral_tile_index,
        amount: paymentAmount,
        turns_remaining_after: turnsRemainingAfter,
      },
    });

    if (status === "paid") {
      await fetchFromSupabaseWithService(
        `property_ownership?game_id=eq.${gameId}&tile_index=eq.${loan.collateral_tile_index}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            collateral_loan_id: null,
          }),
        },
      );
      events.push({
        event_type: "COLLATERAL_LOAN_PAID",
        payload: {
          player_id: player.id,
          tile_index: loan.collateral_tile_index,
          principal: loan.principal,
        },
      });
    }
  }

  return { balances: updatedBalances, balancesChanged, events, bankruptcyCandidate };
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

      const [game] = (await fetchFromSupabaseWithService<GameRow[]>(
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
      )) ?? [];

      if (!game) {
        return NextResponse.json(
          { error: "Unable to create the game." },
          { status: 500 },
        );
      }

      const [hostPlayer] = (await fetchFromSupabaseWithService<PlayerRow[]>(
        "players?select=id,user_id,display_name,created_at,position,is_in_jail,jail_turns_remaining,get_out_of_jail_free_count,is_eliminated,eliminated_at",
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

      await fetchFromSupabaseWithService<GameStateRow[]>(
        "game_state?select=game_id,version,current_player_id,balances,last_roll,doubles_count,turn_phase,pending_action,chance_index,community_index,free_parking_pot,rules,auction_active,auction_tile_index,auction_initiator_player_id,auction_current_bid,auction_current_winner_player_id,auction_turn_player_id,auction_turn_ends_at,auction_eligible_player_ids,auction_passed_player_ids,auction_min_increment",
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

      const [game] = (await fetchFromSupabaseWithService<GameRow[]>(
        `games?select=id,join_code,status,created_at,board_pack_id,created_by&join_code=eq.${joinCode}&limit=1`,
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
        "players?select=id,user_id,display_name,created_at,position,is_in_jail,jail_turns_remaining,get_out_of_jail_free_count,is_eliminated,eliminated_at&on_conflict=game_id,user_id",
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
        `players?select=id,user_id,display_name,created_at,position,is_in_jail,jail_turns_remaining,get_out_of_jail_free_count,is_eliminated,eliminated_at&game_id=eq.${game.id}&order=created_at.asc`,
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

    const [game] = (await fetchFromSupabaseWithService<GameRow[]>(
      `games?select=id,join_code,starting_cash,created_by,status,board_pack_id&id=eq.${gameId}&limit=1`,
      { method: "GET" },
    )) ?? [];

    if (!game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    const players = (await fetchFromSupabaseWithService<PlayerRow[]>(
      `players?select=id,user_id,display_name,created_at,position,is_in_jail,jail_turns_remaining,get_out_of_jail_free_count,is_eliminated,eliminated_at&game_id=eq.${gameId}&order=created_at.asc`,
      { method: "GET" },
    )) ?? [];

    const [gameState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
      `game_state?select=game_id,version,current_player_id,balances,last_roll,doubles_count,turn_phase,pending_action,chance_index,community_index,free_parking_pot,rules,auction_active,auction_tile_index,auction_initiator_player_id,auction_current_bid,auction_current_winner_player_id,auction_turn_player_id,auction_turn_ends_at,auction_eligible_player_ids,auction_passed_player_ids,auction_min_increment&game_id=eq.${gameId}&limit=1`,
      { method: "GET" },
    )) ?? [];

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

      const [startedGame] = (await fetchFromSupabaseWithService<GameRow[]>(
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
      )) ?? [];

      if (!startedGame) {
        const [latestGame] = (await fetchFromSupabaseWithService<GameRow[]>(
          `games?select=id,status&id=eq.${gameId}&limit=1`,
          { method: "GET" },
        )) ?? [];

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
        `${supabaseUrl}/rest/v1/game_state?on_conflict=game_id&select=game_id,version,current_player_id,balances,last_roll,doubles_count,turn_phase,pending_action,chance_index,community_index,auction_active,auction_tile_index,auction_initiator_player_id,auction_current_bid,auction_current_winner_player_id,auction_turn_player_id,auction_turn_ends_at,auction_eligible_player_ids,auction_passed_player_ids,auction_min_increment`,
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

      if (!endedGame) {
        const [latestGame] = (await fetchFromSupabaseWithService<GameRow[]>(
          `games?select=id,status&id=eq.${gameId}&limit=1`,
          { method: "GET" },
        )) ?? [];

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
    const currentUserPlayer = players.find(
      (player) => player.user_id === user.id,
    );
    const isAuctionAction =
      body.action === "AUCTION_BID" || body.action === "AUCTION_PASS";

    if (!currentPlayer) {
      return NextResponse.json(
        { error: "Current player is missing." },
        { status: 400 },
      );
    }

    if (!currentUserPlayer) {
      return NextResponse.json(
        { error: "Player not found for this game." },
        { status: 403 },
      );
    }

    if (!isAuctionAction && currentUserPlayer.id !== gameState.current_player_id) {
      return NextResponse.json(
        { error: "It is not your turn." },
        { status: 403 },
      );
    }

    if (currentUserPlayer.is_eliminated) {
      return NextResponse.json(
        { error: "Eliminated players cannot take actions." },
        { status: 403 },
      );
    }

    if (gameState.auction_active && !isAuctionAction) {
      return NextResponse.json(
        { error: "Auction in progress." },
        { status: 409 },
      );
    }

    if (isAuctionAction) {
      if (!gameState.auction_active) {
        return NextResponse.json(
          { error: "No auction is active." },
          { status: 409 },
        );
      }

      const auctionTileIndex = gameState.auction_tile_index;
      if (!Number.isInteger(auctionTileIndex)) {
        return NextResponse.json(
          { error: "Auction tile is missing." },
          { status: 409 },
        );
      }

      const activePlayerIds = players
        .filter((player) => !player.is_eliminated)
        .map((player) => player.id);
      const eligiblePlayerIds = normalizePlayerIdArray(
        gameState.auction_eligible_player_ids,
      ).filter((id) => activePlayerIds.includes(id));

      if (eligiblePlayerIds.length === 0) {
        return NextResponse.json(
          { error: "Auction has no eligible bidders." },
          { status: 409 },
        );
      }

      const passedPlayerIds = new Set(
        normalizePlayerIdArray(gameState.auction_passed_player_ids).filter((id) =>
          eligiblePlayerIds.includes(id),
        ),
      );
      let currentBid =
        typeof gameState.auction_current_bid === "number"
          ? gameState.auction_current_bid
          : 0;
      let currentWinnerId =
        typeof gameState.auction_current_winner_player_id === "string"
          ? gameState.auction_current_winner_player_id
          : null;
      let turnPlayerId =
        typeof gameState.auction_turn_player_id === "string"
          ? gameState.auction_turn_player_id
          : null;
      let turnEndsAt = gameState.auction_turn_ends_at
        ? new Date(gameState.auction_turn_ends_at)
        : null;
      const minIncrement =
        typeof gameState.auction_min_increment === "number"
          ? gameState.auction_min_increment
          : rules.auctionMinIncrement;
      const now = new Date();
      const auctionEvents: Array<{
        event_type: string;
        payload: Record<string, unknown>;
      }> = [];

      const advanceTurn = (fromPlayerId: string | null) =>
        getNextEligibleAuctionPlayerId(
          players,
          fromPlayerId,
          eligiblePlayerIds,
          passedPlayerIds,
        );

      const isValidTurnPlayer = (playerId: string | null) =>
        Boolean(
          playerId &&
            eligiblePlayerIds.includes(playerId) &&
            !passedPlayerIds.has(playerId) &&
            !players.find((player) => player.id === playerId)?.is_eliminated,
        );

      if (!isValidTurnPlayer(turnPlayerId)) {
        const nextTurnId = advanceTurn(turnPlayerId);
        turnPlayerId = nextTurnId;
        turnEndsAt = nextTurnId
          ? new Date(now.getTime() + rules.auctionTurnSeconds * 1000)
          : null;
      }

      while (turnPlayerId && turnEndsAt && now > turnEndsAt) {
        if (!passedPlayerIds.has(turnPlayerId)) {
          passedPlayerIds.add(turnPlayerId);
          auctionEvents.push({
            event_type: "AUCTION_PASS",
            payload: {
              tile_index: auctionTileIndex,
              player_id: turnPlayerId,
              auto: true,
            },
          });
        }

        const nextTurnId = advanceTurn(turnPlayerId);
        turnPlayerId = nextTurnId;
        turnEndsAt = nextTurnId
          ? new Date(now.getTime() + rules.auctionTurnSeconds * 1000)
          : null;
      }

      const allEligiblePassed = eligiblePlayerIds.every((id) =>
        passedPlayerIds.has(id),
      );
      const allOthersPassed =
        Boolean(currentWinnerId) &&
        eligiblePlayerIds
          .filter((id) => id !== currentWinnerId)
          .every((id) => passedPlayerIds.has(id));

      const finalizeAuction = async ({
        winnerId,
        amount,
        skipped,
      }: {
        winnerId: string | null;
        amount: number;
        skipped: boolean;
      }) => {
        const events = [...auctionEvents];
        if (winnerId && !skipped) {
          events.push({
            event_type: "AUCTION_WON",
            payload: {
              tile_index: auctionTileIndex,
              winner_id: winnerId,
              amount,
            },
          });
        } else if (skipped) {
          events.push({
            event_type: "AUCTION_SKIPPED",
            payload: {
              tile_index: auctionTileIndex,
              reason: "NO_BIDS",
            },
          });
        }

        const finalVersion = currentVersion + events.length;
        const patchPayload: Record<string, unknown> = {
          version: finalVersion,
          auction_active: false,
          auction_tile_index: null,
          auction_initiator_player_id: null,
          auction_current_bid: 0,
          auction_current_winner_player_id: null,
          auction_turn_player_id: null,
          auction_turn_ends_at: null,
          auction_eligible_player_ids: [],
          auction_passed_player_ids: [],
          auction_min_increment: rules.auctionMinIncrement,
          turn_phase: "AWAITING_ROLL",
          pending_action: null,
          updated_at: new Date().toISOString(),
        };

        let updatedBalances = gameState.balances ?? {};
        if (winnerId && !skipped) {
          const currentBalance =
            updatedBalances[winnerId] ?? game.starting_cash ?? 0;
          updatedBalances = {
            ...updatedBalances,
            [winnerId]: currentBalance - amount,
          };
          patchPayload.balances = updatedBalances;

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
                tile_index: auctionTileIndex,
                owner_player_id: winnerId,
              }),
            },
          );

          if (!ownershipResponse.ok) {
            const errorText = await ownershipResponse.text();
            return NextResponse.json(
              { error: errorText || "Unable to record auction ownership." },
              { status: 500 },
            );
          }
        }

        const [updatedState] = (await fetchFromSupabaseWithService<
          GameStateRow[]
        >(`game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`, {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify(patchPayload),
        })) ?? [];

        if (!updatedState) {
          return NextResponse.json(
            { error: "Version mismatch." },
            { status: 409 },
          );
        }

        if (events.length > 0) {
          await emitGameEvents(gameId, currentVersion + 1, events, user.id);
        }

        return NextResponse.json({ gameState: updatedState });
      };

      if (currentWinnerId && allOthersPassed) {
        return await finalizeAuction({
          winnerId: currentWinnerId,
          amount: currentBid,
          skipped: false,
        });
      }

      if (!currentWinnerId && allEligiblePassed) {
        return await finalizeAuction({
          winnerId: null,
          amount: 0,
          skipped: true,
        });
      }

      if (turnPlayerId !== currentUserPlayer.id) {
        const nextPassedIds = Array.from(passedPlayerIds);
        const existingPassedIds = normalizePlayerIdArray(
          gameState.auction_passed_player_ids,
        );
        const shouldUpdateState =
          auctionEvents.length > 0 ||
          turnPlayerId !== gameState.auction_turn_player_id ||
          nextPassedIds.length !== existingPassedIds.length;

        if (shouldUpdateState) {
          const finalVersion = currentVersion + auctionEvents.length;
          const [updatedState] = (await fetchFromSupabaseWithService<
            GameStateRow[]
          >(`game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`, {
            method: "PATCH",
            headers: {
              Prefer: "return=representation",
            },
            body: JSON.stringify({
              version: finalVersion,
              auction_turn_player_id: turnPlayerId,
              auction_turn_ends_at: turnEndsAt
                ? turnEndsAt.toISOString()
                : null,
              auction_passed_player_ids: nextPassedIds,
              auction_eligible_player_ids: eligiblePlayerIds,
              auction_current_bid: currentBid,
              auction_current_winner_player_id: currentWinnerId,
              auction_min_increment: minIncrement,
              updated_at: new Date().toISOString(),
            }),
          })) ?? [];

          if (updatedState && auctionEvents.length > 0) {
            await emitGameEvents(
              gameId,
              currentVersion + 1,
              auctionEvents,
              user.id,
            );
          }
        }

        return NextResponse.json(
          { error: "Auction turn advanced. Sync to continue." },
          { status: 409 },
        );
      }

      if (body.action === "AUCTION_BID") {
        const amount = body.amount;
        if (typeof amount !== "number" || Number.isNaN(amount)) {
          return NextResponse.json(
            { error: "Invalid bid amount." },
            { status: 400 },
          );
        }

        const minBid = currentBid === 0 ? 10 : currentBid + minIncrement;
        if (amount < minBid) {
          return NextResponse.json(
            { error: `Bid must be at least $${minBid}.` },
            { status: 409 },
          );
        }

        const balances = gameState.balances ?? {};
        const currentBalance =
          balances[currentUserPlayer.id] ?? game.starting_cash ?? 0;
        if (amount > currentBalance) {
          return NextResponse.json(
            { error: "Insufficient cash for that bid." },
            { status: 409 },
          );
        }

        currentBid = amount;
        currentWinnerId = currentUserPlayer.id;
        auctionEvents.push({
          event_type: "AUCTION_BID",
          payload: {
            tile_index: auctionTileIndex,
            player_id: currentUserPlayer.id,
            amount,
          },
        });

        turnPlayerId = advanceTurn(turnPlayerId);
        turnEndsAt = turnPlayerId
          ? new Date(now.getTime() + rules.auctionTurnSeconds * 1000)
          : null;
      }

      if (body.action === "AUCTION_PASS") {
        passedPlayerIds.add(currentUserPlayer.id);
        auctionEvents.push({
          event_type: "AUCTION_PASS",
          payload: {
            tile_index: auctionTileIndex,
            player_id: currentUserPlayer.id,
          },
        });
        turnPlayerId = advanceTurn(turnPlayerId);
        turnEndsAt = turnPlayerId
          ? new Date(now.getTime() + rules.auctionTurnSeconds * 1000)
          : null;
      }

      const finalAllOthersPassed =
        Boolean(currentWinnerId) &&
        eligiblePlayerIds
          .filter((id) => id !== currentWinnerId)
          .every((id) => passedPlayerIds.has(id));
      const finalAllPassed = eligiblePlayerIds.every((id) =>
        passedPlayerIds.has(id),
      );

      if (currentWinnerId && finalAllOthersPassed) {
        return await finalizeAuction({
          winnerId: currentWinnerId,
          amount: currentBid,
          skipped: false,
        });
      }

      if (!currentWinnerId && finalAllPassed) {
        return await finalizeAuction({
          winnerId: null,
          amount: 0,
          skipped: true,
        });
      }

      const finalVersion = currentVersion + auctionEvents.length;
      const [updatedState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
        `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            version: finalVersion,
            auction_turn_player_id: turnPlayerId,
            auction_turn_ends_at: turnEndsAt ? turnEndsAt.toISOString() : null,
            auction_passed_player_ids: Array.from(passedPlayerIds),
            auction_eligible_player_ids: eligiblePlayerIds,
            auction_current_bid: currentBid,
            auction_current_winner_player_id: currentWinnerId,
            auction_min_increment: minIncrement,
            turn_phase: "AUCTION",
            pending_action: null,
            updated_at: new Date().toISOString(),
          }),
        },
      )) ?? [];

      if (!updatedState) {
        return NextResponse.json(
          { error: "Version mismatch." },
          { status: 409 },
        );
      }

      if (auctionEvents.length > 0) {
        await emitGameEvents(
          gameId,
          currentVersion + 1,
          auctionEvents,
          user.id,
        );
      }

      return NextResponse.json({ gameState: updatedState });
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
      let bankruptcyCandidate:
        | { reason: string; cashBefore: number; cashAfter: number }
        | null = null;
      let goSalaryAwarded = false;
      let nextChanceIndex = gameState?.chance_index ?? 0;
      let nextCommunityIndex = gameState?.community_index ?? 0;
      let nextGetOutOfJailFreeCount =
        currentPlayer.get_out_of_jail_free_count ?? 0;
      let getOutOfJailFreeCountChanged = false;

      if (isDouble && nextDoublesCount >= 3) {
        const jailTile =
          boardTiles.find((tile) => tile.type === "JAIL") ?? {
            index: 10,
            tile_id: "jail",
            type: "JAIL",
            name: "Jail",
          };
        const nextPlayer = getNextActivePlayer(
          players,
          gameState.current_player_id,
        );

        if (!nextPlayer) {
          return NextResponse.json(
            { error: "No active players remaining." },
            { status: 409 },
          );
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
        const balances = gameState.balances ?? {};
        let updatedBalances = balances;
        let balancesChanged = false;

        const loanResult = await applyLoanPaymentsForPlayer({
          gameId,
          player: nextPlayer,
          balances: updatedBalances,
          startingCash: game.starting_cash ?? 0,
        });
        updatedBalances = loanResult.balances;
        balancesChanged = balancesChanged || loanResult.balancesChanged;
        events.push(...loanResult.events);

        if (loanResult.bankruptcyCandidate) {
          const bankruptcyResult = await resolveBankruptcyIfNeeded({
            gameId,
            gameState,
            players,
            player: nextPlayer,
            updatedBalances,
            cashBefore: loanResult.bankruptcyCandidate.cashBefore,
            cashAfter: loanResult.bankruptcyCandidate.cashAfter,
            reason: loanResult.bankruptcyCandidate.reason,
            events,
            currentVersion,
            userId: user.id,
            playerPosition: nextPlayer.position ?? null,
          });

          if (bankruptcyResult.handled) {
            if (bankruptcyResult.error) {
              return NextResponse.json(
                { error: bankruptcyResult.error },
                { status: 409 },
              );
            }
            return NextResponse.json({ gameState: bankruptcyResult.updatedState });
          }
        }

        const finalVersion = currentVersion + events.length;

        const [updatedState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
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
              ...(balancesChanged ? { balances: updatedBalances } : {}),
              turn_phase: nextPlayer.is_in_jail
                ? "AWAITING_JAIL_DECISION"
                : "AWAITING_ROLL",
              updated_at: new Date().toISOString(),
              }),
          },
        )) ?? [];

        if (!updatedState) {
          return NextResponse.json(
            { error: "Version mismatch." },
            { status: 409 },
          );
        }

        const [updatedPlayer] = (await fetchFromSupabaseWithService<PlayerRow[]>(
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
        )) ?? [];

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
          const nextBalance =
            card.kind === "PAY" ? currentBalance - amount : currentBalance + amount;
          updatedBalances = {
            ...updatedBalances,
            [currentPlayer.id]: nextBalance,
          };
          if (amount !== 0) {
            balancesChanged = true;
          }
          if (
            card.kind === "PAY" &&
            nextBalance < 0 &&
            !bankruptcyCandidate
          ) {
            bankruptcyCandidate = {
              reason: "CARD_PAY",
              cashBefore: currentBalance,
              cashAfter: nextBalance,
            };
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

        if (card.kind === "GET_OUT_OF_JAIL_FREE") {
          nextGetOutOfJailFreeCount += 1;
          getOutOfJailFreeCountChanged = true;
          events.push({
            event_type: "CARD_GET_OUT_OF_JAIL_FREE_RECEIVED",
            payload: {
              player_id: currentPlayer.id,
              player_name: currentPlayer.display_name,
              card_id: card.id,
              card_title: card.title,
              card_kind: card.kind,
              total_cards: nextGetOutOfJailFreeCount,
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
      const isCollateralized = Boolean(ownership?.collateral_loan_id);
      const rentCalculation = isCollateralized
        ? { amount: 0, meta: null }
        : calculateRent({
            tile: activeLandingTile,
            ownerId: rentOwnerId,
            currentPlayerId: currentPlayer.id,
            boardTiles,
            ownershipByTile,
            // TODO: allow card-triggered utility rolls to override this dice total.
            diceTotal: rollTotal,
          });
      const rentAmount = rentCalculation.amount;
      let shouldPayRent = rentAmount > 0 && Boolean(rentOwnerId);
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

      if (
        isCollateralized &&
        rentOwnerId &&
        rentOwnerId !== currentPlayer.id
      ) {
        shouldPayRent = false;
        events.push({
          event_type: "RENT_SKIPPED_COLLATERAL",
          payload: {
            tile_index: activeLandingTile.index,
            tile_id: activeLandingTile.tile_id,
            owner_player_id: rentOwnerId,
            reason: "collateralized",
          },
        });
      }

      if (shouldPayRent && rentOwnerId && rentOwnerId !== currentPlayer.id) {
        const payerBalance =
          updatedBalances[currentPlayer.id] ?? game.starting_cash ?? 0;
        const ownerBalance =
          updatedBalances[rentOwnerId] ?? game.starting_cash ?? 0;
        const nextBalance = payerBalance - rentAmount;
        updatedBalances = {
          ...updatedBalances,
          [currentPlayer.id]: nextBalance,
          [rentOwnerId]: ownerBalance + rentAmount,
        };
        balancesChanged = true;
        if (nextBalance < 0 && !bankruptcyCandidate) {
          bankruptcyCandidate = {
            reason: "PAY_RENT",
            cashBefore: payerBalance,
            cashAfter: nextBalance,
          };
        }
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
        const nextBalance = payerBalance - taxAmount;
        updatedBalances = {
          ...updatedBalances,
          [currentPlayer.id]: nextBalance,
        };
        balancesChanged = true;
        if (nextBalance < 0 && !bankruptcyCandidate) {
          bankruptcyCandidate = {
            reason: "PAY_TAX",
            cashBefore: payerBalance,
            cashAfter: nextBalance,
          };
        }
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

      const isBankruptcyPending = Boolean(bankruptcyCandidate);
      const pendingPurchaseAction =
        !isBankruptcyPending &&
        isUnownedOwnableTile &&
        !(shouldSendToJail && jailTile)
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
        isDouble &&
        !pendingPurchaseAction &&
        !isBankruptcyPending &&
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

      if (bankruptcyCandidate) {
        const bankruptcyResult = await resolveBankruptcyIfNeeded({
          gameId,
          gameState,
          players,
          player: currentPlayer,
          updatedBalances,
          cashBefore: bankruptcyCandidate.cashBefore,
          cashAfter: bankruptcyCandidate.cashAfter,
          reason: bankruptcyCandidate.reason,
          events,
          currentVersion,
          userId: user.id,
          playerPosition: finalPosition,
        });

        if (bankruptcyResult.handled) {
          if (bankruptcyResult.error) {
            return NextResponse.json(
              { error: bankruptcyResult.error },
              { status: 409 },
            );
          }
          return NextResponse.json({ gameState: bankruptcyResult.updatedState });
        }
      }

      const finalVersion = currentVersion + events.length;
      const [updatedState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
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
      )) ?? [];

      if (!updatedState) {
        return NextResponse.json(
          { error: "Version mismatch." },
          { status: 409 },
        );
      }

      const [updatedPlayer] = (await fetchFromSupabaseWithService<PlayerRow[]>(
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
            ...(getOutOfJailFreeCountChanged
              ? { get_out_of_jail_free_count: nextGetOutOfJailFreeCount }
              : {}),
          }),
        },
      )) ?? [];

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

      const boardPack = getBoardPackById(game.board_pack_id);
      const boardTiles = boardPack?.tiles ?? [];
      const landingTile = boardTiles.find(
        (tile) => tile.index === body.tileIndex,
      );

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
      if (ownershipByTile[body.tileIndex]) {
        return NextResponse.json(
          { error: "Property already owned." },
          { status: 409 },
        );
      }

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
      ];

      if (rules.auctionEnabled) {
        const activePlayers = players.filter((player) => !player.is_eliminated);
        const eligiblePlayers = rules.auctionAllowInitiatorToBid
          ? activePlayers
          : activePlayers.filter((player) => player.id !== currentPlayer.id);
        const eligibleIds = eligiblePlayers.map((player) => player.id);

        if (eligibleIds.length <= 1) {
          const nextPlayer = getNextActivePlayer(
            players,
            gameState.current_player_id,
          );

          if (!nextPlayer) {
            return NextResponse.json(
              { error: "No active players remaining." },
              { status: 409 },
            );
          }

          events.push({
            event_type: "AUCTION_SKIPPED",
            payload: {
              tile_index: body.tileIndex,
            },
          });
          events.push({
            event_type: "END_TURN",
            payload: {
              from_player_id: currentPlayer.id,
              from_player_name: currentPlayer.display_name,
              to_player_id: nextPlayer.id,
              to_player_name: nextPlayer.display_name,
            },
          });

          const finalVersion = currentVersion + events.length;
          const [updatedState] =
            (await fetchFromSupabaseWithService<GameStateRow[]>(
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
            )) ?? [];

          if (!updatedState) {
            return NextResponse.json(
              { error: "Version mismatch." },
              { status: 409 },
            );
          }

          await emitGameEvents(gameId, currentVersion + 1, events, user.id);

          return NextResponse.json({ gameState: updatedState });
        }

        const nextTurnPlayerId = getNextEligibleAuctionPlayerId(
          players,
          currentPlayer.id,
          eligibleIds,
          new Set(),
        );

        if (!nextTurnPlayerId) {
          return NextResponse.json(
            { error: "Unable to start auction." },
            { status: 409 },
          );
        }

        events.push({
          event_type: "AUCTION_STARTED",
          payload: {
            tile_index: body.tileIndex,
            min_increment: rules.auctionMinIncrement,
          },
        });

        const finalVersion = currentVersion + events.length;
        const [updatedState] =
          (await fetchFromSupabaseWithService<GameStateRow[]>(
            `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
            {
              method: "PATCH",
              headers: {
                Prefer: "return=representation",
              },
              body: JSON.stringify({
                version: finalVersion,
                pending_action: null,
                turn_phase: "AUCTION",
                auction_active: true,
                auction_tile_index: body.tileIndex,
                auction_initiator_player_id: currentPlayer.id,
                auction_current_bid: 0,
                auction_current_winner_player_id: null,
                auction_turn_player_id: nextTurnPlayerId,
                auction_turn_ends_at: new Date(
                  Date.now() + rules.auctionTurnSeconds * 1000,
                ).toISOString(),
                auction_eligible_player_ids: eligibleIds,
                auction_passed_player_ids: [],
                auction_min_increment: rules.auctionMinIncrement,
                updated_at: new Date().toISOString(),
              }),
            },
          )) ?? [];

        if (!updatedState) {
          return NextResponse.json(
            { error: "Version mismatch." },
            { status: 409 },
          );
        }

        await emitGameEvents(gameId, currentVersion + 1, events, user.id);

        return NextResponse.json({ gameState: updatedState });
      }

      const nextPlayer = getNextActivePlayer(
        players,
        gameState.current_player_id,
      );

      if (!nextPlayer) {
        return NextResponse.json(
          { error: "No active players remaining." },
          { status: 409 },
        );
      }

      events.push({
        event_type: "END_TURN",
        payload: {
          from_player_id: currentPlayer.id,
          from_player_name: currentPlayer.display_name,
          to_player_id: nextPlayer.id,
          to_player_name: nextPlayer.display_name,
        },
      });
      const finalVersion = currentVersion + events.length;

      const [updatedState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
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
      )) ?? [];

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

      const [updatedState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
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
      )) ?? [];

      if (!updatedState) {
        return NextResponse.json(
          { error: "Version mismatch." },
          { status: 409 },
        );
      }

      await emitGameEvents(gameId, currentVersion + 1, events, user.id);

      return NextResponse.json({ gameState: updatedState });
    }

    if (body.action === "TAKE_COLLATERAL_LOAN") {
      if (!rules.loanCollateralEnabled) {
        return NextResponse.json(
          { error: "Collateral loans are disabled." },
          { status: 409 },
        );
      }

      if (!Number.isInteger(body.tileIndex)) {
        return NextResponse.json(
          { error: "Missing collateral tile." },
          { status: 400 },
        );
      }

      const tileIndex = body.tileIndex;
      const boardPack = getBoardPackById(game.board_pack_id);
      const tile = boardPack?.tiles?.find((entry) => entry.index === tileIndex);

      if (!tile) {
        return NextResponse.json(
          { error: "Collateral tile not found." },
          { status: 404 },
        );
      }

      if (!OWNABLE_TILE_TYPES.has(tile.type)) {
        return NextResponse.json(
          { error: "Tile cannot be collateralized." },
          { status: 409 },
        );
      }

      const ownershipByTile = await loadOwnershipByTile(gameId);
      const ownership = ownershipByTile[tileIndex];

      if (!ownership || ownership.owner_player_id !== currentPlayer.id) {
        return NextResponse.json(
          { error: "You do not own this property." },
          { status: 409 },
        );
      }

      if (ownership.collateral_loan_id) {
        return NextResponse.json(
          { error: "Property already collateralized." },
          { status: 409 },
        );
      }

      const purchasePrice = tile.price ?? 0;
      if (purchasePrice <= 0) {
        return NextResponse.json(
          { error: "Collateral value unavailable for this tile." },
          { status: 409 },
        );
      }

      const rpcResponse = await fetch(
        `${supabaseUrl}/rest/v1/rpc/take_collateral_loan`,
        {
          method: "POST",
          headers: bankHeaders,
          body: JSON.stringify({
            game_id: gameId,
            player_id: currentPlayer.id,
            tile_index: tileIndex,
            expected_version: currentVersion,
            tile_price: purchasePrice,
            tile_type: tile.type,
            tile_id: tile.tile_id,
            actor_user_id: user.id,
          }),
        },
      );

      if (!rpcResponse.ok) {
        const errorText = await rpcResponse.text();
        let errorMessage = errorText;
        try {
          const parsed = JSON.parse(errorText) as { message?: string };
          if (parsed?.message) {
            errorMessage = parsed.message;
          }
        } catch {
          // noop
        }

        if (errorMessage === "VERSION_MISMATCH") {
          return NextResponse.json(
            { error: "Version mismatch." },
            { status: 409 },
          );
        }
        if (errorMessage === "ALREADY_COLLATERALIZED") {
          return NextResponse.json(
            { error: "Already collateralized." },
            { status: 409 },
          );
        }
        if (errorMessage === "NOT_OWNER") {
          return NextResponse.json(
            { error: "You do not own this property." },
            { status: 409 },
          );
        }
        if (errorMessage === "COLLATERAL_DISABLED") {
          return NextResponse.json(
            { error: "Collateral loans are disabled." },
            { status: 409 },
          );
        }
        if (errorMessage === "TILE_NOT_OWNABLE") {
          return NextResponse.json(
            { error: "Tile cannot be collateralized." },
            { status: 409 },
          );
        }
        if (errorMessage === "INVALID_PRICE") {
          return NextResponse.json(
            { error: "Collateral value unavailable for this tile." },
            { status: 409 },
          );
        }
        if (errorMessage === "PROPERTY_NOT_OWNED") {
          return NextResponse.json(
            { error: "You do not own this property." },
            { status: 409 },
          );
        }

        console.error("[Bank][CollateralLoan] RPC failed", {
          status: rpcResponse.status,
          error: errorText,
        });
        return NextResponse.json(
          { error: "Unable to create collateral loan." },
          { status: 500 },
        );
      }

      const [rpcResult] = (await rpcResponse.json()) as Array<{
        game_state: GameStateRow;
        property_ownership: OwnershipRow;
        player_loan: PlayerLoanRow;
      }>;

      if (!rpcResult?.game_state || !rpcResult?.property_ownership) {
        return NextResponse.json(
          { error: "Unable to create collateral loan." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        gameState: rpcResult.game_state,
        ownership: rpcResult.property_ownership,
        loan: rpcResult.player_loan ?? null,
      });
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
        const nextPlayer = getNextActivePlayer(
          players,
          gameState.current_player_id,
        );

        if (!nextPlayer) {
          return NextResponse.json(
            { error: "No active players remaining." },
            { status: 409 },
          );
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
        const balances = gameState.balances ?? {};
        let updatedBalances = balances;
        let balancesChanged = false;

        const loanResult = await applyLoanPaymentsForPlayer({
          gameId,
          player: nextPlayer,
          balances: updatedBalances,
          startingCash: game.starting_cash ?? 0,
        });
        updatedBalances = loanResult.balances;
        balancesChanged = balancesChanged || loanResult.balancesChanged;
        events.push(...loanResult.events);

        if (loanResult.bankruptcyCandidate) {
          const bankruptcyResult = await resolveBankruptcyIfNeeded({
            gameId,
            gameState,
            players,
            player: nextPlayer,
            updatedBalances,
            cashBefore: loanResult.bankruptcyCandidate.cashBefore,
            cashAfter: loanResult.bankruptcyCandidate.cashAfter,
            reason: loanResult.bankruptcyCandidate.reason,
            events,
            currentVersion,
            userId: user.id,
            playerPosition: nextPlayer.position ?? null,
          });

          if (bankruptcyResult.handled) {
            if (bankruptcyResult.error) {
              return NextResponse.json(
                { error: bankruptcyResult.error },
                { status: 409 },
              );
            }
            return NextResponse.json({ gameState: bankruptcyResult.updatedState });
          }
        }

        const finalVersion = currentVersion + events.length;

        const [updatedState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
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
              ...(balancesChanged ? { balances: updatedBalances } : {}),
              turn_phase: nextPlayer.is_in_jail
                ? "AWAITING_JAIL_DECISION"
                : "AWAITING_ROLL",
              updated_at: new Date().toISOString(),
            }),
          },
        )) ?? [];

        if (!updatedState) {
          return NextResponse.json(
            { error: "Version mismatch." },
            { status: 409 },
          );
        }

        const [updatedPlayer] = (await fetchFromSupabaseWithService<PlayerRow[]>(
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
        )) ?? [];

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
      let bankruptcyCandidate:
        | { reason: string; cashBefore: number; cashAfter: number }
        | null = null;
      let goSalaryAwarded = false;
      if (forcedFine) {
        const currentBalance =
          updatedBalances[currentPlayer.id] ?? game.starting_cash ?? 0;
        const nextBalance = currentBalance - JAIL_FINE_AMOUNT;
        updatedBalances = {
          ...updatedBalances,
          [currentPlayer.id]: nextBalance,
        };
        balancesChanged = true;
        if (nextBalance < 0) {
          bankruptcyCandidate = {
            reason: "JAIL_PAY_FINE",
            cashBefore: currentBalance,
            cashAfter: nextBalance,
          };
        }
      }
      let nextChanceIndex = gameState?.chance_index ?? 0;
      let nextCommunityIndex = gameState?.community_index ?? 0;
      let nextGetOutOfJailFreeCount =
        currentPlayer.get_out_of_jail_free_count ?? 0;
      let getOutOfJailFreeCountChanged = false;

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
          const nextBalance =
            card.kind === "PAY" ? currentBalance - amount : currentBalance + amount;
          updatedBalances = {
            ...updatedBalances,
            [currentPlayer.id]: nextBalance,
          };
          if (amount !== 0) {
            balancesChanged = true;
          }
          if (
            card.kind === "PAY" &&
            nextBalance < 0 &&
            !bankruptcyCandidate
          ) {
            bankruptcyCandidate = {
              reason: "CARD_PAY",
              cashBefore: currentBalance,
              cashAfter: nextBalance,
            };
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

        if (card.kind === "GET_OUT_OF_JAIL_FREE") {
          nextGetOutOfJailFreeCount += 1;
          getOutOfJailFreeCountChanged = true;
          events.push({
            event_type: "CARD_GET_OUT_OF_JAIL_FREE_RECEIVED",
            payload: {
              player_id: currentPlayer.id,
              player_name: currentPlayer.display_name,
              card_id: card.id,
              card_title: card.title,
              card_kind: card.kind,
              total_cards: nextGetOutOfJailFreeCount,
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
      const isCollateralized = Boolean(ownership?.collateral_loan_id);
      const rentCalculation = isCollateralized
        ? { amount: 0, meta: null }
        : calculateRent({
            tile: activeLandingTile,
            ownerId: rentOwnerId,
            currentPlayerId: currentPlayer.id,
            boardTiles,
            ownershipByTile,
            // TODO: allow card-triggered utility rolls to override this dice total.
            diceTotal: rollTotal,
          });
      const rentAmount = rentCalculation.amount;
      let shouldPayRent = rentAmount > 0 && Boolean(rentOwnerId);
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

      if (
        isCollateralized &&
        rentOwnerId &&
        rentOwnerId !== currentPlayer.id
      ) {
        shouldPayRent = false;
        events.push({
          event_type: "RENT_SKIPPED_COLLATERAL",
          payload: {
            tile_index: activeLandingTile.index,
            tile_id: activeLandingTile.tile_id,
            owner_player_id: rentOwnerId,
            reason: "collateralized",
          },
        });
      }

      if (shouldPayRent && rentOwnerId && rentOwnerId !== currentPlayer.id) {
        const payerBalance =
          updatedBalances[currentPlayer.id] ?? game.starting_cash ?? 0;
        const ownerBalance =
          updatedBalances[rentOwnerId] ?? game.starting_cash ?? 0;
        const nextBalance = payerBalance - rentAmount;
        updatedBalances = {
          ...updatedBalances,
          [currentPlayer.id]: nextBalance,
          [rentOwnerId]: ownerBalance + rentAmount,
        };
        balancesChanged = true;
        if (nextBalance < 0 && !bankruptcyCandidate) {
          bankruptcyCandidate = {
            reason: "PAY_RENT",
            cashBefore: payerBalance,
            cashAfter: nextBalance,
          };
        }
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
        const nextBalance = payerBalance - taxAmount;
        updatedBalances = {
          ...updatedBalances,
          [currentPlayer.id]: nextBalance,
        };
        balancesChanged = true;
        if (nextBalance < 0 && !bankruptcyCandidate) {
          bankruptcyCandidate = {
            reason: "PAY_TAX",
            cashBefore: payerBalance,
            cashAfter: nextBalance,
          };
        }
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

      const isBankruptcyPending = Boolean(bankruptcyCandidate);
      const pendingPurchaseAction =
        !isBankruptcyPending &&
        isUnownedOwnableTile &&
        !(shouldSendToJail && jailTile)
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
        !isBankruptcyPending &&
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

      if (bankruptcyCandidate) {
        const bankruptcyResult = await resolveBankruptcyIfNeeded({
          gameId,
          gameState,
          players,
          player: currentPlayer,
          updatedBalances,
          cashBefore: bankruptcyCandidate.cashBefore,
          cashAfter: bankruptcyCandidate.cashAfter,
          reason: bankruptcyCandidate.reason,
          events,
          currentVersion,
          userId: user.id,
          playerPosition: finalPosition,
        });

        if (bankruptcyResult.handled) {
          if (bankruptcyResult.error) {
            return NextResponse.json(
              { error: bankruptcyResult.error },
              { status: 409 },
            );
          }
          return NextResponse.json({ gameState: bankruptcyResult.updatedState });
        }
      }

      const finalVersion = currentVersion + events.length;
      const [updatedState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
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
      )) ?? [];

      if (!updatedState) {
        return NextResponse.json(
          { error: "Version mismatch." },
          { status: 409 },
        );
      }

      const [updatedPlayer] = (await fetchFromSupabaseWithService<PlayerRow[]>(
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
            ...(getOutOfJailFreeCountChanged
              ? { get_out_of_jail_free_count: nextGetOutOfJailFreeCount }
              : {}),
          }),
        },
      )) ?? [];

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
      const nextBalance = currentBalance - JAIL_FINE_AMOUNT;
      const updatedBalances = {
        ...balances,
        [currentPlayer.id]: nextBalance,
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
      if (nextBalance < 0) {
        const bankruptcyResult = await resolveBankruptcyIfNeeded({
          gameId,
          gameState,
          players,
          player: currentPlayer,
          updatedBalances,
          cashBefore: currentBalance,
          cashAfter: nextBalance,
          reason: "JAIL_PAY_FINE",
          events,
          currentVersion,
          userId: user.id,
          playerPosition: currentPlayer.position ?? null,
        });

        if (bankruptcyResult.handled) {
          if (bankruptcyResult.error) {
            return NextResponse.json(
              { error: bankruptcyResult.error },
              { status: 409 },
            );
          }
          return NextResponse.json({ gameState: bankruptcyResult.updatedState });
        }
      }
      const finalVersion = currentVersion + events.length;

      const [updatedState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
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
      )) ?? [];

      if (!updatedState) {
        return NextResponse.json(
          { error: "Version mismatch." },
          { status: 409 },
        );
      }

      const [updatedPlayer] = (await fetchFromSupabaseWithService<PlayerRow[]>(
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
      )) ?? [];

      if (!updatedPlayer) {
        return NextResponse.json(
          { error: "Unable to release player from jail." },
          { status: 500 },
        );
      }

      await emitGameEvents(gameId, currentVersion + 1, events, user.id);

      return NextResponse.json({ gameState: updatedState });
    }

    if (body.action === "USE_GET_OUT_OF_JAIL_FREE") {
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

      const currentCount = currentPlayer.get_out_of_jail_free_count ?? 0;
      if (currentCount <= 0) {
        return NextResponse.json(
          { error: "No Get Out of Jail Free cards available." },
          { status: 409 },
        );
      }

      const nextCount = Math.max(0, currentCount - 1);
      const events: Array<{
        event_type: string;
        payload: Record<string, unknown>;
      }> = [
        {
          event_type: "CARD_GET_OUT_OF_JAIL_FREE_USED",
          payload: {
            player_id: currentPlayer.id,
            player_name: currentPlayer.display_name,
            remaining_cards: nextCount,
          },
        },
      ];

      const finalVersion = currentVersion + events.length;

      const [updatedState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
        `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            version: finalVersion,
            turn_phase: "AWAITING_ROLL",
            updated_at: new Date().toISOString(),
          }),
        },
      )) ?? [];

      if (!updatedState) {
        return NextResponse.json(
          { error: "Version mismatch." },
          { status: 409 },
        );
      }

      const [updatedPlayer] = (await fetchFromSupabaseWithService<PlayerRow[]>(
        `players?id=eq.${currentPlayer.id}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            is_in_jail: false,
            jail_turns_remaining: 0,
            get_out_of_jail_free_count: nextCount,
          }),
        },
      )) ?? [];

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

      const nextPlayer = getNextActivePlayer(
        players,
        gameState.current_player_id,
      );

      if (!nextPlayer) {
        return NextResponse.json(
          { error: "No active players remaining." },
          { status: 409 },
        );
      }

      const balances = gameState.balances ?? {};
      let updatedBalances = balances;
      let balancesChanged = false;
      const events: Array<{
        event_type: string;
        payload: Record<string, unknown>;
      }> = [
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

      const loanResult = await applyLoanPaymentsForPlayer({
        gameId,
        player: nextPlayer,
        balances: updatedBalances,
        startingCash: game.starting_cash ?? 0,
      });
      updatedBalances = loanResult.balances;
      balancesChanged = balancesChanged || loanResult.balancesChanged;
      events.push(...loanResult.events);

      if (loanResult.bankruptcyCandidate) {
        const bankruptcyResult = await resolveBankruptcyIfNeeded({
          gameId,
          gameState,
          players,
          player: nextPlayer,
          updatedBalances,
          cashBefore: loanResult.bankruptcyCandidate.cashBefore,
          cashAfter: loanResult.bankruptcyCandidate.cashAfter,
          reason: loanResult.bankruptcyCandidate.reason,
          events,
          currentVersion,
          userId: user.id,
          playerPosition: nextPlayer.position ?? null,
        });

        if (bankruptcyResult.handled) {
          if (bankruptcyResult.error) {
            return NextResponse.json(
              { error: bankruptcyResult.error },
              { status: 409 },
            );
          }
          return NextResponse.json({ gameState: bankruptcyResult.updatedState });
        }
      }

      const finalVersion = currentVersion + events.length;
      const [updatedState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
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
            ...(balancesChanged ? { balances: updatedBalances } : {}),
            turn_phase: nextPlayer.is_in_jail
              ? "AWAITING_JAIL_DECISION"
              : "AWAITING_ROLL",
            updated_at: new Date().toISOString(),
          }),
        },
      )) ?? [];

      if (!updatedState) {
        return NextResponse.json(
          { error: "Supabase returned no data for END_TURN game_state update." },
          { status: 500 },
        );
      }

      await emitGameEvents(gameId, currentVersion + 1, events, user.id);

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
