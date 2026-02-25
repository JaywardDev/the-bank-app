"use client";

import { useMemo } from "react";
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

  const selectedTile = useMemo(() => {
    if (selectedTileIndex === null) {
      return null;
    }
    return boardTiles.find((tile) => tile.index === selectedTileIndex) ?? fallbackTile(selectedTileIndex);
  }, [boardTiles, selectedTileIndex]);

  const ownerLabel = useMemo(() => {
    if (selectedTileIndex === null) {
      return "—";
    }
    const ownerId = ownershipByTile[selectedTileIndex]?.owner_player_id;
    if (!ownerId) {
      return "Unowned";
    }
    return players.find((player) => player.id === ownerId)?.display_name ?? "Player";
  }, [ownershipByTile, players, selectedTileIndex]);

  return (
    <div className="relative h-full w-full">
      <BoardSquare>
        <BoardTrack
          tiles={boardTiles}
          economy={boardEconomy}
          players={boardPlayers}
          ownershipByTile={ownershipByTile}
          playerColorsById={playerColorsById}
          currentPlayerId={currentPlayerId}
          selectedTileIndex={selectedTileIndex}
          onTileClick={onSelectTileIndex}
        />
      </BoardSquare>

      {selectedTile ? (
        <section className="pointer-events-none absolute bottom-4 left-4 z-20 w-[min(90vw,320px)] rounded-xl border border-white/20 bg-black/70 p-3 text-xs text-white shadow-2xl backdrop-blur-md">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">Tile {selectedTile.index}</p>
          <p className="mt-1 text-base font-semibold text-white">{selectedTile.name}</p>
          <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-2 gap-y-1 text-white/85">
            <dt className="text-white/60">Type</dt>
            <dd>{getTileTypeLabel(selectedTile.type)}</dd>
            <dt className="text-white/60">Price</dt>
            <dd>{typeof selectedTile.price === "number" ? `$${selectedTile.price}` : "—"}</dd>
            <dt className="text-white/60">Owner</dt>
            <dd>{ownerLabel}</dd>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
