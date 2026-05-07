import "server-only";

import type { BoardTile } from "@/lib/boardPacks";
import type { OwnershipRow } from "../types";

export type SetOwnershipStatus = {
  setTiles: BoardTile[];
  ownedByAi: BoardTile[];
  ownsAny: boolean;
  ownsNone: boolean;
  completes: boolean;
};

export const isOwnableTile = (tile: BoardTile | null | undefined): tile is BoardTile =>
  tile?.type === "PROPERTY" || tile?.type === "RAIL" || tile?.type === "UTILITY";

export const getSetGroupKey = (tile: BoardTile | null | undefined): string | null => {
  if (!isOwnableTile(tile)) return null;
  if (tile.type === "PROPERTY") return tile.colorGroup ? `color:${tile.colorGroup}` : null;
  if (tile.type === "RAIL") return "rail";
  if (tile.type === "UTILITY") return "utility";
  return null;
};

export const getSetTiles = (boardTiles: BoardTile[], tile: BoardTile | null | undefined) => {
  const key = getSetGroupKey(tile);
  if (!key) return [];
  return boardTiles.filter((candidate) => getSetGroupKey(candidate) === key);
};

export const getOwnershipByTile = (ownershipRows: OwnershipRow[]) =>
  ownershipRows.reduce<Record<number, OwnershipRow>>((acc, row) => {
    if (row.owner_player_id) acc[row.tile_index] = row;
    return acc;
  }, {});

export const getSetOwnershipStatus = ({
  boardTiles,
  ownershipRows,
  playerId,
  tile,
}: {
  boardTiles: BoardTile[];
  ownershipRows: OwnershipRow[];
  playerId: string;
  tile: BoardTile;
}): SetOwnershipStatus => {
  const ownershipByTile = getOwnershipByTile(ownershipRows);
  const setTiles = getSetTiles(boardTiles, tile);
  const ownedByAi = setTiles.filter((setTile) => ownershipByTile[setTile.index]?.owner_player_id === playerId);
  const targetOwned = ownershipByTile[tile.index]?.owner_player_id === playerId;
  const ownedCountAfterTarget = ownedByAi.length + (targetOwned ? 0 : 1);
  const completes = setTiles.length > 0 && ownedCountAfterTarget >= setTiles.length;
  return {
    setTiles,
    ownedByAi,
    ownsAny: ownedByAi.length > 0,
    ownsNone: ownedByAi.length === 0,
    completes,
  };
};

export const wouldCompleteSet = (status: SetOwnershipStatus) => status.completes;

export const isCompletedSet = ({
  boardTiles,
  ownershipRows,
  playerId,
  tile,
}: {
  boardTiles: BoardTile[];
  ownershipRows: OwnershipRow[];
  playerId: string;
  tile: BoardTile;
}) => {
  const ownershipByTile = getOwnershipByTile(ownershipRows);
  const setTiles = getSetTiles(boardTiles, tile);
  return setTiles.length > 0 && setTiles.every((setTile) => ownershipByTile[setTile.index]?.owner_player_id === playerId);
};

export const isInTargetSet = (candidate: BoardTile, targetStatus: SetOwnershipStatus) =>
  targetStatus.setTiles.some((targetSetTile) => targetSetTile.index === candidate.index);
