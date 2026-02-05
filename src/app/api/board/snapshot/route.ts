import { NextResponse } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

const supabaseUrl = (process.env.SUPABASE_URL ?? SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (
  process.env.SUPABASE_ANON_KEY ?? SUPABASE_ANON_KEY ?? ""
).trim();
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

const isConfigured = () =>
  Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey);

const adminHeaders = {
  apikey: supabaseServiceRoleKey,
  Authorization: `Bearer ${supabaseServiceRoleKey}`,
  "Content-Type": "application/json",
};

type SnapshotRequest = {
  gameId?: string;
};

type GameMeta = {
  id: string;
  board_pack_id: string | null;
  status: string | null;
};

type Player = {
  id: string;
  user_id: string;
  display_name: string | null;
  created_at: string | null;
  position: number;
  is_eliminated: boolean;
  eliminated_at: string | null;
};

type GameState = {
  game_id: string;
  version: number;
  current_player_id: string | null;
  last_roll: number | null;
  chance_index: number | null;
  community_index: number | null;
  free_parking_pot: number | null;
  rules: Record<string, unknown> | null;
  auction_active: boolean | null;
  auction_tile_index: number | null;
  auction_current_bid: number | null;
  auction_current_winner_player_id: string | null;
  auction_turn_player_id: string | null;
  pending_card_active: boolean | null;
  pending_card_deck: "CHANCE" | "COMMUNITY" | null;
  pending_card_id: string | null;
  pending_card_title: string | null;
  pending_card_kind: string | null;
  pending_card_payload: Record<string, unknown> | null;
  pending_card_drawn_by_player_id: string | null;
  pending_card_drawn_at: string | null;
  pending_card_source_tile_index: number | null;
};

type GameEvent = {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  version: number;
};

type OwnershipRow = {
  tile_index: number;
  owner_player_id: string | null;
  collateral_loan_id: string | null;
  purchase_mortgage_id: string | null;
  houses: number | null;
};

async function fetchTable<T>(path: string) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: "GET",
    headers: adminHeaders,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Snapshot lookup failed.");
  }

  return (await response.json()) as T;
}

export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Board services are not configured." },
      { status: 503 },
    );
  }

  const payload = (await request.json().catch(() => null)) as SnapshotRequest | null;
  const gameId = payload?.gameId?.trim() ?? "";

  if (!gameId) {
    return NextResponse.json(
      { error: "Missing gameId in snapshot request" },
      { status: 400 },
    );
  }

  try {
    const [game] = await fetchTable<GameMeta[]>(
      `games?select=id,board_pack_id,status&id=eq.${encodeURIComponent(gameId)}&limit=1`,
    );

    const isWatchable = game?.status === "lobby" || game?.status === "in_progress";
    if (!game || !isWatchable) {
      return NextResponse.json(
        { error: "This game is not available to watch." },
        { status: 404 },
      );
    }

    const [players, gameState, events, ownershipRows] = await Promise.all([
      fetchTable<Player[]>(
        `players?select=id,user_id,display_name,created_at,position,is_eliminated,eliminated_at&game_id=eq.${encodeURIComponent(gameId)}&order=created_at.asc`,
      ),
      fetchTable<GameState[]>(
        `game_state?select=game_id,version,current_player_id,last_roll,chance_index,community_index,free_parking_pot,rules,auction_active,auction_tile_index,auction_current_bid,auction_current_winner_player_id,auction_turn_player_id,pending_card_active,pending_card_deck,pending_card_id,pending_card_title,pending_card_kind,pending_card_payload,pending_card_drawn_by_player_id,pending_card_drawn_at,pending_card_source_tile_index&game_id=eq.${encodeURIComponent(gameId)}&limit=1`,
      ),
      fetchTable<GameEvent[]>(
        `game_events?select=id,event_type,payload,created_at,version&game_id=eq.${encodeURIComponent(gameId)}&order=version.desc&limit=12`,
      ),
      fetchTable<OwnershipRow[]>(
        `property_ownership?select=tile_index,owner_player_id,collateral_loan_id,purchase_mortgage_id,houses&game_id=eq.${encodeURIComponent(gameId)}`,
      ),
    ]);

    return NextResponse.json({
      gameMeta: game,
      players,
      gameState: gameState[0] ?? null,
      events,
      ownershipRows,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to load the board snapshot right now." },
      { status: 503 },
    );
  }
}
