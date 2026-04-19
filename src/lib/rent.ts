import type { BoardPackEconomy, BoardTile, BoardTileType } from "@/lib/boardPacks";
import { normalizeRentByHousesTiers } from "@/lib/developmentCosts";

export type OwnershipEntry = {
  owner_player_id: string;
  collateral_loan_id: string | null;
  purchase_mortgage_id: string | null;
  houses: number;
};

export type OwnershipByTile = Record<number, OwnershipEntry>;

const DEFAULT_UTILITY_ROLL = 7;
const DEFAULT_UTILITY_TRIPLE_MULTIPLIER = 16;

export const getPropertyRentWithDevelopment = (
  tile: BoardTile,
  development: number,
) => {
  const rentByHouses = normalizeRentByHousesTiers(tile.rentByHouses);
  if (!rentByHouses || rentByHouses.length === 0) {
    return tile.baseRent ?? 0;
  }

  const normalizedDev = Number.isFinite(development)
    ? Math.max(0, Math.floor(development))
    : 0;

  if (normalizedDev <= rentByHouses.length - 1) {
    return rentByHouses[normalizedDev] ?? tile.baseRent ?? 0;
  }
  return rentByHouses[rentByHouses.length - 1] ?? tile.baseRent ?? 0;
};

const countOwnedTilesByType = (
  ownershipByTile: OwnershipByTile,
  ownerPlayerId: string,
  tiles: BoardTile[],
  type: BoardTileType,
) => {
  const tileTypeByIndex = new Map(tiles.map((tile) => [tile.index, tile.type]));
  return Object.entries(ownershipByTile).reduce((count, [index, ownership]) => {
    if (
      ownership.owner_player_id !== ownerPlayerId ||
      tileTypeByIndex.get(Number(index)) !== type
    ) {
      return count;
    }
    return count + 1;
  }, 0);
};

export const ownsFullColorSet = (
  tile: BoardTile,
  boardTiles: BoardTile[],
  ownershipByTile: OwnershipByTile,
  ownerPlayerId: string,
) => {
  if (tile.type !== "PROPERTY" || !tile.colorGroup) {
    return false;
  }

  const groupTiles = boardTiles.filter(
    (entry) => entry.type === "PROPERTY" && entry.colorGroup === tile.colorGroup,
  );

  if (groupTiles.length === 0) {
    return false;
  }

  return groupTiles.every(
    (entry) => ownershipByTile[entry.index]?.owner_player_id === ownerPlayerId,
  );
};

export const getFullColorGroupRent = (tile: BoardTile) => {
  if (tile.type !== "PROPERTY") {
    return null;
  }
  const baseNoHouseRent = tile.rentByHouses?.[0] ?? tile.baseRent;
  if (typeof baseNoHouseRent !== "number") {
    return null;
  }
  return baseNoHouseRent * 2;
};

export const getCurrentTileRent = ({
  tile,
  ownershipByTile,
  boardTiles,
  economy,
  lastRoll,
}: {
  tile: BoardTile;
  ownershipByTile: OwnershipByTile;
  boardTiles: BoardTile[];
  economy: BoardPackEconomy;
  lastRoll?: number | null;
}) => {
  const ownership = ownershipByTile[tile.index];
  if (!ownership) {
    return null;
  }

  if (tile.type === "PROPERTY") {
    const development = ownership.houses;
    const rentWithDevelopment = getPropertyRentWithDevelopment(
      tile,
      development,
    );

    const hasMonopolyNoDevelopment =
      development === 0 &&
      ownsFullColorSet(tile, boardTiles, ownershipByTile, ownership.owner_player_id);
    if (!hasMonopolyNoDevelopment) {
      return rentWithDevelopment;
    }

    return getFullColorGroupRent(tile) ?? 0;
  }

  // Example assertion block (no test runner configured):
  // A monopoly with zero development should preview doubled base rent.
  // const sampleRent = getCurrentTileRent({
  //   tile: { index: 1, tile_id: "x", type: "PROPERTY", name: "A", colorGroup: "BROWN", baseRent: 2 },
  //   ownershipByTile: {
  //     1: { owner_player_id: "p1", collateral_loan_id: null, purchase_mortgage_id: null, houses: 0 },
  //     3: { owner_player_id: "p1", collateral_loan_id: null, purchase_mortgage_id: null, houses: 0 },
  //   },
  //   boardTiles: [
  //     { index: 1, tile_id: "x", type: "PROPERTY", name: "A", colorGroup: "BROWN", baseRent: 2 },
  //     { index: 3, tile_id: "y", type: "PROPERTY", name: "B", colorGroup: "BROWN", baseRent: 4 },
  //   ],
  //   economy: { currency: { code: "USD", symbol: "$" }, houseRentMultipliersByGroup: {}, hotelIncrementMultiplier: 1.25, railRentByCount: [0,25,50,100,200], utilityRentMultipliers: { single: 4, double: 10 } },
  // });
  // console.assert(sampleRent === 4, "Expected monopoly base rent to double");

  if (tile.type === "RAIL") {
    const railCount = countOwnedTilesByType(
      ownershipByTile,
      ownership.owner_player_id,
      boardTiles,
      "RAIL",
    );
    return economy.railRentByCount[railCount] ?? tile.baseRent ?? 0;
  }

  if (tile.type === "UTILITY") {
    const utilityCount = countOwnedTilesByType(
      ownershipByTile,
      ownership.owner_player_id,
      boardTiles,
      "UTILITY",
    );
    const multiplier = getUtilityRentMultiplierForOwnedCount(
      utilityCount,
      economy.utilityRentMultipliers,
    );
    const rentRoll = typeof lastRoll === "number" ? lastRoll : DEFAULT_UTILITY_ROLL;
    const utilityBaseAmount = economy.utilityBaseAmount ?? 1;
    return rentRoll * multiplier * utilityBaseAmount;
  }

  return null;
};

export function getUtilityRentMultiplierForOwnedCount(
  utilityCount: number,
  multipliers: {
    single: number;
    double: number;
    triple?: number;
  },
) {
  if (utilityCount >= 3) {
    return multipliers.triple ?? DEFAULT_UTILITY_TRIPLE_MULTIPLIER;
  }
  if (utilityCount >= 2) {
    return multipliers.double;
  }
  return multipliers.single;
}

export const formatCurrencyCompact = (
  amount: number,
  symbol: string = "$",
) => `${symbol}${Math.round(amount).toLocaleString()}`;
