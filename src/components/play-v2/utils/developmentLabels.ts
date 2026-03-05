const BASE_DEVELOPMENT_LEVEL_LABELS = [
  "Land",
  "Detached House",
  "Luxury House",
  "Row Houses",
  "Mid-rise Apartment",
] as const;

const DEFAULT_MAX_DEVELOPMENT_LEVEL = 5;

export const getMaxDevelopmentLevel = (rentByHouses?: number[] | null) => {
  const inferredMax = (rentByHouses?.length ?? 0) - 1;
  return inferredMax >= 0 ? inferredMax : DEFAULT_MAX_DEVELOPMENT_LEVEL;
};

export const getDevelopmentLevelLabel = (
  level: number,
  rentByHouses?: number[] | null,
) => {
  const maxLevel = getMaxDevelopmentLevel(rentByHouses);
  const normalizedLevel = Math.max(0, Math.min(Math.floor(level), maxLevel));

  if (normalizedLevel >= maxLevel) {
    return "Luxury Hotel";
  }

  return (
    BASE_DEVELOPMENT_LEVEL_LABELS[normalizedLevel] ??
    BASE_DEVELOPMENT_LEVEL_LABELS[BASE_DEVELOPMENT_LEVEL_LABELS.length - 1]
  );
};
