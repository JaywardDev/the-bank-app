export const PROPERTY_SALE_LOCK_ROUNDS = 3;

export const getPropertySaleLockInfo = (
  acquiredRound: number | null,
  currentRound: number,
): { isLocked: boolean; roundsRemaining: number } => {
  if (acquiredRound === null) {
    return { isLocked: false, roundsRemaining: 0 };
  }

  const roundsRemaining = Math.max(
    0,
    acquiredRound + PROPERTY_SALE_LOCK_ROUNDS - currentRound,
  );
  return {
    isLocked: roundsRemaining > 0,
    roundsRemaining,
  };
};

export const isPropertySaleLocked = (
  acquiredRound: number | null,
  currentRound: number,
): boolean => {
  return getPropertySaleLockInfo(acquiredRound, currentRound).isLocked;
};
