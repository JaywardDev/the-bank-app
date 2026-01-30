type HousesDotsProps = {
  houses: number;
  size: "sm" | "md";
};

export default function HousesDots({ houses, size }: HousesDotsProps) {
  if (!Number.isFinite(houses) || houses <= 0) {
    return null;
  }

  const count = Math.min(4, Math.floor(houses));
  const dotSize = size === "sm" ? "h-1.5 w-1.5" : "h-2.5 w-2.5";
  const gapSize = size === "sm" ? "gap-0.5" : "gap-1";

  return (
    <div
      className={`flex items-center ${gapSize}`}
      aria-label={`${count} house${count === 1 ? "" : "s"}`}
    >
      {Array.from({ length: count }).map((_, index) => (
        <span
          key={index}
          className={`${dotSize} rounded-full bg-emerald-500`}
        />
      ))}
    </div>
  );
}
