import {
  MACRO_DECK_PH_V1,
  type MacroCardV1,
  type MacroEffectsV1,
} from "./macroDeckPhV1";

const cloneEffects = (effects: MacroEffectsV1): MacroEffectsV1 => ({
  ...effects,
  regional_disaster: effects.regional_disaster
    ? { ...effects.regional_disaster }
    : undefined,
  bank_stress_test: effects.bank_stress_test
    ? { ...effects.bank_stress_test }
    : undefined,
  pandemic: effects.pandemic ? { ...effects.pandemic } : undefined,
  sovereign_default: effects.sovereign_default
    ? { ...effects.sovereign_default }
    : undefined,
});

const withOverrides = (card: MacroCardV1): MacroCardV1 => {
  const effects = cloneEffects(card.effects);

  switch (card.id) {
    case "regional-disaster":
      return {
        ...card,
        rulesText:
          "Randomly select 2 color sets. Pay ₱200,000 per house on properties in those sets.",
        effects: {
          ...effects,
          regional_disaster: {
            colorSets: 2,
            costPerHouse: 200000,
          },
        },
      };
    case "liquidity-squeeze":
      return {
        ...card,
        rulesText:
          "All new loans are blocked, including purchase mortgages, for 8 rounds.",
        tooltip:
          "No new debt can be opened while this macro is active. This includes collateral loans and purchase mortgages.",
        effects: {
          ...effects,
          loan_mortgage_new_blocked: true,
        },
      };
    case "tax-increase":
      return {
        ...card,
        rulesText:
          "Each player pays 7% of their current cash balance immediately (rounded to the nearest peso).",
        tooltip:
          "Cash tax is percentage-based, so players with larger liquidity pay more this turn.",
        effects: {
          ...effects,
          cash_delta: undefined,
          tax_cash_percent: 0.07,
        },
      };
    case "global-pandemic":
      return {
        ...card,
        weight: 1,
        rulesText:
          "All players skip their next roll. Loans and mortgages still tick. Each player receives ₱800,000 stimulus. If a player is currently on an owned tile, they must pay that tile's rent again.",
        tooltip:
          "Skipped rolls do not pause debt servicing. Loan payments and mortgage interest still apply while turns are skipped.",
        effects: {
          ...effects,
          pandemic: {
            skipNextRoll: true,
            stimulusCash: 800000,
          },
        },
      };
    case "sovereign-default":
      return {
        ...card,
        weight: 1,
        effects,
      };
    case "housing-liquidity-surge":
      return {
        ...card,
        rulesText:
          "House sell price is 150% of build cost for 4 rounds. Building houses is blocked while active.",
        tooltip:
          "You can liquidate existing houses at a premium, but you cannot build new houses until this macro expires.",
        effects: {
          ...effects,
          house_sell_multiplier: 1.5,
          house_build_blocked: true,
        },
      };
    default:
      return {
        ...card,
        effects,
      };
  }
};

const PH_EXCLUSIVE_HARD_MACROS: MacroCardV1[] = [
  {
    id: "typhoon-season",
    name: "Typhoon Season",
    rarity: "common",
    weight: 5,
    durationRounds: 0,
    headline: "Storm damage ripples across neighborhoods.",
    flavor:
      "Frequent typhoons force emergency repairs on developed properties.",
    rulesText: "Each player pays ₱20,000 per house across all color sets.",
    effects: {
      regional_disaster: {
        colorSets: 999,
        costPerHouse: 20000,
      },
    },
  },
  {
    id: "ofw-remittance-surge",
    name: "OFW Remittance Surge",
    rarity: "common",
    weight: 9,
    durationRounds: 0,
    headline: "Remittance inflows boost household liquidity.",
    flavor:
      "Strong overseas earnings send fresh cash back into the local economy.",
    rulesText: "Each player receives ₱600,000 immediately.",
    effects: {
      cash_delta: 600000,
    },
  },
  {
    id: "election-season",
    name: "Election Season",
    rarity: "uncommon",
    weight: 6,
    durationRounds: 0,
    headline: "Campaign spending increases short-term demand.",
    flavor:
      "Election activity injects temporary cash into local businesses.",
    rulesText: "Each player receives ₱300,000 immediately.",
    effects: {
      cash_delta: 300000,
    },
  },
  {
    id: "bpo-expansion",
    name: "BPO Expansion",
    rarity: "common",
    weight: 8,
    durationRounds: 4,
    headline: "Business districts absorb new office demand.",
    flavor:
      "BPO growth concentrates demand in key urban corridors.",
    rulesText: "Rent on RED color-set properties is increased by 20% for 4 rounds.",
    effects: {
      rent_multiplier_by_color_group: {
        red: 1.2,
      },
    },
  },
  {
    id: "summer-season",
    name: "Summer Season",
    rarity: "common",
    weight: 8,
    durationRounds: 4,
    headline: "Peak-season travel lifts select local demand.",
    flavor:
      "Seasonal activity raises traffic in budget-friendly locations.",
    rulesText:
      "Rent on BROWN color-set properties is increased by 20% for 4 rounds.",
    effects: {
      rent_multiplier_by_color_group: {
        brown: 1.2,
      },
    },
  },
  {
    id: "christmas-season",
    name: "Christmas Season",
    rarity: "common",
    weight: 8,
    durationRounds: 4,
    headline: "Holiday spending drives premium district activity.",
    flavor:
      "Festive traffic and events push demand in upscale neighborhoods.",
    rulesText:
      "Rent on GREEN color-set properties is increased by 20% for 4 rounds.",
    effects: {
      rent_multiplier_by_color_group: {
        green: 1.2,
      },
    },
  },
];

export const MACRO_DECK_PH_HARD_V1: MacroCardV1[] = [
  ...MACRO_DECK_PH_V1.map(withOverrides),
  ...PH_EXCLUSIVE_HARD_MACROS,
];

const pickEqual = (cards: MacroCardV1[]) => {
  const index = Math.floor(Math.random() * cards.length);
  return cards[index] ?? cards[0];
};

const pickWeighted = (cards: MacroCardV1[]) => {
  const totalWeight = cards.reduce((sum, card) => sum + (card.weight ?? 1), 0);
  if (totalWeight <= 0) {
    return pickEqual(cards);
  }
  let roll = Math.random() * totalWeight;
  for (const card of cards) {
    roll -= card.weight ?? 1;
    if (roll <= 0) {
      return card;
    }
  }
  return cards[cards.length - 1] ?? cards[0];
};

export const drawMacroCardPhHardV1 = (lastCardId?: string | null) => {
  if (MACRO_DECK_PH_HARD_V1.length === 0) {
    throw new Error("Macro deck ph hard v1 is empty.");
  }
  const filtered =
    lastCardId == null
      ? MACRO_DECK_PH_HARD_V1
      : MACRO_DECK_PH_HARD_V1.filter((card) => card.id !== lastCardId);
  const candidates = filtered.length > 0 ? filtered : MACRO_DECK_PH_HARD_V1;
  return pickWeighted(candidates);
};
