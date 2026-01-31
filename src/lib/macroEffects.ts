import type { MacroEventEffect } from "@/lib/macroDecks";

const normalizeType = (type: string) => {
  switch (type) {
    case "rentMultiplier":
      return "rent_multiplier";
    case "interest_rate_delta_per_turn":
    case "interestRateDeltaPerTurn":
      return "loan_rate_modifier";
    case "maintenancePerHouse":
    case "maintenance_cost_multiplier":
      return "maintenance_per_house";
    default:
      return type;
  }
};

export const normalizeMacroEffect = (
  effect: MacroEventEffect | null | undefined,
): MacroEventEffect | null => {
  if (!effect) {
    return null;
  }
  const type = normalizeType(effect.type ?? "");
  if (!type || typeof effect.value !== "number") {
    return null;
  }
  return {
    ...effect,
    type,
  };
};

export const normalizeMacroEffects = (effects: MacroEventEffect[]) =>
  effects
    .map((effect) => normalizeMacroEffect(effect))
    .filter((effect): effect is MacroEventEffect => Boolean(effect));
