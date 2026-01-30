export type MacroEventEffect = {
  type: string;
  value: number;
  description: string;
};

export type MacroEvent = {
  id: string;
  name: string;
  durationRounds: number;
  effects: MacroEventEffect[];
  weight?: number;
  rarity?: "common" | "uncommon" | "black_swan";
};

export type MacroDeck = {
  id: string;
  name: string;
  events: MacroEvent[];
};

export type MacroDrawMode = "equal" | "weighted";

export const MACRO_EVENT_INTERVAL_ROUNDS = 5;
export const DEFAULT_MACRO_DRAW_MODE: MacroDrawMode = "weighted";

export const macroDecks: MacroDeck[] = [
  {
    id: "macro-core",
    name: "Global Macro",
    events: [
      {
        id: "steady-growth",
        name: "Steady Growth",
        durationRounds: 4,
        effects: [
          {
            type: "rent_multiplier",
            value: 1.05,
            description: "Rents trend slightly upward.",
          },
        ],
        weight: 6,
        rarity: "common",
      },
      {
        id: "soft-landing",
        name: "Soft Landing",
        durationRounds: 3,
        effects: [
          {
            type: "loan_rate_modifier",
            value: -0.002,
            description: "Borrowing costs ease modestly.",
          },
        ],
        weight: 6,
        rarity: "common",
      },
      {
        id: "moderate-inflation",
        name: "Moderate Inflation",
        durationRounds: 3,
        effects: [
          {
            type: "maintenance_cost_multiplier",
            value: 1.1,
            description: "Operating costs creep higher.",
          },
        ],
        weight: 6,
        rarity: "common",
      },
      {
        id: "consumer-boom",
        name: "Consumer Boom",
        durationRounds: 2,
        effects: [
          {
            type: "cash_bonus",
            value: 50,
            description: "Households have extra discretionary cash.",
          },
        ],
        weight: 6,
        rarity: "common",
      },
      {
        id: "energy-spike",
        name: "Energy Price Spike",
        durationRounds: 2,
        effects: [
          {
            type: "maintenance_cost_multiplier",
            value: 1.2,
            description: "Utilities and upkeep costs jump.",
          },
        ],
        weight: 6,
        rarity: "common",
      },
      {
        id: "productivity-surge",
        name: "Productivity Surge",
        durationRounds: 3,
        effects: [
          {
            type: "rent_multiplier",
            value: 1.08,
            description: "Productivity lifts rents and income.",
          },
        ],
        weight: 6,
        rarity: "common",
      },
      {
        id: "credit-tightening",
        name: "Credit Tightening",
        durationRounds: 2,
        effects: [
          {
            type: "loan_rate_modifier",
            value: 0.004,
            description: "Borrowing costs rise sharply.",
          },
        ],
        weight: 3,
        rarity: "uncommon",
      },
      {
        id: "supply-chain-squeeze",
        name: "Supply Chain Squeeze",
        durationRounds: 2,
        effects: [
          {
            type: "development_cost_multiplier",
            value: 1.15,
            description: "Construction becomes more expensive.",
          },
        ],
        weight: 3,
        rarity: "uncommon",
      },
      {
        id: "market-crash",
        name: "Market Crash",
        durationRounds: 5,
        effects: [
          {
            type: "rent_multiplier",
            value: 0.7,
            description: "Demand slumps and rents fall.",
          },
        ],
        weight: 1,
        rarity: "black_swan",
      },
      {
        id: "sovereign-default",
        name: "Sovereign Default",
        durationRounds: 5,
        effects: [
          {
            type: "cash_shock",
            value: -200,
            description: "Liquidity dries up across the market.",
          },
        ],
        weight: 1,
        rarity: "black_swan",
      },
    ],
  },
];

export const defaultMacroDeckId = "macro-core";

export const getMacroDeckById = (deckId?: string | null) =>
  macroDecks.find((deck) => deck.id === deckId) ?? null;

const pickEqual = (events: MacroEvent[]) => {
  const index = Math.floor(Math.random() * events.length);
  return events[index] ?? events[0];
};

const pickWeighted = (events: MacroEvent[]) => {
  const totalWeight = events.reduce(
    (sum, event) => sum + (event.weight ?? 1),
    0,
  );
  if (totalWeight <= 0) {
    return pickEqual(events);
  }
  let roll = Math.random() * totalWeight;
  for (const event of events) {
    roll -= event.weight ?? 1;
    if (roll <= 0) {
      return event;
    }
  }
  return events[events.length - 1] ?? events[0];
};

export const drawMacroEvent = (
  deck: MacroDeck,
  lastEventId?: string | null,
  mode: MacroDrawMode = "equal",
) => {
  if (deck.events.length === 0) {
    throw new Error("Macro deck is empty.");
  }

  const filtered =
    lastEventId == null
      ? deck.events
      : deck.events.filter((event) => event.id !== lastEventId);
  const candidates = filtered.length > 0 ? filtered : deck.events;

  return mode === "weighted" ? pickWeighted(candidates) : pickEqual(candidates);
};
