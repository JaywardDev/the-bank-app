import type { BoardPackEconomy, BoardTile, BoardTileType } from "@/lib/boardPacks";

export type OwnershipEntry = {
  owner_player_id: string;
  collateral_loan_id: string | null;
  purchase_mortgage_id: string | null;
  houses: number;
};

export type OwnershipByTile = Record<number, OwnershipEntry>;

const DEFAULT_HOTEL_INCREMENT_MULTIPLIER = 1.25;
const DEFAULT_UTILITY_ROLL = 7;

const getDevBreakdown = (dev: number) => {
  const normalizedDev = Number.isFinite(dev) ? Math.max(0, Math.floor(dev)) : 0;
  return {
    hotelCount: Math.floor(normalizedDev / 5),
    houseCount: normalizedDev % 5,
  };
};

const getHotelIncrement = (
  rent4: number,
  hotelIncrementMultiplier: number = DEFAULT_HOTEL_INCREMENT_MULTIPLIER,
) => Math.ceil(rent4 * hotelIncrementMultiplier);

export const getPropertyRentWithDevelopment = (
  tile: BoardTile,
  development: number,
  hotelIncrementMultiplier: number = DEFAULT_HOTEL_INCREMENT_MULTIPLIER,
) => {
  const rentByHouses = tile.rentByHouses;
  if (!rentByHouses || rentByHouses.length === 0) {
    return tile.baseRent ?? 0;
  }

  const normalizedDev = Number.isFinite(development)
    ? Math.max(0, Math.floor(development))
    : 0;

  if (normalizedDev <= rentByHouses.length - 1) {
    return rentByHouses[normalizedDev] ?? tile.baseRent ?? 0;
  }

  const { hotelCount, houseCount } = getDevBreakdown(normalizedDev);
  const rent4 =
    rentByHouses[4] ??
    rentByHouses[rentByHouses.length - 1] ??
    tile.baseRent ??
    0;
  const hotelIncrement = getHotelIncrement(rent4, hotelIncrementMultiplier);
  const baseRent = rentByHouses[houseCount] ?? tile.baseRent ?? 0;
  return baseRent + hotelCount * hotelIncrement;
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
      economy.hotelIncrementMultiplier,
    );

    const hasMonopolyNoDevelopment =
      development === 0 &&
      ownsFullColorSet(tile, boardTiles, ownershipByTile, ownership.owner_player_id);
    if (!hasMonopolyNoDevelopment) {
      return rentWithDevelopment;
    }

    const baseNoHouseRent = tile.rentByHouses?.[0] ?? tile.baseRent ?? 0;
    return baseNoHouseRent * 2;
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
    const multiplier =
      utilityCount >= 2
        ? economy.utilityRentMultipliers.double
        : economy.utilityRentMultipliers.single;
    const rentRoll = typeof lastRoll === "number" ? lastRoll : DEFAULT_UTILITY_ROLL;
    const utilityBaseAmount = economy.utilityBaseAmount ?? 1;
    return rentRoll * multiplier * utilityBaseAmount;
  }

  return null;
};

export const formatCurrencyCompact = (
  amount: number,
  symbol: string = "$",
) => `${symbol}${Math.round(amount).toLocaleString()}`;
