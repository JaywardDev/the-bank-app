import {
  DEFAULT_BOARD_PACK_ECONOMY,
  DEFAULT_HOUSE_IMPROVEMENT_VALUE_MULTIPLIERS,
  type BoardPackEconomy,
  type BoardTile,
} from "@/lib/boardPacks";
import {
  getInlandDevelopmentCost,
  getInlandExplorationCost,
  normalizeInlandCellRecords,
  type InlandCellRecord,
} from "@/lib/inlandExploration";
import { getPropertyMarketValue } from "@/lib/propertyMarketValue";

const OWNABLE_TILE_TYPES = new Set<BoardTile["type"]>(["PROPERTY", "RAIL", "UTILITY"]);

export const DEFAULT_INLAND_LAND_BASE_VALUE_RATIO = 0.2;

type OwnershipByTileForNetWorth = Record<
  number,
  {
    owner_player_id: string;
    acquired_round?: number | null;
    houses?: number | null;
  }
>;

type PlayerLoanForNetWorth = {
  principal: number;
  remaining_principal: number | null;
};

type PurchaseMortgageForNetWorth = {
  principal_remaining: number;
  accrued_interest_unpaid: number;
};

export type OwnedInlandAssetValueBreakdownEntry = {
  key: string;
  status: InlandCellRecord["status"];
  landBaseValue: number;
  developmentValue: number;
  totalValue: number;
};

export type OwnedInlandAssetValueBreakdown = {
  total: number;
  entries: OwnedInlandAssetValueBreakdownEntry[];
};

export const getInlandLandBaseValueRatio = (
  boardPackEconomy?: Pick<BoardPackEconomy, "inlandLandBaseValueRatio" | "passGoAmount"> | null,
) => boardPackEconomy?.inlandLandBaseValueRatio ?? DEFAULT_INLAND_LAND_BASE_VALUE_RATIO;

export const computeOwnedPropertyImprovementAssetValue = ({
  tile,
  ownership,
  boardPackEconomy,
}: {
  tile: BoardTile;
  ownership: { houses?: number | null } | null | undefined;
  boardPackEconomy?: Pick<BoardPackEconomy, "houseImprovementValueMultipliers"> | null;
}) => {
  if (tile.type !== "PROPERTY") {
    return 0;
  }

  const rawHouses = ownership?.houses;
  const normalizedHouses = Number.isFinite(rawHouses) ? Math.max(0, Math.floor(rawHouses ?? 0)) : 0;
  if (normalizedHouses <= 0) {
    return 0;
  }

  const rawHouseCost = tile.houseCost;
  const houseCost = Number.isFinite(rawHouseCost) ? Math.max(0, rawHouseCost ?? 0) : 0;
  if (houseCost <= 0) {
    return 0;
  }

  const configuredMultipliers = boardPackEconomy?.houseImprovementValueMultipliers;
  const multipliers =
    Array.isArray(configuredMultipliers) && configuredMultipliers.length > 0
      ? configuredMultipliers
      : DEFAULT_HOUSE_IMPROVEMENT_VALUE_MULTIPLIERS;
  const highestConfiguredMultiplierLevel = Math.max(0, multipliers.length - 1);
  const effectiveValuationLevel = Math.min(normalizedHouses, highestConfiguredMultiplierLevel);
  const rawMultiplier = multipliers[effectiveValuationLevel];
  const multiplier = Number.isFinite(rawMultiplier) ? Math.max(0, rawMultiplier) : 0;

  return normalizedHouses * houseCost * multiplier;
};


export const COLLATERAL_LOAN_LTV = 0.6;

export const computeOwnedPropertyCollateralBaseValue = ({
  tile,
  ownership,
  currentRound,
  boardPackEconomy,
}: {
  tile: BoardTile;
  ownership: { acquired_round?: number | null; houses?: number | null } | null | undefined;
  currentRound?: number | null;
  boardPackEconomy?: Pick<BoardPackEconomy, "houseImprovementValueMultipliers"> | null;
}) => {
  const tilePrice = Number.isFinite(tile.price) ? Math.max(0, tile.price ?? 0) : 0;
  const marketPrice = getPropertyMarketValue({
    basePrice: tilePrice,
    acquiredRound: ownership?.acquired_round,
    currentRound,
  }).marketPrice;
  const improvementAssetValue = computeOwnedPropertyImprovementAssetValue({
    tile,
    ownership,
    boardPackEconomy,
  });

  return marketPrice + improvementAssetValue;
};

export const computeOwnedPropertyCollateralPrincipal = ({
  tile,
  ownership,
  currentRound,
  boardPackEconomy,
}: {
  tile: BoardTile;
  ownership: { acquired_round?: number | null; houses?: number | null } | null | undefined;
  currentRound?: number | null;
  boardPackEconomy?: Pick<BoardPackEconomy, "houseImprovementValueMultipliers"> | null;
}) =>
  Math.round(
    computeOwnedPropertyCollateralBaseValue({
      tile,
      ownership,
      currentRound,
      boardPackEconomy,
    }) * COLLATERAL_LOAN_LTV,
  );
export const computeOwnedInlandAssetValue = ({
  inlandExploredCells,
  boardPackEconomy,
  playerId,
}: {
  inlandExploredCells: unknown;
  boardPackEconomy?: Pick<BoardPackEconomy, "inlandLandBaseValueRatio" | "passGoAmount"> | null;
  playerId: string;
}): OwnedInlandAssetValueBreakdown => {
  const inlandCells = normalizeInlandCellRecords(inlandExploredCells);
  const goSalary = boardPackEconomy?.passGoAmount ?? DEFAULT_BOARD_PACK_ECONOMY.passGoAmount ?? 0;
  const explorationCost = getInlandExplorationCost(goSalary);
  const landBaseRatio = getInlandLandBaseValueRatio(boardPackEconomy);

  const entries: OwnedInlandAssetValueBreakdownEntry[] = [];

  for (const inlandCell of inlandCells.values()) {
    if (!inlandCell.ownerPlayerId || inlandCell.ownerPlayerId !== playerId) {
      continue;
    }

    const landBaseValue = Math.round(landBaseRatio * explorationCost);

    if (inlandCell.status !== "DEVELOPED_SITE") {
      entries.push({
        key: inlandCell.key,
        status: inlandCell.status,
        landBaseValue,
        developmentValue: 0,
        totalValue: landBaseValue,
      });
      continue;
    }

    if (!inlandCell.developedSiteType) {
      entries.push({
        key: inlandCell.key,
        status: inlandCell.status,
        landBaseValue,
        developmentValue: 0,
        totalValue: landBaseValue,
      });
      continue;
    }

    const developmentValue = getInlandDevelopmentCost(inlandCell.developedSiteType, goSalary) ?? 0;
    entries.push({
      key: inlandCell.key,
      status: inlandCell.status,
      landBaseValue,
      developmentValue,
      totalValue: landBaseValue + developmentValue,
    });
  }

  return {
    total: entries.reduce((sum, entry) => sum + entry.totalValue, 0),
    entries,
  };
};

export type AuthoritativeNetWorthInput = {
  currentCash: number;
  currentRound?: number | null;
  playerId: string;
  boardTiles: BoardTile[];
  ownershipByTile: OwnershipByTileForNetWorth;
  activeCollateralLoans: PlayerLoanForNetWorth[];
  activePurchaseMortgages: PurchaseMortgageForNetWorth[];
  inlandExploredCells?: unknown;
  boardPackEconomy?: Pick<
    BoardPackEconomy,
    "inlandLandBaseValueRatio" | "passGoAmount" | "houseImprovementValueMultipliers"
  > | null;
};

export type AuthoritativeNetWorthBreakdown = {
  currentCash: number;
  boardAssetValue: number;
  improvementAssetValue: number;
  inlandAssetValue: number;
  assetValue: number;
  totalLiabilities: number;
  netWorth: number;
  inlandBreakdown: OwnedInlandAssetValueBreakdown;
};

export const computeAuthoritativeNetWorthBreakdown = ({
  currentCash,
  currentRound,
  playerId,
  boardTiles,
  ownershipByTile,
  activeCollateralLoans,
  activePurchaseMortgages,
  inlandExploredCells,
  boardPackEconomy,
}: AuthoritativeNetWorthInput): AuthoritativeNetWorthBreakdown => {
  let boardAssetValue = 0;
  let improvementAssetValue = 0;

  for (const tile of boardTiles) {
    if (!OWNABLE_TILE_TYPES.has(tile.type)) {
      continue;
    }

    const ownership = ownershipByTile[tile.index];
    if (!ownership || ownership.owner_player_id !== playerId) {
      continue;
    }

    const tilePrice = Number.isFinite(tile.price) ? Math.max(0, tile.price ?? 0) : 0;
    boardAssetValue += getPropertyMarketValue({
      basePrice: tilePrice,
      acquiredRound: ownership.acquired_round,
      currentRound,
    }).marketPrice;
    improvementAssetValue += computeOwnedPropertyImprovementAssetValue({
      tile,
      ownership,
      boardPackEconomy,
    });
  }

  const inlandBreakdown = computeOwnedInlandAssetValue({
    inlandExploredCells,
    boardPackEconomy,
    playerId,
  });

  const collateralLiabilities = activeCollateralLoans.reduce((sum, loan) => {
    const principalRemaining =
      typeof loan.remaining_principal === "number" ? loan.remaining_principal : loan.principal;
    return sum + principalRemaining;
  }, 0);

  const purchaseMortgageLiabilities = activePurchaseMortgages.reduce(
    (sum, mortgage) => sum + mortgage.principal_remaining + mortgage.accrued_interest_unpaid,
    0,
  );

  const totalLiabilities = collateralLiabilities + purchaseMortgageLiabilities;
  const inlandAssetValue = inlandBreakdown.total;
  const assetValue = boardAssetValue + improvementAssetValue + inlandAssetValue;

  return {
    currentCash,
    boardAssetValue,
    improvementAssetValue,
    inlandAssetValue,
    assetValue,
    totalLiabilities,
    netWorth: currentCash + assetValue - totalLiabilities,
    inlandBreakdown,
  };
};
