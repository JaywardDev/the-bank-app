import Image from "next/image";
import type { CSSProperties, PointerEvent } from "react";
import HousesDots from "@/app/components/HousesDots";
import TokenStack from "@/app/components/TokenStack";
import type { BoardTile } from "@/lib/boardPacks";
import { getTileBandColor } from "@/lib/boardTileStyles";
import { getBoardTileIconSrc, isIconOnlySpecialTile } from "@/lib/tileIcons";
import type { BoardPackEconomy } from "@/lib/boardPacks";
import { formatCurrencyCompact, getCurrentTileRent } from "@/lib/rent";
import type { InlandCellRecord } from "@/lib/inlandExploration";
import { getInlandResourceIconSrc } from "@/lib/inlandResourceIcons";
import { getDevelopmentSpriteForLevel } from "@/components/play-v2/utils/developmentLabels";

type BoardPlayer = {
  id: string;
  display_name: string | null;
  position: number;
  tokenIndex: number;
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

type BoardTrackDensity = "default" | "compact";
type BoardTrackTileFace = "default" | "map";
type InteriorCellState = "FOREST" | "EXPLORED_EMPTY" | "DISCOVERED_RESOURCE" | "DEVELOPED_SITE";
export type InteriorCellSelection = {
  row: number;
  col: number;
};

type BoardTrackProps = {
  tiles?: BoardTile[];
  economy?: BoardPackEconomy;
  lastRoll?: number | null;
  players: BoardPlayer[];
  ownershipByTile: OwnershipByTile;
  playerColorsById: Record<string, string>;
  currentPlayerId?: string | null;
  lastMovedPlayerId?: string | null;
  lastMovedTileIndex?: number | null;
  selectedTileIndex?: number | null;
  onTileClick?: (tileIndex: number) => void;
  onInteriorCellClick?: (cell: InteriorCellSelection) => void;
  onTilePointerDown?: (tileIndex: number, tileRect: DOMRect) => void;
  onTilePointerRelease?: () => void;
  selectedInteriorCell?: InteriorCellSelection | null;
  exploredInteriorCellKeys?: Set<string>;
  inlandCellsByKey?: Map<string, InlandCellRecord>;
  density?: BoardTrackDensity;
  tileFace?: BoardTrackTileFace;
};

const fallbackTiles: BoardTile[] = Array.from({ length: 40 }, (_, index) => ({
  index,
  tile_id: `tile-${index}`,
  type: index === 0 ? "START" : "PROPERTY",
  name: `Tile ${index}`,
}));

const DEFAULT_BOARD_WIDTH = 15;
const DEFAULT_BOARD_HEIGHT = 7;
const COMPACT_BOARD_WIDTH = 13;
const COMPACT_BOARD_HEIGHT = 9;
const FOREST_VARIANTS = [
  "/assets/forest.png",
  "/assets/forest-2.png",
  "/assets/forest-3.png",
];
const MAP_TILE_WARM_WHITE = "#f3f0e6";
const getInteriorCellKey = (row: number, col: number) => `${row}:${col}`;

const getRowCol = (tileIndex: number, boardWidth: number, boardHeight: number) => {
  const topRowEndIndex = 2 * boardWidth + boardHeight - 3;

  if (tileIndex === 0) return { row: boardHeight - 1, col: boardWidth - 1 };
  if (tileIndex >= 1 && tileIndex <= boardWidth - 1) {
    return { row: boardHeight - 1, col: boardWidth - 1 - tileIndex };
  }
  if (tileIndex >= boardWidth && tileIndex <= boardWidth + boardHeight - 3) {
    return { row: boardHeight - 1 - (tileIndex - (boardWidth - 1)), col: 0 };
  }
  if (tileIndex >= boardWidth + boardHeight - 2 && tileIndex <= topRowEndIndex) {
    return { row: 0, col: tileIndex - (boardWidth + boardHeight - 2) };
  }
  return { row: tileIndex - topRowEndIndex, col: boardWidth - 1 };
};

const getLayerIndex = (row: number, col: number, boardWidth: number) =>
  row * (boardWidth + 1) + col;

const getInteriorCells = (boardWidth: number, boardHeight: number) => {
  const cells: Array<{ row: number; col: number; state: InteriorCellState }> = [];

  for (let row = 1; row <= boardHeight - 2; row += 1) {
    for (let col = 1; col <= boardWidth - 2; col += 1) {
      cells.push({ row, col, state: "FOREST" });
    }
  }

  return cells;
};

const getForestVariantIndex = (row: number, col: number) => {
  const hash = (row * 73856093) ^ (col * 19349663);
  return Math.abs(hash) % FOREST_VARIANTS.length;
};

const isForestStyledOuterSpecialTile = (tile: BoardTile) => {
  if (tile.type === "START") return true;
  if (tile.type === "FREE_PARKING") return true;
  if (tile.type === "JAIL") return true;
  if (tile.type === "GO_TO_JAIL") return true;
  if (tile.type !== "TAX") return false;
  const tileLabel = `${tile.tile_id} ${tile.name}`.toLowerCase();
  return tileLabel.includes("income") || tileLabel.includes("super");
};

const isTransparentMapOuterSpecialTile = (tile: BoardTile) => {
  if (tile.type === "START") return true;
  if (tile.type === "CHANCE" || tile.type === "COMMUNITY_CHEST") return true;
  if (tile.type === "FREE_PARKING") return true;
  if (tile.type === "JAIL") return true;
  if (tile.type === "GO_TO_JAIL") return true;
  if (tile.type === "EVENT") {
    const tileLabel = `${tile.tile_id} ${tile.name}`.toLowerCase();
    return tileLabel.includes("chance") || tileLabel.includes("community");
  }
  if (tile.type !== "TAX") return false;
  const tileLabel = `${tile.tile_id} ${tile.name}`.toLowerCase();
  return tileLabel.includes("income") || tileLabel.includes("super");
};

export default function BoardTrack({
  tiles,
  players,
  ownershipByTile,
  playerColorsById,
  currentPlayerId,
  lastMovedPlayerId,
  lastMovedTileIndex,
  selectedTileIndex,
  onTileClick,
  onInteriorCellClick,
  onTilePointerDown,
  onTilePointerRelease,
  selectedInteriorCell,
  exploredInteriorCellKeys,
  inlandCellsByKey,
  economy,
  lastRoll,
  density = "default",
  tileFace = "default",
}: BoardTrackProps) {
  const boardTiles = tiles && tiles.length > 0 ? tiles : fallbackTiles;
  const boardEconomy = economy ?? {
    currency: { code: "USD", symbol: "$" },
    houseRentMultipliersByGroup: {},
    hotelIncrementMultiplier: 1.25,
    railRentByCount: [0, 25, 50, 100, 200],
    utilityRentMultipliers: { single: 4, double: 10, triple: 16 },
  };
  const isCompact = density === "compact";
  const isMapTileFace = tileFace === "map";
  const boardWidth = isCompact ? COMPACT_BOARD_WIDTH : DEFAULT_BOARD_WIDTH;
  const boardHeight = isCompact ? COMPACT_BOARD_HEIGHT : DEFAULT_BOARD_HEIGHT;
  const bottomLen = boardWidth;
  const leftLen = boardHeight - 2;
  const topLen = boardWidth;
  const bottomLeftCorner = bottomLen - 1;
  const topLeftCorner = bottomLen + leftLen - 1;
  const topRightCorner = bottomLen + leftLen + topLen - 1;
  const interiorCells = getInteriorCells(boardWidth, boardHeight).map((cell) => {
    const key = getInteriorCellKey(cell.row, cell.col);
    const inlandCellRecord = inlandCellsByKey?.get(key);
    return {
      ...cell,
      state: (inlandCellRecord?.status ??
        (exploredInteriorCellKeys?.has(key) ? "EXPLORED_EMPTY" : "FOREST")) as InteriorCellState,
      inlandCellRecord,
      key,
    };
  });

  const playersByTile = players.reduce<Record<number, BoardPlayer[]>>(
    (acc, player) => {
      acc[player.position] = acc[player.position]
        ? [...acc[player.position], player]
        : [player];
      return acc;
    },
    {},
  );

  return (
    <div
      className={`relative h-full w-full ${isCompact ? "p-1" : "rounded-lg border border-white/20 bg-transparent p-2 shadow-2xl"}`}
    >
      <div
        className={`relative grid h-full w-full gap-px ${isCompact ? "p-1" : "rounded-[6px] bg-white/10 p-1.5"}`}
        style={{
          gridTemplateColumns: `repeat(${boardWidth}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${boardHeight}, minmax(0, 1fr))`,
        }}
      >
        <div className="absolute inset-0">
          {interiorCells.map((cell) => {
            const developedSiteIconSrc = getInlandResourceIconSrc(
              cell.inlandCellRecord?.developedSiteType,
            );
            return (
              <div
                key={`interior-${cell.row}-${cell.col}`}
                className="absolute overflow-visible"
                style={{
                  top: `${(cell.row / boardHeight) * 100}%`,
                  left: `${(cell.col / boardWidth) * 100}%`,
                  width: `${100 / boardWidth}%`,
                  height: `${100 / boardHeight}%`,
                  zIndex: getLayerIndex(cell.row, cell.col, boardWidth),
                }}
              >
                {cell.state === "FOREST" ? (
                  <Image
                    src={FOREST_VARIANTS[getForestVariantIndex(cell.row, cell.col)]}
                    alt=""
                    width={192}
                    height={192}
                    aria-hidden
                    className="pointer-events-none absolute bottom-0 left-1/2 h-[160%] w-[160%] max-w-none -translate-x-1/2 object-contain"
                  />
                ) : null}
                {cell.state === "DISCOVERED_RESOURCE" ? (
                  <span className="pointer-events-none absolute right-0.5 top-0.5 z-[2] rounded-full bg-amber-200/90 px-1 text-[10px] font-bold text-amber-950">
                    ?
                  </span>
                ) : null}
                {cell.state === "DEVELOPED_SITE" ? (
                  <div className="pointer-events-none absolute inset-0 z-[2] overflow-visible">
                    {developedSiteIconSrc ? (
                      <Image
                        src={developedSiteIconSrc}
                        alt=""
                        width={48}
                        height={48}
                        aria-hidden
                        className="absolute bottom-0 left-1/2 h-[170%] w-[170%] max-w-none -translate-x-1/2 object-contain opacity-95"
                      />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-800/80" />
                    )}
                  </div>
                ) : null}
                {onInteriorCellClick ? (
                  <button
                    type="button"
                    aria-label={`Inland tile row ${cell.row} col ${cell.col}`}
                    onClick={() => onInteriorCellClick({ row: cell.row, col: cell.col })}
                    className={`absolute inset-0 z-[1] rounded-[2px] transition ${
                      selectedInteriorCell?.row === cell.row &&
                      selectedInteriorCell?.col === cell.col
                        ? "bg-emerald-300/25 outline outline-1 outline-emerald-200/70"
                        : cell.state === "DEVELOPED_SITE"
                          ? "bg-sky-300/15 hover:bg-sky-300/25"
                          : cell.state === "DISCOVERED_RESOURCE"
                            ? "bg-amber-300/15 hover:bg-amber-300/25"
                            : cell.state === "EXPLORED_EMPTY"
                              ? "bg-white/5 hover:bg-white/10"
                              : "bg-transparent hover:bg-emerald-200/10"
                    }`}
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        {boardTiles.map((tile) => {
          const position = getRowCol(tile.index, boardWidth, boardHeight);
          const ownership = ownershipByTile[tile.index];
          const ownerColor = ownership?.owner_player_id
            ? (playerColorsById[ownership.owner_player_id] ?? "#e5e7eb")
            : null;
          const isCollateralized = Boolean(ownership?.collateral_loan_id);
          const isPurchaseMortgaged = Boolean(ownership?.purchase_mortgage_id);
          const ownershipMarkerLabel = isCollateralized
            ? "Collateralized property"
            : isPurchaseMortgaged
              ? "Mortgaged property"
              : "Owned property";
          const tilePlayers = playersByTile[tile.index] ?? [];
          const isCorner =
            tile.index === 0 ||
            tile.index === bottomLeftCorner ||
            tile.index === topLeftCorner ||
            tile.index === topRightCorner;
          const tileIconSrc = getBoardTileIconSrc(tile);
          const isIconOnlyTile = isIconOnlySpecialTile(tile) && !ownership;
          const isPropertyTile = tile.type === "PROPERTY";
          const isRailOrUtilityTile = tile.type === "RAIL" || tile.type === "UTILITY";
          const isOwnableTile = isPropertyTile || isRailOrUtilityTile;
          const isOwned = Boolean(ownership);
          const isOwnedByPlayer = Boolean(ownership?.owner_player_id);
          const isOwnedOuterOwnableNonColoredTile =
            isMapTileFace && isRailOrUtilityTile && isOwnedByPlayer;
          const housesCount = ownershipByTile[tile.index]?.houses ?? 0;
          const mapBuildingSpriteSrc = getDevelopmentSpriteForLevel(housesCount);
          const isTransparentMapSpecialTile =
            isMapTileFace && isTransparentMapOuterSpecialTile(tile) && !isOwnableTile;
          const mapTileBaseColor = isMapTileFace
            ? isPropertyTile
              ? isOwned
                ? "transparent"
                : (getTileBandColor(tile) ?? MAP_TILE_WARM_WHITE)
              : isRailOrUtilityTile
                ? isOwned
                  ? "transparent"
                  : MAP_TILE_WARM_WHITE
                : isTransparentMapSpecialTile
                  ? "transparent"
                  : MAP_TILE_WARM_WHITE
            : MAP_TILE_WARM_WHITE;
          const showMapCenteredIcon = isMapTileFace
            ? !isPropertyTile
            : Boolean(tileIconSrc);
          const showForestStyledMapIcon =
            isMapTileFace &&
            Boolean(tileIconSrc) &&
            (isForestStyledOuterSpecialTile(tile) || isOwnedOuterOwnableNonColoredTile);
          const currentRent = getCurrentTileRent({
            tile,
            ownershipByTile,
            boardTiles,
            economy: boardEconomy,
            lastRoll,
          });
          const showRent = currentRent !== null;
          const rentLabel = isCollateralized
            ? "—"
            : currentRent !== null
              ? formatCurrencyCompact(currentRent, boardEconomy.currency.symbol)
              : null;

          const handleTilePointerDown = (event: PointerEvent<HTMLElement>) => {
            onTilePointerDown?.(tile.index, event.currentTarget.getBoundingClientRect());
          };

          const handleTilePointerRelease = () => {
            onTilePointerRelease?.();
          };

          return (
            <article
              key={tile.tile_id}
              data-tile-face={isMapTileFace ? "map" : "default"}
              role={onTileClick ? "button" : undefined}
              tabIndex={onTileClick ? 0 : undefined}
              onClick={() => onTileClick?.(tile.index)}
              onPointerDown={handleTilePointerDown}
              onPointerUp={handleTilePointerRelease}
              onPointerCancel={handleTilePointerRelease}
              onPointerLeave={handleTilePointerRelease}
              onKeyDown={(event) => {
                if (!onTileClick) {
                  return;
                }
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onTileClick(tile.index);
                }
              }}
              className={`group relative ${isMapTileFace ? "overflow-visible" : "overflow-hidden"} border border-transparent text-neutral-800 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)] ${
                isCorner ? "rounded-[6px]" : "rounded-sm"
              } ${lastMovedTileIndex === tile.index ? "ring-2 ring-amber-400" : ""} ${
                selectedTileIndex === tile.index
                  ? "outline outline-2 outline-indigo-500 outline-offset-[-3px]"
                  : ""
              } ${onTileClick ? "cursor-pointer" : ""}`}
              style={{
                gridRowStart: position.row + 1,
                gridColumnStart: position.col + 1,
                zIndex: getLayerIndex(position.row, position.col, boardWidth),
              }}
            >
              <div className="pointer-events-none absolute inset-x-1.5 top-2 z-20 h-[calc(100%-0.75rem)]">
                <div
                  className="relative h-full w-full"
                  style={{
                    "--token-size": isMapTileFace
                      ? "clamp(14px, 25%, 22px)"
                      : "clamp(26px, 100%, 70px)",
                    "--token-step": "24%",
                  } as CSSProperties}
                >
                  <TokenStack
                    players={tilePlayers.map((player) => ({
                      id: player.id,
                      display_name: player.display_name,
                      color: playerColorsById[player.id] ?? "#93c5fd",
                      tokenIndex: player.tokenIndex,
                      isCurrent: player.id === currentPlayerId,
                      isLastMoved: player.id === lastMovedPlayerId,
                    }))}
                  />
                </div>
              </div>

              <div
                className={`relative h-full w-full ${isMapTileFace ? "overflow-visible" : "overflow-hidden"} ${
                  isCorner ? "rounded-[6px]" : "rounded-sm"
                } bg-[#f3f0e6] ${onTileClick ? "transition group-hover:bg-[#f8f4eb]" : ""}`}
                style={{ backgroundColor: mapTileBaseColor }}
              >
                {tileIconSrc && showMapCenteredIcon ? (
                  showForestStyledMapIcon ? (
                    <div className="pointer-events-none absolute inset-0 z-0 overflow-visible bg-transparent">
                      <Image
                        src={tileIconSrc}
                        alt=""
                        width={96}
                        height={96}
                        aria-hidden
                        className="absolute bottom-0 left-1/2 h-[145%] w-[145%] max-w-none -translate-x-1/2 object-contain"
                      />
                    </div>
                  ) : (
                    <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
                      <Image
                        src={tileIconSrc}
                        alt=""
                        width={96}
                        height={96}
                        aria-hidden
                        className="h-full w-full scale-[0.95] object-contain opacity-[0.85]"
                      />
                    </div>
                  )
                ) : null}

                {ownership && !isMapTileFace ? (
                  <div className="pointer-events-none absolute right-1 top-1 z-10">
                    <span
                      className="relative block h-3.5 w-3.5 rounded-full border border-black/30 shadow-[0_1px_1px_rgba(0,0,0,0.35),inset_0_1px_1px_rgba(255,255,255,0.6)]"
                      style={{
                        backgroundColor: ownerColor ?? "#9ca3af",
                        opacity: isCollateralized ? 0.45 : 1,
                      }}
                      aria-label={ownershipMarkerLabel}
                    >
                      {isCollateralized ? (
                        <span className="absolute left-1/2 top-1/2 h-[1px] w-[140%] -translate-x-1/2 -translate-y-1/2 rotate-[-35deg] bg-black/70" />
                      ) : null}
                      {isPurchaseMortgaged && !isCollateralized ? (
                        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[8px] font-black leading-none text-black/80">
                          M
                        </span>
                      ) : null}
                    </span>
                  </div>
                ) : null}

                {!isMapTileFace ? (
                  <div
                    className="relative z-2 h-3 w-full"
                    style={{ backgroundColor: getTileBandColor(tile) }}
                  />
                ) : null}

                {isMapTileFace && isOwnableTile && isOwnedByPlayer && mapBuildingSpriteSrc ? (
                  <div className="pointer-events-none absolute inset-0 z-10 overflow-visible">
                    <Image
                      src={mapBuildingSpriteSrc}
                      alt=""
                      width={96}
                      height={96}
                      aria-hidden
                      className="absolute bottom-0 left-1/2 h-[170%] w-[170%] max-w-none -translate-x-1/2 object-contain"
                    />
                  </div>
                ) : null}

                {!isMapTileFace ? (
                  <div className="relative z-2 flex h-full flex-col p-1">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-[10px] font-bold leading-none">{tile.index}</p>
                    </div>
                    {!isIconOnlyTile ? (
                      <p className="mt-0.5 line-clamp-2 min-h-[1.7rem] pr-0.5 text-[15px] font-semibold leading-tight">
                        {tile.name}
                      </p>
                    ) : null}

                    {ownership?.houses ? (
                      <div className="mt-1 flex justify-center">
                        <HousesDots houses={ownership.houses} size="sm" />
                      </div>
                    ) : null}
                    {showRent ? (
                      <div className="mt-auto flex items-end justify-between gap-1">
                        {showRent ? (
                          <div className="pointer-events-none z-30">
                            <span
                              className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[15px] font-semibold leading-none ${
                                isCollateralized
                                  ? "bg-neutral-700/35 text-neutral-900/50"
                                  : "bg-neutral-900/70 text-white/95"
                              }`}
                              aria-label={
                                isCollateralized
                                  ? "Rent paused while collateralized"
                                  : `Current rent ${rentLabel}`
                              }
                            >
                              {rentLabel}
                            </span>
                          </div>
                        ) : (
                          <span />
                        )}
                        <span />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
