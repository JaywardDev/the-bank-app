import type { BoardTile } from "@/lib/boardPacks";

const isRailroadTile = (tile: BoardTile) => {
  const tileLabel = `${tile.tile_id} ${tile.name}`.toLowerCase();
  return (
    tileLabel.includes("railroad") ||
    tileLabel.includes("station") ||
    tileLabel.includes("short line") ||
    tileLabel.includes("short-line")
  );
};

const getTaxTileIconSrc = (tile: BoardTile) => {
  const normalizedTileId = tile.tile_id.toLowerCase();
  if (normalizedTileId === "super-tax") {
    return "/icons/luxury_tax.svg";
  }
  if (normalizedTileId === "income-tax") {
    return "/icons/income_tax.svg";
  }

  const tileLabel = `${tile.tile_id} ${tile.name}`.toLowerCase();
  if (tileLabel.includes("luxury")) {
    return "/icons/luxury_tax.svg";
  }

  return "/icons/income_tax.svg";
};

export const getBoardTileIconSrc = (tile: BoardTile | null): string | null => {
  if (!tile) {
    return null;
  }

  if (isRailroadTile(tile)) {
    return "/icons/railroad.svg";
  }

  if (tile.type === "UTILITY") {
    const tileLabel = `${tile.tile_id} ${tile.name}`.toLowerCase();
    if (tileLabel.includes("electric")) {
      return "/icons/electricity.svg";
    }
    return "/icons/water_facility.svg";
  }

  if (tile.type === "START") {
    return "/icons/go.svg";
  }

  if (tile.type === "GO_TO_JAIL") {
    return "/icons/go_to_jail.svg";
  }

  if (tile.type === "FREE_PARKING") {
    return "/icons/free_parking.svg";
  }

  if (tile.type === "JAIL") {
    return "/icons/jail.svg";
  }

  if (tile.type === "CHANCE") {
    return "/icons/chance.svg";
  }

  if (tile.type === "COMMUNITY_CHEST") {
    return "/icons/community_chest.svg";
  }

  if (tile.type === "TAX") {
    return getTaxTileIconSrc(tile);
  }

  if (tile.type === "EVENT") {
    const tileLabel = `${tile.tile_id} ${tile.name}`.toLowerCase();
    if (tileLabel.includes("chance")) {
      return "/icons/chance.svg";
    }
    if (tileLabel.includes("community")) {
      return "/icons/community_chest.svg";
    }
  }

  return null;
};
