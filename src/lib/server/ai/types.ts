import "server-only";

import type { BoardTile } from "@/lib/boardPacks";

export type AiDifficulty = "easy" | "medium" | "hard";

export type PlayerRow = {
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

export type GameRow = {
  id: string;
  status: string | null;
  board_pack_id: string | null;
};

export type GameStateRow = {
  game_id: string;
  version: number;
  current_player_id: string | null;
  balances: Record<string, number> | null;
  last_roll: number | null;
  doubles_count: number | null;
  turn_phase: string | null;
  rounds_elapsed: number | null;
  rules: Record<string, unknown> | null;
  active_macro_effects_v1: unknown[] | null;
  pending_action: Record<string, unknown> | null;
  pending_card_active: boolean | null;
  pending_card_drawn_by_player_id: string | null;
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

export type OwnershipRow = {
  tile_index: number;
  owner_player_id: string | null;
  acquired_round: number | null;
  collateral_loan_id: string | null;
  purchase_mortgage_id: string | null;
  houses: number | null;
};

export type LoanRow = {
  id: string;
  player_id: string;
  collateral_tile_index: number | null;
  status: string;
};

export type AiAction =
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
  | { action: "BUY_PROPERTY"; tileIndex: number; financing?: "MORTGAGE"; downPaymentPercent?: 50 }
  | { action: "DECLINE_PROPERTY"; tileIndex: number }
  | { action: "AUCTION_BID"; amount: number }
  | { action: "AUCTION_PASS" }
  | { action: "SELL_TO_MARKET"; tileIndex: number }
  | { action: "TAKE_COLLATERAL_LOAN"; tileIndex: number }
  | { action: "CONFIRM_INSOLVENCY_PAYMENT" }
  | { action: "DECLARE_BANKRUPTCY" };

export type AiPlanningContext = {
  state: GameStateRow;
  player: PlayerRow;
  game: GameRow | null;
  players: PlayerRow[];
  boardTiles: BoardTile[];
  ownershipRows: OwnershipRow[];
  loanRows: LoanRow[];
  actionsTaken: string[];
};

export type AiActionContext = "auction" | "normal_turn";

export type AiTurnResult = {
  ok: true;
  actions?: string[];
  stopped: string;
  actionContext?: AiActionContext;
  status?: number;
  error?: string | null;
};
