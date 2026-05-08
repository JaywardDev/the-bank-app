import test from "node:test";
import assert from "node:assert/strict";

import {
  ECONOMIC_BOOM_DRAWS,
  buildEconomicBoomSeason,
  getEconomicBoomPropertyWeight,
  getEconomicBoomTileWeight,
  shouldTriggerEconomicBoomSeason,
} from "./economicBoomSeason";

const economy = {
  currency: { code: "USD", symbol: "$" },
  houseRentMultipliersByGroup: {},
  hotelIncrementMultiplier: 1.25,
  railRentByCount: [0, 25, 50, 100, 200],
  utilityRentMultipliers: { single: 4, double: 10 },
  utilityBaseAmount: 1,
};

const players = [
  { id: "p1", display_name: "Ada", is_eliminated: false },
  { id: "p2", display_name: "Ben", is_eliminated: false },
  { id: "p3", display_name: "Cal", is_eliminated: true },
];

const makeTile = (index: number, type: "PROPERTY" | "RAIL" | "UTILITY", name = `Tile ${index}`) => ({
  index,
  tile_id: `tile-${index}`,
  type,
  name,
  price: 100,
  baseRent: 10,
  colorGroup: type === "PROPERTY" ? `G${index}` : undefined,
  rentByHouses: type === "PROPERTY" ? [10, 20, 40, 80, 110, 160] : undefined,
});

test("economic boom trigger cadence is every 10 advanced rounds and idempotent", () => {
  assert.equal(shouldTriggerEconomicBoomSeason({ tableRoundAdvanced: false, nextRound: 10, lastEconomicBoomRound: null, isGameOver: false }), false);
  assert.equal(shouldTriggerEconomicBoomSeason({ tableRoundAdvanced: true, nextRound: 9, lastEconomicBoomRound: null, isGameOver: false }), false);
  assert.equal(shouldTriggerEconomicBoomSeason({ tableRoundAdvanced: true, nextRound: 10, lastEconomicBoomRound: null, isGameOver: false }), true);
  assert.equal(shouldTriggerEconomicBoomSeason({ tableRoundAdvanced: true, nextRound: 10, lastEconomicBoomRound: 10, isGameOver: false }), false);
  assert.equal(shouldTriggerEconomicBoomSeason({ tableRoundAdvanced: true, nextRound: 20, lastEconomicBoomRound: 10, isGameOver: false }), true);
  assert.equal(shouldTriggerEconomicBoomSeason({ tableRoundAdvanced: true, nextRound: 30, lastEconomicBoomRound: 20, isGameOver: false }), true);
  assert.equal(shouldTriggerEconomicBoomSeason({ tableRoundAdvanced: true, nextRound: 10, lastEconomicBoomRound: null, isGameOver: true }), false);
});

test("economic boom weights match property levels, rails, and utilities", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(getEconomicBoomPropertyWeight), [1, 2, 4, 7, 11, 16, 16]);
  assert.equal(getEconomicBoomTileWeight(makeTile(1, "RAIL"), {}), 2);
  assert.equal(getEconomicBoomTileWeight(makeTile(2, "UTILITY"), {}), 2);
});

test("economic boom selects max six unique eligible tiles and emits matching cash credits", () => {
  const boardTiles = Array.from({ length: 8 }, (_, index) => makeTile(index, "PROPERTY"));
  const ownershipByTile = Object.fromEntries(
    boardTiles.map((tile, index) => [tile.index, { owner_player_id: index % 2 === 0 ? "p1" : "p2", collateral_loan_id: null, purchase_mortgage_id: null, houses: index % 6 }]),
  );

  const result = buildEconomicBoomSeason({
    gameId: "g1",
    round: 10,
    boardTiles,
    ownershipByTile,
    players,
    balances: { p1: 100, p2: 100 },
    activeMacroEffects: [],
    boardPackEconomy: economy,
  });

  const revenueEvents = result.events.filter((event) => event.event_type === "ECONOMIC_BOOM_REVENUE");
  const cashCredits = result.events.filter((event) => event.event_type === "CASH_CREDIT");
  assert.equal(revenueEvents.length, ECONOMIC_BOOM_DRAWS);
  assert.equal(cashCredits.length, revenueEvents.length);
  assert.equal(new Set(revenueEvents.map((event) => event.payload.tile_index)).size, revenueEvents.length);
  assert.ok(result.balances.p1 > 100 || result.balances.p2 > 100);
});

test("economic boom handles fewer than six eligible tiles and filters eliminated/collateralized owners", () => {
  const boardTiles = [makeTile(1, "PROPERTY"), makeTile(2, "PROPERTY"), makeTile(3, "PROPERTY"), makeTile(4, "PROPERTY")];
  const result = buildEconomicBoomSeason({
    gameId: "g2",
    round: 10,
    boardTiles,
    ownershipByTile: {
      1: {
        owner_player_id: "p1",
        collateral_loan_id: null,
        purchase_mortgage_id: null,
        houses: 0,
      },
      2: { owner_player_id: "p2", collateral_loan_id: "loan-1", purchase_mortgage_id: null, houses: 0 },
      3: { owner_player_id: "p3", collateral_loan_id: null, purchase_mortgage_id: null, houses: 0 },
    },
    players,
    balances: { p1: 100, p2: 100, p3: 100 },
    activeMacroEffects: [],
    boardPackEconomy: economy,
  });
  const revenueEvents = result.events.filter((event) => event.event_type === "ECONOMIC_BOOM_REVENUE");
  assert.equal(result.eligibleTileCount, 1);
  assert.equal(revenueEvents.length, 1);
  assert.equal(revenueEvents[0].payload.owner_player_id, "p1");
});

test("economic boom includes purchase-mortgaged tiles and pays rounded half of authoritative rent basis", () => {
  const boardTiles = [makeTile(1, "PROPERTY", "Mortgaged Plaza")];
  const result = buildEconomicBoomSeason({
    gameId: "g3",
    round: 10,
    boardTiles,
    ownershipByTile: {
      1: { owner_player_id: "p1", collateral_loan_id: null, purchase_mortgage_id: "pm-1", houses: 2 },
    },
    players,
    balances: { p1: 100 },
    activeMacroEffects: [],
    boardPackEconomy: economy,
  });
  const revenue = result.events.find((event) => event.event_type === "ECONOMIC_BOOM_REVENUE");
  assert.equal(revenue?.payload.purchase_mortgage_id, "pm-1");
  assert.equal(revenue?.payload.rent_basis, 40);
  assert.equal(revenue?.payload.payout_amount, Math.round(40 * 0.5));
  assert.equal(result.balances.p1, 120);
});

test("economic boom utility rent basis uses fixed roll 7", () => {
  const boardTiles = [makeTile(1, "UTILITY", "Power")];
  const result = buildEconomicBoomSeason({
    gameId: "g4",
    round: 10,
    boardTiles,
    ownershipByTile: {
      1: {
        owner_player_id: "p1",
        collateral_loan_id: null,
        purchase_mortgage_id: null,
        houses: 0,
      },
    },
    players,
    balances: { p1: 0 },
    activeMacroEffects: [],
    boardPackEconomy: economy,
  });
  const revenue = result.events.find((event) => event.event_type === "ECONOMIC_BOOM_REVENUE");
  assert.equal(revenue?.payload.utility_rent_basis_roll, 7);
  assert.equal(revenue?.payload.rent_basis, 28);
  assert.equal(revenue?.payload.payout_amount, 14);
});

test("economic boom rent basis uses already-active macro effects and excludes newly triggered same-round effects", () => {
  const boardTiles = [makeTile(1, "PROPERTY", "Demand District")];
  const ownershipByTile = {
    1: {
      owner_player_id: "p1",
      collateral_loan_id: null,
      purchase_mortgage_id: null,
      houses: 0,
    },
  };
  const existingMacroEffects = [
    {
      id: "existing-growth",
      name: "Existing Growth",
      effects: { rent_multiplier: 2 },
      roundsRemaining: 1,
      roundsApplied: 1,
    },
  ];
  const newlyTriggeredMacroEffects = [
    ...existingMacroEffects,
    {
      id: "new-surge",
      name: "New Surge",
      effects: { rent_multiplier: 3 },
      roundsRemaining: 3,
      roundsApplied: 0,
    },
  ];

  const boomBeforeNewMacro = buildEconomicBoomSeason({
    gameId: "g5",
    round: 10,
    boardTiles,
    ownershipByTile,
    players,
    balances: { p1: 0 },
    activeMacroEffects: existingMacroEffects,
    boardPackEconomy: economy,
  });
  const boomIfNewMacroWereAppliedToo = buildEconomicBoomSeason({
    gameId: "g5",
    round: 10,
    boardTiles,
    ownershipByTile,
    players,
    balances: { p1: 0 },
    activeMacroEffects: newlyTriggeredMacroEffects,
    boardPackEconomy: economy,
  });

  const actualRevenue = boomBeforeNewMacro.events.find(
    (event) => event.event_type === "ECONOMIC_BOOM_REVENUE",
  );
  const wronglyAmplifiedRevenue = boomIfNewMacroWereAppliedToo.events.find(
    (event) => event.event_type === "ECONOMIC_BOOM_REVENUE",
  );

  assert.equal(actualRevenue?.payload.rent_basis, 20);
  assert.equal(actualRevenue?.payload.payout_amount, 10);
  assert.equal(wronglyAmplifiedRevenue?.payload.rent_basis, 60);
});

test("economic boom event batch orders started before revenue and cash entries", () => {
  const result = buildEconomicBoomSeason({
    gameId: "g6",
    round: 10,
    boardTiles: [makeTile(1, "PROPERTY", "Market Street")],
    ownershipByTile: {
      1: {
        owner_player_id: "p1",
        collateral_loan_id: null,
        purchase_mortgage_id: null,
        houses: 0,
      },
    },
    players,
    balances: { p1: 0 },
    activeMacroEffects: [],
    boardPackEconomy: economy,
  });

  assert.deepEqual(
    result.events.map((event) => event.event_type),
    ["ECONOMIC_BOOM_STARTED", "ECONOMIC_BOOM_REVENUE", "CASH_CREDIT"],
  );
});
