import { type ReactNode, useEffect, useState } from "react";
import Image from "next/image";
import {
  type BoardPackEconomy,
  type BoardTile,
} from "@/lib/boardPacks";
import {
  getFullColorGroupRent,
  getPropertyRentWithDevelopment,
} from "@/lib/rent";
import { getBoardTileIconSrc } from "@/lib/tileIcons";
import { getDevelopmentLevelLabel } from "@/components/play-v2/utils/developmentLabels";
import { formatCurrency, getCurrencyMetaFromEconomy } from "@/lib/currency";
import { getNextBuildCost, normalizeRentByHousesTiers } from "@/lib/developmentCosts";
import { getPropertyMarketValue } from "@/lib/propertyMarketValue";

const getCanonicalTileType = (tileType: string) => {
  const normalized = tileType.toUpperCase();
  return normalized === "RAIL" ? "RAILROAD" : normalized;
};

const isRailTileType = (tileType: string) =>
  getCanonicalTileType(tileType) === "RAILROAD";

const isOwnableTileType = (tileType: string) => {
  const canonicalType = getCanonicalTileType(tileType);
  return (
    canonicalType === "PROPERTY" ||
    canonicalType === "RAILROAD" ||
    canonicalType === "UTILITY"
  );
};

const TILE_ICON_FALLBACK_SRC = "/icons/dice.svg";

const getTileIconSrc = (tile: BoardTile | null): string | null => {
  return getBoardTileIconSrc(tile);
};

const getDeedIconFallbackLabel = (tile: BoardTile | null): string | null => {
  if (!tile) {
    return null;
  }

  if (tile.type === "RAIL") {
    return "RR";
  }

  if (tile.type === "UTILITY") {
    return "UTIL";
  }

  return null;
};

type TileIconProps = {
  src: string | null;
  alt: string;
  width: number;
  height: number;
  className?: string;
  ariaHidden?: boolean;
};

const TileIcon = ({
  src,
  alt,
  width,
  height,
  className,
  ariaHidden,
}: TileIconProps) => {
  const [currentSrc, setCurrentSrc] = useState(src ?? TILE_ICON_FALLBACK_SRC);

  useEffect(() => {
    setCurrentSrc(src ?? TILE_ICON_FALLBACK_SRC);
  }, [src]);

  if (!src) {
    return null;
  }

  return (
    <Image
      src={currentSrc}
      alt={alt}
      width={width}
      height={height}
      className={className}
      aria-hidden={ariaHidden}
      onError={() => {
        if (currentSrc !== TILE_ICON_FALLBACK_SRC) {
          setCurrentSrc(TILE_ICON_FALLBACK_SRC);
        }
      }}
    />
  );
};

type TitleDeedCardProps = {
  bandColor: string;
  size?: "default" | "compact";
  eyebrow?: string;
  header: ReactNode;
  subheader?: ReactNode;
  rentSection?: ReactNode;
  footer?: ReactNode;
};

const TitleDeedCard = ({
  bandColor,
  size = "default",
  eyebrow,
  header,
  subheader,
  rentSection,
  footer,
}: TitleDeedCardProps) => (
  <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white text-sm text-neutral-900 shadow-sm">
    <div className={`${size === "compact" ? "h-3" : "h-4"} w-full`} style={{ backgroundColor: bandColor }} />
    <div className={`flex min-h-0 flex-1 flex-col ${size === "compact" ? "px-3 pb-3 pt-2" : "px-4 pb-4 pt-3"}`}>
      {eyebrow ? (
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
          {eyebrow}
        </p>
      ) : null}
      {header}
      {subheader}
      {rentSection ? <div className="mt-2 min-h-0 flex-1 overflow-auto pr-1">{rentSection}</div> : null}
      {footer ? (
        <div className={`${size === "compact" ? "mt-3 pt-2" : "mt-4 pt-3"} border-t border-neutral-200`}>{footer}</div>
      ) : null}
    </div>
  </div>
);

type RentRow = { label: string; value: number | null };

const PropertyRentTable = ({
  rentRows,
  nextBuildCost,
  currentRent,
  currency,
  className,
}: {
  rentRows: RentRow[];
  nextBuildCost: number | null;
  currentRent?: number | null;
  currency: { code?: string | null; symbol?: string | null };
  className?: string;
}) => (
  <div
    className={`px-1 py-1 ${className ?? ""}`}
  >
    <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
      Rent
    </p>
    <div className="mt-2 space-y-1 text-xs">
      {rentRows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between text-neutral-600"
        >
          <span>{row.label}</span>
            <span className="font-semibold text-neutral-900">
            {row.value !== null ? formatMoney(row.value, currency) : "—"}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between text-neutral-600">
        <span>Build cost</span>
        <span className="font-semibold text-neutral-900">
          {nextBuildCost !== null ? formatMoney(nextBuildCost, currency) : "—"}
        </span>
      </div>
      {currentRent !== undefined && currentRent !== null ? (
        <div className="mt-2 border-t border-neutral-200 pt-1 text-[11px] font-semibold text-neutral-700">
          Current rent: {formatMoney(currentRent, currency)}
        </div>
      ) : null}
    </div>
  </div>
);

const RailRentTable = ({
  rentRows,
  ownedCount,
  currentRent,
  currency,
  className,
}: {
  rentRows: RentRow[];
  ownedCount: number;
  currentRent: number | null;
  currency: { code?: string | null; symbol?: string | null };
  className?: string;
}) => (
  <div
    className={`rounded-xl border border-neutral-200 bg-white px-3 py-2 ${
      className ?? ""
    }`}
  >
    <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
      Rent
    </p>
    <div className="mt-2 space-y-1 text-xs">
      {rentRows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between text-neutral-600"
        >
          <span>{row.label}</span>
            <span className="font-semibold text-neutral-900">
            {row.value !== null ? formatMoney(row.value, currency) : "—"}
          </span>
        </div>
      ))}
    </div>
    <p className="mt-2 text-[11px] text-neutral-500">Currently owned: {ownedCount} railroads.</p>
    {currentRent !== null ? (
      <p className="mt-1 text-[11px] font-semibold text-neutral-700">
        Current rent: {formatMoney(currentRent, currency)}
      </p>
    ) : null}
  </div>
);

const UtilityRentTable = ({
  ownedCount,
  lastRoll,
  currentRent,
  rentMultipliers,
  currency,
  className,
}: {
  ownedCount: number;
  lastRoll: number | null;
  currentRent: number | null;
  rentMultipliers: BoardPackEconomy["utilityRentMultipliers"];
  currency: { code?: string | null; symbol?: string | null };
  className?: string;
}) => (
  <div
    className={`rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600 ${
      className ?? ""
    }`}
  >
    <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
      Rent
    </p>
    <div className="mt-2 space-y-1">
      <p>
        If one Utility is owned, rent is{" "}
        <span className="font-semibold text-neutral-900">
          {rentMultipliers.single}×
        </span>{" "}
        the dice roll.
      </p>
      <p>
        If both Utilities are owned, rent is{" "}
        <span className="font-semibold text-neutral-900">
          {rentMultipliers.double}×
        </span>{" "}
        the dice roll.
      </p>
      <p>
        If three Utilities are owned, rent is{" "}
        <span className="font-semibold text-neutral-900">
          {rentMultipliers.triple ?? 16}×
        </span>{" "}
        the dice roll.
      </p>
    </div>
    <p className="mt-2 text-[11px] text-neutral-500">
      Rent is based on the dice roll.
    </p>
    <p className="mt-1 text-[11px] text-neutral-500">
      Currently owned: {ownedCount} utilities.
    </p>
    {lastRoll !== null && currentRent !== null ? (
      <p className="mt-1 text-[11px] font-semibold text-neutral-700">
        Current rent (last roll {lastRoll}): {formatMoney(currentRent, currency)}
      </p>
    ) : null}
  </div>
);

const buildRailRentRows = (railRentByCount: number[]): RentRow[] => [
  { label: "Rent", value: railRentByCount[1] ?? null },
  {
    label: "If 2 Railroads are owned",
    value: railRentByCount[2] ?? null,
  },
  {
    label: "If 3 Railroads are owned",
    value: railRentByCount[3] ?? null,
  },
  {
    label: "If 4 Railroads are owned",
    value: railRentByCount[4] ?? null,
  },
];

type OwnershipByTile = Record<
  number,
  {
    owner_player_id: string;
    collateral_loan_id: string | null;
    purchase_mortgage_id: string | null;
    acquired_round?: number | null;
    houses: number;
  }
>;

const formatMoney = (
  amount: number,
  currency: { code?: string | null; symbol?: string | null },
) => formatCurrency(amount, currency);

const getPropertyRentWithDev = (tile: BoardTile, dev: number) =>
  getPropertyRentWithDevelopment(tile, dev);

const getPropertyRentDetails = ({
  tile,
  development = 0,
  ownerPlayerId = null,
  ownershipByTile = {},
  boardTiles = [],
}: {
  tile: BoardTile | null;
  development?: number;
  ownerPlayerId?: string | null;
  ownershipByTile?: OwnershipByTile;
  boardTiles?: BoardTile[];
}) => {
  void ownerPlayerId;
  void ownershipByTile;
  void boardTiles;
  const baseRent =
    tile && typeof tile.baseRent === "number" ? tile.baseRent : null;
  const rentByHouses =
    tile?.rentByHouses && tile.rentByHouses.length > 0
      ? normalizeRentByHousesTiers(tile.rentByHouses)
      : null;
  const baseNoHouseRent = rentByHouses?.[0] ?? baseRent ?? null;
  const fullColorGroupRent = tile ? getFullColorGroupRent(tile) : null;
  const nextBuildCost =
    tile && typeof tile.houseCost === "number"
      ? getNextBuildCost({
          baseCost: tile.houseCost,
          currentLevel: development,
        })
      : null;
  return {
    nextBuildCost,
    rentRows: [
      {
        label: "Base rent",
        value: baseNoHouseRent,
      },
      {
        label: "Full color group rent",
        value: fullColorGroupRent,
      },
      ...Array.from({ length: Math.max((rentByHouses?.length ?? 1) - 1, 0) }, (_, index) => {
        const level = index + 1;
        return {
          label: getDevelopmentLevelLabel(level, rentByHouses),
          value: rentByHouses?.[level] ?? null,
        };
      }),
    ],
  };
};

export type TitleDeedPreviewProps = {
  tile: BoardTile | null;
  bandColor: string;
  boardPackEconomy: BoardPackEconomy;
  eyebrow?: string;
  price?: number | null;
  ownedRailCount?: number;
  ownedUtilityCount?: number;
  mode?: "actions" | "readonly";
  footer?: ReactNode;
  showDevelopment?: boolean;
  developmentCount?: number | null;
  currencySymbol?: string;
  ownerPlayerId?: string | null;
  ownershipByTile?: OwnershipByTile;
  boardTiles?: BoardTile[];
  size?: "default" | "compact";
  currentRound?: number | null;
};

export const TitleDeedPreview = ({
  tile,
  bandColor,
  boardPackEconomy,
  eyebrow,
  price,
  ownedRailCount = 0,
  ownedUtilityCount = 0,
  mode = "actions",
  footer,
  showDevelopment = false,
  developmentCount = null,
  currencySymbol,
  ownerPlayerId = null,
  ownershipByTile = {},
  boardTiles = [],
  size = "default",
  currentRound = null,
}: TitleDeedPreviewProps) => {
  if (!tile || !isOwnableTileType(tile.type)) {
    return null;
  }

  const priceValue =
    typeof price === "number"
      ? price
      : typeof tile.price === "number"
        ? tile.price
        : null;
  const resolvedDevelopment =
    typeof developmentCount === "number" ? developmentCount : null;
  const propertyRent = getPropertyRentDetails({
    tile,
    development: resolvedDevelopment ?? 0,
    ownerPlayerId,
    ownershipByTile,
    boardTiles,
  });
  const railRentRows = isRailTileType(tile.type)
    ? buildRailRentRows(boardPackEconomy.railRentByCount)
    : [];
  const tileName = tile.name ?? "Property";
  const showActions = mode === "actions";
  const resolvedEyebrow = showActions ? eyebrow : undefined;
  const resolvedFooter = showActions ? footer : undefined;
  const tileIconSrc = getTileIconSrc(tile);
  const tileIconFallbackLabel = getDeedIconFallbackLabel(tile);
  const utilityRentMultipliers = boardPackEconomy.utilityRentMultipliers;
  const currentRent =
    tile.type === "PROPERTY" && resolvedDevelopment !== null
      ? getPropertyRentWithDev(tile, resolvedDevelopment)
      : null;
  const resolvedCurrency = getCurrencyMetaFromEconomy(boardPackEconomy);
  const currency = currencySymbol
    ? { ...resolvedCurrency, symbol: currencySymbol }
    : resolvedCurrency;

  const ownership = ownershipByTile[tile.index];
  const marketValueDetails = getPropertyMarketValue({
    basePrice: priceValue ?? 0,
    acquiredRound: ownership?.acquired_round,
    currentRound,
  });
  const marketPriceValue = priceValue === null ? null : marketValueDetails.marketPrice;
  const marketPriceMetaLabel =
    priceValue !== null && marketValueDetails.isAppreciated
      ? `Base ${formatMoney(marketValueDetails.basePrice, currency)} · +${marketValueDetails.appreciationPercent}%`
      : null;

  return (
    <TitleDeedCard
      bandColor={bandColor}
      size={size}
      eyebrow={resolvedEyebrow}
      header={
        isRailTileType(tile.type) ? (
          <div className={`${size === "compact" ? "mt-1 rounded-lg px-2.5 py-2" : "mt-2 rounded-xl px-3 py-3"} border border-neutral-200 bg-neutral-50 text-center`}>
            <div className={`${size === "compact" ? "h-10 w-20" : "h-12 w-24"} mx-auto flex items-center justify-center rounded-md border border-dashed border-neutral-300 text-[10px] font-semibold text-neutral-500`}>
              <TileIcon
                src={tileIconSrc}
                alt=""
                width={48}
                height={48}
                className={`${size === "compact" ? "h-8 w-8" : "h-10 w-10"} object-contain`}
                ariaHidden
              />
              {!tileIconSrc ? tileIconFallbackLabel : null}
            </div>
            <p className={`${size === "compact" ? "mt-1 text-base" : "mt-2 text-lg"} font-black uppercase tracking-wide text-neutral-900`}>
              {tileName}
            </p>
            {priceValue !== null ? (
              <p className={`${size === "compact" ? "text-[11px]" : "text-xs"} font-medium text-neutral-500`}>
                Market price {formatMoney(marketPriceValue ?? 0, currency)}
              </p>
            ) : null}
            {marketPriceMetaLabel ? (
              <p className={`${size === "compact" ? "text-[10px]" : "text-[11px]"} text-neutral-400`}>
                {marketPriceMetaLabel}
              </p>
            ) : null}
          </div>
        ) : tile.type === "UTILITY" ? (
          <div className={`${size === "compact" ? "mt-1 rounded-lg px-2.5 py-2" : "mt-2 rounded-xl px-3 py-3"} border border-neutral-200 bg-neutral-50 text-center`}>
            <div className={`${size === "compact" ? "h-10 w-20" : "h-12 w-24"} mx-auto flex items-center justify-center rounded-md border border-dashed border-neutral-300 text-[10px] font-semibold text-neutral-500`}>
              <TileIcon
                src={tileIconSrc}
                alt=""
                width={48}
                height={48}
                className={`${size === "compact" ? "h-8 w-8" : "h-10 w-10"} object-contain`}
                ariaHidden
              />
              {!tileIconSrc ? tileIconFallbackLabel : null}
            </div>
            <p className={`${size === "compact" ? "mt-1 text-base" : "mt-2 text-lg"} font-black uppercase tracking-wide text-neutral-900`}>
              {tileName}
            </p>
            {priceValue !== null ? (
              <p className={`${size === "compact" ? "text-[11px]" : "text-xs"} font-medium text-neutral-500`}>
                Market price {formatMoney(marketPriceValue ?? 0, currency)}
              </p>
            ) : null}
            {marketPriceMetaLabel ? (
              <p className={`${size === "compact" ? "text-[10px]" : "text-[11px]"} text-neutral-400`}>
                {marketPriceMetaLabel}
              </p>
            ) : null}
          </div>
        ) : (
          <p className={`${size === "compact" ? "mt-0.5 text-base" : "mt-1 text-lg"} font-black uppercase tracking-wide text-neutral-900`}>
            {tileName}
          </p>
        )
      }
      subheader={
        tile.type === "PROPERTY" && priceValue !== null ? (
          <div>
            <p className={`${size === "compact" ? "text-[11px]" : "text-xs"} font-medium text-neutral-500`}>
              Market price {formatMoney(marketPriceValue ?? 0, currency)}
            </p>
            {marketPriceMetaLabel ? (
              <p className={`${size === "compact" ? "text-[10px]" : "text-[11px]"} text-neutral-400`}>
                {marketPriceMetaLabel}
              </p>
            ) : null}
          </div>
        ) : null
      }
      rentSection={
        isRailTileType(tile.type) ? (
          <RailRentTable
            className={size === "compact" ? "" : "mt-1"}
            rentRows={railRentRows}
            ownedCount={ownedRailCount}
            currentRent={null}
            currency={currency}
          />
        ) : tile.type === "UTILITY" ? (
          <UtilityRentTable
            className={size === "compact" ? "" : "mt-1"}
            ownedCount={ownedUtilityCount}
            lastRoll={null}
            currentRent={null}
            rentMultipliers={utilityRentMultipliers}
            currency={currency}
          />
        ) : (
          <div className={size === "compact" ? "space-y-1.5" : "mt-1 space-y-2"}>
            <PropertyRentTable
              rentRows={propertyRent.rentRows}
              nextBuildCost={propertyRent.nextBuildCost}
              currentRent={resolvedDevelopment !== null ? currentRent : undefined}
              currency={currency}
            />
          </div>
        )
      }
      footer={resolvedFooter}
    />
  );
};
