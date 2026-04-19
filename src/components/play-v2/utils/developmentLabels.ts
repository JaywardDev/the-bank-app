const BASE_DEVELOPMENT_LEVEL_LABELS = [
  "Land",
  "Detached House",
  "Luxury House",
  "Row Houses",
  "Mid-rise Apartment",
] as const;

const DEFAULT_MAX_DEVELOPMENT_LEVEL = 5;

const UPGRADE_LEVEL_PRESENTATIONS: Record<
  number,
  {
    label: string;
    narrative: string;
  }
> = {
  1: {
    label: "single detached house",
    narrative:
      "This development establishes a modest single detached home on the property.",
  },
  2: {
    label: "two-storey house",
    narrative:
      "This upgrade expands the home into a larger two-storey residence.",
  },
  3: {
    label: "apartment building",
    narrative:
      "This redevelopment converts the site into an apartment building with stronger rental potential.",
  },
  4: {
    label: "commercial-residential building",
    narrative:
      "This upgrade transforms the property into a commercial-residential building.",
  },
  5: {
    label: "luxury resort and apartments",
    narrative:
      "This final redevelopment creates a luxury resort and apartment complex.",
  },
};

const DEFAULT_UPGRADE_PRESENTATION = {
  label: "building upgrade",
  narrative: "This development improves the property for stronger long-term returns.",
};

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

export const getDevelopmentSpriteForLevel = (level: number) => {
  const normalizedLevel = Math.max(0, Math.floor(level));
  if (normalizedLevel <= 0) {
    return null;
  }

  const spriteLevel = Math.min(normalizedLevel, DEFAULT_MAX_DEVELOPMENT_LEVEL);
  return `/assets/house-${spriteLevel}.svg`;
};

export const getDevelopmentUpgradePresentation = (
  level: number,
  rentByHouses?: number[] | null,
) => {
  const maxLevel = getMaxDevelopmentLevel(rentByHouses);
  const normalizedLevel = Math.max(1, Math.min(Math.floor(level), maxLevel));
  const presentation =
    UPGRADE_LEVEL_PRESENTATIONS[normalizedLevel] ?? DEFAULT_UPGRADE_PRESENTATION;

  return {
    level: normalizedLevel,
    label: presentation.label,
    narrative: presentation.narrative,
    spriteSrc: getDevelopmentSpriteForLevel(normalizedLevel),
  };
};

export const getBuildUpgradeConfirmationCopy = (args: {
  currentLevel: number;
  targetLabel: string;
  useConstructionVoucher?: "BUILD" | "UPGRADE";
  formattedCost: string;
  hasCashCost: boolean;
}) => {
  const {
    currentLevel,
    targetLabel,
    useConstructionVoucher,
    formattedCost,
    hasCashCost,
  } = args;
  const actionVerb = currentLevel <= 0 ? "Build" : "Upgrade to";
  const labelWithArticle = /^[aeiou]/i.test(targetLabel)
    ? `an ${targetLabel}`
    : `a ${targetLabel}`;
  const usingVoucher = Boolean(useConstructionVoucher);
  const question = usingVoucher
    ? `${actionVerb} ${labelWithArticle} using voucher?`
    : hasCashCost
      ? `${actionVerb} ${labelWithArticle} for ${formattedCost}?`
      : `${actionVerb} ${labelWithArticle} for listed cash cost?`;
  const paymentSummary = usingVoucher
    ? `Payment: ${useConstructionVoucher === "BUILD" ? "Build" : "Upgrade"} voucher`
    : `Payment: Cash (${hasCashCost ? formattedCost : "cost unavailable"})`;

  return {
    question,
    paymentSummary,
  };
};
