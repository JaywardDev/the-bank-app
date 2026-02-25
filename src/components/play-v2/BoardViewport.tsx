"use client";

import { useMemo, useState } from "react";
import { DEFAULT_BOARD_PACK_ECONOMY } from "@/lib/boardPacks";
import BoardSquare from "@/app/components/BoardSquare";
import BoardTrack from "@/app/components/BoardTrack";
import { getBoardPackById, type BoardTile } from "@/lib/boardPacks";

type BoardViewportPlayer = {
  id: string;
  display_name: string;
  position: number | null;
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

type BoardViewportProps = {
  boardPackId: string | null;
  players: BoardViewportPlayer[];
  ownershipByTile: OwnershipByTile;
  currentPlayerId: string | null;
  selectedTileIndex: number | null;
  onSelectTileIndex: (tileIndex: number) => void;
};

const playerColors = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#a855f7",
  "#f59e0b",
  "#06b6d4",
];

const fallbackTile = (index: number): BoardTile => ({
  index,
  tile_id: `tile-${index}`,
  type: index === 0 ? "START" : "PROPERTY",
  name: `Tile ${index}`,
});

const getTileTypeLabel = (tileType: string) => {
  switch (tileType) {
    case "COMMUNITY_CHEST":
      return "Community Chest";
    case "FREE_PARKING":
      return "Free Parking";
    case "GO_TO_JAIL":
      return "Go To Jail";
    case "RAIL":
      return "Railroad";
    default:
      return tileType[0] + tileType.slice(1).toLowerCase();
  }
};

type PressedTileTooltip = {
  tileIndex: number;
  tileRect: DOMRect;
};

export default function BoardViewport({
  boardPackId,
  players,
  ownershipByTile,
  currentPlayerId,
  selectedTileIndex,
  onSelectTileIndex,
}: BoardViewportProps) {
  const boardPack = useMemo(() => getBoardPackById(boardPackId), [boardPackId]);
  const boardTiles = useMemo(() => boardPack?.tiles ?? [], [boardPack]);
  const boardEconomy = boardPack?.economy ?? DEFAULT_BOARD_PACK_ECONOMY;
  const [pressedTileTooltip, setPressedTileTooltip] = useState<PressedTileTooltip | null>(null);

  const boardPlayers = useMemo(
    () =>
      players.map((player) => ({
        id: player.id,
        display_name: player.display_name,
        position: Number.isFinite(player.position) ? Number(player.position) : 0,
      })),
    [players],
  );

  const playerColorsById = useMemo(
    () =>
      players.reduce<Record<string, string>>((acc, player, index) => {
        acc[player.id] = playerColors[index % playerColors.length];
        return acc;
      }, {}),
    [players],
  );

  const tooltipTile = useMemo(() => {
    if (!pressedTileTooltip) {
      return null;
    }
    return (
      boardTiles.find((tile) => tile.index === pressedTileTooltip.tileIndex) ??
      fallbackTile(pressedTileTooltip.tileIndex)
    );
  }, [boardTiles, pressedTileTooltip]);

  const ownerLabel = useMemo(() => {
    if (!pressedTileTooltip) {
      return "—";
    }
    const ownerId = ownershipByTile[pressedTileTooltip.tileIndex]?.owner_player_id;
    if (!ownerId) {
      return "Unowned";
    }
    return players.find((player) => player.id === ownerId)?.display_name ?? "Player";
  }, [ownershipByTile, players, pressedTileTooltip]);

  const tooltipPosition = useMemo(() => {
    if (!pressedTileTooltip || typeof window === "undefined") {
      return null;
    }
    const spacing = 8;
    const tooltipWidth = 220;
    const tooltipHeight = 132;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const { tileRect } = pressedTileTooltip;
    const rightPreferred = tileRect.right + spacing;
    const leftFallback = tileRect.left - tooltipWidth - spacing;
    const left = rightPreferred + tooltipWidth <= viewportWidth - spacing
      ? rightPreferred
      : Math.max(spacing, leftFallback);
    const unclampedTop = tileRect.top + tileRect.height / 2 - tooltipHeight / 2;
    const top = Math.max(spacing, Math.min(unclampedTop, viewportHeight - tooltipHeight - spacing));

    return { left, top };
  }, [pressedTileTooltip]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[url('/icons/board.svg')] bg-cover bg-center bg-no-repeat">
      <div className="flex h-full w-full items-center justify-center p-1">
        <div className="relative aspect-square w-full max-h-full max-w-full">
          <BoardSquare variant="viewport">
            <BoardTrack
              tiles={boardTiles}
              economy={boardEconomy}
              players={boardPlayers}
              ownershipByTile={ownershipByTile}
              playerColorsById={playerColorsById}
              currentPlayerId={currentPlayerId}
              selectedTileIndex={selectedTileIndex}
              onTileClick={onSelectTileIndex}
              onTilePointerDown={(tileIndex, tileRect) => {
                setPressedTileTooltip({ tileIndex, tileRect });
                onSelectTileIndex(tileIndex);
              }}
              onTilePointerRelease={() => setPressedTileTooltip(null)}
            />
          </BoardSquare>
        </div>
      </div>

      {tooltipTile && tooltipPosition ? (
        <section
          className="pointer-events-none fixed z-40 w-[220px] rounded-lg border border-white/20 bg-neutral-950 p-3 text-xs text-white shadow-2xl"
          style={{ left: tooltipPosition.left, top: tooltipPosition.top }}
        >
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">Tile {tooltipTile.index}</p>
          <p className="mt-1 text-sm font-semibold text-white">{tooltipTile.name}</p>
          <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-2 gap-y-1 text-white/85">
            <dt className="text-white/60">Type</dt>
            <dd>{getTileTypeLabel(tooltipTile.type)}</dd>
            <dt className="text-white/60">Price</dt>
            <dd>{typeof tooltipTile.price === "number" ? `$${tooltipTile.price}` : "—"}</dd>
            <dt className="text-white/60">Owner</dt>
            <dd>{ownerLabel}</dd>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
