import test from "node:test";
import assert from "node:assert/strict";

import { computeIncomeTaxAmount, computeSuperTaxBreakdown } from "@/lib/tax";
import {
  computeAuthoritativeNetWorthBreakdown,
  computeOwnedPropertyImprovementAssetValue,
  computeOwnedInlandAssetValue,
  computeOwnedPropertyCollateralPrincipal,
  computeOwnedPropertyCollateralBaseValue,
  COLLATERAL_LOAN_LTV,
} from "@/lib/netWorth";
import { DEFAULT_BOARD_PACK_ECONOMY, type BoardTile } from "@/lib/boardPacks";
import { getPropertyMarketValue } from "@/lib/propertyMarketValue";
import { getCurrentTileRent } from "@/lib/rent";

const boardTiles: BoardTile[] = [
  { index: 1, tile_id: "a", type: "PROPERTY", name: "A", price: 100 },
];

const emptyOwnershipByTile = {};

const developedPropertyTile: BoardTile = {
  index: 5,
  tile_id: "prop-a",
  type: "PROPERTY",
  name: "Property A",
  price: 1_000,
  houseCost: 400,
};

test("level 0 property improvement value is zero", () => {
  const value = computeOwnedPropertyImprovementAssetValue({
    tile: developedPropertyTile,
    ownership: { houses: 0 },
    boardPackEconomy: { houseImprovementValueMultipliers: [0, 0.8, 0.9, 1.4, 1.9, 1.7] },
  });

  assert.equal(value, 0);
});

test("level 1 property improvement value uses 1 × houseCost × 0.8", () => {
  const value = computeOwnedPropertyImprovementAssetValue({
    tile: developedPropertyTile,
    ownership: { houses: 1 },
    boardPackEconomy: { houseImprovementValueMultipliers: [0, 0.8, 0.9, 1.4, 1.9, 1.7] },
  });

  assert.equal(value, 320);
});

test("level 4 property improvement value uses 4 × houseCost × 1.9", () => {
  const value = computeOwnedPropertyImprovementAssetValue({
    tile: developedPropertyTile,
    ownership: { houses: 4 },
    boardPackEconomy: { houseImprovementValueMultipliers: [0, 0.8, 0.9, 1.4, 1.9, 1.7] },
  });

  assert.equal(value, 3_040);
});

test("houses above configured max clamp multiplier tier but keep actual houses count", () => {
  const value = computeOwnedPropertyImprovementAssetValue({
    tile: developedPropertyTile,
    ownership: { houses: 7 },
    boardPackEconomy: { houseImprovementValueMultipliers: [0, 0.8, 0.9, 1.4, 1.9, 1.7] },
  });

  assert.equal(value, 4_760);
});

test("missing houseCost fails safe to zero improvement value", () => {
  const value = computeOwnedPropertyImprovementAssetValue({
    tile: { ...developedPropertyTile, houseCost: undefined },
    ownership: { houses: 3 },
    boardPackEconomy: { houseImprovementValueMultipliers: [0, 0.8, 0.9, 1.4, 1.9, 1.7] },
  });

  assert.equal(value, 0);
});

test("malformed ownership.houses fails safe to zero improvement value", () => {
  const value = computeOwnedPropertyImprovementAssetValue({
    tile: developedPropertyTile,
    ownership: { houses: Number.NaN },
    boardPackEconomy: { houseImprovementValueMultipliers: [0, 0.8, 0.9, 1.4, 1.9, 1.7] },
  });

  assert.equal(value, 0);
});

test("collateral principal uses 60% of tile price when property has no development", () => {
  const collateralBase = computeOwnedPropertyCollateralBaseValue({
    tile: developedPropertyTile,
    ownership: { acquired_round: null, houses: 0 },
    currentRound: 12,
    boardPackEconomy: { houseImprovementValueMultipliers: [0, 0.8, 0.9, 1.4, 1.9, 1.7] },
  });

  const principal = computeOwnedPropertyCollateralPrincipal({
    tile: developedPropertyTile,
    ownership: { acquired_round: null, houses: 0 },
    currentRound: 12,
    boardPackEconomy: { houseImprovementValueMultipliers: [0, 0.8, 0.9, 1.4, 1.9, 1.7] },
  });

  assert.equal(collateralBase, developedPropertyTile.price);
  assert.equal(principal, Math.round((developedPropertyTile.price ?? 0) * COLLATERAL_LOAN_LTV));
});

test("collateral principal includes net-worth improvement asset value", () => {
  const ownership = { acquired_round: 10, houses: 4 };
  const boardPackEconomy = { houseImprovementValueMultipliers: [0, 0.8, 0.9, 1.4, 1.9, 1.7] };
  const improvementValue = computeOwnedPropertyImprovementAssetValue({
    tile: developedPropertyTile,
    ownership,
    boardPackEconomy,
  });

  const collateralBase = computeOwnedPropertyCollateralBaseValue({
    tile: developedPropertyTile,
    ownership,
    currentRound: 20,
    boardPackEconomy,
  });
  const principal = computeOwnedPropertyCollateralPrincipal({
    tile: developedPropertyTile,
    ownership,
    currentRound: 20,
    boardPackEconomy,
  });

  assert.equal(collateralBase, 1_140 + improvementValue);
  assert.equal(principal, Math.round(collateralBase * COLLATERAL_LOAN_LTV));
});

test("collateral base uses appreciated land plus unchanged improvements", () => {
  const ownership = { acquired_round: 2, houses: 2 };
  const boardPackEconomy = { houseImprovementValueMultipliers: [0, 0.8, 0.9, 1.4, 1.9, 1.7] };
  const improvementValue = computeOwnedPropertyImprovementAssetValue({
    tile: developedPropertyTile,
    ownership,
    boardPackEconomy,
  });

  const collateralBase = computeOwnedPropertyCollateralBaseValue({
    tile: developedPropertyTile,
    ownership,
    currentRound: 12,
    boardPackEconomy,
  });

  assert.equal(collateralBase, 1_140 + improvementValue);
});

test("undeveloped owned inland explored-empty contributes only land-base value", () => {
  const value = computeOwnedInlandAssetValue({
    playerId: "p1",
    boardPackEconomy: { passGoAmount: 200, inlandLandBaseValueRatio: 0.2 },
    inlandExploredCells: [
      {
        row: 2,
        col: 2,
        status: "EXPLORED_EMPTY",
        discoveredResourceType: null,
        developedSiteType: null,
        ownerPlayerId: "p1",
      },
    ],
  });

  assert.equal(value.total, 40);
});

test("discovered but undeveloped inland cell contributes only land-base value", () => {
  const value = computeOwnedInlandAssetValue({
    playerId: "p1",
    boardPackEconomy: { passGoAmount: 200, inlandLandBaseValueRatio: 0.2 },
    inlandExploredCells: [
      {
        row: 2,
        col: 3,
        status: "DISCOVERED_RESOURCE",
        discoveredResourceType: "OIL",
        developedSiteType: null,
        ownerPlayerId: "p1",
      },
    ],
  });

  assert.equal(value.total, 40);
});

test("developed owned inland cell contributes land-base value plus full development cost", () => {
  const value = computeOwnedInlandAssetValue({
    playerId: "p1",
    boardPackEconomy: { passGoAmount: 200, inlandLandBaseValueRatio: 0.2 },
    inlandExploredCells: [
      {
        row: 2,
        col: 4,
        status: "DEVELOPED_SITE",
        discoveredResourceType: "OIL",
        developedSiteType: "OIL",
        ownerPlayerId: "p1",
      },
    ],
  });

  assert.equal(value.total, 640);
});

test("unowned inland cell contributes zero", () => {
  const value = computeOwnedInlandAssetValue({
    playerId: "p1",
    boardPackEconomy: { passGoAmount: 200, inlandLandBaseValueRatio: 0.2 },
    inlandExploredCells: [
      {
        row: 3,
        col: 3,
        status: "DEVELOPED_SITE",
        discoveredResourceType: "OIL",
        developedSiteType: "OIL",
        ownerPlayerId: "p2",
      },
    ],
  });

  assert.equal(value.total, 0);
});

test("unowned property contributes zero improvement value in authoritative net worth", () => {
  const breakdown = computeAuthoritativeNetWorthBreakdown({
    currentCash: 0,
    currentRound: 15,
    playerId: "p1",
    boardTiles: [developedPropertyTile],
    ownershipByTile: {
      [developedPropertyTile.index]: { owner_player_id: "p2", houses: 4 },
    },
    activeCollateralLoans: [],
    activePurchaseMortgages: [],
    boardPackEconomy: {
      passGoAmount: 200,
      inlandLandBaseValueRatio: 0.2,
      houseImprovementValueMultipliers: [0, 0.8, 0.9, 1.4, 1.9, 1.7],
    },
  });

  assert.equal(breakdown.boardAssetValue, 0);
  assert.equal(breakdown.improvementAssetValue, 0);
  assert.equal(breakdown.assetValue, 0);
});

test("authoritative net worth includes property improvement asset value", () => {
  const breakdown = computeAuthoritativeNetWorthBreakdown({
    currentCash: 100,
    currentRound: 15,
    playerId: "p1",
    boardTiles: [developedPropertyTile],
    ownershipByTile: {
      [developedPropertyTile.index]: { owner_player_id: "p1", acquired_round: 10, houses: 4 },
    },
    activeCollateralLoans: [],
    activePurchaseMortgages: [],
    boardPackEconomy: {
      passGoAmount: 200,
      inlandLandBaseValueRatio: 0.2,
      houseImprovementValueMultipliers: [0, 0.8, 0.9, 1.4, 1.9, 1.7],
    },
  });

  assert.equal(breakdown.boardAssetValue, 1_070);
  assert.equal(breakdown.improvementAssetValue, 3_040);
  assert.equal(breakdown.assetValue, 4_040);
  assert.equal(breakdown.netWorth, 4_140);
});

test("super tax includes inland value in net worth for tax and tax amount", () => {
  const breakdown = computeSuperTaxBreakdown({
    currentCash: 1_000,
    currentRound: 0,
    playerId: "p1",
    boardTiles,
    ownershipByTile: emptyOwnershipByTile,
    activeCollateralLoans: [],
    activePurchaseMortgages: [],
    boardPackEconomy: { passGoAmount: 200, inlandLandBaseValueRatio: 0.2 },
    inlandExploredCells: [
      {
        row: 3,
        col: 4,
        status: "DEVELOPED_SITE",
        discoveredResourceType: "OIL",
        developedSiteType: "OIL",
        ownerPlayerId: "p1",
      },
    ],
  });

  assert.equal(breakdown.assetValue, 640);
  assert.equal(breakdown.netWorthForTax, 1_640);
  assert.equal(breakdown.taxAmount, 164);
});

test("super tax includes property improvement value via authoritative net worth", () => {
  const breakdown = computeSuperTaxBreakdown({
    currentCash: 1_000,
    currentRound: 15,
    playerId: "p1",
    boardTiles: [developedPropertyTile],
    ownershipByTile: {
      [developedPropertyTile.index]: { owner_player_id: "p1", acquired_round: 10, houses: 4 },
    },
    activeCollateralLoans: [],
    activePurchaseMortgages: [],
    boardPackEconomy: {
      passGoAmount: 200,
      inlandLandBaseValueRatio: 0.2,
      houseImprovementValueMultipliers: [0, 0.8, 0.9, 1.4, 1.9, 1.7],
    },
  });

  assert.equal(breakdown.assetValue, 4_110);
  assert.equal(breakdown.netWorthForTax, 5_110);
  assert.equal(breakdown.taxAmount, 511);
});

test("income tax formula remains unchanged", () => {
  assert.equal(computeIncomeTaxAmount(1_500, 1_000), 100);
});

test("malformed developed inland record without developedSiteType fails safe to land-base only", () => {
  const breakdown = computeAuthoritativeNetWorthBreakdown({
    currentCash: 0,
    currentRound: 0,
    playerId: "p1",
    boardTiles,
    ownershipByTile: emptyOwnershipByTile,
    activeCollateralLoans: [],
    activePurchaseMortgages: [],
    boardPackEconomy: { passGoAmount: 200, inlandLandBaseValueRatio: 0.2 },
    inlandExploredCells: [
      {
        row: 4,
        col: 4,
        status: "DEVELOPED_SITE",
        discoveredResourceType: "OIL",
        developedSiteType: null,
        ownerPlayerId: "p1",
      },
    ],
  });

  assert.equal(breakdown.inlandAssetValue, 40);
});

test("authoritative net worth uses base value at rounds 0 and 4", () => {
  const round0 = computeAuthoritativeNetWorthBreakdown({
    currentCash: 0,
    currentRound: 10,
    playerId: "p1",
    boardTiles: [developedPropertyTile],
    ownershipByTile: {
      [developedPropertyTile.index]: { owner_player_id: "p1", acquired_round: 10, houses: 0 },
    },
    activeCollateralLoans: [],
    activePurchaseMortgages: [],
  });
  const round4 = computeAuthoritativeNetWorthBreakdown({
    currentCash: 0,
    currentRound: 14,
    playerId: "p1",
    boardTiles: [developedPropertyTile],
    ownershipByTile: {
      [developedPropertyTile.index]: { owner_player_id: "p1", acquired_round: 10, houses: 0 },
    },
    activeCollateralLoans: [],
    activePurchaseMortgages: [],
  });

  assert.equal(round0.boardAssetValue, 1_000);
  assert.equal(round4.boardAssetValue, 1_000);
});

test("authoritative net worth appreciates board value by 7% at 5 rounds and 14% at 10 rounds", () => {
  const round5 = computeAuthoritativeNetWorthBreakdown({
    currentCash: 0,
    currentRound: 15,
    playerId: "p1",
    boardTiles: [developedPropertyTile],
    ownershipByTile: {
      [developedPropertyTile.index]: { owner_player_id: "p1", acquired_round: 10, houses: 0 },
    },
    activeCollateralLoans: [],
    activePurchaseMortgages: [],
  });
  const round10 = computeAuthoritativeNetWorthBreakdown({
    currentCash: 0,
    currentRound: 20,
    playerId: "p1",
    boardTiles: [developedPropertyTile],
    ownershipByTile: {
      [developedPropertyTile.index]: { owner_player_id: "p1", acquired_round: 10, houses: 0 },
    },
    activeCollateralLoans: [],
    activePurchaseMortgages: [],
  });

  assert.equal(round5.boardAssetValue, 1_070);
  assert.equal(round10.boardAssetValue, 1_140);
});

test("authoritative net worth appreciation is capped at +100%", () => {
  const breakdown = computeAuthoritativeNetWorthBreakdown({
    currentCash: 0,
    currentRound: 500,
    playerId: "p1",
    boardTiles: [developedPropertyTile],
    ownershipByTile: {
      [developedPropertyTile.index]: { owner_player_id: "p1", acquired_round: 0, houses: 0 },
    },
    activeCollateralLoans: [],
    activePurchaseMortgages: [],
  });

  assert.equal(breakdown.boardAssetValue, 2_000);
});

test("authoritative net worth uses base value when acquired_round is null", () => {
  const breakdown = computeAuthoritativeNetWorthBreakdown({
    currentCash: 0,
    currentRound: 50,
    playerId: "p1",
    boardTiles: [developedPropertyTile],
    ownershipByTile: {
      [developedPropertyTile.index]: { owner_player_id: "p1", acquired_round: null, houses: 0 },
    },
    activeCollateralLoans: [],
    activePurchaseMortgages: [],
  });

  assert.equal(breakdown.boardAssetValue, 1_000);
});

test("authoritative net worth uses base value when current round is before acquired round", () => {
  const breakdown = computeAuthoritativeNetWorthBreakdown({
    currentCash: 0,
    currentRound: 3,
    playerId: "p1",
    boardTiles: [developedPropertyTile],
    ownershipByTile: {
      [developedPropertyTile.index]: { owner_player_id: "p1", acquired_round: 10, houses: 0 },
    },
    activeCollateralLoans: [],
    activePurchaseMortgages: [],
  });

  assert.equal(breakdown.boardAssetValue, 1_000);
});

test("super tax inherits appreciated board value only via authoritative net worth", () => {
  const breakdown = computeSuperTaxBreakdown({
    currentCash: 1_000,
    currentRound: 15,
    playerId: "p1",
    boardTiles: [developedPropertyTile],
    ownershipByTile: {
      [developedPropertyTile.index]: { owner_player_id: "p1", acquired_round: 10, houses: 0 },
    },
    activeCollateralLoans: [],
    activePurchaseMortgages: [],
  });

  assert.equal(breakdown.assetValue, 1_070);
  assert.equal(breakdown.netWorthForTax, 2_070);
  assert.equal(breakdown.taxAmount, 207);
});

test("sell-to-market payout is 70% of appreciated market price", () => {
  const marketPrice = getPropertyMarketValue({
    basePrice: developedPropertyTile.price ?? 0,
    acquiredRound: 10,
    currentRound: 20,
  }).marketPrice;
  const payout = Math.round(marketPrice * 0.7);

  assert.equal(marketPrice, 1_140);
  assert.equal(payout, 798);
});

test("rent logic remains unchanged by market-value inputs", () => {
  const rentTile: BoardTile = {
    index: 1,
    tile_id: "rent-a",
    type: "PROPERTY",
    name: "Rent A",
    price: 200,
    baseRent: 20,
    rentByHouses: [20, 60, 180],
    colorGroup: "blue",
  };
  const boardTilesForRent: BoardTile[] = [rentTile];
  const ownershipByTile = {
    1: {
      owner_player_id: "p1",
      collateral_loan_id: null,
      purchase_mortgage_id: null,
      houses: 0,
      acquired_round: 1,
    },
  } as unknown as Parameters<typeof getCurrentTileRent>[0]["ownershipByTile"];
  const rent = getCurrentTileRent({
    tile: rentTile,
    ownershipByTile,
    boardTiles: boardTilesForRent,
    economy: DEFAULT_BOARD_PACK_ECONOMY,
    lastRoll: 7,
  });

  assert.equal(rent, 20);
});

test("tile base price remains unchanged for direct purchase and auction pricing inputs", () => {
  const basePriceBefore = developedPropertyTile.price ?? 0;
  void getPropertyMarketValue({
    basePrice: basePriceBefore,
    acquiredRound: 0,
    currentRound: 100,
  });
  const basePriceAfter = developedPropertyTile.price ?? 0;

  assert.equal(basePriceBefore, 1_000);
  assert.equal(basePriceAfter, 1_000);
});
