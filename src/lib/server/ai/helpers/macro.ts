import "server-only";

import type { GameStateRow } from "../types";

export const hasLoanMortgageBlockingMacro = (state: GameStateRow) =>
  state.rules?.macroEnabled !== false &&
  Array.isArray(state.active_macro_effects_v1) &&
  state.active_macro_effects_v1.some((effect) => {
    if (!effect || typeof effect !== "object") return false;
    const candidate = effect as { effects?: { loan_mortgage_new_blocked?: unknown }; roundsRemaining?: unknown };
    return (
      candidate.effects?.loan_mortgage_new_blocked === true &&
      typeof candidate.roundsRemaining === "number" &&
      candidate.roundsRemaining > 0
    );
  });
