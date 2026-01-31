export type MacroRarity = "common" | "uncommon" | "black_swan";

export type MacroEffectsV1 = {
  rent_multiplier?: number; // e.g. 1.1, 0.8 (applies to property rents)
  rail_rent_multiplier?: number; // e.g. 1.5
  build_cost_multiplier?: number; // e.g. 1.25, 0.75
  cash_delta?: number; // one-off applied to each player at trigger (+/-)
  loan_mortgage_new_blocked?: boolean; // blocks new collateral loans + purchase mortgages while active

  // Interest “trend” that compounds each round while active.
  // Example: -0.01 means interest decreases by 1% each round (10%->9%->8%...).
  interest_trend_per_round?: number; // +/-0.01

  // Flat delta to mortgage interest while active (not compounding).
  mortgage_interest_flat_delta?: number; // e.g. +0.05

  // Utilities macro: utility rent bonus = (bonusPctPerHouse * totalHousesOwnedByUtilityOwner).
  utility_rent_bonus_per_house_pct?: number; // e.g. 0.03

  regional_disaster?: { colorSets: number; costPerHouse: number };

  bank_stress_test?: {
    minLoans: number;
    payLargestLoanInterestImmediately: boolean;
  };

  pandemic?: { skipNextRoll: boolean; stimulusCash: number };

  sovereign_default?: {
    cashDelta: number;
    forceHouseLiquidationIfInsufficient: boolean;
  };

  house_sell_multiplier?: number; // 1.0 for 100%, 1.1 for 110% if enabled later
};

export type MacroCardV1 = {
  id: string;
  name: string;
  rarity: MacroRarity;
  weight: number;
  durationRounds: number; // 0 for one-off / immediate only
  headline: string; // 1 line
  flavor: string; // 1–2 sentences
  rulesText: string; // exact effect text shown to players
  effects: MacroEffectsV1;
};

export const MACRO_DECK_V1: MacroCardV1[] = [
  {
    id: "steady-growth",
    name: "Steady Growth",
    rarity: "common",
    weight: 10,
    durationRounds: 5,
    headline: "Demand firms up across the board.",
    flavor:
      "A quiet expansion lifts rents without spooking buyers. Landlords feel the tailwind.",
    rulesText: "Property rent is increased by 10% for 5 rounds.",
    effects: {
      rent_multiplier: 1.1,
    },
  },
  {
    id: "soft-landing",
    name: "Soft Landing",
    rarity: "common",
    weight: 9,
    durationRounds: 5,
    headline: "Rates cool as inflation eases.",
    flavor:
      "Borrowing costs drift down each round, giving owners room to breathe.",
    rulesText: "Mortgage interest trends down by 1% per round for 5 rounds.",
    effects: {
      interest_trend_per_round: -0.01,
    },
  },
  {
    id: "supply-chain-squeeze",
    name: "Supply Chain Squeeze",
    rarity: "common",
    weight: 9,
    durationRounds: 5,
    headline: "Construction bottlenecks raise material costs.",
    flavor:
      "Delays and shortages make every build more expensive than planned.",
    rulesText: "Building costs are increased by 25% for 5 rounds.",
    effects: {
      build_cost_multiplier: 1.25,
    },
  },
  {
    id: "housing-boom",
    name: "Housing Boom",
    rarity: "common",
    weight: 8,
    durationRounds: 6,
    headline: "New builds flood the market.",
    flavor:
      "Competition among contractors drives costs down as supply surges.",
    rulesText: "Building costs are reduced by 25% for 6 rounds.",
    effects: {
      build_cost_multiplier: 0.75,
    },
  },
  {
    id: "rental-recession",
    name: "Rental Recession",
    rarity: "common",
    weight: 8,
    durationRounds: 5,
    headline: "Vacancies rise and landlords cut deals.",
    flavor:
      "Tenants shop around, forcing rent concessions across the board.",
    rulesText: "Property rent is reduced by 20% for 5 rounds.",
    effects: {
      rent_multiplier: 0.8,
    },
  },
  {
    id: "credit-tightening",
    name: "Credit Tightening",
    rarity: "uncommon",
    weight: 6,
    durationRounds: 5,
    headline: "Lenders ratchet up rates each round.",
    flavor:
      "The cost of capital climbs steadily as banks grow cautious.",
    rulesText: "Mortgage interest trends up by 1% per round for 5 rounds.",
    effects: {
      interest_trend_per_round: 0.01,
    },
  },
  {
    id: "liquidity-squeeze",
    name: "Liquidity Squeeze",
    rarity: "uncommon",
    weight: 6,
    durationRounds: 8,
    headline: "New credit freezes overnight.",
    flavor:
      "Banks pause new lending while they shore up their balance sheets.",
    rulesText: "New loans and purchase mortgages are blocked for 8 rounds.",
    effects: {
      loan_mortgage_new_blocked: true,
    },
  },
  {
    id: "consumer-boom",
    name: "Consumer Boom",
    rarity: "uncommon",
    weight: 7,
    durationRounds: 0,
    headline: "Spending splashes through the economy.",
    flavor:
      "Households feel flush and cash starts moving again.",
    rulesText: "Each player receives $50 immediately.",
    effects: {
      cash_delta: 50,
    },
  },
  {
    id: "universal-basic-payment",
    name: "Universal Basic Payment",
    rarity: "uncommon",
    weight: 6,
    durationRounds: 0,
    headline: "A direct payout hits every wallet.",
    flavor:
      "A one-time transfer boosts liquidity for everyone on the board.",
    rulesText: "Each player receives $100 immediately.",
    effects: {
      cash_delta: 100,
    },
  },
  {
    id: "quantitative-easing",
    name: "Quantitative Easing",
    rarity: "uncommon",
    weight: 5,
    durationRounds: 0,
    headline: "Fresh money pours into the system.",
    flavor:
      "The central bank turns on the spigots to keep markets humming.",
    rulesText: "Each player receives $150 immediately.",
    effects: {
      cash_delta: 150,
    },
  },
  {
    id: "tax-increase",
    name: "Tax Increase",
    rarity: "uncommon",
    weight: 6,
    durationRounds: 0,
    headline: "A surprise levy drains cash.",
    flavor:
      "Policy makers reach deeper, tightening budgets for everyone.",
    rulesText: "Each player pays $100 immediately.",
    effects: {
      cash_delta: -100,
    },
  },
  {
    id: "logistics-boom",
    name: "Logistics Boom",
    rarity: "uncommon",
    weight: 5,
    durationRounds: 6,
    headline: "Freight demand spikes.",
    flavor:
      "Rail traffic surges as supply networks expand.",
    rulesText: "Railroad rent is increased by 50% for 6 rounds.",
    effects: {
      rail_rent_multiplier: 1.5,
    },
  },
  {
    id: "energy-price-spike",
    name: "Energy Price Spike",
    rarity: "uncommon",
    weight: 4,
    durationRounds: 12,
    headline: "Utility bills climb with energy prices.",
    flavor:
      "Higher generation costs boost utility rents, scaling with housing stock.",
    rulesText:
      "Utility rent gains a bonus equal to 3% per house owned by the utility owner for 12 rounds.",
    effects: {
      utility_rent_bonus_per_house_pct: 0.03,
    },
  },
  {
    id: "market-crash",
    name: "Market Crash",
    rarity: "black_swan",
    weight: 2,
    durationRounds: 3,
    headline: "Confidence evaporates overnight.",
    flavor:
      "A sharp downturn slashes demand and landlords scramble for tenants.",
    rulesText: "Property rent dropped. Pay only 30% of normal rent for 3 rounds.",
    effects: {
      rent_multiplier: 0.3,
    },
  },
  {
    id: "bond-market-shock",
    name: "Bond Market Shock",
    rarity: "uncommon",
    weight: 6,
    durationRounds: 10,
    headline: "Yields spike and financing costs jump.",
    flavor:
      "Mortgage rates reset higher as bond markets reprice risk.",
    rulesText: "Mortgage interest is increased by 5% for 10 rounds.",
    effects: {
      mortgage_interest_flat_delta: 0.05,
    },
  },
  {
    id: "regional-disaster",
    name: "Regional Disaster",
    rarity: "black_swan",
    weight: 2,
    durationRounds: 0,
    headline: "A disaster zone is declared.",
    flavor:
      "Two color sets face emergency repair costs tied to housing density.",
    rulesText:
      "Randomly select 2 color sets. Pay $50 per house on properties in those sets.",
    effects: {
      regional_disaster: {
        colorSets: 2,
        costPerHouse: 50,
      },
    },
  },
  {
    id: "bank-stress-test",
    name: "Bank Stress Test",
    rarity: "black_swan",
    weight: 2,
    durationRounds: 0,
    headline: "Regulators demand immediate proof of solvency.",
    flavor:
      "Heavily leveraged players must prove they can service their debts.",
    rulesText:
      "Players with 3 or more loans pay the interest on their largest loan immediately (if tied, pay both).",
    effects: {
      bank_stress_test: {
        minLoans: 3,
        payLargestLoanInterestImmediately: true,
      },
    },
  },
  {
    id: "global-pandemic",
    name: "Global Pandemic",
    rarity: "black_swan",
    weight: 2,
    durationRounds: 1,
    headline: "The board grinds to a halt.",
    flavor:
      "Activity pauses as loans continue to tick and relief checks arrive.",
    rulesText:
      "All players skip their next roll. Loans and mortgages still tick. Each player receives $100 stimulus.",
    effects: {
      pandemic: {
        skipNextRoll: true,
        stimulusCash: 100,
      },
    },
  },
  {
    id: "sovereign-default",
    name: "Sovereign Default",
    rarity: "black_swan",
    weight: 2,
    durationRounds: 0,
    headline: "A major borrower misses payments.",
    flavor:
      "Liquidity seizes up and forced sales ripple through portfolios.",
    rulesText:
      "Each player pays $200 immediately. If cash is insufficient, liquidate houses until covered.",
    effects: {
      sovereign_default: {
        cashDelta: -200,
        forceHouseLiquidationIfInsufficient: true,
      },
    },
  },
  {
    id: "housing-liquidity-surge",
    name: "Housing Liquidity Surge",
    rarity: "black_swan",
    weight: 2,
    durationRounds: 4,
    headline: "Buyers return and sales move instantly.",
    flavor:
      "High demand restores full value on house sales for a brief window.",
    rulesText: "House sell price is 100% of build cost for 4 rounds.",
    effects: {
      house_sell_multiplier: 1.0,
    },
  },
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

export const drawMacroCardV1 = (lastCardId?: string | null) => {
  if (MACRO_DECK_V1.length === 0) {
    throw new Error("Macro deck v1 is empty.");
  }
  const filtered =
    lastCardId == null
      ? MACRO_DECK_V1
      : MACRO_DECK_V1.filter((card) => card.id !== lastCardId);
  const candidates = filtered.length > 0 ? filtered : MACRO_DECK_V1;
  return pickWeighted(candidates);
};

export function getMacroCardByIdV1(id: string): MacroCardV1 | undefined {
  return MACRO_DECK_V1.find((card) => card.id === id);
}
