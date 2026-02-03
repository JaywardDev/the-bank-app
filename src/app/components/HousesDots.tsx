type HousesDotsProps = {
  houses: number;
  size: "sm" | "md";
};

export default function HousesDots({ houses, size }: HousesDotsProps) {
  const normalizedDev = Number.isFinite(houses)
    ? Math.max(0, Math.floor(houses))
    : 0;
  if (normalizedDev <= 0) {
    return null;
  }

  const dotSize = size === "sm" ? "h-1.5 w-1.5" : "h-2.5 w-2.5";
  const hotelCount = Math.floor(normalizedDev / 5);
  const dotColor =
    hotelCount >= 1 ? "bg-red-500" : "bg-emerald-500";
  const ariaLabel =
    hotelCount >= 1 ? "Hotel development" : "House development";

  return (
    <div className="flex items-center" aria-label={ariaLabel}>
      <span className={`${dotSize} rounded-full ${dotColor}`} />
    </div>
  );
}
