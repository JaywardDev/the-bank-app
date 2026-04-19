import test from "node:test";
import assert from "node:assert/strict";

import { getCurrentTileRent } from "./rent.ts";

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
