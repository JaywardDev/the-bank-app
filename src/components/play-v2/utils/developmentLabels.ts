import { getMaxDevelopmentLevel as getSharedMaxDevelopmentLevel } from "@/lib/developmentCosts";

const BASE_DEVELOPMENT_LEVEL_LABELS = [
  "Land",
  "Detached House",
  "Two-Storey Building",
  "Row Houses",
  "Luxury Building",
] as const;
const DEFAULT_MAX_SPRITE_LEVEL = 5;

const UPGRADE_LEVEL_PRESENTATIONS: Record<
  number,
  {
    label: string;
    narrativeSentence1: string;
    narrativeSentence2: string;
  }
> = {
  1: {
    label: "single detached house",
    narrativeSentence1:
      "This development establishes a modest single detached home on the property.",
    narrativeSentence2:
      "It gives the lot its first meaningful residential presence.",
  },
  2: {
    label: "two-storey house",
    narrativeSentence1:
      "This upgrade expands the home into a larger two-storey residence.",
    narrativeSentence2:
      "The added space makes the property more attractive to tenants and buyers.",
  },
  3: {
    label: "apartment building",
    narrativeSentence1:
      "This redevelopment converts the site into an apartment building with stronger rental potential.",
    narrativeSentence2:
      "Multi-unit housing improves both density and long-term earning power.",
  },
  4: {
    label: "commercial-residential building",
    narrativeSentence1:
      "This upgrade transforms the property into a commercial-residential building.",
    narrativeSentence2:
      "Mixed-use development increases both visibility and income potential.",
  },
  5: {
    label: "luxury resort and apartments",
    narrativeSentence1:
      "This final redevelopment creates a luxury resort and apartment complex.",
    narrativeSentence2:
      "Prestige and scale push the property into a premium income class.",
  },
};

const DEFAULT_UPGRADE_PRESENTATION = {
  label: "building upgrade",
  narrativeSentence1: "This development improves the property for stronger long-term returns.",
  narrativeSentence2: "It strengthens the lot's economic value over time.",
};

export const getMaxDevelopmentLevel = (rentByHouses?: number[] | null) => {
  return getSharedMaxDevelopmentLevel(rentByHouses);
};

export const getDevelopmentLevelLabel = (
  level: number,
  rentByHouses?: number[] | null,
) => {
  const maxLevel = getMaxDevelopmentLevel(rentByHouses);
  const normalizedLevel = Math.max(0, Math.min(Math.floor(level), maxLevel));

  if (normalizedLevel >= maxLevel) {
    return "Luxury Building";
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

  const spriteLevel = Math.min(normalizedLevel, DEFAULT_MAX_SPRITE_LEVEL);
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
    narrativeSentence1: presentation.narrativeSentence1,
    narrativeSentence2: presentation.narrativeSentence2,
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

  return {
    question,
  };
};
