"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import PageShell from "../components/PageShell";
import BoardMiniMap from "../components/BoardMiniMap";
import InfoTooltip from "@/app/components/InfoTooltip";
import HousesDots from "../components/HousesDots";
import {
  DEFAULT_BOARD_PACK_ECONOMY,
  getBoardPackById,
  type BoardPackEconomy,
  type BoardTile,
} from "@/lib/boardPacks";
import {
  getMutedGroupTintClass,
  getTileBandColor,
} from "@/lib/boardTileStyles";
import { getRules } from "@/lib/rules";
import { getPropertyRentWithDevelopment } from "@/lib/rent";
import { supabaseClient, type SupabaseSession } from "@/lib/supabase/client";
import Image from "next/image";
import { getBoardTileIconSrc } from "@/lib/tileIcons";

const lastGameKey = "bank.lastGameId";
const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "true";
const EVENT_FETCH_LIMIT = 100;
const EVENT_LOG_LIMIT = 10;
const TRANSACTION_DISPLAY_LIMIT = 30;
const MINI_BOARD_COLLAPSED_STORAGE_KEY = "thebank:miniBoardCollapsed";
const fallbackExpandedTiles: BoardTile[] = Array.from(
  { length: 40 },
  (_, index) => ({
    index,
    tile_id: `tile-${index}`,
    type: index === 0 ? "START" : "PROPERTY",
    name: `Tile ${index}`,
  }),
);
const expandedOwnershipPalette = [
  { border: "rgba(37, 99, 235, 0.9)", inset: "rgba(37, 99, 235, 0.28)" },
  { border: "rgba(220, 38, 38, 0.9)", inset: "rgba(220, 38, 38, 0.26)" },
  { border: "rgba(5, 150, 105, 0.9)", inset: "rgba(5, 150, 105, 0.25)" },
  { border: "rgba(124, 58, 237, 0.9)", inset: "rgba(124, 58, 237, 0.26)" },
  { border: "rgba(217, 119, 6, 0.9)", inset: "rgba(217, 119, 6, 0.24)" },
  { border: "rgba(8, 145, 178, 0.9)", inset: "rgba(8, 145, 178, 0.24)" },
];

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

const getPlayerInitials = (name: string | null) => {
  if (!name) {
    return "P";
  }

  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0]?.slice(0, 2).toUpperCase() ?? "P";
  }

  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
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


type PropertyCardShellProps = {
  bandColor: string;
  children: ReactNode;
  bodyClassName?: string;
};

const PropertyCardShell = ({
  bandColor,
  children,
  bodyClassName,
}: PropertyCardShellProps) => (
  <div className="overflow-hidden rounded-2xl border">
    <div className="h-2 w-full" style={{ backgroundColor: bandColor }} />
    <div className={`p-3 ${bodyClassName ?? ""}`}>{children}</div>
  </div>
);

type TitleDeedCardProps = {
  bandColor: string;
  eyebrow?: string;
  header: ReactNode;
  subheader?: ReactNode;
  rentSection?: ReactNode;
  footer?: ReactNode;
};

const TitleDeedCard = ({
  bandColor,
  eyebrow,
  header,
  subheader,
  rentSection,
  footer,
}: TitleDeedCardProps) => (
  <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white text-sm text-neutral-900 shadow-sm">
    <div className="h-4 w-full" style={{ backgroundColor: bandColor }} />
    <div className="px-4 pb-4 pt-3">
      {eyebrow ? (
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
          {eyebrow}
        </p>
      ) : null}
      {header}
      {subheader}
      {rentSection}
      {footer ? (
        <div className="mt-4 border-t border-neutral-200 pt-3">{footer}</div>
      ) : null}
    </div>
  </div>
);

type RentRow = { label: string; value: number | null };

const PropertyRentTable = ({
  rentRows,
  houseCost,
  hotelIncrement,
  currentRent,
  currencySymbol = "$",
  className,
}: {
  rentRows: RentRow[];
  houseCost: number | null;
  hotelIncrement: number | null;
  currentRent?: number | null;
  currencySymbol?: string;
  className?: string;
}) => (
  <div
    className={`rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 ${
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
            {row.value !== null ? formatMoney(row.value, currencySymbol) : "—"}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between text-neutral-600">
        <span>Hotel increment</span>
        <span className="font-semibold text-neutral-900">
          {hotelIncrement !== null ? `${formatSignedMoney(hotelIncrement, currencySymbol)} per hotel` : "—"}
        </span>
      </div>
    </div>
    {currentRent !== undefined ? (
      <div className="mt-2 text-xs font-semibold text-neutral-700">
        Current rent: {currentRent !== null ? formatMoney(currentRent, currencySymbol) : "—"}
      </div>
    ) : null}
    <div className="mt-2 border-t border-neutral-200 pt-2 text-xs font-medium text-neutral-700">
      House cost: {houseCost ? `${formatMoney(houseCost, currencySymbol)} each` : "—"}
    </div>
  </div>
);

const RailRentTable = ({
  rentRows,
  ownedCount,
  currentRent,
  currencySymbol = "$",
  className,
}: {
  rentRows: RentRow[];
  ownedCount: number;
  currentRent: number | null;
  currencySymbol?: string;
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
            {row.value !== null ? formatMoney(row.value, currencySymbol) : "—"}
          </span>
        </div>
      ))}
    </div>
    <p className="mt-2 text-[11px] text-neutral-500">
      Currently owned: {ownedCount} railroads.
    </p>
    {currentRent !== null ? (
      <p className="mt-1 text-[11px] font-semibold text-neutral-700">
        Current rent: {formatMoney(currentRent, currencySymbol)}
      </p>
    ) : null}
  </div>
);

const UtilityRentTable = ({
  ownedCount,
  lastRoll,
  currentRent,
  rentMultipliers,
  currencySymbol = "$",
  className,
}: {
  ownedCount: number;
  lastRoll: number | null;
  currentRent: number | null;
  rentMultipliers: BoardPackEconomy["utilityRentMultipliers"];
  currencySymbol?: string;
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
    </div>
    <p className="mt-2 text-[11px] text-neutral-500">
      Rent is based on the dice roll.
    </p>
    <p className="mt-1 text-[11px] text-neutral-500">
      Currently owned: {ownedCount} utilities.
    </p>
    {lastRoll !== null && currentRent !== null ? (
      <p className="mt-1 text-[11px] font-semibold text-neutral-700">
        Current rent (last roll {lastRoll}): {formatMoney(currentRent, currencySymbol)}
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

type TitleDeedPreviewProps = {
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
};

const TitleDeedPreview = ({
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
  currencySymbol = "$",
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
  const propertyRent = getPropertyRentDetails(tile);
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
  const resolvedDevelopment =
    typeof developmentCount === "number" ? developmentCount : null;
  const currentRent =
    tile.type === "PROPERTY" && resolvedDevelopment !== null
      ? getPropertyRentWithDev(tile, resolvedDevelopment)
      : null;

  return (
    <TitleDeedCard
      bandColor={bandColor}
      eyebrow={resolvedEyebrow}
      header={
        isRailTileType(tile.type) ? (
          <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-center">
            <div className="mx-auto flex h-12 w-24 items-center justify-center rounded-md border border-dashed border-neutral-300 text-[10px] font-semibold text-neutral-500">
              <TileIcon
                src={tileIconSrc}
                alt=""
                width={48}
                height={48}
                className="h-10 w-10 object-contain"
                ariaHidden
              />
              {!tileIconSrc ? tileIconFallbackLabel : null}
            </div>
            <p className="mt-2 text-lg font-black uppercase tracking-wide text-neutral-900">
              {tileName}
            </p>
            {priceValue !== null ? (
              <p className="text-xs font-medium text-neutral-500">
                Price {formatMoney(priceValue, currencySymbol)}
              </p>
            ) : null}
          </div>
        ) : tile.type === "UTILITY" ? (
          <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-center">
            <div className="mx-auto flex h-12 w-24 items-center justify-center rounded-md border border-dashed border-neutral-300 text-[10px] font-semibold text-neutral-500">
              <TileIcon
                src={tileIconSrc}
                alt=""
                width={48}
                height={48}
                className="h-10 w-10 object-contain"
                ariaHidden
              />
              {!tileIconSrc ? tileIconFallbackLabel : null}
            </div>
            <p className="mt-2 text-lg font-black uppercase tracking-wide text-neutral-900">
              {tileName}
            </p>
            {priceValue !== null ? (
              <p className="text-xs font-medium text-neutral-500">
                Price {formatMoney(priceValue, currencySymbol)}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-1 text-lg font-black uppercase tracking-wide text-neutral-900">
            {tileName}
          </p>
        )
      }
      subheader={
        tile.type === "PROPERTY" && priceValue !== null ? (
          <p className="text-xs font-medium text-neutral-500">
            Price {formatMoney(priceValue, currencySymbol)}
          </p>
        ) : null
      }
      rentSection={
        isRailTileType(tile.type) ? (
          <RailRentTable
            className="mt-3"
            rentRows={railRentRows}
            ownedCount={ownedRailCount}
            currentRent={null}
            currencySymbol={currencySymbol}
          />
        ) : tile.type === "UTILITY" ? (
          <UtilityRentTable
            className="mt-3"
            ownedCount={ownedUtilityCount}
            lastRoll={null}
            currentRent={null}
            rentMultipliers={utilityRentMultipliers}
            currencySymbol={currencySymbol}
          />
        ) : (
          <div className="mt-3 space-y-2">
            {showDevelopment && resolvedDevelopment !== null ? (
              <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-neutral-700">
                    Development
                  </span>
                  <DevelopmentIcons dev={resolvedDevelopment} />
                </div>
              </div>
            ) : null}
            <PropertyRentTable
              rentRows={propertyRent.rentRows}
              houseCost={propertyRent.houseCost}
              hotelIncrement={propertyRent.hotelIncrement}
              currentRent={resolvedDevelopment !== null ? currentRent : undefined}
              currencySymbol={currencySymbol}
            />
          </div>
        )
      }
      footer={resolvedFooter}
    />
  );
};

type FloatingTurnActionsProps = {
  isVisible: boolean;
  canRoll: boolean;
  canEndTurn: boolean;
  actionLoading: string | null;
  rollDiceDisabledReason: string | null;
  onRollDice: () => void;
  onEndTurn: () => void;
};

const FloatingTurnActions = ({
  isVisible,
  canRoll,
  canEndTurn,
  actionLoading,
  rollDiceDisabledReason,
  onRollDice,
  onEndTurn,
}: FloatingTurnActionsProps) => {
  if (!isVisible) {
    return null;
  }

  const isRolling = actionLoading === "ROLL_DICE";
  const isEnding = actionLoading === "END_TURN";
  const rollEmphasized = canRoll && !isRolling;
  const endEmphasized = canEndTurn && !isEnding;
  const shouldPulse = rollEmphasized && isVisible && actionLoading === null;

  return (
    <div className="fixed bottom-20 right-6 z-20 flex flex-col items-center gap-3">
      <button
        className={`flex h-14 w-14 items-center justify-center rounded-full border shadow-lg transition ${
          rollEmphasized
            ? "border-emerald-600 bg-emerald-600 text-white shadow-emerald-600/30"
            : "border-emerald-200 bg-emerald-100 text-emerald-300 shadow-emerald-200/40 opacity-70"
        } ${shouldPulse ? "player-ready-pulse" : ""}`}
        type="button"
        onClick={onRollDice}
        disabled={!canRoll || isRolling}
        aria-label={isRolling ? "Rolling dice" : "Roll dice"}
        title={rollDiceDisabledReason ?? "Roll dice"}
      >
        <span className="sr-only">
          {isRolling ? "Rolling…" : "Roll dice"}
        </span>
        {/* TODO: swap to /public/icons/dice.png if we need a raster asset. */}
        <Image
          src="/icons/dice.svg"
          alt=""
          width={30}
          height={30}
          className="h-10 w-10 object-contain"
          aria-hidden
        />
      </button>
      <button
        className={`flex h-12 w-12 items-center justify-center rounded-full border text-xs font-semibold shadow-lg transition ${
          endEmphasized
            ? "border-rose-600 bg-rose-600 text-white shadow-rose-600/30"
            : "border-rose-200 bg-rose-100 text-rose-300 shadow-rose-200/40 opacity-70"
        }`}
        type="button"
        onClick={onEndTurn}
        disabled={!canEndTurn || isEnding}
        aria-label={isEnding ? "Ending turn" : "End turn"}
      >
        {isEnding ? "..." : "END"}
      </button>
    </div>
  );
};

const formatSignedPercent = (value: number) =>
  `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;

const formatMultiplier = (value: number) => `${value.toFixed(2)}×`;

const formatMoney = (amount: number, currencySymbol = "$") =>
  `${currencySymbol}${amount.toLocaleString()}`;

const formatSignedMoney = (amount: number, currencySymbol = "$") =>
  `${amount < 0 ? "-" : "+"}${formatMoney(Math.abs(amount), currencySymbol)}`;

const getDevBreakdown = (dev: number) => {
  const normalizedDev = Number.isFinite(dev) ? Math.max(0, Math.floor(dev)) : 0;
  return {
    hotelCount: Math.floor(normalizedDev / 5),
    houseCount: normalizedDev % 5,
  };
};

const getHotelIncrement = (rent4: number) => Math.ceil(rent4 * 1.25);

const getPropertyRentWithDev = (tile: BoardTile, dev: number) =>
  getPropertyRentWithDevelopment(tile, dev);

const DevelopmentIcons = ({
  dev,
  maxIcons = 8,
}: {
  dev: number;
  maxIcons?: number;
}) => {
  const { hotelCount, houseCount } = getDevBreakdown(dev);
  const totalIcons = hotelCount + houseCount;
  if (totalIcons === 0) {
    return <span className="text-xs text-neutral-400">None</span>;
  }
  const visibleCount = Math.min(totalIcons, maxIcons);
  const overflow = totalIcons - visibleCount;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {Array.from({ length: visibleCount }).map((_, index) => {
        const iconType = index < hotelCount ? "hotel" : "house";
        return (
        <Image
          key={`${iconType}-${index}`}
          src={iconType === "hotel" ? "/icons/hotel.svg" : "/icons/house.svg"}
          alt=""
          width={14}
          height={14}
          className="h-3.5 w-3.5 object-contain"
          aria-hidden
        />
        );
      })}
      {overflow > 0 ? (
        <span className="text-[10px] font-semibold text-neutral-500">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
};

const getPropertyRentDetails = (tile: BoardTile | null) => {
  const baseRent =
    tile && typeof tile.baseRent === "number" ? tile.baseRent : null;
  const rentByHouses =
    tile?.rentByHouses && tile.rentByHouses.length > 0
      ? tile.rentByHouses
      : null;
  const baseRentDisplay = rentByHouses?.[0] ?? baseRent ?? null;
  const rent4 =
    rentByHouses?.[4] ?? rentByHouses?.[rentByHouses.length - 1] ?? null;
  const hotelIncrement = rent4 !== null ? getHotelIncrement(rent4) : null;
  return {
    houseCost: tile?.houseCost ?? null,
    hotelIncrement,
    rentRows: [
      { label: "Base rent", value: baseRentDisplay },
      { label: "Rent with 1 house", value: rentByHouses?.[1] ?? null },
      { label: "Rent with 2 houses", value: rentByHouses?.[2] ?? null },
      { label: "Rent with 3 houses", value: rentByHouses?.[3] ?? null },
      { label: "Rent with 4 houses", value: rentByHouses?.[4] ?? null },
    ],
  };
};

type Player = {
  id: string;
  user_id: string;
  display_name: string | null;
  created_at: string | null;
  position: number;
  is_in_jail: boolean;
  jail_turns_remaining: number;
  get_out_of_jail_free_count: number;
  is_eliminated: boolean;
  eliminated_at: string | null;
};

type GameMeta = {
  id: string;
  board_pack_id: string | null;
  status: string | null;
  created_by: string | null;
};

type ActiveMacroEffectV1 = {
  id?: string;
  name?: string;
  effects?: {
    house_build_blocked?: boolean;
    loan_mortgage_new_blocked?: boolean;
  };
};

type GameState = {
  game_id: string;
  version: number;
  // References players.id (not auth user_id).
  current_player_id: string | null;
  balances: Record<string, number> | null;
  last_roll: number | null;
  doubles_count: number | null;
  turn_phase: string | null;
  pending_action: Record<string, unknown> | null;
  pending_card_active: boolean | null;
  pending_card_deck: "CHANCE" | "COMMUNITY" | null;
  pending_card_id: string | null;
  pending_card_title: string | null;
  pending_card_kind: string | null;
  pending_card_payload: Record<string, unknown> | null;
  pending_card_drawn_by_player_id: string | null;
  pending_card_drawn_at: string | null;
  pending_card_source_tile_index: number | null;
  chance_index: number | null;
  community_index: number | null;
  free_parking_pot: number | null;
  rules: Partial<ReturnType<typeof getRules>> | null;
  auction_active: boolean | null;
  auction_tile_index: number | null;
  auction_initiator_player_id: string | null;
  auction_current_bid: number | null;
  auction_current_winner_player_id: string | null;
  auction_turn_player_id: string | null;
  auction_turn_ends_at: string | null;
  auction_eligible_player_ids: string[] | null;
  auction_passed_player_ids: string[] | null;
  auction_min_increment: number | null;
  active_macro_effects_v1: ActiveMacroEffectV1[] | null;
  skip_next_roll_by_player: Record<string, boolean> | null;
};

type GameEvent = {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  version: number;
};

type TransactionItem = {
  id: string;
  ts: string | null;
  title: string;
  subtitle: string | null;
  amount: number;
  sourceEventVersion: number;
  sourceEventId: string;
};

type OwnershipRow = {
  tile_index: number;
  owner_player_id: string | null;
  collateral_loan_id: string | null;
  purchase_mortgage_id: string | null;
  houses?: number | null;
};

type OwnershipByTile = Record<
  number,
  {
    owner_player_id: string;
    collateral_loan_id: string | null;
    purchase_mortgage_id: string | null;
    houses: number;
  }
>;

type PlayerLoan = {
  id: string;
  player_id: string;
  collateral_tile_index: number;
  principal: number;
  remaining_principal: number;
  rate_per_turn: number;
  term_turns: number;
  turns_remaining: number;
  payment_per_turn: number;
  status: string;
};

type PurchaseMortgage = {
  id: string;
  player_id: string;
  tile_index: number;
  principal_original: number;
  principal_remaining: number;
  rate_per_turn: number;
  term_turns: number;
  turns_elapsed: number;
  accrued_interest_unpaid: number;
  status: string;
};

type TradeSnapshotTile = {
  tile_index: number;
  collateral_loan_id: string | null;
  purchase_mortgage_id: string | null;
  houses: number;
};

type TradeProposal = {
  id: string;
  game_id: string;
  proposer_player_id: string;
  counterparty_player_id: string;
  offer_cash: number;
  offer_tile_indices: number[];
  request_cash: number;
  request_tile_indices: number[];
  snapshot: TradeSnapshotTile[] | { tiles: TradeSnapshotTile[] } | null;
  status: string;
  created_at: string | null;
};

type TradeExecutionSummary = {
  tradeId: string;
  proposerPlayerId: string;
  counterpartyPlayerId: string;
  offerCash: number;
  offerTiles: number[];
  requestCash: number;
  requestTiles: number[];
  snapshotTiles: TradeSnapshotTile[];
};

type PendingPurchaseAction = {
  type: "BUY_PROPERTY";
  player_id: string | null;
  tile_index: number;
  price: number;
};

type TileDetailsPanelProps = {
  selectedTileIndex: number;
  selectedTile: BoardTile;
  selectedTileTypeLabel: string | null;
  selectedTileOwnerLabel: string | null;
  selectedTilePlayers: Player[];
  currentUserPlayer?: Player;
  selectedOwnerRailCount: number;
  selectedOwnerUtilityCount: number;
  selectedTileDevelopment?: number | null;
  boardPackEconomy: BoardPackEconomy;
  currencySymbol?: string;
  onClose: () => void;
  sheetRef?: React.Ref<HTMLDivElement>;
};

const TileDetailsPanel = ({
  selectedTileIndex,
  selectedTile,
  selectedTileTypeLabel,
  selectedTileOwnerLabel,
  selectedTilePlayers,
  currentUserPlayer,
  selectedOwnerRailCount,
  selectedOwnerUtilityCount,
  selectedTileDevelopment,
  boardPackEconomy,
  currencySymbol = "$",
  onClose,
  sheetRef,
}: TileDetailsPanelProps) => {
  const isOwnable = isOwnableTileType(selectedTile.type);
  const tileIconSrc = getTileIconSrc(selectedTile);
  const resolvedDevelopment =
    typeof selectedTileDevelopment === "number" ? selectedTileDevelopment : 0;

  return (
    <div
      ref={sheetRef}
      className="w-full max-w-3xl rounded-3xl border border-neutral-200 bg-white p-4 shadow-2xl sm:p-6"
      onClick={(event) => event.stopPropagation()}
      role="dialog"
      aria-label="Tile details"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Tile details · {selectedTileIndex}
          </p>
        </div>
        <button
          className="rounded-full border border-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-700"
          type="button"
          onClick={onClose}
          aria-label="Close tile details"
        >
          ✕
        </button>
      </div>
      <div className="mt-4">
        <p className="text-lg font-semibold text-neutral-900 sm:text-xl">
          {selectedTile.name?.trim() || selectedTileTypeLabel || "Tile"}
        </p>
      </div>
      <div className="mt-4 max-h-[60vh] space-y-3 overflow-y-auto pr-1 text-sm text-neutral-600">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-neutral-50 px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Type
          </span>
          <span className="font-medium text-neutral-800">
            {selectedTileTypeLabel ?? "Other"}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-neutral-50 px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Owner
          </span>
          <span className="font-medium text-neutral-800">
            {selectedTileOwnerLabel ?? "Unowned"}
          </span>
        </div>
        {isOwnable ? (
          <TitleDeedPreview
            tile={selectedTile}
            bandColor={getTileBandColor(selectedTile)}
            boardPackEconomy={boardPackEconomy}
            price={selectedTile.price ?? null}
            ownedRailCount={selectedOwnerRailCount}
            ownedUtilityCount={selectedOwnerUtilityCount}
            mode="readonly"
            showDevelopment
            developmentCount={resolvedDevelopment}
            currencySymbol={currencySymbol}
          />
        ) : tileIconSrc ? (
          <div className="rounded-2xl bg-neutral-50 px-3 py-6">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white">
              <TileIcon
                src={tileIconSrc}
                alt=""
                width={72}
                height={72}
                className="h-16 w-16 object-contain"
                ariaHidden
              />
            </div>
          </div>
        ) : null}
        <div className="rounded-2xl bg-neutral-50 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Players here
            </span>
            {currentUserPlayer &&
            currentUserPlayer.position === selectedTileIndex ? (
              <span className="text-xs font-semibold uppercase tracking-wide text-emerald-500">
                You are here
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedTilePlayers.length > 0 ? (
              selectedTilePlayers.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-[9px] font-semibold uppercase text-white">
                    {getPlayerInitials(player.display_name)}
                  </span>
                  <span>
                    {player.display_name ||
                      getPlayerInitials(player.display_name)}
                  </span>
                </div>
              ))
            ) : (
              <span className="text-xs text-neutral-400">None</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const getPendingCardDescription = (
  kind: string | null,
  payload: Record<string, unknown> | null,
  boardPack: ReturnType<typeof getBoardPackById> | null,
  currencySymbol = "$",
) => {
  if (!kind) {
    return "Card effect pending.";
  }
  const data = payload ?? {};
  if (kind === "PAY" || kind === "RECEIVE") {
    const amount =
      typeof data.amount === "number"
        ? data.amount
        : typeof data.amount === "string"
          ? Number.parseInt(data.amount, 10)
          : null;
    if (amount !== null) {
      return kind === "PAY"
        ? `Pay ${formatMoney(amount, currencySymbol)}.`
        : `Receive ${formatMoney(amount, currencySymbol)}.`;
    }
    return kind === "PAY" ? "Pay the bank." : "Receive money from the bank.";
  }
  if (kind === "MOVE_TO") {
    const tileIndex =
      typeof data.tile_index === "number"
        ? data.tile_index
        : typeof data.tile_index === "string"
          ? Number.parseInt(data.tile_index, 10)
          : null;
    const tileName =
      tileIndex !== null
        ? boardPack?.tiles?.find((tile) => tile.index === tileIndex)?.name ??
          `Tile ${tileIndex}`
        : "a specific tile";
    return `Move to ${tileName}.`;
  }
  if (kind === "MOVE_REL") {
    const spaces =
      typeof data.relative_spaces === "number"
        ? data.relative_spaces
        : typeof data.spaces === "number"
          ? data.spaces
          : typeof data.relative_spaces === "string"
            ? Number.parseInt(data.relative_spaces, 10)
            : typeof data.spaces === "string"
              ? Number.parseInt(data.spaces, 10)
              : null;
    if (spaces !== null) {
      return spaces >= 0
        ? `Move forward ${spaces} spaces.`
        : `Move back ${Math.abs(spaces)} spaces.`;
    }
    return "Move to a new space.";
  }
  if (kind === "GET_OUT_OF_JAIL_FREE") {
    return "Keep this card to use later.";
  }
  if (kind === "GO_TO_JAIL") {
    return "Go directly to jail.";
  }
  return "Card effect pending.";
};

const getTurnsRemainingFromPayload = (payload: unknown): number | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const value =
    "turns_remaining" in record
      ? record.turns_remaining
      : record.turns_remaining_after;
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const calculateMortgageInterestPerTurn = (
  principalRemaining: number | null | undefined,
  ratePerTurn: number | null | undefined,
) => {
  if (typeof principalRemaining !== "number" || typeof ratePerTurn !== "number") {
    return 0;
  }
  return Math.round(principalRemaining * ratePerTurn);
};

const normalizeTradeSnapshot = (
  snapshot: TradeProposal["snapshot"],
): TradeSnapshotTile[] => {
  if (!snapshot) {
    return [];
  }
  if (Array.isArray(snapshot)) {
    return snapshot;
  }
  if (
    typeof snapshot === "object" &&
    "tiles" in snapshot &&
    Array.isArray(snapshot.tiles)
  ) {
    return snapshot.tiles;
  }
  return [];
};

const getTileGroupLabel = (tile: BoardTile | null | undefined) => {
  if (!tile) {
    return "Property";
  }
  switch (tile.type) {
    case "RAIL":
      return "Railroad";
    case "UTILITY":
      return "Utility";
    case "PROPERTY":
      return "Property";
    default:
      return "Property";
  }
};

const derivePlayerTransactions = ({
  events,
  currentPlayerId,
  players,
  boardPack,
  ownershipByTile,
}: {
  events: GameEvent[];
  currentPlayerId: string | null;
  players: Player[];
  boardPack: ReturnType<typeof getBoardPackById> | null;
  ownershipByTile: OwnershipByTile;
}): TransactionItem[] => {
  if (!currentPlayerId) {
    return [];
  }

  const getPlayerName = (playerId: string | null) =>
    players.find((player) => player.id === playerId)?.display_name ?? "Player";
  const getTileName = (tileIndex: number | null) => {
    if (tileIndex === null) {
      return "Tile";
    }
    return (
      boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name ??
      `Tile ${tileIndex}`
    );
  };

  const transactions: TransactionItem[] = [];
  const mortgageInterestDebitKeys = new Set<string>();

  for (const event of events) {
    const payload =
      event.payload && typeof event.payload === "object" ? event.payload : null;
    if (!payload) {
      continue;
    }
    if (event.event_type !== "CASH_DEBIT") {
      continue;
    }
    const reason = typeof payload.reason === "string" ? payload.reason : null;
    if (reason !== "PURCHASE_MORTGAGE_INTEREST") {
      continue;
    }
    const mortgageId =
      typeof payload.mortgage_id === "string" ? payload.mortgage_id : "unknown";
    const amount = parseNumber(payload.amount);
    if (amount === null) {
      continue;
    }
    const key = `${mortgageId}-${amount}-${event.created_at ?? ""}`;
    mortgageInterestDebitKeys.add(key);
  }

  for (const event of events) {
    const payload =
      event.payload && typeof event.payload === "object" ? event.payload : null;
    if (!payload) {
      continue;
    }

    const recordBase = {
      ts: event.created_at ?? null,
      sourceEventVersion: event.version,
      sourceEventId: event.id,
    };

    switch (event.event_type) {
      case "COLLECT_GO": {
        const playerId =
          typeof payload.player_id === "string" ? payload.player_id : null;
        if (playerId !== currentPlayerId) {
          break;
        }
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        const reason =
          typeof payload.reason === "string" ? payload.reason : null;
        const reasonLabel =
          reason === "LAND_GO"
            ? "Landing on GO"
            : reason === "PASS_START"
              ? "Passing GO"
              : null;
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "GO salary",
          subtitle: reasonLabel,
          amount,
        });
        break;
      }
      case "CARD_PAY": {
        const playerId =
          typeof payload.player_id === "string" ? payload.player_id : null;
        if (playerId !== currentPlayerId) {
          break;
        }
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        const cardTitle =
          typeof payload.card_title === "string" ? payload.card_title : null;
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "Card payment",
          subtitle: cardTitle,
          amount: -amount,
        });
        break;
      }
      case "CARD_RECEIVE": {
        const playerId =
          typeof payload.player_id === "string" ? payload.player_id : null;
        if (playerId !== currentPlayerId) {
          break;
        }
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        const cardTitle =
          typeof payload.card_title === "string" ? payload.card_title : null;
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "Card payout",
          subtitle: cardTitle,
          amount,
        });
        break;
      }
      case "CASH_DEBIT": {
        const playerId =
          typeof payload.player_id === "string" ? payload.player_id : null;
        if (playerId !== currentPlayerId) {
          break;
        }
        const reason =
          typeof payload.reason === "string" ? payload.reason : null;
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        if (reason === "TRADE") {
          const counterpartyId =
            typeof payload.counterparty_player_id === "string"
              ? payload.counterparty_player_id
              : null;
          const counterpartyName = counterpartyId
            ? getPlayerName(counterpartyId)
            : "another player";
          transactions.push({
            ...recordBase,
            id: event.id,
            title: "Trade payment",
            subtitle: `To ${counterpartyName}`,
            amount: -amount,
          });
          break;
        }
        if (reason === "PURCHASE_MORTGAGE_INTEREST") {
          const tileIndex = parseNumber(payload.tile_index);
          const tileName = getTileName(tileIndex);
          transactions.push({
            ...recordBase,
            id: event.id,
            title: "Mortgage interest",
            subtitle: tileName,
            amount: -amount,
          });
          break;
        }
        if (reason === "MACRO_MAINTENANCE") {
          const eventName =
            typeof payload.event_name === "string" ? payload.event_name : null;
          const houses = parseNumber(payload.houses);
          const subtitle = eventName
            ? `${eventName}${houses !== null ? ` · ${houses} houses` : ""}`
            : houses !== null
              ? `${houses} houses`
              : null;
          transactions.push({
            ...recordBase,
            id: event.id,
            title: "Macro maintenance",
            subtitle: subtitle ?? null,
            amount: -amount,
          });
          break;
        }
        if (reason === "MACRO_INTEREST_SURCHARGE") {
          const tileIndex = parseNumber(payload.tile_index);
          const tileName = getTileName(tileIndex);
          transactions.push({
            ...recordBase,
            id: event.id,
            title: "Macro interest surcharge",
            subtitle: tileName,
            amount: -amount,
          });
          break;
        }
        if (reason === "MACRO_CASH_DELTA") {
          transactions.push({
            ...recordBase,
            id: event.id,
            title: "Macro cash delta",
            subtitle: null,
            amount: -amount,
          });
          break;
        }
        if (reason === "MACRO_REGIONAL_DISASTER") {
          transactions.push({
            ...recordBase,
            id: event.id,
            title: "Regional disaster",
            subtitle: null,
            amount: -amount,
          });
          break;
        }
        if (reason === "MACRO_STRESS_TEST") {
          transactions.push({
            ...recordBase,
            id: event.id,
            title: "Bank stress test",
            subtitle: null,
            amount: -amount,
          });
          break;
        }
        if (reason === "MACRO_SOVEREIGN_DEFAULT") {
          transactions.push({
            ...recordBase,
            id: event.id,
            title: "Sovereign default",
            subtitle: null,
            amount: -amount,
          });
          break;
        }
        if (reason === "MACRO_CASH_SHOCK") {
          const eventName =
            typeof payload.event_name === "string" ? payload.event_name : null;
          transactions.push({
            ...recordBase,
            id: event.id,
            title: "Macro cash shock",
            subtitle: eventName,
            amount: -amount,
          });
        }
        break;
      }
      case "CASH_CREDIT": {
        const playerId =
          typeof payload.player_id === "string" ? payload.player_id : null;
        if (playerId !== currentPlayerId) {
          break;
        }
        const reason =
          typeof payload.reason === "string" ? payload.reason : null;
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        if (reason === "TRADE") {
          const counterpartyId =
            typeof payload.counterparty_player_id === "string"
              ? payload.counterparty_player_id
              : null;
          const counterpartyName = counterpartyId
            ? getPlayerName(counterpartyId)
            : "another player";
          transactions.push({
            ...recordBase,
            id: event.id,
            title: "Trade proceeds",
            subtitle: `From ${counterpartyName}`,
            amount,
          });
          break;
        }
        if (reason === "SELL_TO_MARKET") {
          const tileIndex = parseNumber(payload.tile_index);
          const tileName = getTileName(tileIndex);
          transactions.push({
            ...recordBase,
            id: event.id,
            title: "Sold to market",
            subtitle: tileName,
            amount,
          });
          break;
        }
        if (reason === "MACRO_CASH_BONUS") {
          const eventName =
            typeof payload.event_name === "string" ? payload.event_name : null;
          transactions.push({
            ...recordBase,
            id: event.id,
            title: "Macro cash bonus",
            subtitle: eventName,
            amount,
          });
          break;
        }
        if (reason === "MACRO_CASH_DELTA") {
          transactions.push({
            ...recordBase,
            id: event.id,
            title: "Macro cash delta",
            subtitle: null,
            amount,
          });
          break;
        }
        if (reason === "MACRO_PANDEMIC_STIMULUS") {
          transactions.push({
            ...recordBase,
            id: event.id,
            title: "Pandemic stimulus",
            subtitle: null,
            amount,
          });
          break;
        }
        if (reason === "FORCED_HOUSE_LIQUIDATION") {
          transactions.push({
            ...recordBase,
            id: event.id,
            title: "Forced house liquidation",
            subtitle: null,
            amount,
          });
          break;
        }
        break;
      }
      case "PURCHASE_MORTGAGE_INTEREST_PAID": {
        const playerId =
          typeof payload.player_id === "string" ? payload.player_id : null;
        if (playerId !== currentPlayerId) {
          break;
        }
        const amount = parseNumber(payload.interest_amount);
        if (amount === null) {
          break;
        }
        const mortgageId =
          typeof payload.mortgage_id === "string" ? payload.mortgage_id : "unknown";
        const key = `${mortgageId}-${amount}-${event.created_at ?? ""}`;
        if (mortgageInterestDebitKeys.has(key)) {
          break;
        }
        const tileIndex = parseNumber(payload.tile_index);
        const tileName = getTileName(tileIndex);
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "Mortgage interest",
          subtitle: tileName,
          amount: -amount,
        });
        break;
      }
      case "PAY_RENT": {
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        const fromPlayerId =
          typeof payload.from_player_id === "string"
            ? payload.from_player_id
            : null;
        const toPlayerId =
          typeof payload.to_player_id === "string"
            ? payload.to_player_id
            : null;
        const tileIndex = parseNumber(payload.tile_index);
        const tileName = getTileName(tileIndex);

        if (fromPlayerId === currentPlayerId) {
          transactions.push({
            ...recordBase,
            id: `${event.id}-paid`,
            title: "Rent paid",
            subtitle: `${tileName} → ${getPlayerName(toPlayerId)}`,
            amount: -amount,
          });
          break;
        }
        if (toPlayerId === currentPlayerId) {
          transactions.push({
            ...recordBase,
            id: `${event.id}-received`,
            title: "Rent received",
            subtitle: `${tileName} ← ${getPlayerName(fromPlayerId)}`,
            amount,
          });
        }
        break;
      }
      case "PAY_TAX": {
        const payerId =
          typeof payload.payer_player_id === "string"
            ? payload.payer_player_id
            : null;
        if (payerId !== currentPlayerId) {
          break;
        }
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        const tileIndex = parseNumber(payload.tile_index);
        const tileName =
          typeof payload.tile_name === "string"
            ? payload.tile_name
            : getTileName(tileIndex);
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "Tax paid",
          subtitle: tileName,
          amount: -amount,
        });
        break;
      }
      case "JAIL_PAY_FINE": {
        const playerId =
          typeof payload.player_id === "string" ? payload.player_id : null;
        if (playerId !== currentPlayerId) {
          break;
        }
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "Jail fine",
          subtitle: "Paid to leave jail",
          amount: -amount,
        });
        break;
      }
      case "BUY_PROPERTY": {
        const playerId =
          typeof payload.owner_player_id === "string"
            ? payload.owner_player_id
            : null;
        if (playerId !== currentPlayerId) {
          break;
        }
        const amount = parseNumber(payload.price);
        if (amount === null) {
          break;
        }
        const tileIndex = parseNumber(payload.tile_index);
        const tileName = getTileName(tileIndex);
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "Property purchase",
          subtitle: tileName,
          amount: -amount,
        });
        break;
      }
      case "AUCTION_WON": {
        const winnerId =
          typeof payload.winner_id === "string" ? payload.winner_id : null;
        if (winnerId !== currentPlayerId) {
          break;
        }
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        const tileIndex = parseNumber(payload.tile_index);
        const tileName = getTileName(tileIndex);
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "Auction won",
          subtitle: tileName,
          amount: -amount,
        });
        break;
      }
      case "COLLATERAL_LOAN_TAKEN": {
        const playerId =
          typeof payload.player_id === "string" ? payload.player_id : null;
        if (playerId !== currentPlayerId) {
          break;
        }
        const amount = parseNumber(payload.principal);
        if (amount === null) {
          break;
        }
        const tileIndex = parseNumber(payload.tile_index);
        const tileName = getTileName(tileIndex);
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "Loan proceeds",
          subtitle: tileName,
          amount,
        });
        break;
      }
      case "COLLATERAL_LOAN_PAYMENT": {
        const playerId =
          typeof payload.player_id === "string" ? payload.player_id : null;
        if (playerId !== currentPlayerId) {
          break;
        }
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        const tileIndex = parseNumber(payload.tile_index);
        const tileName = getTileName(tileIndex);
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "Loan payment",
          subtitle: tileName,
          amount: -amount,
        });
        break;
      }
      case "LOAN_PAID_OFF": {
        const tileIndex = parseNumber(payload.tile_index);
        if (
          tileIndex === null ||
          ownershipByTile[tileIndex]?.owner_player_id !== currentPlayerId
        ) {
          break;
        }
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        const tileName = getTileName(tileIndex);
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "Loan payoff",
          subtitle: tileName,
          amount: -amount,
        });
        break;
      }
      default:
        break;
    }
  }

  return transactions.slice(0, 10);
};

export default function PlayPage() {
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [gameMeta, setGameMeta] = useState<GameMeta | null>(null);
  const [gameMetaError, setGameMetaError] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [ownershipByTile, setOwnershipByTile] = useState<OwnershipByTile>({});
  const [playerLoans, setPlayerLoans] = useState<PlayerLoan[]>([]);
  const [purchaseMortgages, setPurchaseMortgages] = useState<PurchaseMortgage[]>(
    [],
  );
  const [tradeProposals, setTradeProposals] = useState<TradeProposal[]>([]);
  const [tradeLoanDetails, setTradeLoanDetails] = useState<PlayerLoan[]>([]);
  const [tradeMortgageDetails, setTradeMortgageDetails] = useState<
    PurchaseMortgage[]
  >([]);
  const [tradeExecutionSummary, setTradeExecutionSummary] =
    useState<TradeExecutionSummary | null>(null);
  const [isProposeTradeOpen, setIsProposeTradeOpen] = useState(false);
  const [isIncomingTradeOpen, setIsIncomingTradeOpen] = useState(false);
  const [tradeCounterpartyId, setTradeCounterpartyId] = useState<string>("");
  const [tradeOfferCash, setTradeOfferCash] = useState<number>(0);
  const [tradeOfferTiles, setTradeOfferTiles] = useState<number[]>([]);
  const [tradeRequestCash, setTradeRequestCash] = useState<number>(0);
  const [tradeRequestTiles, setTradeRequestTiles] = useState<number[]>([]);
  const [payoffLoan, setPayoffLoan] = useState<PlayerLoan | null>(null);
  const [propertyActionModal, setPropertyActionModal] = useState<{
    action: "SELL_TO_MARKET" | "DEFAULT_PROPERTY";
    tileIndex: number;
    defaultKind?: "mortgage" | "loan";
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [auctionBidAmount, setAuctionBidAmount] = useState<number>(0);
  const [auctionNow, setAuctionNow] = useState<Date>(() => new Date());
  const [needsAuth, setNeedsAuth] = useState(false);
  const [isActivityPanelOpen, setIsActivityPanelOpen] = useState(false);
  const [activityTab, setActivityTab] = useState<"log" | "transactions">("log");
  const [isBoardExpanded, setIsBoardExpanded] = useState(false);
  const [miniBoardCollapsed, setMiniBoardCollapsed] = useState(false);
  const [walletPanelView, setWalletPanelView] = useState<
    "owned" | "loans" | "mortgages"
  >("owned");
  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(
    null,
  );
  const [expandedBoardScale, setExpandedBoardScale] = useState(1);
  const [initialSnapshotReady, setInitialSnapshotReady] = useState(false);
  const [realtimeReady, setRealtimeReady] = useState(false);
  const [firstRoundResyncEnabled, setFirstRoundResyncEnabled] = useState(true);
  const [sessionInvalid, setSessionInvalid] = useState(false);
  const [pendingGoToJail, setPendingGoToJail] = useState<{
    eventId: string;
    eventVersion: number;
  } | null>(null);
  const [isGoToJailAcknowledging, setIsGoToJailAcknowledging] = useState(false);
  const [introStartedAt, setIntroStartedAt] = useState<number | null>(null);
  const [introElapsedMs, setIntroElapsedMs] = useState(0);
  const [introMinElapsed, setIntroMinElapsed] = useState(false);
  const [introDismissed, setIntroDismissed] = useState(false);
  const expandedBoardContainerRef = useRef<HTMLDivElement | null>(null);
  const expandedBoardRef = useRef<HTMLDivElement | null>(null);
  const expandedTileSheetRef = useRef<HTMLDivElement | null>(null);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef(false);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const realtimeReconciledRef = useRef(false);
  const firstRoundEndTurnsRef = useRef<Set<string>>(new Set());
  const firstRoundResyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const realtimeContextRef = useRef<{
    gameId: string;
    accessToken: string;
    channelName: string;
  } | null>(null);
  const lastTradeEventIdRef = useRef<string | null>(null);
  const activeGameIdRef = useRef<string | null>(null);
  const unmountingRef = useRef(false);
  const invalidTokenRef = useRef<string | null>(null);
  const tradeConfirmSectionRef = useRef<HTMLElement | null>(null);
  const lastGoToJailAckVersionRef = useRef<number | null>(null);
  const goToJailOkButtonRef = useRef<HTMLButtonElement | null>(null);
  const minIntroMs = 5000;

  useEffect(() => {
    const storedPreference =
      window.localStorage.getItem(MINI_BOARD_COLLAPSED_STORAGE_KEY) === "1";
    setMiniBoardCollapsed(storedPreference);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      MINI_BOARD_COLLAPSED_STORAGE_KEY,
      miniBoardCollapsed ? "1" : "0",
    );
  }, [miniBoardCollapsed]);

  const isConfigured = useMemo(() => supabaseClient.isConfigured(), []);
  const latestRollEvent = useMemo(
    () => events.find((event) => event.event_type === "ROLL_DICE"),
    [events],
  );
  const latestRolledDoubleEvent = useMemo(
    () => events.find((event) => event.event_type === "ROLLED_DOUBLE"),
    [events],
  );
  const latestRollPayload = useMemo(() => {
    const payload = latestRollEvent?.payload;
    return payload && typeof payload === "object"
      ? (payload as {
          dice?: unknown;
          doubles_count?: unknown;
          roll?: unknown;
        })
      : null;
  }, [latestRollEvent]);
  const latestDoublePayload = useMemo(() => {
    const payload = latestRolledDoubleEvent?.payload;
    return payload && typeof payload === "object"
      ? (payload as { doubles_count?: unknown })
      : null;
  }, [latestRolledDoubleEvent]);
  const latestDiceValues = useMemo(() => {
    if (!latestRollPayload) {
      return null;
    }
    const dice = latestRollPayload.dice;
    if (!Array.isArray(dice) || dice.length < 2) {
      return null;
    }
    const [first, second] = dice;
    if (typeof first !== "number" || typeof second !== "number") {
      return null;
    }
    return [first, second] as const;
  }, [latestRollPayload]);
  const latestDiceDisplay = useMemo(() => {
    if (!latestDiceValues) {
      return null;
    }
    return `🎲 ${latestDiceValues[0]} + ${latestDiceValues[1]}`;
  }, [latestDiceValues]);
  const latestDoubleStreak = useMemo(() => {
    const candidate =
      latestRollPayload?.doubles_count ?? latestDoublePayload?.doubles_count;
    return typeof candidate === "number" ? candidate : null;
  }, [latestDoublePayload, latestRollPayload]);
  const currentUserPlayer = useMemo(
    () => players.find((player) => session && player.user_id === session.user.id),
    [players, session],
  );
  const tradeLoansById = useMemo(() => {
    const lookup = new Map<string, PlayerLoan>();
    tradeLoanDetails.forEach((loan) => lookup.set(loan.id, loan));
    return lookup;
  }, [tradeLoanDetails]);
  const tradeMortgagesById = useMemo(() => {
    const lookup = new Map<string, PurchaseMortgage>();
    tradeMortgageDetails.forEach((mortgage) => lookup.set(mortgage.id, mortgage));
    return lookup;
  }, [tradeMortgageDetails]);
  const incomingTradeProposal = useMemo(() => {
    if (!currentUserPlayer) {
      return null;
    }
    return (
      tradeProposals.find(
        (proposal) =>
          proposal.status === "PENDING" &&
          proposal.counterparty_player_id === currentUserPlayer.id,
      ) ?? null
    );
  }, [currentUserPlayer, tradeProposals]);

  useEffect(() => {
    if (!currentUserPlayer) {
      return;
    }
    let latestGoToJailLanding: GameEvent | null = null;
    for (const event of events) {
      if (event.event_type !== "LAND_GO_TO_JAIL") {
        continue;
      }
      const payload = event.payload;
      const playerId =
        payload && typeof payload.player_id === "string"
          ? payload.player_id
          : null;
      if (playerId === currentUserPlayer.id) {
        latestGoToJailLanding = event;
        break;
      }
    }
    if (!latestGoToJailLanding) {
      return;
    }
    if (lastGoToJailAckVersionRef.current === latestGoToJailLanding.version) {
      return;
    }
    setPendingGoToJail({
      eventId: latestGoToJailLanding.id,
      eventVersion: latestGoToJailLanding.version,
    });
  }, [currentUserPlayer, events]);

  useEffect(() => {
    if (pendingGoToJail) {
      goToJailOkButtonRef.current?.focus();
    }
  }, [pendingGoToJail]);

  useEffect(() => {
    if (!pendingGoToJail && isGoToJailAcknowledging) {
      setIsGoToJailAcknowledging(false);
    }
  }, [isGoToJailAcknowledging, pendingGoToJail]);
  const boardPack = getBoardPackById(gameMeta?.board_pack_id);
  const boardPackEconomy = boardPack?.economy ?? DEFAULT_BOARD_PACK_ECONOMY;
  const currencySymbol = boardPackEconomy?.currency?.symbol ?? "$";
  const currentPlayerId = gameState?.current_player_id ?? null;
  const expandedBoardTiles =
    boardPack?.tiles && boardPack.tiles.length > 0
      ? boardPack.tiles
      : fallbackExpandedTiles;
  const expandedTilesByIndex = useMemo(() => {
    const lookup = new Map<number, BoardTile>();
    expandedBoardTiles.forEach((tile) => {
      lookup.set(tile.index, tile);
    });
    return lookup;
  }, [expandedBoardTiles]);
  const expandedPlayersByTile = useMemo(
    () =>
      players.reduce<Record<number, Player[]>>((acc, player) => {
        const position = Number.isFinite(player.position) ? player.position : 0;
        acc[position] = acc[position] ? [...acc[position], player] : [player];
        return acc;
      }, {}),
    [players],
  );
  const expandedOwnershipColorsByPlayer = useMemo(() => {
    return players.reduce<Record<string, { border: string; inset: string }>>(
      (acc, player, index) => {
        acc[player.id] =
          expandedOwnershipPalette[index % expandedOwnershipPalette.length];
        return acc;
      },
      {},
    );
  }, [players]);
  const expandedBoardEdges = useMemo(
    () => ({
      top: [20, 21, 22, 23, 24, 25],
      right: [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39],
      bottom: [5, 4, 3, 2, 1, 0],
      left: [19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6],
    }),
    [],
  );
  const getExpandedTileFaceLabel = useCallback((tileType: string) => {
    const normalized = getCanonicalTileType(tileType);
    if (normalized === "PROPERTY") {
      return null;
    }
    switch (normalized) {
      case "START":
        return "GO";
      case "JAIL":
        return "JAIL";
      case "FREE_PARKING":
        return "FREE";
      case "GO_TO_JAIL":
        return "G2J";
      case "CHANCE":
        return "CHANCE";
      case "COMMUNITY_CHEST":
        return "CHEST";
      case "TAX":
        return "TAX";
      case "RAILROAD":
        return "RR";
      case "UTILITY":
        return "UTIL";
      default: {
        const fallback = normalized.replace(/_/g, " ");
        return fallback.length > 8 ? fallback.slice(0, 8) : fallback;
      }
    }
  }, []);
  const renderExpandedTile = useCallback(
    (tileIndex: number) => {
      const tile =
        expandedTilesByIndex.get(tileIndex) ??
        ({
          index: tileIndex,
          tile_id: `tile-${tileIndex}`,
          type: tileIndex === 0 ? "START" : "PROPERTY",
          name: `Tile ${tileIndex}`,
        } satisfies BoardTile);
      const tilePlayers = expandedPlayersByTile[tileIndex] ?? [];
      const isCurrentTile = tilePlayers.some(
        (player) => player.id === currentPlayerId,
      );
      const ownerId = ownershipByTile?.[tileIndex]?.owner_player_id;
      const ownershipColor = ownerId
        ? expandedOwnershipColorsByPlayer[ownerId]
        : undefined;
      const houses = ownershipByTile?.[tileIndex]?.houses ?? 0;
      const ownershipStyle = ownershipColor
        ? {
            borderColor: ownershipColor.border,
            boxShadow: `inset 0 0 0 2px ${ownershipColor.inset}`,
          }
        : undefined;

      const isSelectedTile = tileIndex === selectedTileIndex;
      const tileFaceLabel = getExpandedTileFaceLabel(tile.type);
      const tileIconSrc = getBoardTileIconSrc(tile);
      const mutedGroupTintClass = getMutedGroupTintClass(tile);
      if (tile.type === "TAX") {
        const taxTileDebug = {
          type: tile.type,
          name: tile.name,
          label: "label" in tile ? tile.label : undefined,
          tile_id: tile.tile_id,
          id: "id" in tile ? tile.id : undefined,
          key: "key" in tile ? tile.key : undefined,
          slug: "slug" in tile ? tile.slug : undefined,
          subtype: "subtype" in tile ? tile.subtype : undefined,
          category: "category" in tile ? tile.category : undefined,
        };
        console.log("[TAX TILE]", tileIndex, taxTileDebug, "icon:", tileIconSrc);
      }

      return (
        <div
          key={tile.tile_id}
          role="button"
          tabIndex={0}
          className="h-full w-full focus:outline-none"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedTileIndex(tileIndex);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              setSelectedTileIndex(tileIndex);
            }
          }}
        >
          <div
            style={ownershipStyle}
            className={`border bg-white text-neutral-700 overflow-hidden ${
              isCurrentTile ? "ring-2 ring-emerald-400/70" : ""
            } ${isSelectedTile ? "outline outline-2 outline-indigo-300/60 outline-offset-2" : ""} h-full w-full rounded-md border-neutral-200 p-0.2 sm:p-0.2`}
          >
            <div className="relative flex h-full flex-col justify-end gap-2">
              {tileIconSrc ? (
                <span className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center px-1">
                  <span className="relative h-full w-full">
                    <Image
                      src={tileIconSrc}
                      alt={tileFaceLabel ?? tile.name}
                      fill
                      className="object-contain object-center opacity-35 grayscale brightness-110 contrast-75"
                    />
                  </span>
                </span>
              ) : null}
              {mutedGroupTintClass ? (
                <div
                  className={`pointer-events-none absolute left-0 top-0 z-20 h-1.5 w-full ${mutedGroupTintClass}`}
                />
              ) : null}
              <span className="absolute left-1 top-1 z-20 text-[9px] font-medium text-neutral-300/70">
                {tile.index}
              </span>
              {tileFaceLabel && !tileIconSrc ? (
                <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-0.5 text-[10px] font-semibold uppercase tracking-normal text-neutral-500">
                  <span className="w-full line-clamp-2 text-center">
                    {tileFaceLabel}
                  </span>
                </span>
              ) : null}
              {tile.type === "PROPERTY" ? (
                <div className="relative z-30 flex justify-end">
                  <HousesDots houses={houses} size="md" />
                </div>
              ) : null}
              {tilePlayers.length > 0 ? (
                <div className="relative z-50 flex flex-wrap justify-end gap-1">
                  {tilePlayers.map((player) => (
                    <div
                      key={player.id}
                      className={`flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-[9px] font-semibold uppercase text-white ${
                        player.id === currentPlayerId
                          ? "ring-2 ring-emerald-300"
                          : ""
                      }`}
                    >
                      {getPlayerInitials(player.display_name)}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      );
    },
    [
      currentPlayerId,
      expandedOwnershipColorsByPlayer,
      expandedPlayersByTile,
      expandedTilesByIndex,
      getExpandedTileFaceLabel,
      ownershipByTile,
      selectedTileIndex,
    ],
  );
  const getExpandedTileTypeLabel = useCallback((tileType: string) => {
    const normalized = getCanonicalTileType(tileType);
    switch (normalized) {
      case "PROPERTY":
        return "Property";
      case "RAILROAD":
        return "Railroad";
      case "UTILITY":
        return "Utility";
      case "CHANCE":
        return "Chance";
      case "COMMUNITY_CHEST":
        return "Community Chest";
      case "TAX":
        return "Tax";
      case "JAIL":
        return "Jail";
      case "START":
        return "Go";
      case "GO_TO_JAIL":
        return "Go To Jail";
      case "FREE_PARKING":
        return "Free Parking";
      default:
        return "Other";
    }
  }, []);
  const selectedExpandedTile = useMemo(() => {
    if (selectedTileIndex === null) {
      return null;
    }
    return (
      expandedTilesByIndex.get(selectedTileIndex) ??
      ({
        index: selectedTileIndex,
        tile_id: `tile-${selectedTileIndex}`,
        type: selectedTileIndex === 0 ? "START" : "PROPERTY",
        name: `Tile ${selectedTileIndex}`,
      } satisfies BoardTile)
    );
  }, [expandedTilesByIndex, selectedTileIndex]);
  const selectedTileTypeLabel = useMemo(() => {
    if (!selectedExpandedTile) {
      return null;
    }
    return getExpandedTileTypeLabel(selectedExpandedTile.type);
  }, [getExpandedTileTypeLabel, selectedExpandedTile]);
  const selectedTileOwnerLabel = useMemo(() => {
    if (!selectedExpandedTile || selectedTileIndex === null) {
      return null;
    }
    if (!isOwnableTileType(selectedExpandedTile.type)) {
      return "Not ownable";
    }
    const ownership = ownershipByTile[selectedTileIndex];
    if (!ownership?.owner_player_id) {
      return "Unowned";
    }
    const owner = players.find(
      (player) => player.id === ownership.owner_player_id,
    );
    return owner?.display_name ?? "Player";
  }, [ownershipByTile, players, selectedExpandedTile, selectedTileIndex]);
  const selectedTileOwnerId = useMemo(() => {
    if (!selectedExpandedTile || selectedTileIndex === null) {
      return null;
    }
    if (!isOwnableTileType(selectedExpandedTile.type)) {
      return null;
    }
    return ownershipByTile[selectedTileIndex]?.owner_player_id ?? null;
  }, [ownershipByTile, selectedExpandedTile, selectedTileIndex]);
  const selectedOwnerRailCount = useMemo(() => {
    if (!selectedTileOwnerId) {
      return 0;
    }
    const tiles = boardPack?.tiles ?? expandedBoardTiles;
    return tiles.filter(
      (tile) =>
        isRailTileType(tile.type) &&
        ownershipByTile[tile.index]?.owner_player_id === selectedTileOwnerId,
    ).length;
  }, [boardPack?.tiles, expandedBoardTiles, ownershipByTile, selectedTileOwnerId]);
  const selectedOwnerUtilityCount = useMemo(() => {
    if (!selectedTileOwnerId) {
      return 0;
    }
    const tiles = boardPack?.tiles ?? expandedBoardTiles;
    return tiles.filter(
      (tile) =>
        tile.type === "UTILITY" &&
        ownershipByTile[tile.index]?.owner_player_id === selectedTileOwnerId,
    ).length;
  }, [
    boardPack?.tiles,
    expandedBoardTiles,
    ownershipByTile,
    selectedTileOwnerId,
  ]);
  const selectedTileDevelopment = useMemo(() => {
    if (selectedTileIndex === null) {
      return null;
    }
    return ownershipByTile[selectedTileIndex]?.houses ?? null;
  }, [ownershipByTile, selectedTileIndex]);
  const selectedTilePlayers = useMemo(() => {
    if (selectedTileIndex === null) {
      return [];
    }
    return expandedPlayersByTile[selectedTileIndex] ?? [];
  }, [expandedPlayersByTile, selectedTileIndex]);
  const rules = useMemo(() => getRules(gameState?.rules), [gameState?.rules]);
  const latestRolledDoubleConfirmed = useMemo(() => {
    if (!latestRollEvent || !latestRolledDoubleEvent) {
      return false;
    }
    return latestRolledDoubleEvent.version === latestRollEvent.version + 1;
  }, [latestRollEvent, latestRolledDoubleEvent]);
  const latestIsDouble = useMemo(() => {
    if (latestDiceValues) {
      return (
        latestRolledDoubleConfirmed ||
        latestDiceValues[0] === latestDiceValues[1]
      );
    }
    return false;
  }, [latestDiceValues, latestRolledDoubleConfirmed]);
  const getPlayerNameById = useCallback(
    (playerId: string | null) =>
      players.find((player) => player.id === playerId)?.display_name ?? "Player",
    [players],
  );
  const getTileNameByIndex = useCallback(
    (tileIndex: number | null) => {
      if (tileIndex === null || Number.isNaN(tileIndex)) {
        return "Tile";
      }
      return (
        boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name ??
        `Tile ${tileIndex}`
      );
    },
    [boardPack?.tiles],
  );
  const getOwnershipLabel = useCallback(
    (tileIndex: number | null) => {
      if (tileIndex === null || Number.isNaN(tileIndex)) {
        return null;
      }

      const ownership = ownershipByTile[tileIndex];
      if (!ownership) {
        return "Unowned";
      }

      const owner = players.find(
        (player) => player.id === ownership.owner_player_id,
      );
      return `Owned by ${owner?.display_name ?? "Player"}`;
    },
    [ownershipByTile, players],
  );

  const formatEventDescription = useCallback((event: GameEvent) => {
    const payload =
      event.payload && typeof event.payload === "object" ? event.payload : null;

    const dice = payload?.dice;
    const diceDisplay =
      Array.isArray(dice) &&
      dice.length >= 2 &&
      typeof dice[0] === "number" &&
      typeof dice[1] === "number"
        ? `🎲 ${dice[0]} + ${dice[1]}`
        : null;
    const doublesCount =
      typeof payload?.doubles_count === "number"
        ? payload.doubles_count
        : null;

    if (event.event_type === "ROLL_DICE") {
      if (diceDisplay) {
        return `Rolled ${diceDisplay}`;
      }
      if (typeof payload?.roll === "number") {
        return `Rolled ${payload.roll}`;
      }
      return "Dice rolled";
    }

    if (event.event_type === "CARD_UTILITY_ROLL") {
      if (diceDisplay) {
        return `Rolled ${diceDisplay} for utility rent (card effect)`;
      }
      if (typeof payload?.roll === "number") {
        return `Rolled ${payload.roll} for utility rent (card effect)`;
      }
      return "Rolled for utility rent (card effect)";
    }

    if (event.event_type === "ROLLED_DOUBLE") {
      return doublesCount !== null
        ? `Double rolled (streak ${doublesCount})`
        : "Double rolled";
    }

    if (event.event_type === "END_TURN" && payload?.to_player_name) {
      return `Turn → ${payload.to_player_name}`;
    }

    if (event.event_type === "TRADE_PROPOSED") {
      const proposerId =
        typeof payload?.proposer_player_id === "string"
          ? payload.proposer_player_id
          : null;
      const counterpartyId =
        typeof payload?.counterparty_player_id === "string"
          ? payload.counterparty_player_id
          : null;
      const proposerName = proposerId
        ? players.find((player) => player.id === proposerId)?.display_name ??
          "Player"
        : "Player";
      const counterpartyName = counterpartyId
        ? players.find((player) => player.id === counterpartyId)?.display_name ??
          "Player"
        : "Player";
      return `Trade proposed · ${proposerName} → ${counterpartyName}`;
    }

    if (event.event_type === "TRADE_ACCEPTED") {
      const proposerId =
        typeof payload?.proposer_player_id === "string"
          ? payload.proposer_player_id
          : null;
      const counterpartyId =
        typeof payload?.counterparty_player_id === "string"
          ? payload.counterparty_player_id
          : null;
      const proposerName = proposerId
        ? players.find((player) => player.id === proposerId)?.display_name ??
          "Player"
        : "Player";
      const counterpartyName = counterpartyId
        ? players.find((player) => player.id === counterpartyId)?.display_name ??
          "Player"
        : "Player";
      return `Trade executed · ${proposerName} ⇄ ${counterpartyName}`;
    }

    if (event.event_type === "TRADE_REJECTED") {
      const rejectedId =
        typeof payload?.rejected_by_player_id === "string"
          ? payload.rejected_by_player_id
          : null;
      const rejectedName = rejectedId
        ? players.find((player) => player.id === rejectedId)?.display_name ??
          "Player"
        : "Player";
      return `Trade rejected · ${rejectedName}`;
    }

    if (event.event_type === "PROPERTY_TRANSFERRED") {
      const tileIndex = parseNumber(payload?.tile_index);
      const tileName = getTileNameByIndex(tileIndex);
      const fromId =
        typeof payload?.from_player_id === "string"
          ? payload.from_player_id
          : null;
      const toId =
        typeof payload?.to_player_id === "string"
          ? payload.to_player_id
          : null;
      const fromName = fromId
        ? players.find((player) => player.id === fromId)?.display_name ??
          "Player"
        : "Player";
      const toName = toId
        ? players.find((player) => player.id === toId)?.display_name ??
          "Player"
        : "Player";
      return `Property transferred · ${tileName} (${fromName} → ${toName})`;
    }

    if (event.event_type === "LOAN_ASSUMED") {
      const tileIndex = parseNumber(payload?.tile_index);
      const tileName = getTileNameByIndex(tileIndex);
      const toId =
        typeof payload?.to_player_id === "string"
          ? payload.to_player_id
          : null;
      const toName = toId
        ? players.find((player) => player.id === toId)?.display_name ??
          "Player"
        : "Player";
      return `Loan assumed · ${tileName} (${toName})`;
    }

    if (event.event_type === "START_GAME") {
      return "Game started";
    }

    if (event.event_type === "MACRO_EVENT") {
      const eventName =
        typeof payload?.event_name === "string"
          ? payload.event_name
          : "Macroeconomic shift";
      const rarityRaw = typeof payload?.rarity === "string" ? payload.rarity : null;
      const rarity = rarityRaw ? rarityRaw.replaceAll("_", " ") : null;
      const duration =
        typeof payload?.duration_rounds === "number"
          ? payload.duration_rounds
          : typeof payload?.duration_rounds === "string"
            ? Number.parseInt(payload.duration_rounds, 10)
            : null;
      const durationLabel = duration !== null ? ` · ${duration} rounds` : "";
      const rarityLabel = rarity ? ` (${rarity})` : "";
      return `Macro event: ${eventName}${rarityLabel}${durationLabel}`;
    }

    if (event.event_type === "MACRO_EVENT_TRIGGERED") {
      const eventName =
        typeof payload?.event_name === "string"
          ? payload.event_name
          : "Macroeconomic shift";
      const rarityRaw = typeof payload?.rarity === "string" ? payload.rarity : null;
      const rarity = rarityRaw ? rarityRaw.replaceAll("_", " ") : null;
      const duration =
        typeof payload?.duration_rounds === "number"
          ? payload.duration_rounds
          : typeof payload?.duration_rounds === "string"
            ? Number.parseInt(payload.duration_rounds, 10)
            : null;
      const durationLabel = duration !== null ? ` · ${duration} rounds` : "";
      const rarityLabel = rarity ? ` (${rarity})` : "";
      return `Macro event triggered: ${eventName}${rarityLabel}${durationLabel}`;
    }

    if (
      event.event_type === "MACRO_EVENT_EXPIRED" ||
      event.event_type === "MACRO_EXPIRED"
    ) {
      const eventName =
        typeof payload?.event_name === "string"
          ? payload.event_name
          : "Macroeconomic shift";
      return `Macro event expired: ${eventName}`;
    }

    if (event.event_type === "MACRO_MAINTENANCE_CHARGED") {
      const perHouse =
        typeof payload?.per_house === "number"
          ? payload.per_house
          : typeof payload?.per_house === "string"
            ? Number.parseInt(payload.per_house, 10)
          : null;
      const eventName =
        typeof payload?.event_name === "string"
          ? payload.event_name
          : "Macro maintenance";
      return perHouse !== null
        ? `${eventName} maintenance charged (${formatMoney(perHouse, currencySymbol)} per house)`
        : `${eventName} maintenance charged`;
    }

    if (event.event_type === "MACRO_INTEREST_SURCHARGE") {
      const amount =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      return amount !== null
        ? `Macro interest surcharge: ${formatMoney(amount, currencySymbol)} (${tileLabel})`
        : `Macro interest surcharge (${tileLabel})`;
    }

    if (event.event_type === "COLLECT_GO") {
      const amount =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      const reason =
        typeof payload?.reason === "string" ? payload.reason : "PASS_START";
      const reasonLabel = reason === "LAND_GO" ? "for landing on GO" : "for passing GO";
      return amount !== null
        ? `${playerName} collected ${formatMoney(amount, currencySymbol)} ${reasonLabel}`
        : `${playerName} collected GO salary`;
    }

    if (event.event_type === "LAND_ON_TILE") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tile = boardPack?.tiles?.find((entry) => entry.index === tileIndex);
      const tileLabel = tile
        ? `${tile.index} ${tile.name}`
        : tileIndex !== null
          ? `Tile ${tileIndex}`
          : "Tile";
      const ownershipLabel = getOwnershipLabel(tileIndex);
      return ownershipLabel
        ? `Landed on ${tileLabel} · ${ownershipLabel}`
        : `Landed on ${tileLabel}`;
    }

    if (event.event_type === "DRAW_CARD") {
      const deck =
        typeof payload?.deck === "string" ? payload.deck : "Card";
      const cardTitle =
        typeof payload?.card_title === "string" ? payload.card_title : "Card";
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      return `${playerName} drew ${deck}: ${cardTitle}`;
    }

    if (event.event_type === "CARD_REVEALED") {
      const deck =
        typeof payload?.deck === "string" ? payload.deck : "Card";
      const cardTitle =
        typeof payload?.card_title === "string" ? payload.card_title : "Card";
      return `${deck} card revealed: ${cardTitle}`;
    }

    if (event.event_type === "CARD_PAY") {
      const amount =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      const cardTitle =
        typeof payload?.card_title === "string" ? payload.card_title : "Card";
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      return amount !== null
        ? `${playerName} paid ${formatMoney(amount, currencySymbol)} (${cardTitle})`
        : `${playerName} paid (${cardTitle})`;
    }

    if (event.event_type === "CARD_RECEIVE") {
      const amount =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      const cardTitle =
        typeof payload?.card_title === "string" ? payload.card_title : "Card";
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      return amount !== null
        ? `${playerName} received ${formatMoney(amount, currencySymbol)} (${cardTitle})`
        : `${playerName} received (${cardTitle})`;
    }

    if (
      event.event_type === "CARD_MOVE_TO" ||
      event.event_type === "CARD_MOVE_REL"
    ) {
      const toIndexRaw = payload?.to_tile_index;
      const toIndex =
        typeof toIndexRaw === "number"
          ? toIndexRaw
          : typeof toIndexRaw === "string"
            ? Number.parseInt(toIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        toIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === toIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (toIndex !== null ? `Tile ${toIndex}` : "tile");
      const cardTitle =
        typeof payload?.card_title === "string" ? payload.card_title : "Card";
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      return `${playerName} moved to ${tileLabel} (${cardTitle})`;
    }

    if (event.event_type === "CARD_GO_TO_JAIL") {
      const cardTitle =
        typeof payload?.card_title === "string" ? payload.card_title : "Card";
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      return `${playerName} went to jail (${cardTitle})`;
    }

    if (event.event_type === "CARD_GET_OUT_OF_JAIL_FREE_RECEIVED") {
      const cardTitle =
        typeof payload?.card_title === "string"
          ? payload.card_title
          : "Get Out of Jail Free";
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      const totalCards =
        typeof payload?.total_cards === "number"
          ? payload.total_cards
          : typeof payload?.total_cards === "string"
            ? Number.parseInt(payload.total_cards, 10)
            : null;
      return totalCards !== null
        ? `${playerName} received a ${cardTitle} card (${totalCards} total)`
        : `${playerName} received a ${cardTitle} card`;
    }

    if (event.event_type === "CARD_GET_OUT_OF_JAIL_FREE_USED") {
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      const remainingCards =
        typeof payload?.remaining_cards === "number"
          ? payload.remaining_cards
          : typeof payload?.remaining_cards === "string"
            ? Number.parseInt(payload.remaining_cards, 10)
            : null;
      return remainingCards !== null
        ? `${playerName} used a Get Out of Jail Free card (${remainingCards} left)`
        : `${playerName} used a Get Out of Jail Free card`;
    }

    if (event.event_type === "OFFER_PURCHASE") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromPayload =
        typeof payload?.tile_name === "string" ? payload.tile_name : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ??
        tileNameFromPayload ??
        (tileIndex !== null ? `Tile ${tileIndex}` : "this tile");
      const price =
        typeof payload?.price === "number"
          ? payload.price
          : typeof payload?.price === "string"
            ? Number.parseInt(payload.price, 10)
            : null;

      return price !== null
        ? `Offer: Buy ${tileLabel} for ${formatMoney(price, currencySymbol)}`
        : `Offer: Buy ${tileLabel}`;
    }

    if (event.event_type === "DECLINE_PROPERTY") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      return `Auction: ${tileLabel}`;
    }

    if (event.event_type === "AUCTION_STARTED") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      const minIncrement =
        typeof payload?.min_increment === "number"
          ? payload.min_increment
          : typeof payload?.min_increment === "string"
            ? Number.parseInt(payload.min_increment, 10)
            : null;
      return minIncrement !== null
        ? `Auction started for ${tileLabel} (min ${formatSignedMoney(minIncrement, currencySymbol)})`
        : `Auction started for ${tileLabel}`;
    }

    if (event.event_type === "AUCTION_BID") {
      const amount =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      const playerId =
        typeof payload?.player_id === "string" ? payload.player_id : null;
      const playerName =
        players.find((player) => player.id === playerId)?.display_name ??
        "Player";
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      return amount !== null
        ? `${playerName} bid ${formatMoney(amount, currencySymbol)} on ${tileLabel}`
        : `${playerName} bid on ${tileLabel}`;
    }

    if (event.event_type === "AUCTION_PASS") {
      const playerId =
        typeof payload?.player_id === "string" ? payload.player_id : null;
      const playerName =
        players.find((player) => player.id === playerId)?.display_name ??
        "Player";
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      const isAuto = payload?.auto === true;
      return isAuto
        ? `${playerName} auto-passed on ${tileLabel}`
        : `${playerName} passed on ${tileLabel}`;
    }

    if (event.event_type === "AUCTION_WON") {
      const winnerId =
        typeof payload?.winner_id === "string" ? payload.winner_id : null;
      const winnerName =
        players.find((player) => player.id === winnerId)?.display_name ??
        "Player";
      const amount =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      return amount !== null
        ? `${winnerName} won ${tileLabel} for ${formatMoney(amount, currencySymbol)}`
        : `${winnerName} won ${tileLabel}`;
    }

    if (event.event_type === "AUCTION_SKIPPED") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      return `Auction skipped for ${tileLabel}`;
    }

    if (event.event_type === "PAY_RENT") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      const rentAmount =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      const ownerId =
        typeof payload?.to_player_id === "string" ? payload.to_player_id : null;
      const ownerName =
        players.find((player) => player.id === ownerId)?.display_name ??
        "Player";
      const diceTotal =
        typeof payload?.dice_total === "number"
          ? payload.dice_total
          : typeof payload?.dice_total === "string"
            ? Number.parseInt(payload.dice_total, 10)
            : null;
      const multiplier =
        typeof payload?.multiplier === "number"
          ? payload.multiplier
          : typeof payload?.multiplier === "string"
            ? Number.parseInt(payload.multiplier, 10)
            : null;
      const rentType =
        typeof payload?.rent_type === "string" ? payload.rent_type : null;
      const detailLabel =
        rentType === "UTILITY" && diceTotal !== null && multiplier !== null
          ? ` (dice ${diceTotal} × ${multiplier})`
          : "";
      const rentMultiplierTotal = parseNumber(payload?.rent_multiplier_total);
      const macroLabel =
        rentMultiplierTotal !== null && rentMultiplierTotal !== 1
          ? ` (macro ×${rentMultiplierTotal.toFixed(2)})`
          : "";

      return rentAmount !== null
        ? `Paid ${formatMoney(rentAmount, currencySymbol)} rent to ${ownerName} (${tileLabel})${detailLabel}${macroLabel}`
        : `Paid rent to ${ownerName} (${tileLabel})${macroLabel}`;
    }

    if (event.event_type === "RENT_SKIPPED_COLLATERAL") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      return `Rent skipped on ${tileLabel} (collateralized)`;
    }

    if (event.event_type === "COLLATERAL_LOAN_TAKEN") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      const principal =
        typeof payload?.principal === "number"
          ? payload.principal
          : typeof payload?.principal === "string"
            ? Number.parseInt(payload.principal, 10)
            : null;
      const payment =
        typeof payload?.payment_per_turn === "number"
          ? payload.payment_per_turn
          : typeof payload?.payment_per_turn === "string"
            ? Number.parseInt(payload.payment_per_turn, 10)
            : null;
      const termTurns =
        typeof payload?.term_turns === "number"
          ? payload.term_turns
          : typeof payload?.term_turns === "string"
            ? Number.parseInt(payload.term_turns, 10)
            : null;
      const principalLabel =
        principal !== null ? ` for ${formatMoney(principal, currencySymbol)}` : "";
      const paymentLabel =
        payment !== null && termTurns !== null
          ? ` · ${formatMoney(payment, currencySymbol)}/turn × ${termTurns}`
          : "";
      return `Collateral loan on ${tileLabel}${principalLabel}${paymentLabel}`;
    }

    if (event.event_type === "COLLATERAL_LOAN_PAYMENT") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      const payment =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      const turnsRemaining = getTurnsRemainingFromPayload(payload);
      if (payment !== null && turnsRemaining !== null) {
        return `Loan payment ${formatMoney(payment, currencySymbol)} on ${tileLabel} · ${turnsRemaining} turns left`;
      }
      if (payment !== null) {
        return `Loan payment ${formatMoney(payment, currencySymbol)} on ${tileLabel}`;
      }
      return `Loan payment on ${tileLabel}`;
    }

    if (event.event_type === "COLLATERAL_LOAN_PAID") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      return `Loan paid off on ${tileLabel}`;
    }

    if (event.event_type === "LOAN_PAID_OFF") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      const amount =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      if (amount !== null) {
        return `Loan paid off early on ${tileLabel} for ${formatMoney(amount, currencySymbol)}`;
      }
      return `Loan paid off early on ${tileLabel}`;
    }

    if (event.event_type === "PROPERTY_SOLD_TO_MARKET") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      const playerId =
        typeof payload?.player_id === "string" ? payload.player_id : null;
      const playerName =
        players.find((player) => player.id === playerId)?.display_name ??
        "Player";
      const payout =
        typeof payload?.payout === "number"
          ? payload.payout
          : typeof payload?.payout === "string"
            ? Number.parseInt(payload.payout, 10)
            : null;
      return payout !== null
        ? `${playerName} sold ${tileLabel} to market for ${formatMoney(payout, currencySymbol)}`
        : `${playerName} sold ${tileLabel} to market`;
    }

    if (event.event_type === "PROPERTY_DEFAULTED") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      const playerId =
        typeof payload?.player_id === "string" ? payload.player_id : null;
      const playerName =
        players.find((player) => player.id === playerId)?.display_name ??
        "Player";
      return `${playerName} defaulted on ${tileLabel}`;
    }

    if (event.event_type === "PAY_TAX") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      const taxAmount =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      const payerName =
        typeof payload?.payer_display_name === "string"
          ? payload.payer_display_name
          : "Player";

      return taxAmount !== null
        ? `${payerName} paid ${formatMoney(taxAmount, currencySymbol)} tax (${tileLabel})`
        : `${payerName} paid tax (${tileLabel})`;
    }

    if (event.event_type === "BANKRUPTCY") {
      const playerId =
        typeof payload?.player_id === "string" ? payload.player_id : null;
      const playerName =
        players.find((player) => player.id === playerId)?.display_name ??
        "Player";
      const reason =
        typeof payload?.reason === "string" ? payload.reason : "PAYMENT";
      const returnedIds = Array.isArray(payload?.returned_property_ids)
        ? payload.returned_property_ids
        : [];
      const propertyCount =
        returnedIds.length > 0 ? ` (${returnedIds.length} properties)` : "";
      return `${playerName} went bankrupt (${reason})${propertyCount}`;
    }

    if (event.event_type === "JAIL_PAY_FINE") {
      const fineAmount =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      return fineAmount !== null
        ? `${playerName} paid ${formatMoney(fineAmount, currencySymbol)} to get out of jail`
        : `${playerName} paid a jail fine`;
    }

    if (event.event_type === "JAIL_DOUBLES_SUCCESS") {
      const dice = Array.isArray(payload?.dice) ? payload?.dice : null;
      const diceValues =
        dice && dice.length >= 2 && dice.every((value) => typeof value === "number")
          ? dice.slice(0, 2)
          : null;
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      return diceValues
        ? `${playerName} rolled doubles to leave jail (${diceValues[0]} + ${diceValues[1]})`
        : `${playerName} rolled doubles to leave jail`;
    }

    if (event.event_type === "JAIL_DOUBLES_FAIL") {
      const dice = Array.isArray(payload?.dice) ? payload?.dice : null;
      const diceValues =
        dice && dice.length >= 2 && dice.every((value) => typeof value === "number")
          ? dice.slice(0, 2)
          : null;
      const turnsRemaining = getTurnsRemainingFromPayload(payload);
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      if (diceValues && turnsRemaining !== null) {
        return `${playerName} missed doubles (${diceValues[0]} + ${diceValues[1]}). Turns remaining: ${turnsRemaining}`;
      }
      if (diceValues) {
        return `${playerName} missed doubles (${diceValues[0]} + ${diceValues[1]})`;
      }
      return `${playerName} missed doubles in jail`;
    }

    if (event.event_type === "GO_TO_JAIL") {
      const fromIndexRaw = payload?.from_tile_index;
      const fromIndex =
        typeof fromIndexRaw === "number"
          ? fromIndexRaw
          : typeof fromIndexRaw === "string"
            ? Number.parseInt(fromIndexRaw, 10)
            : null;
      const toIndexRaw = payload?.to_jail_tile_index;
      const toIndexCandidate =
        toIndexRaw ?? (payload?.tile_index as typeof toIndexRaw);
      const toIndex =
        typeof toIndexCandidate === "number"
          ? toIndexCandidate
          : typeof toIndexCandidate === "string"
            ? Number.parseInt(toIndexCandidate, 10)
            : null;
      const fromLabel =
        fromIndex !== null ? `tile ${fromIndex}` : "Go To Jail";
      const toLabel = toIndex !== null ? `jail ${toIndex}` : "jail";
      const playerName =
        typeof payload?.display_name === "string"
          ? payload.display_name
          : typeof payload?.player_name === "string"
            ? payload.player_name
            : "Player";
      return `${playerName} went to ${toLabel} from ${fromLabel}`;
    }

    if (event.event_type === "GAME_OVER") {
      const winnerName =
        typeof payload?.winner_player_name === "string"
          ? payload.winner_player_name
          : "Player";
      return `Game over · Winner: ${winnerName}`;
    }

    return "Update received";
  }, [boardPack?.tiles, currencySymbol, getOwnershipLabel, getTileNameByIndex, players]);

  const clearResumeStorage = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const { localStorage } = window;
    localStorage.removeItem(lastGameKey);

    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith("bank.lobby")) {
        localStorage.removeItem(key);
      }
    }
  }, []);

  const loadPlayers = useCallback(
    async (activeGameId: string, accessToken?: string) => {
      const playerRows = await supabaseClient.fetchFromSupabase<Player[]>(
        `players?select=id,user_id,display_name,created_at,position,is_in_jail,jail_turns_remaining,get_out_of_jail_free_count,is_eliminated,eliminated_at&game_id=eq.${activeGameId}&order=created_at.asc`,
        { method: "GET" },
        accessToken,
      );
      setPlayers(playerRows);
    },
    [],
  );

  const loadOwnership = useCallback(
    async (activeGameId: string, accessToken?: string) => {
      const ownershipRows = await supabaseClient.fetchFromSupabase<
        OwnershipRow[]
      >(
        `property_ownership?select=tile_index,owner_player_id,collateral_loan_id,purchase_mortgage_id,houses&game_id=eq.${activeGameId}`,
        { method: "GET" },
        accessToken,
      );
      const mapped = ownershipRows.reduce<OwnershipByTile>((acc, row) => {
        if (row.owner_player_id) {
          acc[row.tile_index] = {
            owner_player_id: row.owner_player_id,
            collateral_loan_id: row.collateral_loan_id ?? null,
            purchase_mortgage_id: row.purchase_mortgage_id ?? null,
            houses: row.houses ?? 0,
          };
        }
        return acc;
      }, {});
      setOwnershipByTile(mapped);
    },
    [],
  );

  const loadLoans = useCallback(
    async (
      activeGameId: string,
      accessToken?: string,
      playerId?: string | null,
    ) => {
      if (!playerId) {
        setPlayerLoans([]);
        return;
      }
      const loanRows = await supabaseClient.fetchFromSupabase<PlayerLoan[]>(
        `player_loans?select=id,player_id,collateral_tile_index,principal,remaining_principal,rate_per_turn,term_turns,turns_remaining,payment_per_turn,status&game_id=eq.${activeGameId}&player_id=eq.${playerId}`,
        { method: "GET" },
        accessToken,
      );
      setPlayerLoans(loanRows);
    },
    [],
  );

  const loadPurchaseMortgages = useCallback(
    async (
      activeGameId: string,
      accessToken?: string,
      playerId?: string | null,
    ) => {
      if (!playerId) {
        setPurchaseMortgages([]);
        return;
      }
      const mortgageRows = await supabaseClient.fetchFromSupabase<
        PurchaseMortgage[]
      >(
        `purchase_mortgages?select=id,player_id,tile_index,principal_original,principal_remaining,rate_per_turn,term_turns,turns_elapsed,accrued_interest_unpaid,status&game_id=eq.${activeGameId}&player_id=eq.${playerId}`,
        { method: "GET" },
        accessToken,
      );
      setPurchaseMortgages(mortgageRows);
    },
    [],
  );

  const loadTradeProposals = useCallback(
    async (activeGameId: string, accessToken?: string) => {
      const proposalRows = await supabaseClient.fetchFromSupabase<
        TradeProposal[]
      >(
        `trade_proposals?select=id,game_id,proposer_player_id,counterparty_player_id,offer_cash,offer_tile_indices,request_cash,request_tile_indices,snapshot,status,created_at&game_id=eq.${activeGameId}&order=created_at.desc`,
        { method: "GET" },
        accessToken,
      );
      setTradeProposals(proposalRows);
    },
    [],
  );

  const loadTradeLiabilities = useCallback(
    async (
      activeGameId: string,
      accessToken: string,
      loanIds: string[],
      mortgageIds: string[],
    ) => {
      if (loanIds.length === 0) {
        setTradeLoanDetails([]);
      } else {
        const loanRows = await supabaseClient.fetchFromSupabase<PlayerLoan[]>(
          `player_loans?select=id,player_id,collateral_tile_index,principal,remaining_principal,rate_per_turn,term_turns,turns_remaining,payment_per_turn,status&game_id=eq.${activeGameId}&id=in.(${loanIds.join(",")})`,
          { method: "GET" },
          accessToken,
        );
        setTradeLoanDetails(loanRows);
      }

      if (mortgageIds.length === 0) {
        setTradeMortgageDetails([]);
      } else {
        const mortgageRows = await supabaseClient.fetchFromSupabase<
          PurchaseMortgage[]
        >(
          `purchase_mortgages?select=id,player_id,tile_index,principal_original,principal_remaining,rate_per_turn,term_turns,turns_elapsed,accrued_interest_unpaid,status&game_id=eq.${activeGameId}&id=in.(${mortgageIds.join(",")})`,
          { method: "GET" },
          accessToken,
        );
        setTradeMortgageDetails(mortgageRows);
      }
    },
    [],
  );

  const loadGameMeta = useCallback(
    async (activeGameId: string, accessToken?: string) => {
      const [game] = await supabaseClient.fetchFromSupabase<GameMeta[]>(
        `games?select=id,board_pack_id,status,created_by&id=eq.${activeGameId}&limit=1`,
        { method: "GET" },
        accessToken,
      );
      if (!game) {
        setGameMeta(null);
        setGameMetaError(
          "Game exists but is not visible — membership or RLS issue.",
        );
        return;
      }

      setGameMeta(game);
      setGameMetaError(null);
    },
    [],
  );

  const loadGameState = useCallback(
    async (activeGameId: string, accessToken?: string) => {
      const [stateRow] = await supabaseClient.fetchFromSupabase<GameState[]>(
        `game_state?select=game_id,version,current_player_id,balances,last_roll,doubles_count,turn_phase,pending_action,pending_card_active,pending_card_deck,pending_card_id,pending_card_title,pending_card_kind,pending_card_payload,pending_card_drawn_by_player_id,pending_card_drawn_at,pending_card_source_tile_index,active_macro_effects_v1,skip_next_roll_by_player,chance_index,community_index,free_parking_pot,rules,auction_active,auction_tile_index,auction_initiator_player_id,auction_current_bid,auction_current_winner_player_id,auction_turn_player_id,auction_turn_ends_at,auction_eligible_player_ids,auction_passed_player_ids,auction_min_increment&game_id=eq.${activeGameId}&limit=1`,
        { method: "GET" },
        accessToken,
      );
      setGameState(stateRow ?? null);
    },
    [],
  );

  const loadEvents = useCallback(
    async (activeGameId: string, accessToken?: string) => {
      const eventRows = await supabaseClient.fetchFromSupabase<GameEvent[]>(
        `game_events?select=id,event_type,payload,created_at,version&game_id=eq.${activeGameId}&order=version.desc&limit=${EVENT_FETCH_LIMIT}`,
        { method: "GET" },
        accessToken,
      );
      setEvents(eventRows);
    },
    [],
  );

  const loadGameData = useCallback(
    async (activeGameId: string, accessToken?: string) => {
      await Promise.all([
        loadGameMeta(activeGameId, accessToken),
        loadPlayers(activeGameId, accessToken),
        loadGameState(activeGameId, accessToken),
        loadEvents(activeGameId, accessToken),
        loadOwnership(activeGameId, accessToken),
        loadTradeProposals(activeGameId, accessToken),
      ]);
      if (!activeGameIdRef.current || activeGameIdRef.current === activeGameId) {
        setInitialSnapshotReady(true);
      }
    },
    [
      loadEvents,
      loadGameMeta,
      loadGameState,
      loadOwnership,
      loadPlayers,
      loadTradeProposals,
    ],
  );

  const setupRealtimeChannel = useCallback(() => {
    if (!isConfigured || !gameId || !session?.access_token || sessionInvalid) {
      return;
    }

    const realtimeClient = supabaseClient.getRealtimeClient();
    if (!realtimeClient) {
      return;
    }

    const existingChannel = realtimeChannelRef.current;
    const existingContext = realtimeContextRef.current;
    const hasMatchingContext =
      existingContext?.gameId === gameId &&
      existingContext.accessToken === session.access_token;
    const channelIsClosedOrErrored =
      existingChannel?.state === "closed" ||
      existingChannel?.state === "errored";

    if (existingChannel && hasMatchingContext && !channelIsClosedOrErrored) {
      if (existingChannel.state === "joined") {
        setRealtimeReady(true);
      }
      return;
    }

    if (existingChannel && (!hasMatchingContext || channelIsClosedOrErrored)) {
      realtimeClient.removeChannel(existingChannel);
      realtimeChannelRef.current = null;
      realtimeContextRef.current = null;
    }

    setRealtimeReady(false);
    const channelName = `player-console:${gameId}`;
    if (DEBUG) {
      console.info("[Play][Realtime] create channel", {
        channel: channelName,
        gameId,
        hasAccessToken: Boolean(session?.access_token),
      });
    }
    const channel = realtimeClient
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `game_id=eq.${gameId}`,
        },
        async (payload) => {
          if (DEBUG) {
            console.info("[Play][Realtime] payload", {
              table: "players",
              eventType: payload.eventType,
              gameId,
            });
          }
          try {
            await loadPlayers(gameId, session?.access_token);
          } catch (error) {
            if (DEBUG) {
              console.error("[Play][Realtime] players handler error", error);
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_state",
          filter: `game_id=eq.${gameId}`,
        },
        async (payload) => {
          if (DEBUG) {
            console.info("[Play][Realtime] payload", {
              table: "game_state",
              eventType: payload.eventType,
              gameId,
            });
          }
          try {
            await loadGameState(gameId, session?.access_token);
          } catch (error) {
            if (DEBUG) {
              console.error("[Play][Realtime] game_state handler error", error);
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_events",
          filter: `game_id=eq.${gameId}`,
        },
        async (payload) => {
          if (DEBUG) {
            console.info("[Play][Realtime] payload", {
              table: "game_events",
              eventType: payload.eventType,
              gameId,
            });
          }
          try {
            await loadEvents(gameId, session?.access_token);
          } catch (error) {
            if (DEBUG) {
              console.error("[Play][Realtime] game_events handler error", error);
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "property_ownership",
          filter: `game_id=eq.${gameId}`,
        },
        async (payload) => {
          if (DEBUG) {
            console.info("[Play][Realtime] payload", {
              table: "property_ownership",
              eventType: payload.eventType,
              gameId,
            });
          }
          try {
            await loadOwnership(gameId, session?.access_token);
          } catch (error) {
            if (DEBUG) {
              console.error(
                "[Play][Realtime] property_ownership handler error",
                error,
              );
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trade_proposals",
          filter: `game_id=eq.${gameId}`,
        },
        async (payload) => {
          if (DEBUG) {
            console.info("[Play][Realtime] payload", {
              table: "trade_proposals",
              eventType: payload.eventType,
              gameId,
            });
          }
          try {
            await loadTradeProposals(gameId, session?.access_token);
          } catch (error) {
            if (DEBUG) {
              console.error(
                "[Play][Realtime] trade_proposals handler error",
                error,
              );
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_loans",
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          try {
            await loadLoans(gameId, session?.access_token, currentUserPlayer?.id);
          } catch (error) {
            if (DEBUG) {
              console.error("[Play][Realtime] player_loans handler error", error);
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "purchase_mortgages",
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          try {
            await loadPurchaseMortgages(
              gameId,
              session?.access_token,
              currentUserPlayer?.id,
            );
          } catch (error) {
            if (DEBUG) {
              console.error(
                "[Play][Realtime] purchase_mortgages handler error",
                error,
              );
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        async (payload) => {
          if (DEBUG) {
            console.info("[Play][Realtime] payload", {
              table: "games",
              eventType: payload.eventType,
              gameId,
            });
          }
          try {
            await loadGameMeta(gameId, session?.access_token);
          } catch (error) {
            if (DEBUG) {
              console.error("[Play][Realtime] games handler error", error);
            }
          }
        },
      )
      .subscribe((status) => {
        if (DEBUG) {
          console.info("[Play][Realtime] status", { status, gameId });
        }
        const isReady = status === "SUBSCRIBED";
        setRealtimeReady(isReady);

        if (isReady && !realtimeReconciledRef.current) {
          realtimeReconciledRef.current = true;
          void loadGameData(gameId, session.access_token);
        }
      });

    realtimeChannelRef.current = channel;
    realtimeContextRef.current = {
      gameId,
      accessToken: session.access_token,
      channelName,
    };
  }, [
    gameId,
    isConfigured,
    currentUserPlayer?.id,
    loadEvents,
    loadGameMeta,
    loadGameState,
    loadLoans,
    loadPurchaseMortgages,
    loadPlayers,
    loadOwnership,
    loadTradeProposals,
    loadGameData,
    session?.access_token,
  ]);

  const requestRefresh = useCallback(() => {
    if (!gameId || !session?.access_token || sessionInvalid) {
      return;
    }

    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = setTimeout(async () => {
      if (refreshInFlightRef.current) {
        return;
      }

      refreshInFlightRef.current = true;

      try {
        await loadGameData(gameId, session.access_token);
        const channel = realtimeChannelRef.current;
        const channelIsClosedOrErrored =
          channel?.state === "closed" || channel?.state === "errored";
        if (!channel || channelIsClosedOrErrored) {
          setupRealtimeChannel();
        }
      } finally {
        refreshInFlightRef.current = false;
      }
    }, 400);
  }, [
    gameId,
    loadGameData,
    session?.access_token,
    sessionInvalid,
    setupRealtimeChannel,
  ]);

  const requestFirstRoundResync = useCallback(
    (accessTokenOverride?: string) => {
      const accessToken = accessTokenOverride ?? session?.access_token;
      if (!firstRoundResyncEnabled || !gameId || !accessToken || sessionInvalid) {
        return;
      }

      if (firstRoundResyncTimeoutRef.current) {
        clearTimeout(firstRoundResyncTimeoutRef.current);
      }

      firstRoundResyncTimeoutRef.current = setTimeout(async () => {
        await Promise.all([
          loadPlayers(gameId, accessToken),
          loadGameState(gameId, accessToken),
          loadEvents(gameId, accessToken),
          loadOwnership(gameId, accessToken),
          loadLoans(gameId, accessToken, currentUserPlayer?.id),
          loadPurchaseMortgages(gameId, accessToken, currentUserPlayer?.id),
        ]);
      }, 350);
    },
    [
      currentUserPlayer?.id,
      firstRoundResyncEnabled,
      gameId,
      loadEvents,
      loadGameState,
      loadLoans,
      loadPurchaseMortgages,
      loadPlayers,
      loadOwnership,
      session?.access_token,
      sessionInvalid,
    ],
  );

  useEffect(() => {
    let isMounted = true;

    const hydrate = async () => {
      if (!isConfigured) {
        setLoading(false);
        return;
      }

      const currentSession = await supabaseClient.getSession();
      if (!isMounted) {
        return;
      }

      setSession(currentSession);
      setNeedsAuth(false);

      if (typeof window !== "undefined") {
        const storedGameId = window.localStorage.getItem(lastGameKey);
        const accessToken = currentSession?.access_token;
        setGameId(storedGameId);

        if (storedGameId && !accessToken) {
          setNeedsAuth(true);
          setLoading(false);
          return;
        }

        if (storedGameId && accessToken) {
          try {
            await loadGameData(storedGameId, accessToken);
          } catch (error) {
            if (error instanceof Error) {
              setNotice(error.message);
            } else {
              setNotice("Unable to load game data.");
            }
          }
        }
      }

      setLoading(false);
    };

    hydrate();

    return () => {
      isMounted = false;
    };
  }, [isConfigured, loadGameData]);

  useEffect(() => {
    if (!gameId) {
      setGameMetaError(null);
    }
  }, [gameId]);

  useEffect(() => {
    activeGameIdRef.current = gameId;
    setInitialSnapshotReady(false);
    setFirstRoundResyncEnabled(true);
    firstRoundEndTurnsRef.current = new Set();
    setOwnershipByTile({});
  }, [gameId]);

  useEffect(() => {
    if (gameMeta?.status === "lobby" && gameId) {
      router.replace(`/lobby/${gameId}`);
    }
  }, [gameId, gameMeta?.status, router]);

  useEffect(() => {
    if (gameMeta?.status !== "ended") {
      return;
    }

    clearResumeStorage();
    setGameId(null);
    setGameMeta(null);
    setGameMetaError(null);
    setPlayers([]);
    setGameState(null);
    setEvents([]);
    setOwnershipByTile({});
    setNotice("This session has ended.");
    router.replace("/");
  }, [clearResumeStorage, gameMeta?.status, router]);

  useEffect(() => {
    if (!isConfigured || !gameId || !session?.access_token) {
      return;
    }

    setupRealtimeChannel();

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      const realtimeClient = supabaseClient.getRealtimeClient();
      if (realtimeClient && realtimeChannelRef.current) {
        realtimeClient.removeChannel(realtimeChannelRef.current);
      }
      if (DEBUG) {
        const channelName =
          realtimeContextRef.current?.channelName ??
          (gameId ? `player-console:${gameId}` : "player-console:unknown");
        console.info("[Play][Realtime] cleanup", {
          channel: channelName,
          reason: unmountingRef.current ? "unmount" : "dependency change",
        });
      }
      realtimeChannelRef.current = null;
      realtimeContextRef.current = null;
      setRealtimeReady(false);
      realtimeReconciledRef.current = false;
    };
  }, [
    gameId,
    isConfigured,
    loadEvents,
    loadGameState,
    loadPlayers,
    session?.access_token,
    sessionInvalid,
    setupRealtimeChannel,
  ]);

  useEffect(() => {
    setRealtimeReady(false);
    realtimeReconciledRef.current = false;
  }, [gameId]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        requestRefresh();
      }
    };

    const handleFocus = () => {
      requestRefresh();
    };

    const handleOnline = () => {
      requestRefresh();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);

      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      if (firstRoundResyncTimeoutRef.current) {
        clearTimeout(firstRoundResyncTimeoutRef.current);
      }
    };
  }, [requestRefresh]);

  useEffect(() => {
    if (!initialSnapshotReady || !gameId) {
      return;
    }

    if (realtimeReady || !firstRoundResyncEnabled) {
      return;
    }

    const refreshIntervalMs = 1750;
    const maxDurationMs = 20000;
    const intervalId = setInterval(() => {
      requestRefresh();
    }, refreshIntervalMs);
    const timeoutId = setTimeout(() => {
      clearInterval(intervalId);
    }, maxDurationMs);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [
    firstRoundResyncEnabled,
    gameId,
    initialSnapshotReady,
    realtimeReady,
    requestRefresh,
  ]);

  useEffect(() => {
    if (!firstRoundResyncEnabled || players.length === 0) {
      return;
    }

    events.forEach((event) => {
      if (event.event_type !== "END_TURN") {
        return;
      }

      const payload = event.payload as { from_player_id?: unknown } | null;
      const fromPlayerId =
        typeof payload?.from_player_id === "string"
          ? payload.from_player_id
          : null;

      if (fromPlayerId && !firstRoundEndTurnsRef.current.has(fromPlayerId)) {
        firstRoundEndTurnsRef.current.add(fromPlayerId);
      }
    });

    if (firstRoundEndTurnsRef.current.size >= players.length) {
      setFirstRoundResyncEnabled(false);
    }
  }, [events, firstRoundResyncEnabled, players.length]);

  useEffect(() => {
    return () => {
      unmountingRef.current = true;
    };
  }, []);

  useEffect(() => {
    setIntroStartedAt(null);
    setIntroElapsedMs(0);
    setIntroMinElapsed(false);
    setIntroDismissed(false);
  }, [gameId]);

  const isInProgress = gameMeta?.status === "in_progress";
  const hasGameMetaError = Boolean(gameMetaError);
  const isGameReady =
    isConfigured &&
    !loading &&
    !needsAuth &&
    !sessionInvalid &&
    Boolean(session?.access_token) &&
    Boolean(gameId) &&
    Boolean(gameMeta) &&
    Boolean(boardPack?.tiles?.length) &&
    Boolean(gameState) &&
    players.length > 0 &&
    initialSnapshotReady;
  const canShowIntro =
    isConfigured && Boolean(gameId) && !needsAuth && !gameMetaError;
  const shouldShowIntro = canShowIntro && !introDismissed;
  const introProgress = Math.min((introElapsedMs / minIntroMs) * 100, 100);

  useEffect(() => {
    if (!canShowIntro) {
      setIntroStartedAt(null);
      setIntroElapsedMs(0);
      setIntroMinElapsed(false);
      setIntroDismissed(false);
      return;
    }

    if (introStartedAt === null) {
      setIntroStartedAt(Date.now());
      setIntroElapsedMs(0);
      setIntroMinElapsed(false);
    }
  }, [canShowIntro, introStartedAt]);

  useEffect(() => {
    if (!canShowIntro || introStartedAt === null || introDismissed) {
      return;
    }

    let animationFrameId = 0;
    const updateElapsed = () => {
      const elapsed = Date.now() - introStartedAt;
      setIntroElapsedMs(elapsed);
      if (elapsed >= minIntroMs) {
        setIntroMinElapsed(true);
      } else {
        animationFrameId = window.requestAnimationFrame(updateElapsed);
      }
    };

    animationFrameId = window.requestAnimationFrame(updateElapsed);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [canShowIntro, introDismissed, introStartedAt, minIntroMs]);

  useEffect(() => {
    if (introStartedAt === null || introMinElapsed) {
      return;
    }

    if (introElapsedMs >= minIntroMs) {
      setIntroMinElapsed(true);
      return;
    }
  }, [introElapsedMs, introMinElapsed, introStartedAt, minIntroMs]);

  useEffect(() => {
    if (!sessionInvalid) {
      return;
    }

    if (
      session?.access_token &&
      session.access_token !== invalidTokenRef.current
    ) {
      invalidTokenRef.current = null;
      setSessionInvalid(false);
      setNotice(null);
    }
  }, [session?.access_token, sessionInvalid]);

  const currentPlayer = players.find(
    (player) => player.id === gameState?.current_player_id,
  );
  const isEliminated = Boolean(currentUserPlayer?.is_eliminated);
  const isAuctionActive = Boolean(gameState?.auction_active);
  const isMyTurn = Boolean(
    isInProgress &&
      session &&
      currentUserPlayer &&
      gameState?.current_player_id === currentUserPlayer.id &&
      !currentUserPlayer.is_eliminated,
  );
  const skipNextRollByPlayer = gameState?.skip_next_roll_by_player ?? {};
  const isPandemicSkipPending = Boolean(
    isMyTurn &&
      currentUserPlayer &&
      skipNextRollByPlayer[currentUserPlayer.id],
  );
  const pendingPurchase = useMemo<PendingPurchaseAction | null>(() => {
    const pendingAction = gameState?.pending_action;
    if (!pendingAction || typeof pendingAction !== "object") {
      return null;
    }

    const candidate = pendingAction as {
      type?: unknown;
      player_id?: unknown;
      tile_index?: unknown;
      price?: unknown;
    };

    if (candidate.type !== "BUY_PROPERTY") {
      return null;
    }

    const pendingPlayerId =
      typeof candidate.player_id === "string" ? candidate.player_id : null;
    if (
      pendingPlayerId &&
      gameState?.current_player_id &&
      pendingPlayerId !== gameState.current_player_id
    ) {
      return null;
    }

    if (
      typeof candidate.tile_index !== "number" ||
      typeof candidate.price !== "number"
    ) {
      return null;
    }

    return {
      type: "BUY_PROPERTY",
      player_id: pendingPlayerId,
      tile_index: candidate.tile_index,
      price: candidate.price,
    };
  }, [gameState?.current_player_id, gameState?.pending_action]);
  const pendingMacroEvent = useMemo(() => {
    const pendingAction = gameState?.pending_action;
    if (!pendingAction || typeof pendingAction !== "object") {
      return null;
    }

    const candidate = pendingAction as {
      type?: unknown;
      macro_id?: unknown;
      macroCardId?: unknown;
      name?: unknown;
      rarity?: unknown;
      durationRounds?: unknown;
      headline?: unknown;
      flavor?: unknown;
      rulesText?: unknown;
      tooltip?: unknown;
      effects?: unknown;
    };

    if (candidate.type !== "MACRO_EVENT") {
      return null;
    }

    const macroCardId =
      typeof candidate.macroCardId === "string"
        ? candidate.macroCardId
        : typeof candidate.macro_id === "string"
          ? candidate.macro_id
          : null;
    const rarity = typeof candidate.rarity === "string" ? candidate.rarity : null;
    const durationRounds =
      typeof candidate.durationRounds === "number" ? candidate.durationRounds : 0;
    const headline = typeof candidate.headline === "string" ? candidate.headline : "";
    const flavor = typeof candidate.flavor === "string" ? candidate.flavor : "";
    const rulesText =
      typeof candidate.rulesText === "string" ? candidate.rulesText : "";
    const tooltip = typeof candidate.tooltip === "string" ? candidate.tooltip : "";
    const effects =
      candidate.effects && typeof candidate.effects === "object"
        ? candidate.effects
        : null;

    return {
      macroCardId,
      name: typeof candidate.name === "string" ? candidate.name : "Macroeconomic Shift",
      rarity,
      durationRounds,
      headline,
      flavor,
      rulesText,
      tooltip,
      effects,
    };
  }, [gameState?.pending_action]);
  const pendingCard = useMemo(() => {
    if (!gameState?.pending_card_active) {
      return null;
    }
    return {
      deck: gameState.pending_card_deck ?? null,
      title: gameState.pending_card_title ?? "Card",
      kind: gameState.pending_card_kind ?? null,
      payload: gameState.pending_card_payload ?? null,
      drawnBy: gameState.pending_card_drawn_by_player_id ?? null,
    };
  }, [
    gameState?.pending_card_active,
    gameState?.pending_card_deck,
    gameState?.pending_card_kind,
    gameState?.pending_card_payload,
    gameState?.pending_card_title,
    gameState?.pending_card_drawn_by_player_id,
  ]);
  const pendingCardDescription = useMemo(
    () =>
      pendingCard
        ? getPendingCardDescription(
            pendingCard.kind,
            pendingCard.payload,
            boardPack,
            currencySymbol,
          )
        : null,
    [boardPack, currencySymbol, pendingCard],
  );
  const pendingCardActorName = useMemo(() => {
    if (!pendingCard?.drawnBy) {
      return null;
    }
    return (
      players.find((player) => player.id === pendingCard.drawnBy)?.display_name ??
      "Player"
    );
  }, [pendingCard?.drawnBy, players]);
  const pendingMacroRarityLabel = useMemo(() => {
    if (!pendingMacroEvent?.rarity) {
      return null;
    }
    return pendingMacroEvent.rarity.replaceAll("_", " ");
  }, [pendingMacroEvent?.rarity]);
  const macroTooltipById = useMemo(() => {
    const lookup = new Map<string, string>();
    const cards = boardPack?.macroDeck?.cards ?? [];
    cards.forEach((card) => {
      if (card.tooltip) {
        lookup.set(card.id, card.tooltip);
      }
    });
    return lookup;
  }, [boardPack?.macroDeck?.cards]);
  const activeMacroEffectsV1 = useMemo(() => {
    return (gameState?.active_macro_effects_v1 ?? []).filter(
      (entry): entry is ActiveMacroEffectV1 => Boolean(entry),
    );
  }, [gameState?.active_macro_effects_v1]);
  const houseBuildBlockedByMacro = useMemo(
    () =>
      activeMacroEffectsV1.find(
        (entry) => entry?.effects?.house_build_blocked === true,
      ) ?? null,
    [activeMacroEffectsV1],
  );
  const loanBlockedByMacro = useMemo(
    () =>
      activeMacroEffectsV1.find(
        (entry) => entry?.effects?.loan_mortgage_new_blocked === true,
      ) ?? null,
    [activeMacroEffectsV1],
  );

  const pendingMacroRarityClass = useMemo(() => {
    switch (pendingMacroEvent?.rarity) {
      case "common":
        return "bg-emerald-100 text-emerald-700";
      case "uncommon":
        return "bg-amber-100 text-amber-700";
      case "black_swan":
        return "bg-rose-100 text-rose-700";
      default:
        return "bg-slate-100 text-slate-600";
    }
  }, [pendingMacroEvent?.rarity]);
  const pendingTile = useMemo(() => {
    if (!pendingPurchase) {
      return null;
    }
    return (
      boardPack?.tiles?.find((tile) => tile.index === pendingPurchase.tile_index) ??
      null
    );
  }, [boardPack?.tiles, pendingPurchase]);
  const pendingOwnerId = useMemo(() => {
    if (!pendingTile) {
      return null;
    }
    const existingOwner = ownershipByTile[pendingTile.index]?.owner_player_id;
    if (existingOwner) {
      return existingOwner;
    }
    return currentUserPlayer?.id ?? null;
  }, [currentUserPlayer?.id, ownershipByTile, pendingTile]);
  const pendingOwnerRailCount = useMemo(() => {
    if (!pendingOwnerId || !boardPack?.tiles) {
      return 0;
    }
    return boardPack.tiles.filter(
      (tile) =>
        tile.type === "RAIL" &&
        ownershipByTile[tile.index]?.owner_player_id === pendingOwnerId,
    ).length;
  }, [boardPack?.tiles, ownershipByTile, pendingOwnerId]);
  const pendingOwnerUtilityCount = useMemo(() => {
    if (!pendingOwnerId || !boardPack?.tiles) {
      return 0;
    }
    return boardPack.tiles.filter(
      (tile) =>
        tile.type === "UTILITY" &&
        ownershipByTile[tile.index]?.owner_player_id === pendingOwnerId,
    ).length;
  }, [boardPack?.tiles, ownershipByTile, pendingOwnerId]);
  const pendingTileLabel =
    pendingTile?.name ??
    (pendingPurchase ? `Tile ${pendingPurchase.tile_index}` : null);
  const pendingBandColor = getTileBandColor(pendingTile);
  const hasPendingDecision = Boolean(pendingPurchase);
  const hasPendingMacroEvent = Boolean(pendingMacroEvent);
  const showPendingDecisionCard =
    hasPendingDecision && isMyTurn && !isAuctionActive;
  const showPendingDecisionBanner =
    hasPendingDecision && !isMyTurn && !isAuctionActive;
  const myPlayerBalance =
    gameState?.balances && currentUserPlayer
      ? gameState.balances[currentUserPlayer.id] ?? 0
      : 0;
  const canAffordPendingPurchase = pendingPurchase
    ? myPlayerBalance >= pendingPurchase.price
    : false;
  const pendingMortgagePrincipal = pendingPurchase
    ? Math.round(pendingPurchase.price * 0.5)
    : 0;
  const pendingMortgageDownPayment = pendingPurchase
    ? pendingPurchase.price - pendingMortgagePrincipal
    : 0;
  const canAffordPendingMortgage = pendingPurchase
    ? myPlayerBalance >= pendingMortgageDownPayment
    : false;
  const hasPendingCard = Boolean(pendingCard);
  const canAct =
    initialSnapshotReady &&
    isMyTurn &&
    !isEliminated &&
    !isAuctionActive &&
    !hasPendingCard &&
    !hasPendingMacroEvent &&
    !pendingGoToJail;
  const isAwaitingJailDecision =
    isMyTurn && gameState?.turn_phase === "AWAITING_JAIL_DECISION";
  const showJailDecisionPanel =
    isAwaitingJailDecision &&
    currentUserPlayer?.is_in_jail &&
    !pendingGoToJail;
  const canRollForDoubles =
    isAwaitingJailDecision && currentUserPlayer?.is_in_jail;
  const getOutOfJailFreeCount =
    currentUserPlayer?.get_out_of_jail_free_count ?? 0;
  const hasGetOutOfJailFree = getOutOfJailFreeCount > 0;
  const canRoll =
    canAct &&
    !hasPendingDecision &&
    !isAwaitingJailDecision &&
    (gameState?.last_roll == null || (gameState?.doubles_count ?? 0) > 0);
  const canEndTurn =
    canAct && !hasPendingDecision && gameState?.last_roll != null;
  const canConfirmPendingCard =
    Boolean(pendingCard) &&
    currentUserPlayer?.id === pendingCard?.drawnBy &&
    gameState?.turn_phase === "AWAITING_CARD_CONFIRM";
  const canConfirmMacroEvent =
    hasPendingMacroEvent &&
    isMyTurn &&
    gameState?.turn_phase === "AWAITING_CONFIRMATION";
  const rollDiceDisabledReason = useMemo(() => {
    if (!(actionLoading === "ROLL_DICE" || !canRoll)) {
      return null;
    }
    if (actionLoading === "ROLL_DICE") {
      return "Rolling…";
    }
    if (!initialSnapshotReady) {
      return "Loading snapshot…";
    }
    if (isEliminated) {
      return "You are eliminated";
    }
    if (isAuctionActive) {
      return "Auction in progress";
    }
    if (hasPendingCard) {
      return "Resolve card to continue";
    }
    if (hasPendingMacroEvent) {
      return "Resolve macro event to continue";
    }
    if (pendingGoToJail) {
      return "Acknowledge Go To Jail";
    }
    if (hasPendingDecision) {
      return "Resolve property decision";
    }
    if (isAwaitingJailDecision) {
      return "You are in jail – choose an option";
    }
    if (!isMyTurn) {
      return `Waiting for ${currentPlayer?.display_name ?? "another player"}…`;
    }
    if (gameState?.last_roll != null && (gameState?.doubles_count ?? 0) <= 0) {
      return "End your turn";
    }
    return null;
  }, [
    actionLoading,
    canRoll,
    currentPlayer?.display_name,
    gameState?.doubles_count,
    gameState?.last_roll,
    hasPendingCard,
    hasPendingMacroEvent,
    hasPendingDecision,
    initialSnapshotReady,
    isAuctionActive,
    isAwaitingJailDecision,
    isEliminated,
    isMyTurn,
    pendingGoToJail,
  ]);
  const buyDisabledReason =
    actionLoading === "BUY_PROPERTY"
      ? "Buying…"
      : !canAffordPendingPurchase
        ? "Not enough cash"
        : null;
  const mortgageBuyDisabledReason =
    actionLoading === "BUY_PROPERTY"
      ? "Buying…"
      : !canAffordPendingMortgage
        ? "Not enough cash for down payment"
        : null;
  const jailPayDisabledReason =
    actionLoading === "JAIL_PAY_FINE" ? "Paying…" : null;
  const confirmCardDisabledReason =
    actionLoading === "CONFIRM_PENDING_CARD" ? "Confirming…" : null;
  const confirmMacroDisabledReason =
    actionLoading === "CONFIRM_MACRO_EVENT" ? "Confirming…" : null;
  const payoffLoanDisabledReason =
    actionLoading === "PAYOFF_COLLATERAL_LOAN"
      ? "Paying…"
      : payoffLoan && payoffLoan.remaining_principal > myPlayerBalance
        ? "Not enough cash"
        : null;
  const pendingDeckLabel =
    pendingCard?.deck === "CHANCE"
      ? "Chance"
      : pendingCard?.deck === "COMMUNITY"
        ? "Community"
        : "Card";
  const turnPhaseLabel = useMemo(() => {
    if (gameState?.auction_active) {
      return "Auction in progress";
    }
    if (gameState?.turn_phase === "AWAITING_JAIL_DECISION") {
      return "In jail – choose option";
    }
    if (
      gameState?.turn_phase === "AWAITING_CARD_CONFIRM" ||
      gameState?.pending_card_active
    ) {
      return "Resolving card";
    }
    if (
      gameState?.turn_phase === "AWAITING_CONFIRMATION" ||
      hasPendingMacroEvent
    ) {
      return "Resolving macro event";
    }
    if (gameState?.turn_phase === "AWAITING_ROLL") {
      return "Rolling";
    }
    if (gameState?.current_player_id) {
      return "Waiting for other player";
    }
    return "Waiting";
  }, [
    gameState?.auction_active,
    gameState?.current_player_id,
    gameState?.pending_card_active,
    gameState?.turn_phase,
    hasPendingMacroEvent,
  ]);
  const realtimeStatusLabel = realtimeReady ? "Live" : "Syncing…";
  const isHost = Boolean(
    session && gameMeta?.created_by && session.user.id === gameMeta.created_by,
  );
  const ownedProperties = useMemo(() => {
    if (!boardPack?.tiles || !currentUserPlayer) {
      return [];
    }
    return boardPack.tiles
      .filter(
        (tile) =>
          ["PROPERTY", "RAIL", "UTILITY"].includes(tile.type) &&
          ownershipByTile[tile.index]?.owner_player_id === currentUserPlayer.id,
      )
      .map((tile) => {
        const ownership = ownershipByTile[tile.index];
        const isCollateralized = Boolean(ownership?.collateral_loan_id);
        const isPurchaseMortgaged = Boolean(ownership?.purchase_mortgage_id);
        const colorGroup = tile.colorGroup ?? null;
        const groupTiles = colorGroup
          ? boardPack.tiles.filter(
              (entry) =>
                entry.type === "PROPERTY" && entry.colorGroup === colorGroup,
            )
          : [];
        const hasFullSet =
          colorGroup &&
          groupTiles.length > 0 &&
          groupTiles.every(
            (entry) =>
              ownershipByTile[entry.index]?.owner_player_id ===
              currentUserPlayer.id,
          );
        const houses = ownership?.houses ?? 0;
        const houseCost = tile.houseCost ?? 0;
        const houseBuildMacroBlocked = houseBuildBlockedByMacro !== null;
        const canBuildHouse =
          canAct &&
          tile.type === "PROPERTY" &&
          hasFullSet &&
          !isCollateralized &&
          houseCost > 0 &&
          myPlayerBalance >= houseCost &&
          !houseBuildMacroBlocked;
        const canSellHouse =
          canAct &&
          tile.type === "PROPERTY" &&
          hasFullSet &&
          !isCollateralized &&
          houseCost > 0 &&
          houses > 0;
        const sellToMarketDisabledReason = !canAct
          ? "Not your turn"
          : houses > 0
            ? "Sell houses first"
            : isCollateralized
              ? "Collateralized properties cannot be sold"
              : isPurchaseMortgaged
                ? "Mortgaged properties cannot be sold"
                : null;
        const canSellToMarket = sellToMarketDisabledReason === null;
        return {
          tile,
          isCollateralized,
          isPurchaseMortgaged,
          isCollateralEligible: !isCollateralized && !isPurchaseMortgaged,
          hasFullSet,
          houses,
          houseCost,
          canBuildHouse,
          canSellHouse,
          canSellToMarket,
          houseBuildMacroBlocked,
          sellToMarketDisabledReason,
        };
      });
  }, [
    boardPack?.tiles,
    canAct,
    currentUserPlayer,
    houseBuildBlockedByMacro,
    myPlayerBalance,
    ownershipByTile,
  ]);
  const ownedRailCount = useMemo(() => {
    if (!boardPack?.tiles || !currentUserPlayer) {
      return 0;
    }
    return boardPack.tiles.filter(
      (tile) =>
        tile.type === "RAIL" &&
        ownershipByTile[tile.index]?.owner_player_id === currentUserPlayer.id,
    ).length;
  }, [boardPack?.tiles, currentUserPlayer, ownershipByTile]);
  const ownedUtilityCount = useMemo(() => {
    if (!boardPack?.tiles || !currentUserPlayer) {
      return 0;
    }
    return boardPack.tiles.filter(
      (tile) =>
        tile.type === "UTILITY" &&
        ownershipByTile[tile.index]?.owner_player_id === currentUserPlayer.id,
    ).length;
  }, [boardPack?.tiles, currentUserPlayer, ownershipByTile]);
  const propertyActionTile = useMemo(() => {
    if (!propertyActionModal || !boardPack?.tiles) {
      return null;
    }
    return (
      boardPack.tiles.find(
        (entry) => entry.index === propertyActionModal.tileIndex,
      ) ?? null
    );
  }, [boardPack?.tiles, propertyActionModal]);
  const propertyActionPayout = useMemo(() => {
    if (!propertyActionModal || propertyActionModal.action !== "SELL_TO_MARKET") {
      return 0;
    }
    const price = propertyActionTile?.price ?? 0;
    return Math.round(price * 0.7);
  }, [propertyActionModal, propertyActionTile]);
  const availableTradeCounterparties = useMemo(() => {
    if (!currentUserPlayer) {
      return [];
    }
    return players.filter(
      (player) => player.id !== currentUserPlayer.id && !player.is_eliminated,
    );
  }, [currentUserPlayer, players]);
  const counterpartyOwnedProperties = useMemo(() => {
    if (!tradeCounterpartyId || !boardPack?.tiles) {
      return [];
    }
    return boardPack.tiles
      .filter(
        (tile) =>
          ["PROPERTY", "RAIL", "UTILITY"].includes(tile.type) &&
          ownershipByTile[tile.index]?.owner_player_id === tradeCounterpartyId,
      )
      .map((tile) => {
        const ownership = ownershipByTile[tile.index];
        return {
          tile,
          houses: ownership?.houses ?? 0,
        };
      });
  }, [boardPack?.tiles, ownershipByTile, tradeCounterpartyId]);
  const canSubmitTradeProposal = useMemo(() => {
    const hasAssets =
      tradeOfferCash > 0 ||
      tradeOfferTiles.length > 0 ||
      tradeRequestCash > 0 ||
      tradeRequestTiles.length > 0;
    return Boolean(tradeCounterpartyId) && hasAssets;
  }, [
    tradeCounterpartyId,
    tradeOfferCash,
    tradeOfferTiles.length,
    tradeRequestCash,
    tradeRequestTiles.length,
  ]);
  const activeLoans = playerLoans.filter((loan) => loan.status === "active");
  const activePurchaseMortgages = purchaseMortgages.filter(
    (mortgage) => mortgage.status === "active",
  );
  const latestMortgageInterestById = useMemo(() => {
    const latestById = new Map<
      string,
      { amount: number; version: number; ts: string | null }
    >();
    for (const event of events) {
      const payload =
        event.payload && typeof event.payload === "object"
          ? event.payload
          : null;
      if (!payload) {
        continue;
      }
      const version = typeof event.version === "number" ? event.version : 0;
      if (event.event_type === "CASH_DEBIT") {
        const reason =
          typeof payload.reason === "string" ? payload.reason : null;
        if (reason !== "PURCHASE_MORTGAGE_INTEREST") {
          continue;
        }
        const mortgageId =
          typeof payload.mortgage_id === "string" ? payload.mortgage_id : null;
        if (!mortgageId) {
          continue;
        }
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          continue;
        }
        const existing = latestById.get(mortgageId);
        if (!existing || version > existing.version) {
          latestById.set(mortgageId, {
            amount,
            version,
            ts: event.created_at ?? null,
          });
        }
        continue;
      }
      if (
        event.event_type !== "PURCHASE_MORTGAGE_INTEREST_PAID" &&
        event.event_type !== "PURCHASE_MORTGAGE_INTEREST_ACCRUED"
      ) {
        continue;
      }
      const mortgageId =
        typeof payload.mortgage_id === "string" ? payload.mortgage_id : null;
      if (!mortgageId) {
        continue;
      }
      const amount = parseNumber(payload.interest_amount);
      if (amount === null) {
        continue;
      }
      const existing = latestById.get(mortgageId);
      if (!existing || version > existing.version) {
        latestById.set(mortgageId, {
          amount,
          version,
          ts: event.created_at ?? null,
        });
      }
    }
    return latestById;
  }, [events]);
  const netWorth = useMemo(() => {
    const propertyValue = ownedProperties.reduce((total, entry) => {
      if (entry.isCollateralized || entry.isPurchaseMortgaged) {
        return total;
      }
      return total + (entry.tile.price ?? 0);
    }, 0);
    const outstandingPrincipal = activeLoans.reduce((total, loan) => {
      if (typeof loan.remaining_principal === "number") {
        return total + loan.remaining_principal;
      }
      return total + loan.principal;
    }, 0);
    const mortgageBalance = activePurchaseMortgages.reduce((total, mortgage) => {
      const principal = mortgage.principal_remaining ?? 0;
      const interest = mortgage.accrued_interest_unpaid ?? 0;
      return total + principal + interest;
    }, 0);
    return myPlayerBalance + propertyValue - outstandingPrincipal - mortgageBalance;
  }, [
    activeLoans,
    activePurchaseMortgages,
    myPlayerBalance,
    ownedProperties,
  ]);
  const auctionTurnPlayerId = gameState?.auction_turn_player_id ?? null;
  const auctionTileIndex = gameState?.auction_tile_index ?? null;
  const auctionTile =
    auctionTileIndex !== null && auctionTileIndex !== undefined
      ? boardPack?.tiles?.find((tile) => tile.index === auctionTileIndex) ?? null
      : null;
  const auctionBandColor = getTileBandColor(auctionTile);
  const auctionOwnedRailCount = useMemo(() => {
    if (!currentUserPlayer?.id || !boardPack?.tiles) {
      return 0;
    }
    return boardPack.tiles.filter(
      (tile) =>
        tile.type === "RAIL" &&
        ownershipByTile[tile.index]?.owner_player_id === currentUserPlayer.id,
    ).length;
  }, [boardPack?.tiles, currentUserPlayer?.id, ownershipByTile]);
  const auctionOwnedUtilityCount = useMemo(() => {
    if (!currentUserPlayer?.id || !boardPack?.tiles) {
      return 0;
    }
    return boardPack.tiles.filter(
      (tile) =>
        tile.type === "UTILITY" &&
        ownershipByTile[tile.index]?.owner_player_id === currentUserPlayer.id,
    ).length;
  }, [boardPack?.tiles, currentUserPlayer?.id, ownershipByTile]);
  const auctionCurrentBid = gameState?.auction_current_bid ?? 0;
  const auctionMinIncrement =
    gameState?.auction_min_increment ?? boardPackEconomy.auctionMinIncrement ?? 10;
  const auctionBidMinimum =
    auctionCurrentBid > 0 ? auctionCurrentBid + auctionMinIncrement : auctionMinIncrement;
  const auctionTurnEndsAt = gameState?.auction_turn_ends_at ?? null;
  const auctionWinnerId = gameState?.auction_current_winner_player_id ?? null;
  const auctionWinnerName =
    players.find((player) => player.id === auctionWinnerId)?.display_name ??
    (auctionWinnerId ? "Player" : null);
  const auctionTurnPlayerName =
    players.find((player) => player.id === auctionTurnPlayerId)?.display_name ??
    (auctionTurnPlayerId ? "Player" : null);
  const isCurrentAuctionBidder =
    Boolean(currentUserPlayer?.id) &&
    currentUserPlayer?.id === auctionTurnPlayerId;
  const UI_RESOLVE_DELAY_MS = 250;
  const [isCardResolving, setIsCardResolving] = useState(false);
  const [isMacroResolving, setIsMacroResolving] = useState(false);
  const [isAuctionResolving, setIsAuctionResolving] = useState(false);
  const [isLoanPayoffResolving, setIsLoanPayoffResolving] = useState(false);
  const [cardDisplaySnapshot, setCardDisplaySnapshot] = useState<{
    deckLabel: string;
    title: string;
    description: string | null;
    actorName: string | null;
  } | null>(null);
  const [auctionDisplaySnapshot, setAuctionDisplaySnapshot] = useState<{
    tileName: string;
    tileType: string;
    currentBid: number;
    winnerName: string | null;
    turnPlayerName: string | null;
    countdownLabel: string;
  } | null>(null);
  const currentBidderCash =
    currentUserPlayer && gameState?.balances
      ? gameState.balances[currentUserPlayer.id] ?? 0
      : 0;
  const autoPassAttemptedTurnRef = useRef<string | null>(null);
  const isDecisionOverlayActive =
    showJailDecisionPanel ||
    pendingGoToJail !== null ||
    pendingCard !== null ||
    isCardResolving ||
    pendingMacroEvent !== null ||
    isMacroResolving ||
    payoffLoan !== null ||
    isLoanPayoffResolving ||
    isAuctionActive ||
    isAuctionResolving;
  const isEventLogSuppressed =
    showJailDecisionPanel ||
    pendingGoToJail !== null ||
    pendingCard !== null ||
    isCardResolving ||
    pendingMacroEvent !== null ||
    isMacroResolving ||
    payoffLoan !== null ||
    isLoanPayoffResolving ||
    isAuctionActive;
  const transactions = useMemo(() => {
    const derived = derivePlayerTransactions({
      events,
      currentPlayerId: currentUserPlayer?.id ?? null,
      players,
      boardPack,
      ownershipByTile,
    });
    return [...derived].sort(
      (a, b) => b.sourceEventVersion - a.sourceEventVersion,
    );
  }, [boardPack, currentUserPlayer?.id, events, ownershipByTile, players]);
  const displayEvents = useMemo(
    () => events.slice(0, EVENT_LOG_LIMIT),
    [events],
  );
  const displayTransactions = useMemo(
    () => transactions.slice(0, TRANSACTION_DISPLAY_LIMIT),
    [transactions],
  );
  const formatSignedCurrency = (amount: number) =>
    formatSignedMoney(amount, currencySymbol);
  const incomingTradeSnapshotTiles = useMemo(
    () =>
      incomingTradeProposal
        ? normalizeTradeSnapshot(incomingTradeProposal.snapshot)
        : [],
    [incomingTradeProposal],
  );
  const incomingTradeOfferTiles =
    incomingTradeProposal?.offer_tile_indices ?? [];
  const incomingTradeRequestTiles =
    incomingTradeProposal?.request_tile_indices ?? [];
  const incomingTradeOfferCash = incomingTradeProposal?.offer_cash ?? 0;
  const incomingTradeRequestCash = incomingTradeProposal?.request_cash ?? 0;
  const incomingTradeCounterpartyName = incomingTradeProposal
    ? getPlayerNameById(incomingTradeProposal.proposer_player_id)
    : "Player";
  const incomingTradeLiabilities = useMemo(() => {
    if (!incomingTradeProposal) {
      return [];
    }
    return incomingTradeOfferTiles.map((tileIndex) => {
      const snapshot = incomingTradeSnapshotTiles.find(
        (entry) => entry.tile_index === tileIndex,
      );
      const collateralLoan = snapshot?.collateral_loan_id
        ? tradeLoansById.get(snapshot.collateral_loan_id)
        : null;
      const mortgage = snapshot?.purchase_mortgage_id
        ? tradeMortgagesById.get(snapshot.purchase_mortgage_id)
        : null;
      return {
        tileIndex,
        collateralPayment: collateralLoan?.payment_per_turn ?? null,
        mortgageInterest: mortgage
          ? calculateMortgageInterestPerTurn(
              mortgage.principal_remaining,
              mortgage.rate_per_turn,
            )
          : null,
      };
    });
  }, [
    incomingTradeOfferTiles,
    incomingTradeProposal,
    incomingTradeSnapshotTiles,
    tradeLoansById,
    tradeMortgagesById,
  ]);
  const tradeExecutionPerspective = useMemo(() => {
    if (!tradeExecutionSummary || !currentUserPlayer) {
      return null;
    }
    const isProposer =
      currentUserPlayer.id === tradeExecutionSummary.proposerPlayerId;
    const giveTiles = isProposer
      ? tradeExecutionSummary.offerTiles
      : tradeExecutionSummary.requestTiles;
    const receiveTiles = isProposer
      ? tradeExecutionSummary.requestTiles
      : tradeExecutionSummary.offerTiles;
    const giveCash = isProposer
      ? tradeExecutionSummary.offerCash
      : tradeExecutionSummary.requestCash;
    const receiveCash = isProposer
      ? tradeExecutionSummary.requestCash
      : tradeExecutionSummary.offerCash;
    const counterpartyName = isProposer
      ? getPlayerNameById(tradeExecutionSummary.counterpartyPlayerId)
      : getPlayerNameById(tradeExecutionSummary.proposerPlayerId);
    return {
      giveTiles,
      receiveTiles,
      giveCash,
      receiveCash,
      counterpartyName,
      snapshotTiles: tradeExecutionSummary.snapshotTiles,
    };
  }, [currentUserPlayer, getPlayerNameById, tradeExecutionSummary]);
  const updateExpandedBoardScale = useCallback(() => {
    const container = expandedBoardContainerRef.current;
    const board = expandedBoardRef.current;
    if (!container || !board) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const boardWidth = board.offsetWidth;
    const boardHeight = board.offsetHeight;
    if (
      containerRect.width === 0 ||
      containerRect.height === 0 ||
      boardWidth === 0 ||
      boardHeight === 0
    ) {
      return;
    }
    const rawScale = Math.min(
      containerRect.width / boardWidth,
      containerRect.height / boardHeight,
    );
    const paddedScale = rawScale * 0.95;
    const nextScale = Math.min(2, Math.max(0.4, paddedScale));
    setExpandedBoardScale(nextScale);
  }, []);

  useEffect(() => {
    if (isEventLogSuppressed && isActivityPanelOpen) {
      setIsActivityPanelOpen(false);
    }
  }, [isActivityPanelOpen, isEventLogSuppressed]);
  useEffect(() => {
    if (isDecisionOverlayActive && isBoardExpanded) {
      setIsBoardExpanded(false);
    }
  }, [isBoardExpanded, isDecisionOverlayActive]);
  useEffect(() => {
    if (!isBoardExpanded) {
      setSelectedTileIndex(null);
    }
  }, [isBoardExpanded]);
  useEffect(() => {
    if (!isBoardExpanded) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (selectedTileIndex !== null) {
          setSelectedTileIndex(null);
          return;
        }
        setIsBoardExpanded(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isBoardExpanded, selectedTileIndex]);
  useEffect(() => {
    if (!isBoardExpanded) {
      return undefined;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isBoardExpanded]);
  useEffect(() => {
    if (!isBoardExpanded) {
      return undefined;
    }
    const container = expandedBoardContainerRef.current;
    const board = expandedBoardRef.current;
    if (!container || !board) {
      return undefined;
    }
    updateExpandedBoardScale();
    const observer = new ResizeObserver(() => {
      updateExpandedBoardScale();
    });
    observer.observe(container);
    observer.observe(board);
    return () => {
      observer.disconnect();
    };
  }, [isBoardExpanded, updateExpandedBoardScale]);
  const auctionRemainingSeconds = useMemo(() => {
    if (!auctionTurnEndsAt) {
      return null;
    }
    const endMs = Date.parse(auctionTurnEndsAt);
    if (Number.isNaN(endMs)) {
      return null;
    }
    const diffMs = endMs - auctionNow.getTime();
    return Math.max(0, Math.ceil(diffMs / 1000));
  }, [auctionNow, auctionTurnEndsAt]);
  const auctionCountdownLabel =
    typeof auctionRemainingSeconds === "number"
      ? `${Math.floor(auctionRemainingSeconds / 60)}:${String(
          auctionRemainingSeconds % 60,
        ).padStart(2, "0")}`
      : "—";
  const canIncreaseAuctionBid =
    isCurrentAuctionBidder && auctionBidAmount + auctionMinIncrement <= currentBidderCash;
  const canDecreaseAuctionBid =
    isCurrentAuctionBidder && auctionBidAmount - auctionMinIncrement >= auctionBidMinimum;
  const canSubmitAuctionBid =
    isCurrentAuctionBidder &&
    auctionBidAmount >= auctionBidMinimum &&
    auctionBidAmount <= currentBidderCash;
  const auctionBidDisabledReason =
    actionLoading === "AUCTION_BID"
      ? "Submitting bid…"
      : !canSubmitAuctionBid
        ? auctionBidAmount < auctionBidMinimum
          ? `Minimum bid is ${formatMoney(auctionBidMinimum, currencySymbol)}`
          : auctionBidAmount > currentBidderCash
            ? "Not enough cash"
            : null
        : null;

  useEffect(() => {
    if (!gameId || !session?.access_token) {
      return;
    }
    void loadLoans(gameId, session.access_token, currentUserPlayer?.id);
    void loadPurchaseMortgages(
      gameId,
      session.access_token,
      currentUserPlayer?.id,
    );
  }, [
    currentUserPlayer?.id,
    gameId,
    loadLoans,
    loadPurchaseMortgages,
    session?.access_token,
  ]);

  useEffect(() => {
    setTradeRequestTiles([]);
  }, [tradeCounterpartyId]);

  useEffect(() => {
    if (!incomingTradeProposal) {
      setIsIncomingTradeOpen(false);
    }
  }, [incomingTradeProposal]);

  useEffect(() => {
    if (!gameId || !session?.access_token) {
      return;
    }
    const pendingTrades = tradeProposals.filter(
      (proposal) => proposal.status === "PENDING",
    );
    const loanIds = new Set<string>();
    const mortgageIds = new Set<string>();
    for (const proposal of pendingTrades) {
      const snapshotTiles = normalizeTradeSnapshot(proposal.snapshot);
      for (const tile of snapshotTiles) {
        if (tile.collateral_loan_id) {
          loanIds.add(tile.collateral_loan_id);
        }
        if (tile.purchase_mortgage_id) {
          mortgageIds.add(tile.purchase_mortgage_id);
        }
      }
    }
    void loadTradeLiabilities(
      gameId,
      session.access_token,
      Array.from(loanIds),
      Array.from(mortgageIds),
    );
  }, [
    gameId,
    loadTradeLiabilities,
    session?.access_token,
    tradeProposals,
  ]);

  useEffect(() => {
    if (!isAuctionActive) {
      return;
    }
    setAuctionDisplaySnapshot({
      tileName:
        auctionTile?.name ??
        (auctionTileIndex !== null
          ? `Tile ${auctionTileIndex}`
          : "Unowned tile"),
      tileType: auctionTile?.type ?? "Ownable tile",
      currentBid: auctionCurrentBid,
      winnerName: auctionWinnerName,
      turnPlayerName: auctionTurnPlayerName,
      countdownLabel: auctionCountdownLabel,
    });
    setAuctionNow(new Date());
    const interval = setInterval(() => {
      setAuctionNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, [
    auctionCountdownLabel,
    auctionCurrentBid,
    auctionTile?.name,
    auctionTile?.type,
    auctionTileIndex,
    auctionTurnEndsAt,
    auctionTurnPlayerName,
    auctionWinnerName,
    isAuctionActive,
  ]);

  useEffect(() => {
    if (!pendingCard) {
      return;
    }
    setCardDisplaySnapshot({
      deckLabel: pendingDeckLabel,
      title: pendingCard.title,
      description: pendingCardDescription ?? null,
      actorName: pendingCardActorName ?? null,
    });
  }, [
    pendingCard,
    pendingCardActorName,
    pendingCardDescription,
    pendingDeckLabel,
  ]);

  useEffect(() => {
    if (!initialSnapshotReady || lastTradeEventIdRef.current) {
      return;
    }
    const tradeEvent = events.find(
      (event) => event.event_type === "TRADE_ACCEPTED",
    );
    if (tradeEvent) {
      lastTradeEventIdRef.current = tradeEvent.id;
    }
  }, [events, initialSnapshotReady]);

  useEffect(() => {
    if (!currentUserPlayer) {
      return;
    }
    const tradeEvent = events.find(
      (event) => event.event_type === "TRADE_ACCEPTED",
    );
    if (!tradeEvent || tradeEvent.id === lastTradeEventIdRef.current) {
      return;
    }
    const payload =
      tradeEvent.payload && typeof tradeEvent.payload === "object"
        ? tradeEvent.payload
        : null;
    const tradeId =
      payload && typeof payload.trade_id === "string" ? payload.trade_id : null;
    if (!tradeId) {
      return;
    }
    const proposerId =
      payload && typeof payload.proposer_player_id === "string"
        ? payload.proposer_player_id
        : null;
    const counterpartyId =
      payload && typeof payload.counterparty_player_id === "string"
        ? payload.counterparty_player_id
        : null;
    if (
      currentUserPlayer.id !== proposerId &&
      currentUserPlayer.id !== counterpartyId
    ) {
      return;
    }
    const proposal = tradeProposals.find((trade) => trade.id === tradeId);
    const offerCash =
      proposal?.offer_cash ??
      (payload && typeof payload.offer_cash === "number" ? payload.offer_cash : 0);
    const requestCash =
      proposal?.request_cash ??
      (payload && typeof payload.request_cash === "number"
        ? payload.request_cash
        : 0);
    const offerTiles =
      proposal?.offer_tile_indices ??
      (Array.isArray(payload?.offer_tile_indices)
        ? payload?.offer_tile_indices.filter((entry): entry is number =>
            typeof entry === "number",
          )
        : []);
    const requestTiles =
      proposal?.request_tile_indices ??
      (Array.isArray(payload?.request_tile_indices)
        ? payload?.request_tile_indices.filter((entry): entry is number =>
            typeof entry === "number",
          )
        : []);
    const snapshotTiles = proposal
      ? normalizeTradeSnapshot(proposal.snapshot)
      : [];
    setTradeExecutionSummary({
      tradeId,
      proposerPlayerId: proposerId ?? proposal?.proposer_player_id ?? "",
      counterpartyPlayerId:
        counterpartyId ?? proposal?.counterparty_player_id ?? "",
      offerCash,
      offerTiles,
      requestCash,
      requestTiles,
      snapshotTiles,
    });
    lastTradeEventIdRef.current = tradeEvent.id;
  }, [currentUserPlayer, events, tradeProposals]);

  useEffect(() => {
    if (!isAuctionActive && auctionDisplaySnapshot) {
      setIsAuctionResolving(true);
      const timeout = window.setTimeout(() => {
        setIsAuctionResolving(false);
      }, UI_RESOLVE_DELAY_MS);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [UI_RESOLVE_DELAY_MS, auctionDisplaySnapshot, isAuctionActive]);

  useEffect(() => {
    if (!isAuctionActive || !isCurrentAuctionBidder) {
      return;
    }
    setAuctionBidAmount((prev) => {
      const minValue = auctionBidMinimum;
      const maxValue = currentBidderCash;
      if (prev < minValue) {
        return minValue;
      }
      if (prev > maxValue) {
        return maxValue;
      }
      return prev;
    });
  }, [
    auctionBidMinimum,
    currentBidderCash,
    isAuctionActive,
    isCurrentAuctionBidder,
  ]);

  const handleBankAction = useCallback(
    async (
      request:
        | {
          action:
            | "ROLL_DICE"
            | "END_TURN"
            | "JAIL_PAY_FINE"
            | "JAIL_ROLL_FOR_DOUBLES"
            | "USE_GET_OUT_OF_JAIL_FREE"
            | "CONFIRM_PENDING_CARD"
            | "CONFIRM_MACRO_EVENT";
        }
        | {
          action: "DECLINE_PROPERTY" | "BUY_PROPERTY";
          tileIndex: number;
          financing?: "MORTGAGE";
        }
        | { action: "AUCTION_BID"; amount: number }
        | { action: "AUCTION_PASS" }
        | { action: "TAKE_COLLATERAL_LOAN"; tileIndex: number }
        | {
            action:
              | "BUILD_HOUSE"
              | "SELL_HOUSE"
              | "SELL_HOTEL"
              | "SELL_TO_MARKET"
              | "DEFAULT_PROPERTY";
            tileIndex: number;
          }
        | { action: "PAYOFF_COLLATERAL_LOAN"; loanId: string }
        | { action: "PAYOFF_PURCHASE_MORTGAGE"; mortgageId: string }
        | {
            action: "PROPOSE_TRADE";
            counterpartyPlayerId: string;
            offerCash?: number;
            offerTiles?: number[];
            requestCash?: number;
            requestTiles?: number[];
          }
        | { action: "ACCEPT_TRADE" | "REJECT_TRADE" | "CANCEL_TRADE"; tradeId: string },
      options?: {
        retryOnVersionMismatch?: boolean;
        suppressVersionMismatchNotice?: boolean;
      },
    ) => {
      const { action } = request;
      const tileIndex = "tileIndex" in request ? request.tileIndex : undefined;
      const amount = "amount" in request ? request.amount : undefined;
      const loanId = "loanId" in request ? request.loanId : undefined;
      const mortgageId =
        "mortgageId" in request ? request.mortgageId : undefined;
      const financing =
        "financing" in request ? request.financing : undefined;
      const tradeId = "tradeId" in request ? request.tradeId : undefined;
      const counterpartyPlayerId =
        "counterpartyPlayerId" in request
          ? request.counterpartyPlayerId
          : undefined;
      const offerCash = "offerCash" in request ? request.offerCash : undefined;
      const offerTiles = "offerTiles" in request ? request.offerTiles : undefined;
      const requestCash =
        "requestCash" in request ? request.requestCash : undefined;
      const requestTiles =
        "requestTiles" in request ? request.requestTiles : undefined;
      if (!session || !gameId) {
        setNotice("Join a game lobby first.");
        return false;
      }

      if (!isInProgress) {
        setNotice("Waiting for the host to start the game.");
        return false;
      }

      const snapshotVersion = gameState?.version ?? 0;
      const retryOnVersionMismatch = options?.retryOnVersionMismatch ?? false;
      const suppressVersionMismatchNotice =
        options?.suppressVersionMismatchNotice ?? false;
      const snapshotLastRoll = gameState?.last_roll ?? null;
      console.info("[Play] action request", {
        action,
        gameId,
        tileIndex: tileIndex ?? null,
        expectedVersion: snapshotVersion,
        currentVersion: gameState?.version ?? null,
        last_roll: snapshotLastRoll,
      });

      setActionLoading(action);
      setNotice(null);

      try {
        let accessToken = session.access_token;
        const logAuthState = (context: {
          action: string;
          status: number;
          responseError?: string | null;
          phase: string;
          sessionSnapshot?: SupabaseSession | null;
        }) => {
          const sessionSnapshot = context.sessionSnapshot ?? session;
          const expiresAt =
            typeof sessionSnapshot?.expires_at === "number"
              ? new Date(sessionSnapshot.expires_at * 1000).toISOString()
              : null;

          console.info("[Play][Auth] 401 response", {
            action: context.action,
            phase: context.phase,
            status: context.status,
            responseError: context.responseError ?? null,
            hasSession: Boolean(sessionSnapshot),
            hasAccessToken: Boolean(sessionSnapshot?.access_token),
            expiresAt,
          });
        };

        const performBankAction = async (
          accessToken: string,
          expectedVersionOverride?: number,
        ) => {
          const response = await fetch("/api/bank/action", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              gameId,
              action,
              tileIndex,
              amount,
              loanId,
              mortgageId,
              financing,
              tradeId,
              counterpartyPlayerId,
              offerCash,
              offerTiles,
              requestCash,
              requestTiles,
              expectedVersion:
                typeof expectedVersionOverride === "number"
                  ? expectedVersionOverride
                  : snapshotVersion,
            }),
          });

          let responseBody:
            | {
                error?: string;
                currentVersion?: number;
                gameState?: GameState;
                ownership?: OwnershipRow;
                loan?: PlayerLoan | null;
              }
            | null = null;
          try {
            responseBody = (await response.json()) as {
              error?: string;
              gameState?: GameState;
            };
          } catch {
            responseBody = null;
          }

          console.info("[Play] action response", {
            action,
            status: response.status,
            body: responseBody,
          });

          return { response, responseBody };
        };

        let { response, responseBody } = await performBankAction(accessToken);

        if (response.status === 401) {
          logAuthState({
            action,
            status: response.status,
            responseError: responseBody?.error ?? null,
            phase: "initial",
          });

          const refreshedSession = await supabaseClient.getSession();
          setSession(refreshedSession);

          if (!refreshedSession?.access_token) {
            invalidTokenRef.current = session.access_token ?? null;
            setSessionInvalid(true);
            setNotice("Invalid session. Tap to re-auth.");
            return false;
          }

          accessToken = refreshedSession.access_token;
          const retryResult = await performBankAction(
            accessToken,
          );

          if (retryResult.response.status === 401) {
            logAuthState({
              action,
              status: retryResult.response.status,
              responseError: retryResult.responseBody?.error ?? null,
              phase: "retry",
              sessionSnapshot: refreshedSession,
            });
            invalidTokenRef.current = accessToken;
            setSessionInvalid(true);
            setNotice("Invalid session. Tap to re-auth.");
            return false;
          }

          response = retryResult.response;
          responseBody = retryResult.responseBody;
          invalidTokenRef.current = null;
          setSessionInvalid(false);
          setNotice(null);
        }

        if (!response.ok) {
          if (response.status === 409) {
            const serverVersion =
              typeof responseBody?.currentVersion === "number"
                ? responseBody.currentVersion
                : null;
            if (
              retryOnVersionMismatch &&
              action === "AUCTION_PASS" &&
              typeof serverVersion === "number" &&
              Number.isInteger(serverVersion) &&
              serverVersion !== snapshotVersion
            ) {
              const retryResult = await performBankAction(accessToken, serverVersion);
              response = retryResult.response;
              responseBody = retryResult.responseBody;
            }

            if (!response.ok) {
              if (!suppressVersionMismatchNotice) {
                setNotice("Syncing…");
              }
              await loadGameData(gameId, accessToken);
              throw new Error(
                suppressVersionMismatchNotice
                  ? responseBody?.error ?? "Game updated."
                  : (responseBody?.error ?? "Game updated. Try again."),
              );
            }
          }
          if (!response.ok) {
            throw new Error(responseBody?.error ?? "Unable to perform action.");
          }
        }

        if (responseBody?.gameState) {
          setGameState(responseBody.gameState);
        }
        if (responseBody?.ownership) {
          setOwnershipByTile((prev) => {
            if (!responseBody.ownership?.owner_player_id) {
              return prev;
            }
            const tileIndex = responseBody.ownership.tile_index;
            const existing = prev[tileIndex];
            return {
              ...prev,
              [tileIndex]: {
                owner_player_id: responseBody.ownership.owner_player_id,
                collateral_loan_id:
                  responseBody.ownership.collateral_loan_id ??
                  existing?.collateral_loan_id ??
                  null,
                purchase_mortgage_id:
                  responseBody.ownership.purchase_mortgage_id ??
                  existing?.purchase_mortgage_id ??
                  null,
                houses:
                  responseBody.ownership.houses ?? existing?.houses ?? 0,
              },
            };
          });
        }
        if (responseBody?.loan) {
          setPlayerLoans((prev) => {
            const existingIndex = prev.findIndex(
              (loan) => loan.id === responseBody?.loan?.id,
            );
            if (existingIndex >= 0) {
              const next = [...prev];
              next[existingIndex] = responseBody.loan as PlayerLoan;
              return next;
            }
            return [...prev, responseBody.loan as PlayerLoan];
          });
        }

        await Promise.all([
          loadPlayers(gameId, accessToken),
          loadEvents(gameId, accessToken),
          loadOwnership(gameId, accessToken),
          loadPurchaseMortgages(gameId, accessToken, currentUserPlayer?.id),
          loadTradeProposals(gameId, accessToken),
        ]);

        if (firstRoundResyncEnabled) {
          requestFirstRoundResync(accessToken);
        }
        return true;
      } catch (error) {
        if (error instanceof Error) {
          setNotice(error.message);
        } else {
          setNotice("Unable to perform action.");
        }
        return false;
      } finally {
        setActionLoading(null);
      }
    },
    [
      firstRoundResyncEnabled,
      gameId,
      gameState,
      isInProgress,
      loadEvents,
      loadGameData,
      loadOwnership,
      loadPurchaseMortgages,
      loadPlayers,
      loadTradeProposals,
      currentUserPlayer?.id,
      requestFirstRoundResync,
      session,
    ],
  );

  const openIncomingTradeModal = useCallback(() => {
    if (!incomingTradeProposal) {
      console.info("[Play] No incoming trades to review.");
      setNotice("No incoming trades yet.");
      return;
    }
    setIsIncomingTradeOpen(true);
  }, [incomingTradeProposal]);

  const scrollToTradeConfirm = useCallback(() => {
    tradeConfirmSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, []);

  const openProposeTradeModal = useCallback(() => {
    if (!currentUserPlayer) {
      setNotice("Join a game lobby first.");
      return;
    }
    const availableCounterparties = players.filter(
      (player) => player.id !== currentUserPlayer.id && !player.is_eliminated,
    );
    if (availableCounterparties.length === 0) {
      setNotice("No other players are available to trade.");
      return;
    }
    if (ownedProperties.length === 0 && myPlayerBalance <= 0) {
      setNotice("You don't have any assets to offer yet.");
    }
    const defaultCounterparty = availableCounterparties[0]?.id ?? "";
    setTradeCounterpartyId(defaultCounterparty);
    setTradeOfferCash(0);
    setTradeOfferTiles([]);
    setTradeRequestCash(0);
    setTradeRequestTiles([]);
    setIsProposeTradeOpen(true);
  }, [currentUserPlayer, myPlayerBalance, ownedProperties.length, players]);

  const handleSubmitTradeProposal = useCallback(async () => {
    if (!tradeCounterpartyId) {
      setNotice("Select a player to trade with.");
      return;
    }
    // Trade contract: offer_* is what the proposer gives; request_* is what they receive.
    const offerCash = tradeOfferCash;
    const requestCash = tradeRequestCash;
    const hasTradeValue =
      offerCash > 0 ||
      tradeOfferTiles.length > 0 ||
      requestCash > 0 ||
      tradeRequestTiles.length > 0;
    if (!hasTradeValue) {
      setNotice("Add cash or properties to the trade.");
      return;
    }
    const success = await handleBankAction({
      action: "PROPOSE_TRADE",
      counterpartyPlayerId: tradeCounterpartyId,
      offerCash: offerCash > 0 ? offerCash : undefined,
      offerTiles: tradeOfferTiles.length > 0 ? tradeOfferTiles : undefined,
      requestCash: requestCash > 0 ? requestCash : undefined,
      requestTiles: tradeRequestTiles.length > 0 ? tradeRequestTiles : undefined,
    });
    if (success) {
      setNotice("Trade sent.");
      setIsProposeTradeOpen(false);
    }
  }, [
    handleBankAction,
    tradeCounterpartyId,
    tradeOfferCash,
    tradeOfferTiles,
    tradeRequestCash,
    tradeRequestTiles,
  ]);

  const handleDeclineProperty = useCallback(() => {
    if (!pendingPurchase) {
      return;
    }

    void handleBankAction({
      action: "DECLINE_PROPERTY",
      tileIndex: pendingPurchase.tile_index,
    });
  }, [handleBankAction, pendingPurchase]);

  const handleBuyProperty = useCallback(() => {
    if (!pendingPurchase) {
      return;
    }

    void handleBankAction({
      action: "BUY_PROPERTY",
      tileIndex: pendingPurchase.tile_index,
    });
  }, [handleBankAction, pendingPurchase]);

  const handleBuyPropertyWithMortgage = useCallback(() => {
    if (!pendingPurchase) {
      return;
    }

    void handleBankAction({
      action: "BUY_PROPERTY",
      tileIndex: pendingPurchase.tile_index,
      financing: "MORTGAGE",
    });
  }, [handleBankAction, pendingPurchase]);

  const handleAcceptTrade = useCallback(
    (tradeId: string) => {
      void handleBankAction({ action: "ACCEPT_TRADE", tradeId });
    },
    [handleBankAction],
  );

  const handleRejectTrade = useCallback(
    (tradeId: string) => {
      void handleBankAction({ action: "REJECT_TRADE", tradeId });
    },
    [handleBankAction],
  );

  const handleConfirmPendingCard = useCallback(() => {
    if (!canConfirmPendingCard) {
      return;
    }
    setIsCardResolving(true);
    window.setTimeout(() => {
      setIsCardResolving(false);
    }, UI_RESOLVE_DELAY_MS);
    void handleBankAction({ action: "CONFIRM_PENDING_CARD" });
  }, [UI_RESOLVE_DELAY_MS, canConfirmPendingCard, handleBankAction]);

  const handleConfirmMacroEvent = useCallback(() => {
    if (!canConfirmMacroEvent) {
      return;
    }
    setIsMacroResolving(true);
    window.setTimeout(() => {
      setIsMacroResolving(false);
    }, UI_RESOLVE_DELAY_MS);
    void handleBankAction({ action: "CONFIRM_MACRO_EVENT" });
  }, [UI_RESOLVE_DELAY_MS, canConfirmMacroEvent, handleBankAction]);

  const handleAcknowledgeGoToJail = useCallback(() => {
    if (!pendingGoToJail || isGoToJailAcknowledging) {
      return;
    }
    setIsGoToJailAcknowledging(true);
    lastGoToJailAckVersionRef.current = pendingGoToJail.eventVersion;
    setPendingGoToJail(null);
  }, [isGoToJailAcknowledging, pendingGoToJail]);

  const handleAuctionBid = useCallback(() => {
    if (!isCurrentAuctionBidder) {
      return;
    }
    void handleBankAction({
      action: "AUCTION_BID",
      amount: auctionBidAmount,
    });
  }, [auctionBidAmount, handleBankAction, isCurrentAuctionBidder]);

  const handleAuctionPass = useCallback(() => {
    if (!isCurrentAuctionBidder) {
      return;
    }
    void handleBankAction(
      { action: "AUCTION_PASS" },
      { retryOnVersionMismatch: true },
    );
  }, [handleBankAction, isCurrentAuctionBidder]);

  useEffect(() => {
    if (!isAuctionActive || !isCurrentAuctionBidder || !auctionTurnEndsAt) {
      autoPassAttemptedTurnRef.current = null;
      return;
    }
    if (auctionRemainingSeconds !== 0) {
      return;
    }
    const turnKey = `${auctionTileIndex ?? "none"}:${auctionTurnPlayerId ?? "none"}:${auctionTurnEndsAt}`;
    if (autoPassAttemptedTurnRef.current === turnKey) {
      return;
    }
    autoPassAttemptedTurnRef.current = turnKey;
    void handleBankAction(
      { action: "AUCTION_PASS" },
      {
        retryOnVersionMismatch: true,
        suppressVersionMismatchNotice: true,
      },
    );
  }, [
    auctionRemainingSeconds,
    auctionTileIndex,
    auctionTurnEndsAt,
    auctionTurnPlayerId,
    handleBankAction,
    isAuctionActive,
    isCurrentAuctionBidder,
  ]);

  const handlePayJailFine = useCallback(() => {
    void handleBankAction({ action: "JAIL_PAY_FINE" });
  }, [handleBankAction]);

  const handleRollForDoubles = useCallback(() => {
    void handleBankAction({ action: "JAIL_ROLL_FOR_DOUBLES" });
  }, [handleBankAction]);

  const handleUseGetOutOfJailFree = useCallback(() => {
    void handleBankAction({ action: "USE_GET_OUT_OF_JAIL_FREE" });
  }, [handleBankAction]);

  const handleLeaveTable = useCallback(() => {
    clearResumeStorage();
    setGameId(null);
    setGameMeta(null);
    setGameMetaError(null);
    setPlayers([]);
    setGameState(null);
    setEvents([]);
    setOwnershipByTile({});
    setNotice(null);
    router.push("/");
  }, [clearResumeStorage, router]);

  const handleSignInAgain = useCallback(() => {
    clearResumeStorage();
    router.push("/");
  }, [clearResumeStorage, router]);

  const handleEndSession = useCallback(async () => {
    if (!session || !gameId) {
      setNotice("Join a game lobby first.");
      return;
    }

    setActionLoading("END_GAME");
    setNotice(null);

    try {
      const response = await fetch("/api/bank/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          gameId,
          action: "END_GAME",
          expectedVersion: gameState?.version ?? 0,
        }),
      });

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        if (response.status === 409) {
          await loadGameData(gameId, session.access_token);
          throw new Error(error.error ?? "Game updated. Try again.");
        }
        throw new Error(error.error ?? "Unable to end the session.");
      }

      clearResumeStorage();
      setGameId(null);
      setGameMeta(null);
      setGameMetaError(null);
      setPlayers([]);
      setGameState(null);
      setEvents([]);
      setOwnershipByTile({});
      router.push("/");
    } catch (error) {
      if (error instanceof Error) {
        setNotice(error.message);
      } else {
        setNotice("Unable to end the session.");
      }
    } finally {
      setActionLoading(null);
    }
  }, [
    clearResumeStorage,
    gameId,
    gameState?.version,
    loadGameData,
    router,
    session,
  ]);

  if (!isConfigured) {
    return (
      <PageShell title="Player Console">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to see
          live game updates.
        </div>
      </PageShell>
    );
  }

  if (needsAuth) {
    return (
      <PageShell title="Player Console">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Please sign in again to load this game.</p>
          <button
            className="mt-3 rounded-full bg-amber-900 px-4 py-2 text-xs font-semibold text-white"
            type="button"
            onClick={handleSignInAgain}
          >
            Please sign in again
          </button>
        </div>
      </PageShell>
    );
  }

  if (!gameId) {
    return (
      <PageShell title="Player Console">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-600">
          <p className="font-semibold text-neutral-900">No active game.</p>
          <p className="mt-2 text-sm text-neutral-500">
            Head back to the lobby to join or start a new session.
          </p>
          <button
            className="mt-4 rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white"
            type="button"
            onClick={() => router.push("/")}
          >
            Back to home
          </button>
        </div>
      </PageShell>
    );
  }

  if (gameMetaError) {
    return (
      <PageShell title="Player Console">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {gameMetaError}
        </div>
      </PageShell>
    );
  }

  if (shouldShowIntro) {
    return (
      <PageShell title="Player Console">
        <div className="fixed inset-0 z-40 overflow-hidden text-white">
          <div className="absolute inset-0">
            <Image
              src="/icons/loading_screen.svg"
              alt="Game boot background"
              fill
              sizes="100vw"
              className="object-cover object-center transition-[filter,opacity] duration-700 ease-out"
              style={{
                filter: introMinElapsed
                  ? "saturate(1.02) contrast(1) brightness(1)"
                  : "saturate(0.7) contrast(0.92) brightness(0.88)",
                opacity: introMinElapsed ? 1 : 0.95,
              }}
            />
            <div
              className="absolute inset-0 bg-neutral-900/35 transition-opacity duration-700 ease-out"
              style={{ opacity: introMinElapsed ? 0.15 : 0.45 }}
            />
          </div>
          <div className="relative flex h-full flex-col items-center justify-end gap-6 px-6 py-12 text-center">
            <div className="flex w-full max-w-md flex-col items-center gap-4">
              <div
                className={`h-2 w-full overflow-hidden rounded-full bg-white/20 transition-opacity duration-500 ${
                  introMinElapsed ? "opacity-60" : "opacity-100"
                }`}
              >
                <div
                  className="h-full rounded-full bg-emerald-300 transition-[width] duration-100 ease-linear"
                  style={{ width: `${introProgress}%` }}
                />
              </div>
              <p className="text-xs text-white/75">
                {introMinElapsed ? "Ready when you are." : "Loading intro…"}
              </p>
              {introMinElapsed ? (
                <button
                  className="rounded-full bg-white/90 px-6 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 disabled:cursor-not-allowed disabled:bg-white/50 disabled:text-neutral-500"
                  type="button"
                  disabled={!isGameReady}
                  onClick={() => {
                    if (!isGameReady) {
                      return;
                    }
                    setIntroDismissed(true);
                  }}
                >
                  Start
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Player Console"
      headerActions={
        <div className="flex items-center gap-3 text-[11px] font-medium">
          {isHost ? (
            <button
              className="text-rose-500/80 transition hover:text-rose-600"
              type="button"
              onClick={handleEndSession}
              disabled={actionLoading === "END_GAME"}
            >
              {actionLoading === "END_GAME" ? "Ending…" : "End session"}
            </button>
          ) : null}
          <button
            className="text-neutral-400 transition hover:text-neutral-700"
            type="button"
            onClick={handleLeaveTable}
          >
            Leave table
          </button>
        </div>
      }
    >
      {notice ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          {notice}
        </div>
      ) : null}

      {isPandemicSkipPending ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          Pandemic: your next roll is skipped.
        </div>
      ) : null}

      {miniBoardCollapsed ? (
        <section className="rounded-2xl bg-white/90 p-3 shadow-[0_12px_30px_rgba(15,23,42,0.08)] ring-1 ring-black/5">
          <button
            className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-800"
            type="button"
            onClick={() => setMiniBoardCollapsed(false)}
          >
            Show mini-board
          </button>
        </section>
      ) : (
        <section className="rounded-2xl bg-white/90 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] ring-1 ring-black/5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                MINI-BOARD
              </p>
              <p className="text-xs text-neutral-400">
                Board pack: {boardPack?.displayName ?? "Unknown"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-800"
                type="button"
                onClick={() => setMiniBoardCollapsed(true)}
              >
                Hide
              </button>
              <button
                className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-800 disabled:cursor-not-allowed disabled:border-neutral-100 disabled:text-neutral-300"
                type="button"
                onClick={() => setIsBoardExpanded(true)}
                disabled={isDecisionOverlayActive}
                title={
                  isDecisionOverlayActive
                    ? "Resolve the current decision to open the full board."
                    : "Open the full board view"
                }
              >
                Expand board
              </button>
            </div>
          </div>
          <div className="overflow-x-auto transition-opacity duration-200">
            <div className="min-w-[320px]">
              <BoardMiniMap
                tiles={boardPack?.tiles}
                players={players}
                currentPlayerId={currentPlayer?.id}
                ownershipByTile={ownershipByTile}
                showOwnership
                size="compact"
                selectedTileIndex={selectedTileIndex}
                onTileClick={(tileIndex) => {
                  setSelectedTileIndex(tileIndex);
                }}
              />
            </div>
          </div>
          {players.length > 0 ? (
            <p className="text-xs text-neutral-500">
              Turn order:{" "}
              {players.map((player, index) => (
                <span
                  key={player.id}
                  className={
                    player.id === currentPlayer?.id
                      ? "font-semibold text-neutral-900"
                      : "text-neutral-500"
                  }
                >
                  {player.display_name ?? "Player"}
                  {index < players.length - 1 ? " · " : ""}
                </span>
              ))}
            </p>
          ) : null}
        </section>
      )}

      {!isBoardExpanded && selectedTileIndex !== null && selectedExpandedTile ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 px-4 pb-6 sm:items-center sm:pb-0"
          onClick={() => setSelectedTileIndex(null)}
        >
          <TileDetailsPanel
            selectedTileIndex={selectedTileIndex}
            selectedTile={selectedExpandedTile}
            selectedTileTypeLabel={selectedTileTypeLabel}
            selectedTileOwnerLabel={selectedTileOwnerLabel}
            selectedTilePlayers={selectedTilePlayers}
            currentUserPlayer={currentUserPlayer}
            selectedOwnerRailCount={selectedOwnerRailCount}
            selectedOwnerUtilityCount={selectedOwnerUtilityCount}
            selectedTileDevelopment={selectedTileDevelopment}
            boardPackEconomy={boardPackEconomy}
            onClose={() => setSelectedTileIndex(null)}
          />
        </div>
      ) : null}

      <section className="space-y-4">
        <div className="relative">
          <div
            className={`rounded-2xl bg-white/95 p-5 space-y-4 ring-1 transition ${
              isMyTurn
                ? "ring-emerald-200/80 shadow-[0_16px_36px_rgba(16,185,129,0.18)]"
                : "ring-black/5 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
            } ${isAuctionActive ? "pointer-events-none opacity-50" : ""}`}
          >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Current turn
                </p>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  {turnPhaseLabel}
                </span>
              </div>
              <p className="text-2xl font-semibold text-neutral-900">
                {hasGameMetaError
                  ? "Game not visible"
                  : isInProgress
                    ? currentPlayer?.display_name ?? "Waiting for start"
                    : "Waiting for start"}
              </p>
              <p className="text-sm text-neutral-500">
                Last roll:{" "}
                {hasGameMetaError
                  ? "—"
                  : isInProgress
                    ? gameState?.last_roll ?? "—"
                    : "—"}
              </p>
              {latestDiceDisplay ? (
                <div className="mt-2 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
                    <span className="font-semibold text-neutral-900">
                      {latestDiceDisplay}
                    </span>
                    {latestIsDouble ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase text-amber-800">
                        DOUBLE!
                      </span>
                    ) : null}
                  </div>
                  {latestDoubleStreak !== null ? (
                    <p className="text-xs text-neutral-500">
                      Double streak: {latestDoubleStreak}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-neutral-400">
                Turn status
              </p>
              <p className="text-sm font-semibold text-neutral-700">
                {hasGameMetaError
                  ? "Check access"
                  : isInProgress
                    ? isMyTurn
                      ? "Your turn"
                      : "Stand by"
                    : "Waiting"}
              </p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                {realtimeStatusLabel}
              </p>
            </div>
          </div>
          {showJailDecisionPanel ? (
            <>
              <div className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
              <div className="relative z-30 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 shadow-2xl ring-1 ring-black/10">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                  Jail decision
                </p>
                <p className="mt-1 text-base font-semibold text-rose-900">
                  You are in jail.
                </p>
                <p className="text-sm text-rose-800">
                  Turns remaining: {currentUserPlayer?.jail_turns_remaining ?? 0}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <button
                      className="rounded-2xl bg-rose-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-rose-300"
                      type="button"
                      onClick={handlePayJailFine}
                      disabled={actionLoading === "JAIL_PAY_FINE"}
                    >
                      {actionLoading === "JAIL_PAY_FINE"
                        ? "Paying…"
                        : `Pay ${formatMoney(boardPackEconomy.jailFineAmount ?? 50, currencySymbol)} fine`}
                    </button>
                    {jailPayDisabledReason ? (
                      <p className="text-xs text-neutral-400">
                        {jailPayDisabledReason}
                      </p>
                    ) : null}
                  </div>
                  {hasGetOutOfJailFree ? (
                    <button
                      className="rounded-2xl border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-900 disabled:cursor-not-allowed disabled:border-rose-200 disabled:text-rose-400"
                      type="button"
                      onClick={handleUseGetOutOfJailFree}
                      disabled={actionLoading === "USE_GET_OUT_OF_JAIL_FREE"}
                    >
                      {actionLoading === "USE_GET_OUT_OF_JAIL_FREE"
                        ? "Using…"
                        : "Use Get Out of Jail Free"}
                    </button>
                  ) : null}
                  <button
                    className="rounded-2xl border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-900 disabled:cursor-not-allowed disabled:border-rose-200 disabled:text-rose-400"
                    type="button"
                    onClick={handleRollForDoubles}
                    disabled={
                      !canRollForDoubles ||
                      actionLoading === "JAIL_ROLL_FOR_DOUBLES"
                    }
                  >
                    {actionLoading === "JAIL_ROLL_FOR_DOUBLES"
                      ? "Rolling…"
                      : "Roll for doubles"}
                  </button>
                </div>
              </div>
            </>
          ) : null}
          {pendingGoToJail ? (
            <>
              <div className="fixed inset-0 z-20 bg-black/50 backdrop-blur-[2px]" />
              <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="go-to-jail-title"
                  className="w-full max-w-sm rounded-3xl border border-neutral-200 bg-white p-6 text-center shadow-2xl ring-1 ring-black/10"
                >
                  <div className="flex flex-col items-center gap-4">
                    <Image
                      src="/icons/go_to_jail.svg"
                      alt=""
                      width={140}
                      height={140}
                      className="h-32 w-32 object-contain"
                      aria-hidden
                    />
                    <p
                      id="go-to-jail-title"
                      className="text-2xl font-black tracking-wide text-neutral-900"
                    >
                      GO TO JAIL
                    </p>
                    <button
                      ref={goToJailOkButtonRef}
                      className="w-full rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                      type="button"
                      onClick={handleAcknowledgeGoToJail}
                      disabled={isGoToJailAcknowledging}
                    >
                      {isGoToJailAcknowledging ? "Acknowledging…" : "OK"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
          {showPendingDecisionCard && pendingPurchase ? (
            <TitleDeedPreview
              tile={pendingTile}
              bandColor={pendingBandColor}
              boardPackEconomy={boardPackEconomy}
              eyebrow="Pending decision"
              price={pendingPurchase.price}
              ownedRailCount={pendingOwnerRailCount}
              ownedUtilityCount={pendingOwnerUtilityCount}
              currencySymbol={currencySymbol}
              footer={
                <>
                  <div className="grid gap-2">
                    <button
                      className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                      type="button"
                      onClick={handleBuyProperty}
                      disabled={
                        actionLoading === "BUY_PROPERTY" || !canAffordPendingPurchase
                      }
                      title={
                        canAffordPendingPurchase
                          ? "Buy this property"
                          : "Not enough cash to buy"
                      }
                    >
                      {actionLoading === "BUY_PROPERTY" ? "Buying…" : "Buy"}
                    </button>
                    <button
                      className="rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-400"
                      type="button"
                      onClick={handleBuyPropertyWithMortgage}
                      disabled={
                        actionLoading === "BUY_PROPERTY" || !canAffordPendingMortgage
                      }
                      title={
                        canAffordPendingMortgage
                          ? "Buy with a 50% down payment"
                          : "Not enough cash for down payment"
                      }
                    >
                      {actionLoading === "BUY_PROPERTY"
                        ? "Buying…"
                        : `Buy with Mortgage (${formatMoney(pendingMortgageDownPayment, currencySymbol)} down)`}
                    </button>
                    <button
                      className="rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-400"
                      type="button"
                      onClick={handleDeclineProperty}
                      disabled={actionLoading === "DECLINE_PROPERTY"}
                      title="Start auction for this property"
                    >
                      {actionLoading === "DECLINE_PROPERTY"
                        ? "Auctioning…"
                        : "Auction"}
                    </button>
                  </div>
                  {buyDisabledReason ? (
                    <p className="mt-2 text-xs text-neutral-400">
                      {buyDisabledReason}
                    </p>
                  ) : null}
                  {!buyDisabledReason && mortgageBuyDisabledReason ? (
                    <p className="mt-2 text-xs text-neutral-400">
                      {mortgageBuyDisabledReason}
                    </p>
                  ) : null}
                  {!canAffordPendingPurchase ? (
                    <p className="mt-2 text-[11px] text-neutral-500">
                      You need {formatMoney(pendingPurchase.price - myPlayerBalance, currencySymbol)} more to
                      buy this property.
                    </p>
                  ) : null}
                </>
              }
            />
          ) : null}
          {showPendingDecisionBanner ? (
            <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-sm text-amber-900">
              Waiting for {currentPlayer?.display_name ?? "the current player"} to
              decide on {pendingTileLabel ?? "this tile"}…
            </div>
          ) : null}
          {!initialSnapshotReady ? (
            <p className="text-xs text-neutral-400">Loading snapshot…</p>
          ) : null}
        </div>
        {pendingMacroEvent || isMacroResolving ? (
          <>
            <div className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
            <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
              <div className="w-full max-w-md rounded-3xl border border-sky-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-500">
                  Macro event
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold text-neutral-900">
                    {pendingMacroEvent?.name ?? "Macroeconomic Shift"}
                    {((pendingMacroEvent?.tooltip && pendingMacroEvent.tooltip.length > 0) ||
                      (pendingMacroEvent?.macroCardId && macroTooltipById.get(pendingMacroEvent.macroCardId))) ? (
                      <InfoTooltip
                        text={
                          pendingMacroEvent?.tooltip && pendingMacroEvent.tooltip.length > 0
                            ? pendingMacroEvent.tooltip
                            : macroTooltipById.get(pendingMacroEvent?.macroCardId ?? "") ?? ""
                        }
                        className="ml-2"
                      />
                    ) : null}
                  </p>
                  {pendingMacroRarityLabel ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${pendingMacroRarityClass}`}
                    >
                      {pendingMacroRarityLabel}
                    </span>
                  ) : null}
                </div>
                {pendingMacroEvent?.headline ? (
                  <p className="mt-2 text-sm font-semibold text-neutral-800">
                    {pendingMacroEvent.headline}
                  </p>
                ) : null}
                {pendingMacroEvent?.flavor ? (
                  <p className="mt-1 text-sm text-neutral-600">
                    {pendingMacroEvent.flavor}
                  </p>
                ) : null}
                {pendingMacroEvent?.rulesText ? (
                  <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-sm font-semibold text-sky-900">
                    {pendingMacroEvent.rulesText}
                  </div>
                ) : null}
                {pendingMacroEvent && pendingMacroEvent.durationRounds > 0 ? (
                  <p className="mt-3 text-sm text-neutral-600">
                    Lasts {pendingMacroEvent.durationRounds} rounds
                  </p>
                ) : null}
                {canConfirmMacroEvent && !isMacroResolving ? (
                  <div className="mt-4 space-y-1">
                    <button
                      className="w-full rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-sky-200"
                      type="button"
                      onClick={handleConfirmMacroEvent}
                      disabled={
                        actionLoading === "CONFIRM_MACRO_EVENT" || isMacroResolving
                      }
                    >
                      {actionLoading === "CONFIRM_MACRO_EVENT"
                        ? "Confirming…"
                        : isMacroResolving
                          ? "Resolving…"
                          : "OK"}
                    </button>
                    {confirmMacroDisabledReason ? (
                      <p className="text-xs text-neutral-400">
                        {confirmMacroDisabledReason}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-neutral-500">
                    {isMacroResolving
                      ? "Resolving…"
                      : `Waiting for ${
                          currentPlayer?.display_name ?? "the current player"
                        } to acknowledge…`}
                  </p>
                )}
              </div>
            </div>
          </>
        ) : null}
        {pendingCard || isCardResolving ? (
          <>
            <div className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
            <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
              <div className="w-full max-w-md rounded-3xl border border-emerald-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500">
                  {pendingCard ? "Card revealed" : "Resolving card"}
                </p>
                <p className="text-lg font-semibold text-neutral-900">
                  {pendingCard ? pendingDeckLabel : cardDisplaySnapshot?.deckLabel}
                </p>
                <p className="mt-2 text-base font-semibold text-neutral-900">
                  {pendingCard?.title ?? cardDisplaySnapshot?.title}
                </p>
                {pendingCardDescription || cardDisplaySnapshot?.description ? (
                  <p className="mt-1 text-sm text-neutral-600">
                    {pendingCardDescription ?? cardDisplaySnapshot?.description}
                  </p>
                ) : null}
                {canConfirmPendingCard && !isCardResolving ? (
                  <div className="mt-4 space-y-1">
                    <button
                      className="w-full rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-emerald-200"
                      type="button"
                      onClick={handleConfirmPendingCard}
                      disabled={
                        actionLoading === "CONFIRM_PENDING_CARD" || isCardResolving
                      }
                    >
                      {actionLoading === "CONFIRM_PENDING_CARD"
                        ? "Confirming…"
                        : isCardResolving
                          ? "Resolving…"
                        : "OK"}
                    </button>
                    {confirmCardDisabledReason ? (
                      <p className="text-xs text-neutral-400">
                        {confirmCardDisabledReason}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-neutral-500">
                    {isCardResolving
                      ? "Resolving…"
                      : `Waiting for ${
                          pendingCardActorName ??
                          cardDisplaySnapshot?.actorName ??
                          "the current player"
                        } to confirm…`}
                  </p>
                )}
              </div>
            </div>
          </>
        ) : null}
        {isProposeTradeOpen ? (
          <>
            <div className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
            <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
              <div className="w-full max-w-2xl rounded-3xl border border-indigo-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                      Propose trade
                    </p>
                    <p className="text-lg font-semibold text-neutral-900">
                      Craft a trade offer
                    </p>
                  </div>
                  <button
                    className="rounded-full border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-700"
                    type="button"
                    onClick={() => setIsProposeTradeOpen(false)}
                    aria-label="Close trade proposal"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Counterparty
                    </label>
                    <select
                      className="w-full rounded-2xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700"
                      value={tradeCounterpartyId}
                      onChange={(event) =>
                        setTradeCounterpartyId(event.target.value)
                      }
                    >
                      {availableTradeCounterparties.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.display_name ?? "Player"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Offer
                      </p>
                      <label className="text-xs text-neutral-500">
                        Cash
                        <input
                          className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700"
                          type="number"
                          min={0}
                          max={myPlayerBalance}
                          value={tradeOfferCash}
                          onChange={(event) =>
                            setTradeOfferCash(
                              Math.max(0, Number(event.target.value)),
                            )
                          }
                        />
                      </label>
                      <div className="space-y-1">
                        <p className="text-xs text-neutral-500">Properties</p>
                        {ownedProperties.length === 0 ? (
                          <p className="text-xs text-neutral-400">
                            No owned properties to offer.
                          </p>
                        ) : (
                          <div className="max-h-40 space-y-2 overflow-y-auto pr-2 text-sm text-neutral-700">
                            {ownedProperties.map(({ tile, houses }) => (
                              <label
                                key={`offer-${tile.index}`}
                                className="flex items-center gap-2"
                              >
                                <input
                                  type="checkbox"
                                  checked={tradeOfferTiles.includes(tile.index)}
                                  onChange={(event) => {
                                    setTradeOfferTiles((prev) =>
                                      event.target.checked
                                        ? [...prev, tile.index]
                                        : prev.filter(
                                            (entry) => entry !== tile.index,
                                          ),
                                    );
                                  }}
                                />
                                <span>
                                  {tile.name}
                                  {houses > 0
                                    ? ` · ${houses} ${
                                        houses === 1 ? "house" : "houses"
                                      }`
                                    : ""}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Request
                      </p>
                      <label className="text-xs text-neutral-500">
                        Cash
                        <input
                          className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700"
                          type="number"
                          min={0}
                          value={tradeRequestCash}
                          onChange={(event) =>
                            setTradeRequestCash(
                              Math.max(0, Number(event.target.value)),
                            )
                          }
                        />
                      </label>
                      <div className="space-y-1">
                        <p className="text-xs text-neutral-500">Properties</p>
                        {tradeCounterpartyId ? (
                          counterpartyOwnedProperties.length === 0 ? (
                            <p className="text-xs text-neutral-400">
                              No properties owned by the selected player.
                            </p>
                          ) : (
                            <div className="max-h-40 space-y-2 overflow-y-auto pr-2 text-sm text-neutral-700">
                              {counterpartyOwnedProperties.map(
                                ({ tile, houses }) => (
                                  <label
                                    key={`request-${tile.index}`}
                                    className="flex items-center gap-2"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={tradeRequestTiles.includes(
                                        tile.index,
                                      )}
                                      onChange={(event) => {
                                        setTradeRequestTiles((prev) =>
                                          event.target.checked
                                            ? [...prev, tile.index]
                                            : prev.filter(
                                                (entry) =>
                                                  entry !== tile.index,
                                              ),
                                        );
                                      }}
                                    />
                                    <span>
                                      {tile.name}
                                      {houses > 0
                                        ? ` · ${houses} ${
                                            houses === 1 ? "house" : "houses"
                                          }`
                                        : ""}
                                    </span>
                                  </label>
                                ),
                              )}
                            </div>
                          )
                        ) : (
                          <p className="text-xs text-neutral-400">
                            Select a player to see their properties.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-neutral-400">
                      Trades are sent to the bank for review before delivery.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded-2xl border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
                        type="button"
                        onClick={() => setIsProposeTradeOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        className="rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-indigo-200"
                        type="button"
                        onClick={handleSubmitTradeProposal}
                        disabled={
                          actionLoading === "PROPOSE_TRADE" ||
                          !canSubmitTradeProposal
                        }
                      >
                        {actionLoading === "PROPOSE_TRADE"
                          ? "Sending…"
                          : "Send trade"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
        {incomingTradeProposal && isIncomingTradeOpen ? (
          <>
            <div className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
            <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
              <div className="w-full max-w-lg rounded-3xl border border-indigo-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                      Incoming trade offer
                    </p>
                    <p className="text-lg font-semibold text-neutral-900">
                      {incomingTradeCounterpartyName} wants to trade
                    </p>
                  </div>
                  <button
                    className="rounded-full border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-700"
                    type="button"
                    onClick={() => setIsIncomingTradeOpen(false)}
                    aria-label="Close incoming trade"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                      You give
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                      {incomingTradeRequestCash > 0 ? (
                        <li>Cash: {formatMoney(incomingTradeRequestCash, currencySymbol)}</li>
                      ) : null}
                      {incomingTradeRequestTiles.length > 0 ? (
                        incomingTradeRequestTiles.map((tileIndex) => {
                          const snapshot = incomingTradeSnapshotTiles.find(
                            (entry) => entry.tile_index === tileIndex,
                          );
                          const houses = snapshot?.houses ?? 0;
                          return (
                            <li key={`give-${tileIndex}`}>
                              {getTileNameByIndex(tileIndex)}
                              {houses > 0
                                ? ` · ${houses} ${houses === 1 ? "house" : "houses"}`
                                : ""}
                            </li>
                          );
                        })
                      ) : incomingTradeRequestCash === 0 ? (
                        <li className="text-neutral-400">No properties</li>
                      ) : null}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                      You receive
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                      {incomingTradeOfferCash > 0 ? (
                        <li>Cash: {formatMoney(incomingTradeOfferCash, currencySymbol)}</li>
                      ) : null}
                      {incomingTradeOfferTiles.length > 0 ? (
                        incomingTradeOfferTiles.map((tileIndex) => {
                          const snapshot = incomingTradeSnapshotTiles.find(
                            (entry) => entry.tile_index === tileIndex,
                          );
                          const houses = snapshot?.houses ?? 0;
                          return (
                            <li key={`receive-${tileIndex}`}>
                              {getTileNameByIndex(tileIndex)}
                              {houses > 0
                                ? ` · ${houses} ${houses === 1 ? "house" : "houses"}`
                                : ""}
                            </li>
                          );
                        })
                      ) : incomingTradeOfferCash === 0 ? (
                        <li className="text-neutral-400">No properties</li>
                      ) : null}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                      Liabilities assumed
                    </p>
                    {incomingTradeLiabilities.some(
                      (entry) =>
                        entry.collateralPayment !== null ||
                        entry.mortgageInterest !== null,
                    ) ? (
                      <ul className="mt-2 space-y-2 text-sm text-neutral-700">
                        {incomingTradeLiabilities.map((entry) => {
                          const details = [];
                          if (entry.collateralPayment !== null) {
                            details.push(
                              `Collateral: ${formatMoney(entry.collateralPayment, currencySymbol)}/turn`,
                            );
                          }
                          if (entry.mortgageInterest !== null) {
                            details.push(
                              `Mortgage interest: ${formatMoney(entry.mortgageInterest, currencySymbol)}/turn`,
                            );
                          }
                          if (details.length === 0) {
                            return null;
                          }
                          return (
                            <li
                              key={`liability-${entry.tileIndex}`}
                              className="rounded-xl bg-white px-3 py-2"
                            >
                              <p className="text-xs font-semibold text-neutral-500">
                                {getTileNameByIndex(entry.tileIndex)}
                              </p>
                              <p className="text-sm text-neutral-800">
                                {details.join(" · ")}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-neutral-500">
                        No liabilities on incoming properties.
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    className="rounded-2xl border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:border-neutral-100 disabled:text-neutral-400"
                    type="button"
                    onClick={() => {
                      setIsIncomingTradeOpen(false);
                      handleRejectTrade(incomingTradeProposal.id);
                    }}
                    disabled={actionLoading === "REJECT_TRADE"}
                  >
                    {actionLoading === "REJECT_TRADE" ? "Rejecting…" : "Reject"}
                  </button>
                  <button
                    className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                    type="button"
                    onClick={() => {
                      setIsIncomingTradeOpen(false);
                      handleAcceptTrade(incomingTradeProposal.id);
                    }}
                    disabled={actionLoading === "ACCEPT_TRADE"}
                  >
                    {actionLoading === "ACCEPT_TRADE" ? "Accepting…" : "Accept"}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : null}
        {tradeExecutionSummary && tradeExecutionPerspective ? (
          <>
            <div className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
            <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
              <div className="w-full max-w-lg rounded-3xl border border-emerald-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500">
                  Trade executed
                </p>
                <p className="text-lg font-semibold text-neutral-900">
                  Trade completed with {tradeExecutionPerspective.counterpartyName}
                </p>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                      You gave
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                      {tradeExecutionPerspective.giveCash > 0 ? (
                        <li>Cash: {formatMoney(tradeExecutionPerspective.giveCash, currencySymbol)}</li>
                      ) : null}
                      {tradeExecutionPerspective.giveTiles.length > 0 ? (
                        tradeExecutionPerspective.giveTiles.map((tileIndex) => {
                          const snapshot =
                            tradeExecutionPerspective.snapshotTiles.find(
                              (entry) => entry.tile_index === tileIndex,
                            );
                          const houses = snapshot?.houses ?? 0;
                          return (
                            <li key={`gave-${tileIndex}`}>
                              {getTileNameByIndex(tileIndex)}
                              {houses > 0
                                ? ` · ${houses} ${houses === 1 ? "house" : "houses"}`
                                : ""}
                            </li>
                          );
                        })
                      ) : tradeExecutionPerspective.giveCash === 0 ? (
                        <li className="text-neutral-400">Nothing</li>
                      ) : null}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                      You received
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                      {tradeExecutionPerspective.receiveCash > 0 ? (
                        <li>Cash: {formatMoney(tradeExecutionPerspective.receiveCash, currencySymbol)}</li>
                      ) : null}
                      {tradeExecutionPerspective.receiveTiles.length > 0 ? (
                        tradeExecutionPerspective.receiveTiles.map((tileIndex) => {
                          const snapshot =
                            tradeExecutionPerspective.snapshotTiles.find(
                              (entry) => entry.tile_index === tileIndex,
                            );
                          const houses = snapshot?.houses ?? 0;
                          return (
                            <li key={`received-${tileIndex}`}>
                              {getTileNameByIndex(tileIndex)}
                              {houses > 0
                                ? ` · ${houses} ${houses === 1 ? "house" : "houses"}`
                                : ""}
                            </li>
                          );
                        })
                      ) : tradeExecutionPerspective.receiveCash === 0 ? (
                        <li className="text-neutral-400">Nothing</li>
                      ) : null}
                    </ul>
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    className="w-full rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                    type="button"
                    onClick={() => setTradeExecutionSummary(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : null}
        {propertyActionModal ? (
          <>
            <div className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
            <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
              <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {propertyActionModal.action === "SELL_TO_MARKET"
                    ? "Sell to Market"
                    : propertyActionModal.defaultKind === "mortgage"
                      ? "Default mortgage"
                      : propertyActionModal.defaultKind === "loan"
                        ? "Default collateral loan"
                        : "Default property"}
                </p>
                <p className="text-lg font-semibold text-neutral-900">
                  {propertyActionTile?.name ??
                    `Tile ${propertyActionModal.tileIndex}`}
                </p>
                <p className="mt-2 text-sm text-neutral-600">
                  {propertyActionModal.action === "SELL_TO_MARKET"
                    ? "This will return the property to the open market. This action is irreversible."
                    : propertyActionModal.defaultKind === "mortgage"
                      ? "This will default the mortgage and return the property to the market. This action is irreversible."
                      : propertyActionModal.defaultKind === "loan"
                        ? "This will default the collateral loan and return the property to the market. This action is irreversible."
                        : "This will default the loan and return the property to the market. This action is irreversible."}
                </p>
                <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                  <span className="font-semibold">Payout:</span>{" "}
                  {formatMoney(
                    propertyActionModal.action === "SELL_TO_MARKET"
                      ? propertyActionPayout
                      : 0,
                    currencySymbol,
                  )}
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    className="rounded-2xl border px-4 py-2 text-sm font-semibold text-neutral-700"
                    type="button"
                    onClick={() => setPropertyActionModal(null)}
                    disabled={
                      actionLoading === "SELL_TO_MARKET" ||
                      actionLoading === "DEFAULT_PROPERTY"
                    }
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                    type="button"
                    onClick={() => {
                      void handleBankAction({
                        action: propertyActionModal.action,
                        tileIndex: propertyActionModal.tileIndex,
                      });
                      setPropertyActionModal(null);
                    }}
                    disabled={
                      actionLoading === "SELL_TO_MARKET" ||
                      actionLoading === "DEFAULT_PROPERTY"
                    }
                  >
                    {propertyActionModal.action === "SELL_TO_MARKET"
                      ? actionLoading === "SELL_TO_MARKET"
                        ? "Selling…"
                        : "Confirm sale"
                      : actionLoading === "DEFAULT_PROPERTY"
                        ? "Defaulting…"
                        : "Confirm default"}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : null}
        {payoffLoan ? (
          <>
            <div className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
            <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
              <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Pay off loan
                </p>
                <p className="text-lg font-semibold text-neutral-900">
                  {boardPack?.tiles?.find(
                    (entry) => entry.index === payoffLoan.collateral_tile_index,
                  )?.name ?? `Tile ${payoffLoan.collateral_tile_index}`}
                </p>
                <p className="mt-2 text-sm text-neutral-600">
                  Pay {formatMoney(payoffLoan.remaining_principal, currencySymbol)} to release the collateral
                  and re-enable rent immediately.
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    className="rounded-2xl border px-4 py-2 text-sm font-semibold text-neutral-700"
                    type="button"
                    onClick={() => setPayoffLoan(null)}
                    disabled={actionLoading === "PAYOFF_COLLATERAL_LOAN"}
                  >
                    Cancel
                  </button>
                  <div className="space-y-1">
                    <button
                      className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                      type="button"
                      onClick={() => {
                        setIsLoanPayoffResolving(true);
                        void handleBankAction({
                          action: "PAYOFF_COLLATERAL_LOAN",
                          loanId: payoffLoan.id,
                        });
                        window.setTimeout(() => {
                          setIsLoanPayoffResolving(false);
                          setPayoffLoan(null);
                        }, UI_RESOLVE_DELAY_MS);
                      }}
                      disabled={
                        actionLoading === "PAYOFF_COLLATERAL_LOAN" ||
                        payoffLoan.remaining_principal > myPlayerBalance ||
                        isLoanPayoffResolving
                      }
                    >
                      {actionLoading === "PAYOFF_COLLATERAL_LOAN"
                        ? "Paying…"
                        : isLoanPayoffResolving
                          ? "Resolving…"
                          : `Pay ${formatMoney(payoffLoan.remaining_principal, currencySymbol)}`}
                    </button>
                    {payoffLoanDisabledReason ? (
                      <p className="text-xs text-neutral-400">
                        {payoffLoanDisabledReason}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
        {isAuctionActive || isAuctionResolving ? (
          <>
            <div className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
            <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
              <div className="flex w-full max-w-md scale-[1.02] flex-col rounded-3xl border border-indigo-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur max-h-[calc(100vh-2rem)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                      {isAuctionActive ? "Auction in progress" : "Resolving auction"}
                    </p>
                    <p className="text-lg font-semibold text-neutral-900">
                      {isAuctionActive
                        ? auctionTile?.name ??
                          (auctionTileIndex !== null
                            ? `Tile ${auctionTileIndex}`
                            : "Unowned tile")
                        : auctionDisplaySnapshot?.tileName ?? "Unowned tile"}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {isAuctionActive
                        ? auctionTile?.type ?? "Ownable tile"
                        : auctionDisplaySnapshot?.tileType ?? "Ownable tile"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-neutral-400">
                      {isAuctionActive ? "Time left" : "Finalizing"}
                    </p>
                    <p
                      className={`text-lg font-semibold ${
                        isCurrentAuctionBidder
                          ? "text-rose-600"
                          : "text-neutral-800"
                      }`}
                    >
                      {isAuctionActive
                        ? auctionCountdownLabel
                        : auctionDisplaySnapshot?.countdownLabel ?? "—"}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
                  {isAuctionActive && auctionTile ? (
                    <TitleDeedPreview
                      tile={auctionTile}
                      bandColor={auctionBandColor}
                      boardPackEconomy={boardPackEconomy}
                      price={auctionTile.price ?? null}
                      ownedRailCount={auctionOwnedRailCount}
                      ownedUtilityCount={auctionOwnedUtilityCount}
                      currencySymbol={currencySymbol}
                    />
                  ) : null}
                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3 text-sm text-indigo-900">
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                      Current bid
                    </p>
                    <p className="text-base font-semibold text-indigo-900">
                      {formatMoney(
                        isAuctionActive
                          ? auctionCurrentBid
                          : auctionDisplaySnapshot?.currentBid ?? 0,
                        currencySymbol,
                      )}
                    </p>
                    <p className="text-xs text-indigo-700">
                      {isAuctionActive
                        ? auctionWinnerName
                          ? `Leading: ${auctionWinnerName}`
                          : "No bids yet"
                        : auctionDisplaySnapshot?.winnerName
                          ? `Leading: ${auctionDisplaySnapshot.winnerName}`
                          : "No bids yet"}
                    </p>
                  </div>
                  {isAuctionActive ? (
                    <p className="text-sm text-neutral-600">
                      Waiting for{" "}
                      <span className="font-semibold text-neutral-900">
                        {auctionTurnPlayerName ?? "next bidder"}
                      </span>
                      …
                    </p>
                  ) : (
                    <p className="text-sm text-neutral-600">Resolving…</p>
                  )}
                  {isCurrentAuctionBidder && isAuctionActive ? (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Your bid
                      </p>
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-2">
                        <button
                          className="rounded-full border border-neutral-200 px-3 py-1 text-sm font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:text-neutral-300"
                          type="button"
                          onClick={() =>
                            setAuctionBidAmount((prev) => prev - auctionMinIncrement)
                          }
                          disabled={!canDecreaseAuctionBid}
                        >
                          –
                        </button>
                        <div className="text-lg font-semibold text-neutral-900">
                          {formatMoney(auctionBidAmount, currencySymbol)}
                        </div>
                        <button
                          className="rounded-full border border-neutral-200 px-3 py-1 text-sm font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:text-neutral-300"
                          type="button"
                          onClick={() =>
                            setAuctionBidAmount((prev) => prev + auctionMinIncrement)
                          }
                          disabled={!canIncreaseAuctionBid}
                        >
                          +
                        </button>
                      </div>
                      <p className="text-xs text-neutral-500">
                        Minimum bid: {formatMoney(auctionBidMinimum, currencySymbol)} · Cash:{" "}
                        {formatMoney(currentBidderCash, currencySymbol)}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <button
                            className="rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-indigo-200"
                            type="button"
                            onClick={handleAuctionBid}
                            disabled={
                              actionLoading === "AUCTION_BID" ||
                              !canSubmitAuctionBid
                            }
                          >
                            {actionLoading === "AUCTION_BID" ? "Bidding…" : "Bid"}
                          </button>
                          {auctionBidDisabledReason ? (
                            <p className="text-xs text-neutral-400">
                              {auctionBidDisabledReason}
                            </p>
                          ) : null}
                        </div>
                        <button
                          className="rounded-2xl border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:border-neutral-100 disabled:text-neutral-300"
                          type="button"
                          onClick={handleAuctionPass}
                          disabled={actionLoading === "AUCTION_PASS"}
                        >
                          {actionLoading === "AUCTION_PASS" ? "Passing…" : "Pass"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-500">
                      {isAuctionActive
                        ? "Watch the auction update live. Actions unlock when it is your turn to bid or pass."
                        : "Updating auction results..."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : null}
        </div>

        <div className="rounded-2xl bg-white/95 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] ring-1 ring-black/5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Balance
              </p>
              <p className="text-3xl font-semibold text-neutral-900">
                {formatMoney(myPlayerBalance, currencySymbol)}
              </p>
              <p className="text-sm text-neutral-500">Available to spend</p>
              {getOutOfJailFreeCount > 0 ? (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Get Out of Jail Free: {getOutOfJailFreeCount}
                </div>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-neutral-400">
                Net worth
              </p>
              <p className="text-lg font-semibold text-neutral-700">
                {formatMoney(netWorth, currencySymbol)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white/95 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] ring-1 ring-black/5 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Loan with Collateral
          </p>
          <p className="text-sm text-neutral-600">
            Raise cash by collateralizing an owned property. Rent is paused while
            the loan is active.
          </p>
        </div>
        <div className="rounded-2xl border border-dashed border-neutral-200 p-3 text-xs text-neutral-600">
          <p className="font-semibold text-neutral-700">Terms</p>
          <p>
            LTV: {Math.round(rules.collateralLtv * 100)}% · Rate:{" "}
            {(rules.loanRatePerTurn * 100).toFixed(2)}% per turn · Term:{" "}
            {rules.loanTermTurns} turns
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 p-1">
            {[
              { id: "owned", label: "Owned", count: ownedProperties.length },
              {
                id: "loans",
                label: "Loans",
                count: activeLoans.length,
                hasIndicator: activeLoans.length > 0,
              },
              {
                id: "mortgages",
                label: "Mortgages",
                count: activePurchaseMortgages.length,
                hasIndicator: activePurchaseMortgages.length > 0,
              },
            ].map((tab) => {
              const isActive = walletPanelView === tab.id;
              const showIndicator = tab.hasIndicator && !isActive;
              return (
                <button
                  key={tab.id}
                  className={`relative rounded-full px-4 py-2 text-xs font-semibold transition ${
                    isActive
                      ? "bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-300"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                  type="button"
                  onClick={() =>
                    setWalletPanelView(
                      tab.id as "owned" | "loans" | "mortgages",
                    )
                  }
                >
                  {tab.label} ({tab.count})
                  {showIndicator ? (
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400/80 shadow-sm" />
                  ) : null}
                </button>
              );
            })}
          </div>
          {walletPanelView === "owned" ? (
            <div className="space-y-2">
              {ownedProperties.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  No owned properties available.
                </p>
              ) : (
                <div className="space-y-2">
                  {ownedProperties.map(
                    ({
                      tile,
                      houses,
                      isCollateralEligible,
                      canBuildHouse,
                      canSellHouse,
                      canSellToMarket,
                      sellToMarketDisabledReason,
                      houseBuildMacroBlocked,
                    }) => {
                      const principalPreview = Math.round(
                        (tile.price ?? 0) * rules.collateralLtv,
                      );
                      const isProperty = tile.type === "PROPERTY";
                      const isRail = tile.type === "RAIL";
                      const isUtility = tile.type === "UTILITY";
                      const propertyRent = isProperty
                        ? getPropertyRentDetails(tile)
                        : null;
                      const currentPropertyRent = isProperty
                        ? getPropertyRentWithDev(tile, houses)
                        : null;
                      const railRentByCount = boardPackEconomy.railRentByCount;
                      const railBaseRent = railRentByCount[1] ?? null;
                      const railCurrentRent =
                        railRentByCount[
                          Math.min(ownedRailCount, railRentByCount.length - 1)
                        ] ?? railBaseRent;
                      const railRentRows = buildRailRentRows(railRentByCount);
                      const utilityMultiplier =
                        ownedUtilityCount >= 2
                          ? boardPackEconomy.utilityRentMultipliers.double
                          : boardPackEconomy.utilityRentMultipliers.single;
                      const lastRoll =
                        typeof gameState?.last_roll === "number"
                          ? gameState.last_roll
                          : null;
                      const utilityBaseAmount =
                        boardPackEconomy.utilityBaseAmount ?? 1;
                      const utilityRentPreview =
                        lastRoll !== null
                          ? lastRoll * utilityMultiplier * utilityBaseAmount
                          : null;
                      const groupLabel = getTileGroupLabel(tile);
                      const tileIconSrc = getTileIconSrc(tile);
                      const tileIconFallbackLabel =
                        getDeedIconFallbackLabel(tile);
                      const showSellHouse = houses > 0;
                      const showSellHotel = houses >= 5;
                      const isHotelBoundary = houses >= 5 && houses % 5 === 0;
                      const canSellHotel = canSellHouse && isHotelBoundary;
                      const sellHotelDisabledReason = !isHotelBoundary
                        ? "Sell houses first to reach a hotel boundary."
                        : null;
                      return (
                        <TitleDeedCard
                          key={tile.index}
                          bandColor={getTileBandColor(tile)}
                          header={
                            isRail ? (
                              <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-center">
                                <div className="mx-auto flex h-12 w-24 items-center justify-center rounded-md border border-dashed border-neutral-300 text-[10px] font-semibold text-neutral-500">
                                  <TileIcon
                                    src={tileIconSrc}
                                    alt=""
                                    width={48}
                                    height={48}
                                    className="h-10 w-10 object-contain"
                                    ariaHidden
                                  />
                                  {!tileIconSrc ? tileIconFallbackLabel : null}
                                </div>
                                <p className="mt-2 text-lg font-black uppercase tracking-wide text-neutral-900">
                                  {tile.name}
                                </p>
                                <p className="text-xs font-medium text-neutral-500">
                                  {groupLabel}
                                </p>
                              </div>
                            ) : isUtility ? (
                              <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-center">
                                <div className="mx-auto flex h-12 w-24 items-center justify-center rounded-md border border-dashed border-neutral-300 text-[10px] font-semibold text-neutral-500">
                                  <TileIcon
                                    src={tileIconSrc}
                                    alt=""
                                    width={48}
                                    height={48}
                                    className="h-10 w-10 object-contain"
                                    ariaHidden
                                  />
                                  {!tileIconSrc ? tileIconFallbackLabel : null}
                                </div>
                                <p className="mt-2 text-lg font-black uppercase tracking-wide text-neutral-900">
                                  {tile.name}
                                </p>
                                <p className="text-xs font-medium text-neutral-500">
                                  {groupLabel}
                                </p>
                              </div>
                            ) : (
                              <p className="mt-1 text-lg font-black uppercase tracking-wide text-neutral-900">
                                {tile.name}
                              </p>
                            )
                          }
                          subheader={
                            isProperty ? (
                              <div className="mt-1 space-y-1 text-xs font-medium text-neutral-500">
                                <p>{groupLabel}</p>
                                <p>Loan Value: {formatMoney(principalPreview, currencySymbol)}</p>
                                <div className="flex items-center justify-between gap-2">
                                  <span>Development</span>
                                  <DevelopmentIcons dev={houses} />
                                </div>
                              </div>
                            ) : (
                              <div className="mt-2 text-xs font-medium text-neutral-500">
                                <p>Loan Value: {formatMoney(principalPreview, currencySymbol)}</p>
                              </div>
                            )
                          }
                          rentSection={
                            isProperty && propertyRent ? (
                              <PropertyRentTable
                                className="mt-3"
                                rentRows={propertyRent.rentRows}
                                houseCost={propertyRent.houseCost}
                                hotelIncrement={propertyRent.hotelIncrement}
                                currentRent={currentPropertyRent}
                                currencySymbol={currencySymbol}
                              />
                            ) : isRail ? (
                              <RailRentTable
                                className="mt-3"
                                rentRows={railRentRows}
                                ownedCount={ownedRailCount}
                                currentRent={railCurrentRent}
                                currencySymbol={currencySymbol}
                              />
                            ) : isUtility ? (
                              <UtilityRentTable
                                className="mt-3"
                                ownedCount={ownedUtilityCount}
                                lastRoll={lastRoll}
                                currentRent={utilityRentPreview}
                                rentMultipliers={
                                  boardPackEconomy.utilityRentMultipliers
                                }
                                currencySymbol={currencySymbol}
                              />
                            ) : null
                          }
                          footer={
                            <div className="grid gap-2">
                              {isProperty ? (
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    className="rounded-2xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                                    type="button"
                                    onClick={() =>
                                      void handleBankAction({
                                        action: "BUILD_HOUSE",
                                        tileIndex: tile.index,
                                      })
                                    }
                                    disabled={
                                      !canBuildHouse ||
                                      actionLoading === "BUILD_HOUSE"
                                    }
                                    title={
                                      houseBuildMacroBlocked
                                        ? `Blocked by macro: ${houseBuildBlockedByMacro?.name ?? "Macroeconomic event"}`
                                        : undefined
                                    }
                                  >
                                    {actionLoading === "BUILD_HOUSE"
                                      ? "Building…"
                                      : "Build"}
                                  </button>
                                  {!canBuildHouse && houseBuildMacroBlocked ? (
                                    <p className="text-xs text-neutral-400">
                                      <span>Blocked by macro: {houseBuildBlockedByMacro?.name ?? "Macroeconomic event"}</span>{" "}
                                      {houseBuildBlockedByMacro?.id &&
                                      macroTooltipById.get(houseBuildBlockedByMacro.id) ? (
                                        <InfoTooltip
                                          text={macroTooltipById.get(houseBuildBlockedByMacro.id) ?? ""}
                                          className="align-middle"
                                        />
                                      ) : null}
                                    </p>
                                  ) : null}
                                  {showSellHouse ? (
                                    <button
                                      className="rounded-2xl border border-neutral-900 px-4 py-2 text-xs font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
                                      type="button"
                                      onClick={() =>
                                        void handleBankAction({
                                          action: "SELL_HOUSE",
                                          tileIndex: tile.index,
                                        })
                                      }
                                      disabled={
                                        !canSellHouse ||
                                        actionLoading === "SELL_HOUSE"
                                      }
                                    >
                                      {actionLoading === "SELL_HOUSE"
                                        ? "Selling…"
                                        : "Sell House"}
                                    </button>
                                  ) : null}
                                  {showSellHotel ? (
                                    <div className="space-y-1">
                                      <button
                                        className="rounded-2xl border border-neutral-900 px-4 py-2 text-xs font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
                                        type="button"
                                        onClick={() =>
                                          void handleBankAction({
                                            action: "SELL_HOTEL",
                                            tileIndex: tile.index,
                                          })
                                        }
                                        disabled={
                                          !canSellHotel ||
                                          actionLoading === "SELL_HOTEL"
                                        }
                                        title={
                                          sellHotelDisabledReason ??
                                          "Sell a hotel (5 development)"
                                        }
                                      >
                                        {actionLoading === "SELL_HOTEL"
                                          ? "Selling…"
                                          : "Sell Hotel"}
                                      </button>
                                      {!canSellHotel &&
                                      sellHotelDisabledReason ? (
                                        <p className="text-xs text-neutral-400">
                                          {sellHotelDisabledReason}
                                        </p>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                              <div className="space-y-1">
                                <button
                                  className="rounded-2xl border border-neutral-900 px-4 py-2 text-xs font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
                                  type="button"
                                  onClick={() =>
                                    setPropertyActionModal({
                                      action: "SELL_TO_MARKET",
                                      tileIndex: tile.index,
                                    })
                                  }
                                  disabled={
                                    !canSellToMarket ||
                                    actionLoading === "SELL_TO_MARKET"
                                  }
                                  title={
                                    sellToMarketDisabledReason ??
                                    "Sell this property to the market"
                                  }
                                >
                                  {actionLoading === "SELL_TO_MARKET"
                                    ? "Selling…"
                                    : "Sell to Market"}
                                </button>
                                {sellToMarketDisabledReason ? (
                                  <p className="text-xs text-neutral-400">
                                    {sellToMarketDisabledReason}
                                  </p>
                                ) : null}
                              </div>
                              <button
                                className="rounded-2xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                                type="button"
                                onClick={() =>
                                  void handleBankAction({
                                    action: "TAKE_COLLATERAL_LOAN",
                                    tileIndex: tile.index,
                                  })
                                }
                                disabled={
                                  !canAct ||
                                  !rules.loanCollateralEnabled ||
                                  !isCollateralEligible ||
                                  loanBlockedByMacro !== null ||
                                  actionLoading === "TAKE_COLLATERAL_LOAN"
                                }
                                title={
                                  loanBlockedByMacro
                                    ? `Blocked by macro: ${loanBlockedByMacro.name ?? "Macroeconomic event"}`
                                    : undefined
                                }
                              >
                                {actionLoading === "TAKE_COLLATERAL_LOAN"
                                  ? "Collateralizing…"
                                  : "Collateralize"}
                              </button>
                              {loanBlockedByMacro ? (
                                <p className="text-xs text-neutral-400">
                                  <span>Blocked by macro: {loanBlockedByMacro.name ?? "Macroeconomic event"}</span>{" "}
                                  {loanBlockedByMacro.id &&
                                  macroTooltipById.get(loanBlockedByMacro.id) ? (
                                    <InfoTooltip
                                      text={macroTooltipById.get(loanBlockedByMacro.id) ?? ""}
                                      className="align-middle"
                                    />
                                  ) : null}
                                </p>
                              ) : null}
                            </div>
                          }
                        />
                      );
                    },
                  )}
                </div>
              )}
            </div>
          ) : null}
          {walletPanelView === "loans" ? (
            <div className="space-y-2">
              {activeLoans.length === 0 ? (
                <p className="text-sm text-neutral-500">No active loans.</p>
              ) : (
                <div className="space-y-2">
                  {activeLoans.map((loan) => {
                    const tile =
                      boardPack?.tiles?.find(
                        (entry) => entry.index === loan.collateral_tile_index,
                      ) ?? null;
                    const tileName =
                      tile?.name ?? `Tile ${loan.collateral_tile_index}`;
                    const groupLabel = getTileGroupLabel(tile);
                    const payoffAmount =
                      typeof loan.remaining_principal === "number"
                        ? loan.remaining_principal
                        : loan.principal;
                    const canPayoff =
                      canAct &&
                      payoffAmount > 0 &&
                      myPlayerBalance >= payoffAmount;
                    const houses =
                      ownershipByTile[loan.collateral_tile_index]?.houses ?? 0;
                    const defaultDisabledReason =
                      houses > 0
                        ? "Sell houses first"
                        : !canAct
                          ? "Not your turn"
                          : null;
                    const canDefault =
                      defaultDisabledReason === null && houses === 0;
                    return (
                      <PropertyCardShell
                        key={loan.id}
                        bandColor={getTileBandColor(tile)}
                        bodyClassName="text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-neutral-900">
                              {tileName}
                            </p>
                            <p className="text-xs text-neutral-500">
                              {groupLabel}
                            </p>
                            <p className="text-xs text-neutral-400">
                              Rent paused while collateralized.
                            </p>
                            <p className="text-xs text-neutral-500">
                              Payment: {formatMoney(loan.payment_per_turn, currencySymbol)} · Turns
                              remaining: {loan.turns_remaining}
                            </p>
                            <p className="text-xs text-neutral-500">
                              Remaining balance: {formatMoney(payoffAmount, currencySymbol)}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <button
                              className="rounded-full border border-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
                              type="button"
                              onClick={() => setPayoffLoan(loan)}
                              disabled={
                                !canPayoff ||
                                actionLoading === "PAYOFF_COLLATERAL_LOAN"
                              }
                              title={
                                canPayoff
                                  ? "Pay off this loan"
                                  : "Not enough cash to pay off"
                              }
                            >
                              Pay off
                            </button>
                            <div className="space-y-1 text-right">
                              <button
                                className="rounded-full border border-rose-500 px-3 py-2 text-xs font-semibold text-rose-600 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
                                type="button"
                                onClick={() =>
                                  setPropertyActionModal({
                                    action: "DEFAULT_PROPERTY",
                                    tileIndex: loan.collateral_tile_index,
                                    defaultKind: "loan",
                                  })
                                }
                                disabled={
                                  !canDefault ||
                                  actionLoading === "DEFAULT_PROPERTY"
                                }
                                title={
                                  defaultDisabledReason ??
                                  "Default on this collateral loan"
                                }
                              >
                                {actionLoading === "DEFAULT_PROPERTY"
                                  ? "Defaulting…"
                                  : "Default"}
                              </button>
                              {defaultDisabledReason ? (
                                <p className="text-xs text-neutral-400">
                                  {defaultDisabledReason}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </PropertyCardShell>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
          {walletPanelView === "mortgages" ? (
            <div className="space-y-2">
              <p className="text-xs text-neutral-500">
                Interest is charged each turn; unpaid interest accumulates.
              </p>
              {activePurchaseMortgages.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  No purchase mortgages.
                </p>
              ) : (
                <div className="space-y-2">
                  {activePurchaseMortgages.map((mortgage) => {
                    const tile =
                      boardPack?.tiles?.find(
                        (entry) => entry.index === mortgage.tile_index,
                      ) ?? null;
                    const tileName =
                      tile?.name ?? `Tile ${mortgage.tile_index}`;
                    const groupLabel = getTileGroupLabel(tile);
                    const payoffAmount =
                      (mortgage.principal_remaining ?? 0) +
                      (mortgage.accrued_interest_unpaid ?? 0);
                    const interestPerTurn = calculateMortgageInterestPerTurn(
                      mortgage.principal_remaining,
                      mortgage.rate_per_turn,
                    );
                    const lastCharged = latestMortgageInterestById.get(
                      mortgage.id,
                    );
                    const canPayoff =
                      canAct &&
                      payoffAmount > 0 &&
                      myPlayerBalance >= payoffAmount;
                    const houses =
                      ownershipByTile[mortgage.tile_index]?.houses ?? 0;
                    const defaultDisabledReason =
                      houses > 0
                        ? "Sell houses first"
                        : !canAct
                          ? "Not your turn"
                          : null;
                    const canDefault =
                      defaultDisabledReason === null && houses === 0;
                    return (
                      <PropertyCardShell
                        key={mortgage.id}
                        bandColor={getTileBandColor(tile)}
                        bodyClassName="text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-neutral-900">
                              {tileName}
                            </p>
                            <p className="text-xs text-neutral-500">
                              {groupLabel}
                            </p>
                            <p className="text-xs text-neutral-500">
                              Principal remaining: {formatMoney(mortgage.principal_remaining, currencySymbol)}
                            </p>
                            <p className="text-xs text-neutral-500">
                              Accrued interest: {formatMoney(mortgage.accrued_interest_unpaid, currencySymbol)}
                            </p>
                            <p className="text-xs text-neutral-500">
                              Interest per turn: {formatMoney(interestPerTurn, currencySymbol)}
                            </p>
                            <p className="text-xs text-neutral-500">
                              Payoff amount: {formatMoney(payoffAmount, currencySymbol)}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <button
                              className="rounded-full border border-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
                              type="button"
                              onClick={() =>
                                void handleBankAction({
                                  action: "PAYOFF_PURCHASE_MORTGAGE",
                                  mortgageId: mortgage.id,
                                })
                              }
                              disabled={
                                !canPayoff ||
                                actionLoading === "PAYOFF_PURCHASE_MORTGAGE"
                              }
                              title={
                                canPayoff
                                  ? "Pay off this mortgage"
                                  : "Not enough cash to pay off"
                              }
                            >
                              Pay off
                            </button>
                            <div className="space-y-1 text-right">
                              <button
                                className="rounded-full border border-rose-500 px-3 py-2 text-xs font-semibold text-rose-600 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
                                type="button"
                                onClick={() =>
                                  setPropertyActionModal({
                                    action: "DEFAULT_PROPERTY",
                                    tileIndex: mortgage.tile_index,
                                    defaultKind: "mortgage",
                                  })
                                }
                                disabled={
                                  !canDefault ||
                                  actionLoading === "DEFAULT_PROPERTY"
                                }
                                title={
                                  defaultDisabledReason ??
                                  "Default on this mortgage"
                                }
                              >
                                {actionLoading === "DEFAULT_PROPERTY"
                                  ? "Defaulting…"
                                  : "Default"}
                              </button>
                              {defaultDisabledReason ? (
                                <p className="text-xs text-neutral-400">
                                  {defaultDisabledReason}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </PropertyCardShell>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </section>

      <section
        ref={tradeConfirmSectionRef}
        className="rounded-2xl bg-white/95 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] ring-1 ring-black/5 space-y-3"
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Trade Confirm
            </p>
            {incomingTradeProposal ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-amber-500"
                  aria-hidden
                />
                Offer
              </span>
            ) : null}
          </div>
          <p className="text-sm text-neutral-600">
            Verify the terms before both sides accept.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            className="rounded-2xl border px-4 py-3 text-sm font-semibold text-neutral-700"
            type="button"
            onClick={openProposeTradeModal}
          >
            Propose Trade
          </button>
          {incomingTradeProposal ? (
            <button
              className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white"
              type="button"
              onClick={openIncomingTradeModal}
            >
              See offer
            </button>
          ) : (
            <div className="flex items-center rounded-2xl border border-dashed border-neutral-200 px-4 py-3 text-sm text-neutral-400">
              No incoming trades yet.
            </div>
          )}
        </div>
      </section>
      {isBoardExpanded ? (
        <div
          className="fixed inset-0 z-50 flex bg-black/60 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Board"
          onClick={() => setIsBoardExpanded(false)}
        >
          <div
            className="relative flex h-full w-full flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(event) => {
              event.stopPropagation();
              if (selectedTileIndex === null) {
                return;
              }
              const target = event.target as Node;
              if (expandedTileSheetRef.current?.contains(target)) {
                return;
              }
              setSelectedTileIndex(null);
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 sm:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Board
                </p>
              </div>
              <button
                className="rounded-full border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-700"
                type="button"
                onClick={() => setIsBoardExpanded(false)}
                aria-label="Close board"
              >
                ✕
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col px-3 pb-6 pt-4 sm:px-5">
              <div
                ref={expandedBoardContainerRef}
                className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden"
              >
                <div
                  ref={expandedBoardRef}
                  className="flex items-center justify-center"
                  style={{
                    transform: `scale(${expandedBoardScale})`,
                    transformOrigin: "center",
                  }}
                >
                  <div className="w-full max-w-5xl">
                    <div className="aspect-[6/16] w-full">
                      <div className="grid h-full w-full grid-cols-[repeat(6,minmax(0,1fr))] grid-rows-[repeat(16,minmax(0,1fr))] gap-1 rounded-xl border border-neutral-200 bg-white p-1 text-neutral-700 sm:gap-1.5 sm:p-1.5">
                        {expandedBoardEdges.top.map((index, position) => (
                          <div
                            key={`top-${index}`}
                            className="col-span-1 row-span-1 flex"
                            style={{ gridColumn: position + 1, gridRow: 1 }}
                          >
                            {renderExpandedTile(index)}
                          </div>
                        ))}
                        {expandedBoardEdges.left.map((index, position) => (
                          <div
                            key={`left-${index}`}
                            className="col-span-1 row-span-1 flex"
                            style={{ gridColumn: 1, gridRow: position + 2 }}
                          >
                            {renderExpandedTile(index)}
                          </div>
                        ))}
                        {expandedBoardEdges.right.map((index, position) => (
                          <div
                            key={`right-${index}`}
                            className="col-span-1 row-span-1 flex"
                            style={{ gridColumn: 6, gridRow: position + 2 }}
                          >
                            {renderExpandedTile(index)}
                          </div>
                        ))}
                        {expandedBoardEdges.bottom.map((index, position) => (
                          <div
                            key={`bottom-${index}`}
                            className="col-span-1 row-span-1 flex"
                            style={{ gridColumn: position + 1, gridRow: 16 }}
                          >
                            {renderExpandedTile(index)}
                          </div>
                        ))}
                        <div className="col-start-2 row-start-2 col-span-4 row-span-14 flex items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400 sm:text-sm">
                          The Bank
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {selectedTileIndex !== null && selectedExpandedTile ? (
                <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4 sm:px-6 sm:pb-6">
                  <TileDetailsPanel
                    selectedTileIndex={selectedTileIndex}
                    selectedTile={selectedExpandedTile}
                    selectedTileTypeLabel={selectedTileTypeLabel}
                    selectedTileOwnerLabel={selectedTileOwnerLabel}
                    selectedTilePlayers={selectedTilePlayers}
                    currentUserPlayer={currentUserPlayer}
                    selectedOwnerRailCount={selectedOwnerRailCount}
                    selectedOwnerUtilityCount={selectedOwnerUtilityCount}
                    selectedTileDevelopment={selectedTileDevelopment}
                    boardPackEconomy={boardPackEconomy}
                    onClose={() => setSelectedTileIndex(null)}
                    sheetRef={expandedTileSheetRef}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      <FloatingTurnActions
        isVisible={isMyTurn}
        canRoll={canRoll}
        canEndTurn={canEndTurn}
        actionLoading={actionLoading}
        rollDiceDisabledReason={rollDiceDisabledReason}
        onRollDice={() => void handleBankAction({ action: "ROLL_DICE" })}
        onEndTurn={() => void handleBankAction({ action: "END_TURN" })}
      />
      {incomingTradeProposal ? (
        <button
          className="fixed bottom-16 right-6 z-10 flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 shadow-lg shadow-neutral-200/60 transition hover:border-neutral-300 hover:text-neutral-900"
          type="button"
          onClick={scrollToTradeConfirm}
          aria-label="Trade offer. Scroll to trade confirmation"
        >
          <span
            className="h-2 w-2 rounded-full bg-amber-500"
            aria-hidden
          />
          Trade offer
        </button>
      ) : null}
      {!isEventLogSuppressed ? (
        <>
          <button
            className="fixed bottom-6 right-4 z-10 rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-lg shadow-neutral-900/20 transition hover:bg-neutral-800"
            type="button"
            onClick={() => {
              setActivityTab("log");
              setIsActivityPanelOpen(true);
            }}
          >
            ︽
          </button>
          {isActivityPanelOpen ? (
            <div
              className="fixed inset-0 z-30"
              onClick={() => setIsActivityPanelOpen(false)}
            >
              <div className="absolute inset-0 bg-black/20" />
              <div
                className="absolute bottom-20 right-6 z-40 w-[min(92vw,380px)] rounded-2xl border bg-white p-4 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Activity"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Activity
                    </p>
                    <p className="text-sm text-neutral-600">
                      Wallet-impacting updates and live table events.
                    </p>
                  </div>
                  <button
                    className="rounded-full border border-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-700"
                    type="button"
                    onClick={() => setIsActivityPanelOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-full bg-neutral-100 p-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  <button
                    className={`flex-1 rounded-full px-3 py-1 transition ${
                      activityTab === "log"
                        ? "bg-white text-neutral-900 shadow-sm"
                        : "text-neutral-500 hover:text-neutral-700"
                    }`}
                    type="button"
                    onClick={() => setActivityTab("log")}
                  >
                    Log
                  </button>
                  <button
                    className={`flex-1 rounded-full px-3 py-1 transition ${
                      activityTab === "transactions"
                        ? "bg-white text-neutral-900 shadow-sm"
                        : "text-neutral-500 hover:text-neutral-700"
                    }`}
                    type="button"
                    onClick={() => setActivityTab("transactions")}
                  >
                    Transactions
                  </button>
                </div>
                {activityTab === "log" ? (
                  <div className="mt-4 max-h-[50vh] space-y-3 overflow-y-auto text-sm">
                    {displayEvents.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-neutral-200 p-4 text-center text-neutral-500">
                        Events will appear once the game starts.
                      </div>
                    ) : (
                      displayEvents.map((event) => (
                        <div key={event.id} className="rounded-2xl border px-4 py-3">
                          <div className="flex items-center justify-between text-xs uppercase text-neutral-400">
                            <span>{event.event_type.replaceAll("_", " ")}</span>
                            <span>v{event.version}</span>
                          </div>
                          <p className="mt-2 flex items-start gap-2 text-sm font-medium text-neutral-800">
                            <span>{formatEventDescription(event)}</span>
                            {(["MACRO_EVENT", "MACRO_EVENT_TRIGGERED"].includes(event.event_type) &&
                              (() => {
                                const payload = event.payload as { event_id?: unknown } | null;
                                const macroId = typeof payload?.event_id === "string" ? payload.event_id : null;
                                if (!macroId) {
                                  return null;
                                }
                                const tooltip = macroTooltipById.get(macroId);
                                return tooltip ? <InfoTooltip text={tooltip} /> : null;
                              })())}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="mt-4 max-h-[50vh] space-y-3 overflow-y-auto text-sm">
                    {displayTransactions.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-neutral-200 p-4 text-center text-neutral-500">
                        No transactions yet.
                      </div>
                    ) : (
                      displayTransactions.map((transaction) => (
                        <div
                          key={transaction.id}
                          className="flex items-center justify-between rounded-2xl border px-4 py-3"
                        >
                          <div>
                            <p className="font-medium text-neutral-800">
                              {transaction.title}
                            </p>
                            {transaction.subtitle ? (
                              <p className="text-xs text-neutral-500">
                                {transaction.subtitle}
                              </p>
                            ) : null}
                          </div>
                          <p
                            className={`text-sm font-semibold ${
                              transaction.amount < 0
                                ? "text-rose-500"
                                : "text-emerald-600"
                            }`}
                          >
                            {formatSignedCurrency(transaction.amount)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </PageShell>
  );
}
