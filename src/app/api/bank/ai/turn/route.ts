import { NextResponse } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

const supabaseUrl = (process.env.SUPABASE_URL ?? SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY ?? SUPABASE_ANON_KEY ?? "").trim();
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

const bankHeaders = {
  apikey: supabaseServiceRoleKey,
  Authorization: `Bearer ${supabaseServiceRoleKey}`,
  "Content-Type": "application/json",
};

const isConfigured = () => Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey);

type AiDifficulty = "easy" | "medium" | "hard";

type PlayerRow = {
  id: string;
  user_id: string;
  display_name: string | null;
  created_at: string | null;
  position: number | null;
  is_in_jail: boolean;
  jail_turns_remaining: number;
  get_out_of_jail_free_count: number;
  tax_exemption_pass_count: number;
  is_eliminated: boolean;
  is_ai: boolean;
  ai_difficulty: AiDifficulty | null;
};

type GameRow = {
  id: string;
  status: string | null;
};

type GameStateRow = {
  game_id: string;
  version: number;
  current_player_id: string | null;
  balances: Record<string, number> | null;
  last_roll: number | null;
  doubles_count: number | null;
  turn_phase: string | null;
  pending_action: Record<string, unknown> | null;
  pending_card_active: boolean | null;
  pending_card_drawn_by_player_id: string | null;
  auction_active: boolean | null;
  auction_turn_player_id: string | null;
};

type AiAction =
  | { action: "ROLL_DICE" }
  | { action: "END_TURN" }
  | { action: "CONFIRM_PENDING_CARD" }
  | { action: "CONFIRM_MACRO_EVENT" }
  | { action: "CONFIRM_GO_TO_JAIL" }
  | { action: "CONFIRM_INCOME_TAX" }
  | { action: "CONFIRM_SUPER_TAX" }
  | { action: "USE_TAX_EXEMPTION_PASS" }
  | { action: "JAIL_PAY_FINE" }
  | { action: "JAIL_ROLL_FOR_DOUBLES" }
  | { action: "USE_GET_OUT_OF_JAIL_FREE" }
  | { action: "BUY_PROPERTY"; tileIndex: number }
  | { action: "DECLINE_PROPERTY"; tileIndex: number }
  | { action: "AUCTION_PASS" }
  | { action: "CONFIRM_INSOLVENCY_PAYMENT" }
  | { action: "DECLARE_BANKRUPTCY" };

const parseSupabaseResponse = async <T>(response: Response): Promise<T | null> => {
  if (response.status === 204) return null;
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(bodyText || "Supabase request failed.");
  }
  return bodyText ? (JSON.parse(bodyText) as T) : null;
};

const fetchFromSupabaseWithService = async <T>(path: string, options: RequestInit): Promise<T | null> => {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...bankHeaders,
      ...(options.headers ?? {}),
    },
  });
  return parseSupabaseResponse<T>(response);
};

const loadSnapshot = async (gameId: string) => {
  const [game] = (await fetchFromSupabaseWithService<GameRow[]>(
    `games?select=id,status&id=eq.${gameId}&limit=1`,
    { method: "GET" },
  )) ?? [];
  const players = (await fetchFromSupabaseWithService<PlayerRow[]>(
    `players?select=id,user_id,display_name,created_at,position,is_in_jail,jail_turns_remaining,get_out_of_jail_free_count,tax_exemption_pass_count,is_eliminated,is_ai,ai_difficulty&game_id=eq.${gameId}&order=created_at.asc`,
    { method: "GET" },
  )) ?? [];
  const [gameState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
    `game_state?select=game_id,version,current_player_id,balances,last_roll,doubles_count,turn_phase,pending_action,pending_card_active,pending_card_drawn_by_player_id,auction_active,auction_turn_player_id&game_id=eq.${gameId}&limit=1`,
    { method: "GET" },
  )) ?? [];
  return { game: game ?? null, players, gameState: gameState ?? null };
};

const acquireLock = async ({
  gameId,
  playerId,
  stateVersion,
  lockToken,
}: {
  gameId: string;
  playerId: string;
  stateVersion: number;
  lockToken: string;
}) => {
  const rows = await fetchFromSupabaseWithService<boolean | boolean[]>("rpc/acquire_ai_turn_lock", {
    method: "POST",
    body: JSON.stringify({
      p_game_id: gameId,
      p_player_id: playerId,
      p_state_version: stateVersion,
      p_lock_token: lockToken,
      p_lock_ttl_seconds: 90,
    }),
  });
  return Array.isArray(rows) ? rows[0] === true : rows === true;
};

const releaseLock = async (gameId: string, lockToken: string) => {
  await fetchFromSupabaseWithService("rpc/release_ai_turn_lock", {
    method: "POST",
    body: JSON.stringify({ p_game_id: gameId, p_lock_token: lockToken }),
  });
};

const pendingType = (state: GameStateRow) =>
  state.pending_action && typeof state.pending_action.type === "string"
    ? state.pending_action.type
    : null;

const pendingPlayerId = (state: GameStateRow) =>
  state.pending_action && typeof state.pending_action.player_id === "string"
    ? state.pending_action.player_id
    : null;

const chooseEasyAction = ({
  state,
  player,
}: {
  state: GameStateRow;
  player: PlayerRow;
}): AiAction | null => {
  if (state.auction_active) {
    return state.auction_turn_player_id === player.id ? { action: "AUCTION_PASS" } : null;
  }

  if (state.pending_card_active) {
    return state.pending_card_drawn_by_player_id === player.id
      ? { action: "CONFIRM_PENDING_CARD" }
      : null;
  }

  const type = pendingType(state);
  const actorId = pendingPlayerId(state);
  if (type === "MACRO_EVENT") return { action: "CONFIRM_MACRO_EVENT" };
  if (type === "GO_TO_JAIL_CONFIRM" && actorId === player.id) return { action: "CONFIRM_GO_TO_JAIL" };
  if ((type === "INCOME_TAX_CONFIRM" || type === "SUPER_TAX_CONFIRM") && actorId === player.id) {
    const passCount =
      typeof state.pending_action?.tax_exemption_pass_count === "number"
        ? state.pending_action.tax_exemption_pass_count
        : player.tax_exemption_pass_count;
    if (passCount > 0) return { action: "USE_TAX_EXEMPTION_PASS" };
    return { action: type === "INCOME_TAX_CONFIRM" ? "CONFIRM_INCOME_TAX" : "CONFIRM_SUPER_TAX" };
  }
  if (type === "BUY_PROPERTY" && actorId === player.id) {
    const tileIndex = typeof state.pending_action?.tile_index === "number" ? state.pending_action.tile_index : null;
    const price = typeof state.pending_action?.price === "number" ? state.pending_action.price : Number.POSITIVE_INFINITY;
    const cash = state.balances?.[player.id] ?? 0;
    if (tileIndex === null) return null;
    return cash >= price ? { action: "BUY_PROPERTY", tileIndex } : { action: "DECLINE_PROPERTY", tileIndex };
  }
  if (type === "INSOLVENCY_RECOVERY" && actorId === player.id) {
    const amountDue = typeof state.pending_action?.amount_due === "number" ? state.pending_action.amount_due : Number.POSITIVE_INFINITY;
    const cash = state.balances?.[player.id] ?? 0;
    return cash >= amountDue ? { action: "CONFIRM_INSOLVENCY_PAYMENT" } : { action: "DECLARE_BANKRUPTCY" };
  }
  if (type) return null;

  if (state.turn_phase === "AWAITING_JAIL_DECISION") {
    const cash = state.balances?.[player.id] ?? 0;
    if (player.get_out_of_jail_free_count > 0) return { action: "USE_GET_OUT_OF_JAIL_FREE" };
    if (cash >= 50) return { action: "JAIL_PAY_FINE" };
    return { action: "JAIL_ROLL_FOR_DOUBLES" };
  }

  if (state.turn_phase === "AWAITING_ROLL" && (state.last_roll === null || (state.doubles_count ?? 0) > 0)) {
    return { action: "ROLL_DICE" };
  }

  if (state.last_roll !== null) {
    return { action: "END_TURN" };
  }

  return null;
};

export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as { gameId?: unknown } | null;
  const gameId = typeof body?.gameId === "string" ? body.gameId : null;
  if (!gameId) {
    return NextResponse.json({ error: "Missing gameId." }, { status: 400 });
  }

  const initial = await loadSnapshot(gameId);
  if (initial.game?.status !== "in_progress" || !initial.gameState) {
    return NextResponse.json({ ok: true, stopped: "not_in_progress" });
  }
  const initialAiPlayer = initial.players.find(
    (player) => player.id === initial.gameState?.current_player_id && player.is_ai,
  );
  if (!initialAiPlayer || initialAiPlayer.is_eliminated) {
    return NextResponse.json({ ok: true, stopped: "not_ai_turn" });
  }
  if (initialAiPlayer.ai_difficulty && initialAiPlayer.ai_difficulty !== "easy") {
    return NextResponse.json({ ok: true, stopped: "difficulty_unavailable" });
  }

  const lockToken = crypto.randomUUID();
  const locked = await acquireLock({
    gameId,
    playerId: initialAiPlayer.id,
    stateVersion: initial.gameState.version,
    lockToken,
  });
  if (!locked) {
    return NextResponse.json({ ok: true, stopped: "already_running" });
  }

  const actions: string[] = [];
  const seenStates = new Set<string>();
  try {
    for (let step = 0; step < 12; step += 1) {
      const { game, gameState, players } = await loadSnapshot(gameId);
      if (game?.status !== "in_progress" || !gameState) return NextResponse.json({ ok: true, actions, stopped: "game_over" });
      const player = players.find((candidate) => candidate.id === gameState.current_player_id);
      if (!player?.is_ai || player.is_eliminated) return NextResponse.json({ ok: true, actions, stopped: "human_or_missing_turn" });
      if (player.ai_difficulty && player.ai_difficulty !== "easy") return NextResponse.json({ ok: true, actions, stopped: "difficulty_unavailable" });

      const stateKey = JSON.stringify({
        version: gameState.version,
        currentPlayerId: gameState.current_player_id,
        phase: gameState.turn_phase,
        pending: pendingType(gameState),
        lastRoll: gameState.last_roll,
        auctionTurnPlayerId: gameState.auction_turn_player_id,
      });
      if (seenStates.has(stateKey)) return NextResponse.json({ ok: true, actions, stopped: "repeated_state" });
      seenStates.add(stateKey);

      const aiAction = chooseEasyAction({ state: gameState, player });
      if (!aiAction) return NextResponse.json({ ok: true, actions, stopped: "unsupported_state" });

      const actionResponse = await fetch(new URL("/api/bank/action", request.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bank-internal-ai-token": supabaseServiceRoleKey,
          "x-bank-ai-user-id": player.user_id,
        },
        body: JSON.stringify({
          ...aiAction,
          gameId,
          expectedVersion: gameState.version,
        }),
      });
      const payload = (await actionResponse.json().catch(() => null)) as { error?: string; currentVersion?: number } | null;
      if (!actionResponse.ok) {
        return NextResponse.json({
          ok: true,
          actions,
          stopped: actionResponse.status === 409 && payload?.error === "Version mismatch." ? "version_conflict" : "action_rejected",
          status: actionResponse.status,
          error: payload?.error ?? null,
        });
      }
      actions.push(aiAction.action);
    }

    return NextResponse.json({ ok: true, actions, stopped: "max_steps" });
  } finally {
    await releaseLock(gameId, lockToken).catch(() => undefined);
  }
}
