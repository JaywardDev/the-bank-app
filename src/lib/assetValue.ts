export type TileAssetValueInput = {
  index: number;
  price?: number | null;
};

export const getTileAssetValue = (
  tile: TileAssetValueInput | null | undefined,
  _ownership?: { owner_player_id?: string | null } | null,
): number => {
  void _ownership;
  if (!tile) {
    return 0;
  }
  return typeof tile.price === "number" ? tile.price : 0;
};

export const computeOwnedAssetValue = (
  ownedTiles: TileAssetValueInput[],
): number => {
  return ownedTiles.reduce((total, tile) => total + getTileAssetValue(tile), 0);
};

export const computeTaxableAssetValueForLuxuryTax = (
  ownedTiles: TileAssetValueInput[],
  collateralizedTileIdsOrFlags: Iterable<number>,
): number => {
  const collateralizedTileIds = new Set(collateralizedTileIdsOrFlags);
  return ownedTiles.reduce((total, tile) => {
    if (collateralizedTileIds.has(tile.index)) {
      return total;
    }
    return total + getTileAssetValue(tile);
  }, 0);
};
