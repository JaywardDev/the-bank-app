import type { BoardPackEconomy, BoardTile, BoardTileType } from "@/lib/boardPacks";
import { normalizeRentByHousesTiers } from "@/lib/developmentCosts";
import { getUtilityRentMultiplierForOwnedCount } from "@/lib/rent";
import type { MacroEffectsV1 } from "@/lib/macroDeckV1";

export type AuthoritativeRentOwnershipEntry = {
  owner_player_id: string;
  collateral_loan_id: string | null;
  purchase_mortgage_id: string | null;
  houses: number;
};

export type AuthoritativeRentOwnershipByTile = Record<number, AuthoritativeRentOwnershipEntry>;

export type AuthoritativeRentActiveMacroEffectV1 = {
  id: string;
  name: string;
  effects: MacroEffectsV1;
  roundsRemaining: number;
  roundsApplied: number;
};

type RentTile = BoardTile & {
  index: number;
  tile_id: string;
  type: BoardTileType;
  name: string;
};

export const countOwnedTilesByTypeForRent = (
  boardTiles: RentTile[],
  ownershipByTile: AuthoritativeRentOwnershipByTile,
  ownerId: string,
  tileType: string,
) =>
  boardTiles.filter(
    (tile) =>
      tile.type === tileType &&
      ownershipByTile[tile.index]?.owner_player_id === ownerId,
  ).length;

export const ownsFullColorSetForRent = (
  tile: RentTile,
  boardTiles: RentTile[],
  ownershipByTile: AuthoritativeRentOwnershipByTile,
  ownerId: string,
) => {
  if (tile.type !== "PROPERTY" || !tile.colorGroup) {
    return false;
  }
  const groupTiles = boardTiles.filter(
    (entry) =>
      entry.type === "PROPERTY" && entry.colorGroup === tile.colorGroup,
  );
  if (groupTiles.length === 0) {
    return false;
  }
  return groupTiles.every(
    (entry) => ownershipByTile[entry.index]?.owner_player_id === ownerId,
  );
};

export const getPropertyRentWithDevForRent = (
  tile: RentTile,
  dev: number,
) => {
  const rentByHouses = normalizeRentByHousesTiers(tile.rentByHouses);
  if (!rentByHouses || rentByHouses.length === 0) {
    return tile.baseRent ?? 0;
  }
  const normalizedDev = Number.isFinite(dev) ? Math.max(0, Math.floor(dev)) : 0;
  if (normalizedDev <= rentByHouses.length - 1) {
    return rentByHouses[normalizedDev] ?? tile.baseRent ?? 0;
  }
  return rentByHouses[rentByHouses.length - 1] ?? tile.baseRent ?? 0;
};

const getMacroRentMultiplierV1 = (activeEffects: AuthoritativeRentActiveMacroEffectV1[]) =>
  activeEffects.reduce((product, effect) => {
    const multiplier = effect.effects.rent_multiplier;
    if (typeof multiplier === "number") {
      return product * multiplier;
    }
    return product;
  }, 1);

const getMacroRailRentMultiplierV1 = (activeEffects: AuthoritativeRentActiveMacroEffectV1[]) =>
  activeEffects.reduce((product, effect) => {
    const multiplier = effect.effects.rail_rent_multiplier;
    if (typeof multiplier === "number") {
      return product * multiplier;
    }
    return product;
  }, 1);

const getMacroUtilityRentBonusPctPerHouseV1 = (
  activeEffects: AuthoritativeRentActiveMacroEffectV1[],
) =>
  activeEffects.reduce((total, effect) => {
    const bonus = effect.effects.utility_rent_bonus_per_house_pct;
    if (typeof bonus === "number") {
      return total + bonus;
    }
    return total;
  }, 0);

const getMacroRentMultiplierForColorGroupV1 = (
  activeEffects: AuthoritativeRentActiveMacroEffectV1[],
  colorGroup?: string | null,
) => {
  if (!colorGroup) {
    return 1;
  }
  const normalizedColorGroup = colorGroup.toLowerCase();
  return activeEffects.reduce((product, effect) => {
    const byGroup = effect.effects.rent_multiplier_by_color_group;
    if (!byGroup) {
      return product;
    }
    const entry = byGroup[normalizedColorGroup];
    return typeof entry === "number" ? product * entry : product;
  }, 1);
};

export const calculateAuthoritativeRent = ({
  tile,
  ownerId,
  currentPlayerId,
  allowOwnerAsPayer = false,
  boardTiles,
  ownershipByTile,
  diceTotal,
  activeMacroEffects,
  boardPackEconomy,
}: {
  tile: RentTile;
  ownerId: string | null;
  currentPlayerId: string | null;
  allowOwnerAsPayer?: boolean;
  boardTiles: RentTile[];
  ownershipByTile: AuthoritativeRentOwnershipByTile;
  diceTotal?: number | null;
  activeMacroEffects: AuthoritativeRentActiveMacroEffectV1[];
  boardPackEconomy: BoardPackEconomy;
}) => {
  if (!ownerId || (!allowOwnerAsPayer && ownerId === currentPlayerId)) {
    return { amount: 0, meta: null as Record<string, unknown> | null };
  }

  const rentMultiplier = getMacroRentMultiplierV1(activeMacroEffects);
  const railMultiplier = getMacroRailRentMultiplierV1(activeMacroEffects);
  const utilityBonusPctPerHouse = getMacroUtilityRentBonusPctPerHouseV1(
    activeMacroEffects,
  );
  const macroMeta =
    rentMultiplier !== 1 || railMultiplier !== 1 || utilityBonusPctPerHouse !== 0
      ? {
          rent_multiplier: rentMultiplier,
          rail_rent_multiplier: railMultiplier,
          utility_rent_bonus_per_house_pct: utilityBonusPctPerHouse,
        }
      : null;

  if (tile.type === "RAIL") {
    const railCount = countOwnedTilesByTypeForRent(
      boardTiles,
      ownershipByTile,
      ownerId,
      "RAIL",
    );
    const baseAmount = boardPackEconomy.railRentByCount[railCount] ?? 0;
    const amount = Math.round(baseAmount * rentMultiplier * railMultiplier);
    return {
      amount,
      meta: {
        rent_type: "RAIL",
        railroads_owned: railCount,
        base_rent: baseAmount,
        ...(macroMeta ?? {}),
      },
    };
  }

  if (tile.type === "UTILITY") {
    const utilityCount = countOwnedTilesByTypeForRent(
      boardTiles,
      ownershipByTile,
      ownerId,
      "UTILITY",
    );
    const multiplier = getUtilityRentMultiplierForOwnedCount(
      utilityCount,
      boardPackEconomy.utilityRentMultipliers,
    );
    const total = diceTotal ?? 0;
    const utilityBaseAmount = boardPackEconomy.utilityBaseAmount ?? 1;
    const baseAmount = multiplier * total * utilityBaseAmount;
    const totalHousesOwned = Object.values(ownershipByTile).reduce(
      (sum, ownership) =>
        ownership.owner_player_id === ownerId ? sum + ownership.houses : sum,
      0,
    );
    const utilityBonusMultiplier =
      1 + utilityBonusPctPerHouse * totalHousesOwned;
    const amount = Math.round(
      baseAmount * rentMultiplier * utilityBonusMultiplier,
    );
    return {
      amount,
      meta: {
        rent_type: "UTILITY",
        utilities_owned: utilityCount,
        dice_total: total,
        multiplier,
        base_rent: baseAmount,
        utility_bonus_multiplier: utilityBonusMultiplier,
        utility_houses_owned: totalHousesOwned,
        ...(macroMeta ?? {}),
      },
    };
  }

  if (tile.type === "PROPERTY") {
    const dev = ownershipByTile[tile.index]?.houses ?? 0;
    const amount = getPropertyRentWithDevForRent(tile, dev);
    const hasMonopolyNoDev =
      dev === 0 && ownsFullColorSetForRent(tile, boardTiles, ownershipByTile, ownerId);
    const baseNoHouseRent = tile.rentByHouses?.[0] ?? tile.baseRent ?? 0;
    const monopolyAdjustedAmount = hasMonopolyNoDev
      ? baseNoHouseRent * 2
      : amount;
    const colorGroupMultiplier = getMacroRentMultiplierForColorGroupV1(
      activeMacroEffects,
      tile.colorGroup,
    );
    const finalAmount = Math.round(
      monopolyAdjustedAmount * rentMultiplier * colorGroupMultiplier,
    );
    return {
      amount: finalAmount,
      meta: {
        rent_type: "PROPERTY",
        houses: dev,
        base_rent: monopolyAdjustedAmount,
        monopoly_applied: hasMonopolyNoDev,
        color_group_multiplier: colorGroupMultiplier,
        ...(macroMeta ?? {}),
      },
    };
  }

  const amount = tile.baseRent ?? 0;
  return {
    amount: Math.round(amount * rentMultiplier),
    meta: {
      rent_type: "PROPERTY",
      base_rent: amount,
      ...(macroMeta ?? {}),
    },
  };
};
