import type { BoardTile } from "@/lib/boardPacks";
import { normalizeInlandCellRecords } from "@/lib/inlandExploration";

export const COMMUNICATION_UTILITY_UNLOCK_TILE_INDEX = 20;

export type RuntimeUnlocks = {
  communicationUtilityUnlocked: boolean;
};

const DEFAULT_RUNTIME_UNLOCKS: RuntimeUnlocks = {
  communicationUtilityUnlocked: false,
};

export const getRuntimeUnlocksFromRules = (rules: unknown): RuntimeUnlocks => {
  if (!rules || typeof rules !== "object") {
    return DEFAULT_RUNTIME_UNLOCKS;
  }

  const runtimeUnlocks = (rules as { runtime_unlocks?: unknown }).runtime_unlocks;
  if (!runtimeUnlocks || typeof runtimeUnlocks !== "object") {
    return DEFAULT_RUNTIME_UNLOCKS;
  }

  return {
    communicationUtilityUnlocked:
      (runtimeUnlocks as { communication_utility_unlocked?: unknown })
        .communication_utility_unlocked === true,
  };
};

export const mergeCommunicationUnlockIntoRules = (rules: unknown) => {
  const baseRules = rules && typeof rules === "object" ? { ...(rules as Record<string, unknown>) } : {};
  const existingRuntimeUnlocks =
    baseRules.runtime_unlocks && typeof baseRules.runtime_unlocks === "object"
      ? { ...(baseRules.runtime_unlocks as Record<string, unknown>) }
      : {};

  return {
    ...baseRules,
    runtime_unlocks: {
      ...existingRuntimeUnlocks,
      communication_utility_unlocked: true,
    },
  };
};

const hasOwnedUtilityKind = (
  boardTiles: BoardTile[],
  ownershipByTile: Record<number, { owner_player_id: string }>,
  utilityKind: "ELECTRIC" | "WATER",
) =>
  boardTiles.some(
    (tile) =>
      tile.type === "UTILITY" &&
      tile.utilityKind === utilityKind &&
      Boolean(ownershipByTile[tile.index]?.owner_player_id),
  );

export const shouldUnlockCommunicationUtility = ({
  alreadyUnlocked,
  boardTiles,
  ownershipByTile,
  inlandExploredCells,
}: {
  alreadyUnlocked: boolean;
  boardTiles: BoardTile[];
  ownershipByTile: Record<number, { owner_player_id: string }>;
  inlandExploredCells: unknown;
}) => {
  if (alreadyUnlocked) {
    return false;
  }

  const electricOwned = hasOwnedUtilityKind(boardTiles, ownershipByTile, "ELECTRIC");
  const waterOwned = hasOwnedUtilityKind(boardTiles, ownershipByTile, "WATER");
  if (!electricOwned || !waterOwned) {
    return false;
  }

  const inlandCells = normalizeInlandCellRecords(inlandExploredCells);
  let hasOilRefinery = false;
  let hasWaterReservoir = false;

  for (const inlandCell of inlandCells.values()) {
    if (inlandCell.status !== "DEVELOPED_SITE") {
      continue;
    }
    if (inlandCell.developedSiteType === "OIL") {
      hasOilRefinery = true;
    }
    if (inlandCell.developedSiteType === "DEEP_WELL") {
      hasWaterReservoir = true;
    }
    if (hasOilRefinery && hasWaterReservoir) {
      return true;
    }
  }

  return false;
};
