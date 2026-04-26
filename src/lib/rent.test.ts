import test from "node:test";
import assert from "node:assert/strict";

import { getCurrentTileRent, ownsFullColorSet, ownsFullyBuiltColorSet } from "./rent.ts";

test("property rent uses each tile's own development level", () => {
  const boardTiles = [
    {
      index: 1,
      tile_id: "a",
      type: "PROPERTY" as const,
      name: "Alpha",
      colorGroup: "BLUE",
      baseRent: 50,
      rentByHouses: [50, 100, 200, 350, 500, 700],
    },
    {
      index: 3,
      tile_id: "b",
      type: "PROPERTY" as const,
      name: "Bravo",
      colorGroup: "BLUE",
      baseRent: 50,
      rentByHouses: [50, 100, 200, 350, 500, 700],
    },
    {
      index: 6,
      tile_id: "c",
      type: "PROPERTY" as const,
      name: "Charlie",
      colorGroup: "BLUE",
      baseRent: 50,
      rentByHouses: [50, 100, 200, 350, 500, 700],
    },
  ];
  const ownershipByTile = {
    1: {
      owner_player_id: "p1",
      collateral_loan_id: null,
      purchase_mortgage_id: null,
      houses: 3,
    },
    3: {
      owner_player_id: "p1",
      collateral_loan_id: null,
      purchase_mortgage_id: null,
      houses: 1,
    },
    6: {
      owner_player_id: "p1",
      collateral_loan_id: null,
      purchase_mortgage_id: null,
      houses: 0,
    },
  };
  const economy = {
    currency: { code: "USD", symbol: "$" },
    houseRentMultipliersByGroup: {},
    hotelIncrementMultiplier: 1.25,
    railRentByCount: [0, 25, 50, 100, 200],
    utilityRentMultipliers: { single: 4, double: 10 },
  };

  assert.equal(
    getCurrentTileRent({
      tile: boardTiles[0],
      ownershipByTile,
      boardTiles,
      economy,
    }),
    350,
  );
  assert.equal(
    getCurrentTileRent({
      tile: boardTiles[1],
      ownershipByTile,
      boardTiles,
      economy,
    }),
    100,
  );
  assert.equal(
    getCurrentTileRent({
      tile: boardTiles[2],
      ownershipByTile,
      boardTiles,
      economy,
    }),
    100,
  );
});


test("ownsFullyBuiltColorSet enforces ownership and at least one house on each sibling", () => {
  const twoTileGroup = [
    {
      index: 1,
      tile_id: "a",
      type: "PROPERTY" as const,
      name: "Alpha",
      colorGroup: "BROWN",
      baseRent: 2,
      rentByHouses: [2, 10, 30, 90, 160, 250],
    },
    {
      index: 3,
      tile_id: "b",
      type: "PROPERTY" as const,
      name: "Beta",
      colorGroup: "BROWN",
      baseRent: 4,
      rentByHouses: [4, 20, 60, 180, 320, 450],
    },
  ];

  const twoTileOwnership = {
    1: {
      owner_player_id: "p1",
      collateral_loan_id: null,
      purchase_mortgage_id: null,
      houses: 1,
    },
    3: {
      owner_player_id: "p1",
      collateral_loan_id: null,
      purchase_mortgage_id: null,
      houses: 0,
    },
  };

  assert.equal(
    ownsFullyBuiltColorSet(twoTileGroup[0], twoTileGroup, twoTileOwnership, "p1"),
    false,
  );

  const threeTileGroup = [
    {
      index: 6,
      tile_id: "c",
      type: "PROPERTY" as const,
      name: "Gamma",
      colorGroup: "PINK",
      baseRent: 6,
      rentByHouses: [6, 30, 90, 270, 400, 550],
    },
    {
      index: 8,
      tile_id: "d",
      type: "PROPERTY" as const,
      name: "Delta",
      colorGroup: "PINK",
      baseRent: 6,
      rentByHouses: [6, 30, 90, 270, 400, 550],
    },
    {
      index: 9,
      tile_id: "e",
      type: "PROPERTY" as const,
      name: "Epsilon",
      colorGroup: "PINK",
      baseRent: 8,
      rentByHouses: [8, 40, 100, 300, 450, 600],
    },
  ];

  const threeTileOwnershipAnyVacant = {
    6: {
      owner_player_id: "p1",
      collateral_loan_id: null,
      purchase_mortgage_id: null,
      houses: 1,
    },
    8: {
      owner_player_id: "p1",
      collateral_loan_id: null,
      purchase_mortgage_id: null,
      houses: 2,
    },
    9: {
      owner_player_id: "p1",
      collateral_loan_id: null,
      purchase_mortgage_id: null,
      houses: 0,
    },
  };

  assert.equal(
    ownsFullyBuiltColorSet(
      threeTileGroup[0],
      threeTileGroup,
      threeTileOwnershipAnyVacant,
      "p1",
    ),
    false,
  );

  const threeTileOwnershipAllBuilt = {
    6: {
      owner_player_id: "p1",
      collateral_loan_id: null,
      purchase_mortgage_id: null,
      houses: 1,
    },
    8: {
      owner_player_id: "p1",
      collateral_loan_id: null,
      purchase_mortgage_id: null,
      houses: 2,
    },
    9: {
      owner_player_id: "p1",
      collateral_loan_id: null,
      purchase_mortgage_id: null,
      houses: 1,
    },
  };

  assert.equal(
    ownsFullyBuiltColorSet(
      threeTileGroup[1],
      threeTileGroup,
      threeTileOwnershipAllBuilt,
      "p1",
    ),
    true,
  );
});


test("ownsFullColorSet remains true for build eligibility even when current tile is vacant", () => {
  const boardTiles = [
    {
      index: 11,
      tile_id: "f",
      type: "PROPERTY" as const,
      name: "Foxtrot",
      colorGroup: "ORANGE",
      baseRent: 10,
      rentByHouses: [10, 50, 150, 450, 625, 750],
    },
    {
      index: 13,
      tile_id: "g",
      type: "PROPERTY" as const,
      name: "Golf",
      colorGroup: "ORANGE",
      baseRent: 10,
      rentByHouses: [10, 50, 150, 450, 625, 750],
    },
    {
      index: 14,
      tile_id: "h",
      type: "PROPERTY" as const,
      name: "Hotel",
      colorGroup: "ORANGE",
      baseRent: 12,
      rentByHouses: [12, 60, 180, 500, 700, 900],
    },
  ];

  const ownershipByTile = {
    11: {
      owner_player_id: "p1",
      collateral_loan_id: null,
      purchase_mortgage_id: null,
      houses: 0,
    },
    13: {
      owner_player_id: "p1",
      collateral_loan_id: null,
      purchase_mortgage_id: null,
      houses: 1,
    },
    14: {
      owner_player_id: "p1",
      collateral_loan_id: null,
      purchase_mortgage_id: null,
      houses: 1,
    },
  };

  assert.equal(ownsFullColorSet(boardTiles[0], boardTiles, ownershipByTile, "p1"), true);
  assert.equal(
    ownsFullyBuiltColorSet(boardTiles[0], boardTiles, ownershipByTile, "p1"),
    false,
  );
});
