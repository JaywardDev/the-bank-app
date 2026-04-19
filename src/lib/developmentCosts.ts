const BUILD_COST_MULTIPLIERS = [1, 1.1, 1.3, 1.35, 1.4] as const;

const DEFAULT_MAX_DEVELOPMENT_LEVEL = BUILD_COST_MULTIPLIERS.length;

export const getBuildCostMultipliers = () => [...BUILD_COST_MULTIPLIERS];

export const normalizeRentByHousesTiers = (rentByHouses?: number[] | null) => {
  if (!rentByHouses || rentByHouses.length === 0) {
    return rentByHouses ?? null;
  }

  if (rentByHouses.length !== 5) {
    return [...rentByHouses];
  }

  const tier4 = rentByHouses[3] ?? rentByHouses[4] ?? 0;
  const tier5 = rentByHouses[4] ?? tier4;
  if (tier5 <= tier4) {
    return [...rentByHouses.slice(0, 4), tier4, rentByHouses[4]];
  }
  const insertedTier = Math.min(
    tier5 - 1,
    Math.max(tier4 + 1, Math.round((tier4 + tier5) / 2)),
  );

  return [...rentByHouses.slice(0, 4), insertedTier, rentByHouses[4]];
};

export const getMaxDevelopmentLevel = (rentByHouses?: number[] | null) => {
  const normalizedRentByHouses = normalizeRentByHousesTiers(rentByHouses);
  if (!normalizedRentByHouses || normalizedRentByHouses.length === 0) {
    return DEFAULT_MAX_DEVELOPMENT_LEVEL;
  }
  return Math.max(normalizedRentByHouses.length - 1, 0);
};

export const getNextBuildCost = ({
  baseCost,
  currentLevel,
}: {
  baseCost: number;
  currentLevel: number;
}) => {
  const normalizedBaseCost = Number.isFinite(baseCost) ? Math.max(0, baseCost) : 0;
  const normalizedLevel = Number.isFinite(currentLevel)
    ? Math.max(0, Math.floor(currentLevel))
    : 0;
  const multiplierIndex = Math.min(
    normalizedLevel,
    BUILD_COST_MULTIPLIERS.length - 1,
  );
  const multiplier = BUILD_COST_MULTIPLIERS[multiplierIndex];
  return Math.round(normalizedBaseCost * multiplier);
};
