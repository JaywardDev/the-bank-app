import "server-only";

import type { AiAction, GameStateRow, PlayerRow } from "../types";

export const pendingType = (state: GameStateRow) =>
  state.pending_action && typeof state.pending_action.type === "string"
    ? state.pending_action.type
    : null;

export const pendingPlayerId = (state: GameStateRow) =>
  state.pending_action && typeof state.pending_action.player_id === "string"
    ? state.pending_action.player_id
    : null;

export const chooseEasyAction = ({
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
