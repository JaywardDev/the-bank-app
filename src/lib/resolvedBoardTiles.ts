import type { BoardPack, BoardTile } from "@/lib/boardPacks";
import {
  COMMUNICATION_UTILITY_UNLOCK_TILE_INDEX,
  getRuntimeUnlocksFromRules,
} from "@/lib/runtimeUnlocks";

const getCommunicationUtilityPrice = (tiles: BoardTile[]) =>
  tiles.find((tile) => tile.type === "UTILITY" && typeof tile.price === "number")
    ?.price;

export const resolveBoardTilesForGame = ({
  boardPack,
  communicationUtilityUnlocked,
}: {
  boardPack: BoardPack | null | undefined;
  communicationUtilityUnlocked: boolean;
}): BoardTile[] => {
  const baseTiles = boardPack?.tiles ?? [];
  if (!communicationUtilityUnlocked) {
    return baseTiles;
  }

  const communicationPrice = getCommunicationUtilityPrice(baseTiles);

  return baseTiles.map((tile) => {
    if (
      tile.index !== COMMUNICATION_UTILITY_UNLOCK_TILE_INDEX ||
      tile.type !== "FREE_PARKING"
    ) {
      return tile;
    }

    return {
      ...tile,
      tile_id: "communication-network",
      type: "UTILITY",
      utilityKind: "COMMUNICATION",
      name: "Communications Network",
      price: communicationPrice,
      baseRent: undefined,
      taxAmount: undefined,
      colorGroup: undefined,
      houseCost: undefined,
      rentByHouses: undefined,
    };
  });
};

export const resolveBoardTilesForRules = ({
  boardPack,
  rules,
}: {
  boardPack: BoardPack | null | undefined;
  rules: unknown;
}) => {
  const unlocks = getRuntimeUnlocksFromRules(rules);
  return resolveBoardTilesForGame({
    boardPack,
    communicationUtilityUnlocked: unlocks.communicationUtilityUnlocked,
  });
};
