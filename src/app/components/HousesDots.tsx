import Image from "next/image";

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

  const hotelCount = Math.floor(normalizedDev / 5);
  const houseCount = normalizedDev % 5;
  const iconSizeClass = size === "sm" ? "h-3 w-3" : "h-4 w-4";

  const icons =
    hotelCount >= 1
      ? [
          ...Array.from({ length: hotelCount }, () => ({
            src: "/icons/hotel.svg",
            alt: "Hotel",
          })),
          ...Array.from({ length: houseCount }, () => ({
            src: "/icons/house.svg",
            alt: "House",
          })),
        ]
      : Array.from({ length: houseCount }, () => ({
          src: "/icons/house.svg",
          alt: "House",
        }));

  return (
    <div
      className="flex flex-wrap items-center gap-0.5"
      aria-label="Development"
    >
      {icons.map((icon, index) => (
        <Image
          key={`${icon.alt}-${index}`}
          src={icon.src}
          alt={icon.alt}
          width={size === "sm" ? 12 : 16}
          height={size === "sm" ? 12 : 16}
          className={`${iconSizeClass} object-contain`}
        />
      ))}
    </div>
  );
}
