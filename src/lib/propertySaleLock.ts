export const PROPERTY_SALE_LOCK_ROUNDS = 3;

export const isPropertySaleLocked = (
  acquiredRound: number | null,
  currentRound: number,
): boolean => {
  if (acquiredRound === null) {
    return false;
  }
  return currentRound < acquiredRound + PROPERTY_SALE_LOCK_ROUNDS;
};
