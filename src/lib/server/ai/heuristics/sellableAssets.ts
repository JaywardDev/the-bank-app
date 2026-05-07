import "server-only";

import type { BoardTile } from "@/lib/boardPacks";
import { isPropertySaleLocked } from "@/lib/propertySaleLock";
import type { OwnershipRow } from "../types";
import {
  getOwnershipByTile,
  getSetTiles,
  isCompletedSet,
  isInTargetSet,
  isOwnableTile,
  type SetOwnershipStatus,
} from "../helpers/ownership";

export const getWeakSellableAssets = ({
  boardTiles,
  ownershipRows,
  playerId,
  targetStatus,
  roundsElapsed,
}: {
  boardTiles: BoardTile[];
  ownershipRows: OwnershipRow[];
  playerId: string;
  targetStatus: SetOwnershipStatus;
  roundsElapsed: number;
}) => {
  const ownershipByTile = getOwnershipByTile(ownershipRows);
  return boardTiles
    .filter(isOwnableTile)
    .filter((tile) => {
      const ownership = ownershipByTile[tile.index];
      if (!ownership || ownership.owner_player_id !== playerId) return false;
      if (isInTargetSet(tile, targetStatus)) return false;
      if (isCompletedSet({ boardTiles, ownershipRows, playerId, tile })) return false;
      if ((ownership.houses ?? 0) !== 0) return false;
      if (ownership.collateral_loan_id || ownership.purchase_mortgage_id) return false;
      if (isPropertySaleLocked(ownership.acquired_round, roundsElapsed)) return false;
      const candidateSetTiles = getSetTiles(boardTiles, tile);
      const ownedInCandidateSet = candidateSetTiles.filter(
        (setTile) => ownershipByTile[setTile.index]?.owner_player_id === playerId,
      );
      return ownedInCandidateSet.length === 1;
    })
    .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
};
