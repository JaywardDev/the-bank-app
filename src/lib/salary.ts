import type { BoardPackEconomy, BoardTile } from "./boardPacks";

type OwnershipByTile = Record<
  number,
  {
    owner_player_id: string | null;
    collateral_loan_id: string | null;
    houses?: number | null;
  }
>;

type EffectiveGoSalaryInput = {
  packEconomy: BoardPackEconomy;
  boardTiles: BoardTile[];
  ownershipByTile: OwnershipByTile;
  playerId: string;
};

export const getDevBreakdown = (dev: number) => {
  const safeDev = Number.isFinite(dev) ? dev : 0;
  const hotelCount = Math.floor(safeDev / 5);
  const houseCount = Math.max(0, safeDev - hotelCount * 5);
  return { hotelCount, houseCount };
};

export const computeEffectiveGoSalary = ({
  packEconomy,
  boardTiles,
  ownershipByTile,
  playerId,
}: EffectiveGoSalaryInput) => {
  const baseGoSalary = packEconomy.passGoAmount ?? 0;
  let bonusFromProperties = 0;

  for (const tile of boardTiles) {
    if (tile.type !== "PROPERTY") {
      continue;
    }

    const ownership = ownershipByTile[tile.index];
    if (!ownership || ownership.owner_player_id !== playerId) {
      continue;
    }

    if (ownership.collateral_loan_id !== null) {
      continue;
    }

    const houseCost = tile.houseCost;
    if (houseCost == null) {
      continue;
    }

    const dev = ownership.houses ?? 0;
    const { hotelCount } = getDevBreakdown(dev);

    if (hotelCount > 0) {
      bonusFromProperties += hotelCount * houseCost;
    }
  }

  return baseGoSalary + bonusFromProperties;
};
