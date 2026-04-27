export const PROPERTY_APPRECIATION_STEP_ROUNDS = 5;
export const PROPERTY_APPRECIATION_RATE_PER_STEP = 0.07;
export const PROPERTY_APPRECIATION_RATE_CAP = 1;

type PropertyMarketValueInput = {
  basePrice: number;
  acquiredRound?: number | null;
  currentRound?: number | null;
};

type PropertyMarketValueResult = {
  basePrice: number;
  marketPrice: number;
  roundsHeld: number;
  appreciationSteps: number;
  appreciationRate: number;
  appreciationPercent: number;
  isAppreciated: boolean;
};

const toSafeBasePrice = (basePrice: number) => {
  if (!Number.isFinite(basePrice)) {
    return 0;
  }
  return Math.max(0, basePrice);
};

export const getPropertyMarketValue = ({
  basePrice,
  acquiredRound,
  currentRound,
}: PropertyMarketValueInput): PropertyMarketValueResult => {
  const resolvedBasePrice = toSafeBasePrice(basePrice);

  if (
    acquiredRound === null ||
    acquiredRound === undefined ||
    typeof acquiredRound !== "number" ||
    typeof currentRound !== "number" ||
    !Number.isFinite(acquiredRound) ||
    !Number.isFinite(currentRound)
  ) {
    return {
      basePrice: resolvedBasePrice,
      marketPrice: Math.round(resolvedBasePrice),
      roundsHeld: 0,
      appreciationSteps: 0,
      appreciationRate: 0,
      appreciationPercent: 0,
      isAppreciated: false,
    };
  }

  const roundsHeld = Math.max(0, currentRound - acquiredRound);
  const appreciationSteps = Math.max(
    0,
    Math.floor(roundsHeld / PROPERTY_APPRECIATION_STEP_ROUNDS),
  );
  const appreciationRate = Math.min(
    appreciationSteps * PROPERTY_APPRECIATION_RATE_PER_STEP,
    PROPERTY_APPRECIATION_RATE_CAP,
  );
  const marketPrice = Math.round(resolvedBasePrice * (1 + appreciationRate));

  return {
    basePrice: resolvedBasePrice,
    marketPrice,
    roundsHeld,
    appreciationSteps,
    appreciationRate,
    appreciationPercent: Math.round(appreciationRate * 100),
    isAppreciated: appreciationRate > 0,
  };
};
