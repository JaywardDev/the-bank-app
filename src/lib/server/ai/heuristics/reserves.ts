import "server-only";

export const calculateReserve = ({
  propertyPrice,
  passGoAmount,
  completion,
}: {
  propertyPrice: number;
  passGoAmount: number;
  completion: boolean;
}) =>
  completion
    ? Math.max(propertyPrice * 0.4, passGoAmount)
    : Math.max(propertyPrice * 0.75, passGoAmount * 1.5);
