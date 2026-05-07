import "server-only";

import { SUPABASE_URL } from "@/lib/env";
import type { GameRow, GameStateRow, LoanRow, OwnershipRow, PlayerRow } from "./types";

const supabaseUrl = (process.env.SUPABASE_URL ?? SUPABASE_URL ?? "").trim();
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

const bankHeaders = {
  apikey: supabaseServiceRoleKey,
  Authorization: `Bearer ${supabaseServiceRoleKey}`,
  "Content-Type": "application/json",
};

const parseSupabaseResponse = async <T>(response: Response): Promise<T | null> => {
  if (response.status === 204) return null;
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(bodyText || "Supabase request failed.");
  }
  return bodyText ? (JSON.parse(bodyText) as T) : null;
};

export const fetchFromSupabaseWithService = async <T>(path: string, options: RequestInit): Promise<T | null> => {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...bankHeaders,
      ...(options.headers ?? {}),
    },
  });
  return parseSupabaseResponse<T>(response);
};

export const loadSnapshot = async (gameId: string) => {
  const [game] = (await fetchFromSupabaseWithService<GameRow[]>(
    `games?select=id,status,board_pack_id&id=eq.${gameId}&limit=1`,
    { method: "GET" },
  )) ?? [];
  const players = (await fetchFromSupabaseWithService<PlayerRow[]>(
    `players?select=id,user_id,display_name,created_at,position,is_in_jail,jail_turns_remaining,get_out_of_jail_free_count,tax_exemption_pass_count,is_eliminated,is_ai,ai_difficulty&game_id=eq.${gameId}&order=created_at.asc`,
    { method: "GET" },
  )) ?? [];
  const [gameState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
    `game_state?select=game_id,version,current_player_id,balances,last_roll,doubles_count,rounds_elapsed,rules,active_macro_effects_v1,turn_phase,pending_action,pending_card_active,pending_card_drawn_by_player_id,auction_active,auction_tile_index,auction_initiator_player_id,auction_current_bid,auction_current_winner_player_id,auction_turn_player_id,auction_turn_ends_at,auction_eligible_player_ids,auction_passed_player_ids,auction_min_increment&game_id=eq.${gameId}&limit=1`,
    { method: "GET" },
  )) ?? [];
  const ownershipRows = (await fetchFromSupabaseWithService<OwnershipRow[]>(
    `property_ownership?select=tile_index,owner_player_id,acquired_round,collateral_loan_id,purchase_mortgage_id,houses&game_id=eq.${gameId}`,
    { method: "GET" },
  )) ?? [];
  const loanRows = (await fetchFromSupabaseWithService<LoanRow[]>(
    `player_loans?select=id,player_id,collateral_tile_index,status&game_id=eq.${gameId}&status=eq.active`,
    { method: "GET" },
  )) ?? [];
  return { game: game ?? null, players, gameState: gameState ?? null, ownershipRows, loanRows };
};

export const userIsGameMember = async (gameId: string, userId: string) => {
  const [player] = (await fetchFromSupabaseWithService<Array<{ id: string }>>(
    `players?select=id&game_id=eq.${gameId}&user_id=eq.${userId}&limit=1`,
    { method: "GET" },
  )) ?? [];
  return Boolean(player);
};
