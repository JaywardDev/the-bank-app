import type { MacroCardV1 } from "./macroDeckV1";

export const NZ_MACRO_DECK: MacroCardV1[] = [
  {
    id: "steady-growth",
    name: "Tourism Recovery Cycle",
    rarity: "common",
    weight: 10,
    durationRounds: 5,
    headline: "Visitor demand lifts spending from Queenstown to Auckland.",
    flavor:
      "A steady flow of travellers fills rentals and boosts confidence in local property markets.",
    rulesText: "Property rent is increased by 10% for 5 rounds.",
    effects: {
      rent_multiplier: 1.1,
    },
  },
  {
    id: "soft-landing",
    name: "OCR Stabilisation",
    rarity: "common",
    weight: 9,
    durationRounds: 5,
    headline: "Inflation cools and rate pressure begins to ease.",
    flavor:
      "As the Reserve Bank steadies policy, borrowers get more breathing room each round.",
    rulesText: "Mortgage interest trends down by 1% per round for 5 rounds.",
    effects: {
      interest_trend_per_round: -0.01,
    },
  },
  {
    id: "supply-chain-squeeze",
    name: "Port Congestion at Tauranga",
    rarity: "common",
    weight: 9,
    durationRounds: 5,
    headline: "Shipping delays choke building material deliveries.",
    flavor:
      "Hold-ups through major ports push up construction inputs across the country.",
    rulesText: "Building costs are increased by 25% for 5 rounds.",
    effects: {
      build_cost_multiplier: 1.25,
    },
  },
  {
    id: "housing-boom",
    name: "Housing Acceleration Phase",
    rarity: "common",
    weight: 8,
    durationRounds: 6,
    headline: "New development pipelines finally clear and scale up.",
    flavor:
      "With supply moving faster, builders compete harder and costs come down.",
    rulesText: "Building costs are reduced by 25% for 6 rounds.",
    effects: {
      build_cost_multiplier: 0.75,
    },
  },
  {
    id: "rental-recession",
    name: "Rental Market Cooling",
    rarity: "common",
    weight: 8,
    durationRounds: 5,
    headline: "Vacancy rates rise in key urban centres.",
    flavor:
      "Tenants gain leverage, and landlords across Aotearoa trim asking rents.",
    rulesText: "Property rent is reduced by 20% for 5 rounds.",
    effects: {
      rent_multiplier: 0.8,
    },
  },
  {
    id: "credit-tightening",
    name: "OCR Rate Hike",
    rarity: "uncommon",
    weight: 6,
    durationRounds: 5,
    headline: "Borrowing costs climb with each policy reset.",
    flavor:
      "Banks pass through tighter monetary conditions as lending appetite cools.",
    rulesText: "Mortgage interest trends up by 1% per round for 5 rounds.",
    effects: {
      interest_trend_per_round: 0.01,
    },
  },
  {
    id: "liquidity-squeeze",
    name: "Lending Freeze",
    rarity: "uncommon",
    weight: 6,
    durationRounds: 8,
    headline: "Credit desks pause new approvals nationwide.",
    flavor:
      "Lenders focus on balance-sheet resilience and halt fresh mortgage exposure.",
    rulesText: "New loans and purchase mortgages are blocked for 8 rounds.",
    effects: {
      loan_mortgage_new_blocked: true,
    },
  },
  {
    id: "consumer-boom",
    name: "Consumer Confidence Surge",
    rarity: "uncommon",
    weight: 7,
    durationRounds: 0,
    headline: "Retail and hospitality spending jumps sharply.",
    flavor:
      "Households feel optimistic, and cash circulates quickly through local businesses.",
    rulesText: "Each player receives NZ$120,000 immediately.",
    effects: {
      cash_delta: 120_000,
    },
  },
  {
    id: "universal-basic-payment",
    name: "Cost of Living Relief Payment",
    rarity: "uncommon",
    weight: 6,
    durationRounds: 0,
    headline: "A direct support payment is issued to every household.",
    flavor:
      "Emergency relief lands at once, lifting short-term liquidity across the board.",
    rulesText: "Each player receives NZ$240,000 immediately.",
    effects: {
      cash_delta: 240_000,
    },
  },
  {
    id: "quantitative-easing",
    name: "Reserve Bank Stimulus",
    rarity: "uncommon",
    weight: 5,
    durationRounds: 0,
    headline: "Monetary stimulus injects fresh cash into the economy.",
    flavor:
      "Policy support ramps up quickly to keep markets liquid and credit flowing.",
    rulesText: "Each player receives NZ$360,000 immediately.",
    effects: {
      cash_delta: 360_000,
    },
  },
  {
    id: "tax-increase",
    name: "Emergency Fiscal Levy",
    rarity: "uncommon",
    weight: 6,
    durationRounds: 0,
    headline: "A temporary levy is introduced to fund urgent spending.",
    flavor:
      "Public finances tighten and everyone contributes at once.",
    rulesText: "Each player pays NZ$240,000 immediately.",
    effects: {
      cash_delta: -240_000,
    },
  },
  {
    id: "logistics-boom",
    name: "Interislander Peak Season",
    rarity: "uncommon",
    weight: 5,
    durationRounds: 6,
    headline: "Freight and passenger volumes surge between islands.",
    flavor:
      "Transport links run hot as seasonal demand boosts rail and ferry turnover.",
    rulesText: "Railroad rent is increased by 50% for 6 rounds.",
    effects: {
      rail_rent_multiplier: 1.5,
    },
  },
  {
    id: "energy-price-spike",
    name: "Hydro Storage Shortfall",
    rarity: "uncommon",
    weight: 4,
    durationRounds: 12,
    headline: "Low lake levels push power prices higher.",
    flavor:
      "Tight generation margins raise utility returns, amplified by housing density.",
    rulesText:
      "Utility rent gains a bonus equal to 3% per house owned by the utility owner for 12 rounds.",
    effects: {
      utility_rent_bonus_per_house_pct: 0.03,
    },
  },
  {
    id: "market-crash",
    name: "Equity Market Correction",
    rarity: "black_swan",
    weight: 2,
    durationRounds: 3,
    headline: "A sharp sell-off dents confidence across sectors.",
    flavor:
      "Risk appetite vanishes and landlords compete aggressively to hold tenants.",
    rulesText: "Property rent dropped. Pay only 30% of normal rent for 3 rounds.",
    effects: {
      rent_multiplier: 0.3,
    },
  },
  {
    id: "bond-market-shock",
    name: "Bond Yield Spike",
    rarity: "uncommon",
    weight: 6,
    durationRounds: 10,
    headline: "Government yields jump and reprice lending instantly.",
    flavor:
      "Funding costs rise as debt markets demand higher returns for risk.",
    rulesText: "Mortgage interest is increased by 5% for 10 rounds.",
    effects: {
      mortgage_interest_flat_delta: 0.05,
    },
  },
  {
    id: "regional-disaster",
    name: "Major Seismic Event",
    rarity: "black_swan",
    weight: 2,
    durationRounds: 0,
    headline: "Emergency declarations target multiple regions.",
    flavor:
      "Damage assessments trigger immediate repair costs tied to local housing density.",
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
    name: "Bank Capital Review",
    rarity: "black_swan",
    weight: 2,
    durationRounds: 0,
    headline: "Regulators demand immediate capital resilience checks.",
    flavor:
      "Highly leveraged players face instant scrutiny on their largest obligations.",
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
    name: "Nationwide Lockdown",
    rarity: "black_swan",
    weight: 2,
    durationRounds: 1,
    headline: "Movement halts while relief measures ramp up.",
    flavor:
      "Economic activity pauses abruptly, but support payments arrive to cushion households.",
    rulesText:
      "All players skip their next roll. Loans and mortgages still tick. Each player receives NZ$240,000 stimulus.",
    effects: {
      pandemic: {
        skipNextRoll: true,
        stimulusCash: 240_000,
      },
    },
  },
  {
    id: "sovereign-default",
    name: "Government Credit Downgrade",
    rarity: "black_swan",
    weight: 2,
    durationRounds: 0,
    headline: "A credit shock forces abrupt fiscal repricing.",
    flavor:
      "Liquidity tightens and players may need to liquidate housing to stay solvent.",
    rulesText:
      "Each player pays NZ$480,000 immediately. If cash is insufficient, liquidate houses until covered.",
    effects: {
      sovereign_default: {
        cashDelta: -480_000,
        forceHouseLiquidationIfInsufficient: true,
      },
    },
  },
  {
    id: "housing-liquidity-surge",
    name: "Investor Exit Wave",
    rarity: "black_swan",
    weight: 2,
    durationRounds: 4,
    headline: "Listings turn over rapidly as investors rotate out.",
    flavor:
      "Transaction volume spikes, restoring full resale liquidity on houses for a short window.",
    rulesText: "House sell price is 100% of build cost for 4 rounds.",
    effects: {
      house_sell_multiplier: 1.0,
    },
  },
  {
    id: "dairy-payout-season",
    name: "Dairy Payout Season",
    rarity: "common",
    weight: 8,
    durationRounds: 0,
    headline: "The payout lands across the regions.",
    flavor: "A seasonal dairy payout boosts cashflow and spending overnight.",
    rulesText: "All players receive NZ$240,000.",
    tooltip: "One-off cash injection.",
    effects: {
      cash_delta: 240_000,
    },
  },
  {
    id: "council-consent-backlog",
    name: "Council Consent Backlog",
    rarity: "common",
    weight: 9,
    durationRounds: 5,
    headline: "Building consents slow and quotes rise.",
    flavor: "Paperwork piles up, tradies re-quote, and schedules slip.",
    rulesText: "All build costs are increased by 20% for 5 rounds.",
    tooltip: "Building becomes more expensive.",
    effects: {
      build_cost_multiplier: 1.2,
    },
  },
  {
    id: "tourism-shoulder-season",
    name: "Tourism Shoulder Season",
    rarity: "common",
    weight: 8,
    durationRounds: 5,
    headline: "Bookings stay strong week after week.",
    flavor: "From Queenstown to Waiheke, demand holds up and rents lift.",
    rulesText: "All rent payments are increased by 10% for 5 rounds.",
    tooltip: "Rent up for 5 rounds.",
    effects: {
      rent_multiplier: 1.1,
    },
  },
  {
    id: "net-migration-surge",
    name: "Net Migration Surge",
    rarity: "uncommon",
    weight: 5,
    durationRounds: 6,
    headline: "New arrivals tighten the rental market.",
    flavor: "Listings disappear fast and competition heats up nationwide.",
    rulesText: "All rent payments are increased by 20% for 6 rounds.",
    tooltip: "Rent up for 6 rounds.",
    effects: {
      rent_multiplier: 1.2,
    },
  },
  {
    id: "hydro-storage-shortfall",
    name: "Hydro Storage Shortfall",
    rarity: "uncommon",
    weight: 4,
    durationRounds: 12,
    headline: "Power demand spikes as supply tightens.",
    flavor: "Low lake levels and cold snaps push energy costs higher.",
    rulesText: "Utility rent gains +5% per house owned for 12 rounds.",
    tooltip: "Utilities earn more when housing is developed.",
    effects: {
      utility_rent_bonus_per_house_pct: 0.05,
    },
  },
  {
    id: "interislander-peak-freight",
    name: "Interislander Peak Freight",
    rarity: "uncommon",
    weight: 5,
    durationRounds: 6,
    headline: "Freight capacity is booked solid.",
    flavor: "Rail and ferry links become the backbone of logistics.",
    rulesText: "Rail rent is increased by 30% for 6 rounds.",
    tooltip: "Rails pay more for 6 rounds.",
    effects: {
      rail_rent_multiplier: 1.3,
    },
  },
  {
    id: "ocr-hold-and-ease",
    name: "OCR Hold and Ease",
    rarity: "uncommon",
    weight: 6,
    durationRounds: 5,
    headline: "Funding conditions gradually improve.",
    flavor: "Markets exhale — refinancing gets easier each round.",
    rulesText: "Interest trend decreases by 0.02 per round for 5 rounds.",
    tooltip: "Interest becomes cheaper over time.",
    effects: {
      interest_trend_per_round: -0.02,
    },
  },
  {
    id: "major-seismic-event",
    name: "Major Seismic Event",
    rarity: "black_swan",
    weight: 2,
    durationRounds: 0,
    headline: "Aftershocks trigger urgent repairs.",
    flavor:
      "Strengthening, inspections, and fixes hit multiple regions at once.",
    rulesText:
      "Two random colour sets are affected. Owners pay NZ$120,000 per house in those sets.",
    tooltip: "Black swan: big one-off repair cost.",
    effects: {
      regional_disaster: {
        colorSets: 2,
        costPerHouse: 120_000,
      },
    },
  },
  {
    id: "bank-funding-freeze",
    name: "Bank Funding Freeze",
    rarity: "black_swan",
    weight: 2,
    durationRounds: 8,
    headline: "Lending pauses across the market.",
    flavor:
      "Credit committees tighten up and approvals stop temporarily.",
    rulesText: "New mortgages are blocked for 8 rounds.",
    tooltip: "Black swan: borrowing temporarily blocked.",
    effects: {
      loan_mortgage_new_blocked: true,
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

export const drawNZMacroCard = (lastCardId?: string | null) => {
  if (NZ_MACRO_DECK.length === 0) {
    throw new Error("NZ macro deck is empty.");
  }
  const filtered =
    lastCardId == null
      ? NZ_MACRO_DECK
      : NZ_MACRO_DECK.filter((card) => card.id !== lastCardId);
  const candidates = filtered.length > 0 ? filtered : NZ_MACRO_DECK;
  return pickWeighted(candidates);
};
