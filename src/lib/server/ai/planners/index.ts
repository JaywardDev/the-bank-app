import "server-only";

import type { AiAction, AiPlanningContext } from "../types";
import { chooseMediumAction } from "./medium";

export { chooseEasyAction } from "./easy";
export { chooseMediumAction } from "./medium";

export const chooseAiAction = (context: AiPlanningContext): AiAction | null => {
  const difficulty = context.player.ai_difficulty ?? "easy";

  if (difficulty === "easy" || difficulty === "medium") {
    return chooseMediumAction(context);
  }

  return null;
};
