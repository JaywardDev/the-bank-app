import test from "node:test";
import assert from "node:assert/strict";

import { computeIncomeTaxAmount, computeSuperTaxBreakdown } from "@/lib/tax";
import {
  computeAuthoritativeNetWorthBreakdown,
  computeOwnedPropertyImprovementAssetValue,
  computeOwnedInlandAssetValue,
} from "@/lib/netWorth";
import type { BoardTile } from "@/lib/boardPacks";

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
    playerId: "p1",
    boardTiles: [developedPropertyTile],
    ownershipByTile: {
      [developedPropertyTile.index]: { owner_player_id: "p1", houses: 4 },
    },
    activeCollateralLoans: [],
    activePurchaseMortgages: [],
    boardPackEconomy: {
      passGoAmount: 200,
      inlandLandBaseValueRatio: 0.2,
      houseImprovementValueMultipliers: [0, 0.8, 0.9, 1.4, 1.9, 1.7],
    },
  });

  assert.equal(breakdown.boardAssetValue, 1_000);
  assert.equal(breakdown.improvementAssetValue, 3_040);
  assert.equal(breakdown.assetValue, 4_040);
  assert.equal(breakdown.netWorth, 4_140);
});

test("super tax includes inland value in net worth for tax and tax amount", () => {
  const breakdown = computeSuperTaxBreakdown({
    currentCash: 1_000,
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
    playerId: "p1",
    boardTiles: [developedPropertyTile],
    ownershipByTile: {
      [developedPropertyTile.index]: { owner_player_id: "p1", houses: 4 },
    },
    activeCollateralLoans: [],
    activePurchaseMortgages: [],
    boardPackEconomy: {
      passGoAmount: 200,
      inlandLandBaseValueRatio: 0.2,
      houseImprovementValueMultipliers: [0, 0.8, 0.9, 1.4, 1.9, 1.7],
    },
  });

  assert.equal(breakdown.assetValue, 4_040);
  assert.equal(breakdown.netWorthForTax, 5_040);
  assert.equal(breakdown.taxAmount, 504);
});

test("income tax formula remains unchanged", () => {
  assert.equal(computeIncomeTaxAmount(1_500, 1_000), 100);
});

test("malformed developed inland record without developedSiteType fails safe to land-base only", () => {
  const breakdown = computeAuthoritativeNetWorthBreakdown({
    currentCash: 0,
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
