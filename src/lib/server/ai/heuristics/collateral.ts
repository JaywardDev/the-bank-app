import "server-only";

import type { BoardTile } from "@/lib/boardPacks";
import type { OwnershipRow } from "../types";
import {
  getOwnershipByTile,
  isCompletedSet,
  isInTargetSet,
  isOwnableTile,
  type SetOwnershipStatus,
} from "../helpers/ownership";

export const getCollateralCandidates = ({
  boardTiles,
  ownershipRows,
  playerId,
  targetTile,
  targetStatus,
}: {
  boardTiles: BoardTile[];
  ownershipRows: OwnershipRow[];
  playerId: string;
  targetTile: BoardTile;
  targetStatus: SetOwnershipStatus;
}) => {
  const ownershipByTile = getOwnershipByTile(ownershipRows);
  return boardTiles
    .filter(isOwnableTile)
    .filter((tile) => {
      const ownership = ownershipByTile[tile.index];
      if (!ownership || ownership.owner_player_id !== playerId) return false;
      if (tile.index === targetTile.index || isInTargetSet(tile, targetStatus)) return false;
      if (isCompletedSet({ boardTiles, ownershipRows, playerId, tile })) return false;
      if ((ownership.houses ?? 0) !== 0) return false;
      if (ownership.collateral_loan_id || ownership.purchase_mortgage_id) return false;
      return true;
    })
    .sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
};
