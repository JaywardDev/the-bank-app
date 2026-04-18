import test from "node:test";
import assert from "node:assert/strict";

import { computeIncomeTaxAmount, computeSuperTaxBreakdown } from "@/lib/tax";
import {
  computeAuthoritativeNetWorthBreakdown,
  computeOwnedInlandAssetValue,
} from "@/lib/netWorth";
import type { BoardTile } from "@/lib/boardPacks";

const boardTiles: BoardTile[] = [
  { index: 1, tile_id: "a", type: "PROPERTY", name: "A", price: 100 },
];

const emptyOwnershipByTile = {};

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
