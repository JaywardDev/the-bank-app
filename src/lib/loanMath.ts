export const PURCHASE_DOWN_PAYMENT_PERCENTS = [30, 40, 50, 60, 70, 80] as const;

export type PurchaseDownPaymentPercent =
  (typeof PURCHASE_DOWN_PAYMENT_PERCENTS)[number];

export const isValidPurchaseDownPaymentPercent = (
  value: unknown,
): value is PurchaseDownPaymentPercent =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  PURCHASE_DOWN_PAYMENT_PERCENTS.includes(value as PurchaseDownPaymentPercent);

export const clampToPurchaseDownPaymentPercent = (
  value: number,
): PurchaseDownPaymentPercent => {
  const rounded = Math.round(value / 10) * 10;
  if (rounded <= PURCHASE_DOWN_PAYMENT_PERCENTS[0]) {
    return PURCHASE_DOWN_PAYMENT_PERCENTS[0];
  }
  if (rounded >= PURCHASE_DOWN_PAYMENT_PERCENTS[PURCHASE_DOWN_PAYMENT_PERCENTS.length - 1]) {
    return PURCHASE_DOWN_PAYMENT_PERCENTS[PURCHASE_DOWN_PAYMENT_PERCENTS.length - 1];
  }
  return rounded as PurchaseDownPaymentPercent;
};

export const defaultPurchaseDownPaymentPercentFromMortgageLtv = (
  mortgageLtv: number,
): PurchaseDownPaymentPercent =>
  clampToPurchaseDownPaymentPercent((1 - mortgageLtv) * 100);

export const calculateDownPaymentAmount = (
  price: number,
  downPaymentPercent: PurchaseDownPaymentPercent,
) => Math.round((price * downPaymentPercent) / 100);

export const calculateMortgagePrincipalFromDownPayment = (
  price: number,
  downPaymentPercent: PurchaseDownPaymentPercent,
) => price - calculateDownPaymentAmount(price, downPaymentPercent);

export const calculateAmortizedPaymentPerTurn = (
  principal: number,
  ratePerTurn: number,
  termTurns: number,
) => {
  if (principal <= 0 || termTurns <= 0) {
    return 0;
  }

  if (ratePerTurn <= 0) {
    return Math.round(principal / termTurns);
  }

  const denominator = 1 - (1 + ratePerTurn) ** (-termTurns);
  if (denominator <= 0) {
    return Math.round(principal / termTurns);
  }

  return Math.round((principal * ratePerTurn) / denominator);
};
