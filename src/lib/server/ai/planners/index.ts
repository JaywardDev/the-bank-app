import "server-only";

import type { AiAction, AiPlanningContext } from "../types";
import { chooseEasyAction } from "./easy";
import { chooseMediumAction } from "./medium";

export { chooseEasyAction } from "./easy";
export { chooseMediumAction } from "./medium";

export const chooseAiAction = (context: AiPlanningContext): AiAction | null => {
  const difficulty = context.player.ai_difficulty ?? "easy";
  if (difficulty === "medium") return chooseMediumAction(context);
  if (difficulty === "easy") return chooseEasyAction({ state: context.state, player: context.player });
  return null;
};
