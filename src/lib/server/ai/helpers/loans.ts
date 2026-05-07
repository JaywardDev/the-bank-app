import "server-only";

import type { GameStateRow } from "../types";

export const pendingPurchaseTileIndex = (state: GameStateRow) =>
  typeof state.pending_action?.tile_index === "number" ? state.pending_action.tile_index : null;
