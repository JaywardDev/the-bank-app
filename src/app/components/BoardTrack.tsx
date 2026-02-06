import type { CSSProperties } from "react";
import Image from "next/image";
import HousesDots from "@/app/components/HousesDots";
import TokenStack from "@/app/components/TokenStack";
import type { BoardTile } from "@/lib/boardPacks";
import { getTileBandColor } from "@/lib/boardTileStyles";
import { getBoardTileIconSrc, isIconOnlySpecialTile } from "@/lib/tileIcons";

type BoardPlayer = {
  id: string;
  display_name: string | null;
  position: number;
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

type BoardTrackProps = {
  tiles?: BoardTile[];
  players: BoardPlayer[];
  ownershipByTile: OwnershipByTile;
  playerColorsById: Record<string, string>;
  currentPlayerId?: string | null;
  lastMovedPlayerId?: string | null;
  lastMovedTileIndex?: number | null;
};

const fallbackTiles: BoardTile[] = Array.from({ length: 40 }, (_, index) => ({
  index,
  tile_id: `tile-${index}`,
  type: index === 0 ? "START" : "PROPERTY",
  name: `Tile ${index}`,
}));

const getRowCol = (tileIndex: number) => {
  if (tileIndex === 0) return { row: 10, col: 10 };
  if (tileIndex >= 1 && tileIndex <= 9) return { row: 10, col: 10 - tileIndex };
  if (tileIndex === 10) return { row: 10, col: 0 };
  if (tileIndex >= 11 && tileIndex <= 19)
    return { row: 20 - tileIndex, col: 0 };
  if (tileIndex === 20) return { row: 0, col: 0 };
  if (tileIndex >= 21 && tileIndex <= 29)
    return { row: 0, col: tileIndex - 20 };
  if (tileIndex === 30) return { row: 0, col: 10 };
  return { row: tileIndex - 30, col: 10 };
};

export default function BoardTrack({
  tiles,
  players,
  ownershipByTile,
  playerColorsById,
  currentPlayerId,
  lastMovedPlayerId,
  lastMovedTileIndex,
}: BoardTrackProps) {
  const boardTiles = tiles && tiles.length > 0 ? tiles : fallbackTiles;
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
    <div className="relative h-full w-full rounded-lg border border-white/20 bg-transparent p-2 shadow-2xl">
      <div className="grid h-full w-full grid-cols-11 grid-rows-11 gap-px rounded-[6px] bg-white/10 p-1.5">
        {boardTiles.map((tile) => {
          const position = getRowCol(tile.index);
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
          const isCorner = tile.index % 10 === 0;
          const tileIconSrc = getBoardTileIconSrc(tile);
          const isIconOnlyTile = isIconOnlySpecialTile(tile) && !ownership;

          return (
            <article
              key={tile.tile_id}
              className={`relative overflow-hidden border border-transparent bg-[#f3f0e6] text-neutral-800 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)] ${
                isCorner ? "rounded-[6px]" : "rounded-sm"
              } ${lastMovedTileIndex === tile.index ? "ring-2 ring-amber-400" : ""}`}
              style={{
                gridRowStart: position.row + 1,
                gridColumnStart: position.col + 1,
              }}
            >
              <div className="pointer-events-none absolute inset-x-1.5 top-2 z-20 h-[calc(100%-0.75rem)]">
                <div
                  className="relative h-full w-full"
                  style={{
                    "--token-size": "clamp(12px, 40%, 26px)",
                    "--token-step": "24%",
                  } as CSSProperties}
                >
                  <TokenStack
                    players={tilePlayers.map((player) => ({
                      id: player.id,
                      display_name: player.display_name,
                      color: playerColorsById[player.id] ?? "#93c5fd",
                      isCurrent: player.id === currentPlayerId,
                      isLastMoved: player.id === lastMovedPlayerId,
                    }))}
                  />
                </div>
              </div>

              {tileIconSrc ? (
                <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
                  <Image
                    src={tileIconSrc}
                    alt=""
                    width={96}
                    height={96}
                    aria-hidden
                    className="h-[70%] w-[70%] scale-[0.75] object-contain opacity-25 blur-[0.2px]"
                  />
                </div>
              ) : null}

              <div
                className="relative z-10 h-1.5 w-full"
                style={{ backgroundColor: getTileBandColor(tile) }}
              />
              <div className="relative z-10 p-1">
                <div className="flex items-start justify-between gap-1">
                  <p className="text-[10px] font-bold leading-none">
                    {tile.index}
                  </p>
                </div>
                {!isIconOnlyTile ? (
                  <p className="mt-0.5 line-clamp-2 min-h-[1.7rem] pr-0.5 text-[9px] font-semibold leading-tight">
                    {tile.name}
                  </p>
                ) : null}

                {ownership?.houses ? (
                  <div className="mt-1 flex justify-start pr-4">
                    <HousesDots houses={ownership.houses} size="sm" />
                  </div>
                ) : null}
              </div>

              {ownership ? (
                <div className="pointer-events-none absolute bottom-1 right-1 z-30">
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
            </article>
          );
        })}
      </div>
    </div>
  );
}
