import type { BoardPackEconomy, BoardTile, BoardTileType } from "@/lib/boardPacks";
import {
  calculateAuthoritativeRent,
  type AuthoritativeRentActiveMacroEffectV1,
  type AuthoritativeRentOwnershipByTile,
} from "@/lib/server/authoritativeRent";

export const ECONOMIC_BOOM_INTERVAL_ROUNDS = 10;
export const ECONOMIC_BOOM_DRAWS = 6;
export const ECONOMIC_BOOM_PAYOUT_RATE = 0.5;
export const ECONOMIC_BOOM_UTILITY_RENT_BASIS_ROLL = 7;
export const ECONOMIC_BOOM_PROPERTY_WEIGHTS = [1, 2, 4, 7, 11, 16] as const;
export const ECONOMIC_BOOM_RAIL_WEIGHT = 2;
export const ECONOMIC_BOOM_UTILITY_WEIGHT = 2;

const ECONOMIC_BOOM_ELIGIBLE_TYPES = new Set<BoardTileType>([
  "PROPERTY",
  "RAIL",
  "UTILITY",
]);

type BoomTile = BoardTile & {
  index: number;
  tile_id: string;
  type: BoardTileType;
  name: string;
};

type BoomPlayer = {
  id: string;
  display_name: string | null;
  is_eliminated: boolean;
};

export type EconomicBoomEvent = {
  event_type: string;
  payload: Record<string, unknown>;
};

type EconomicBoomCandidate = {
  tile: BoomTile;
  owner: BoomPlayer;
  ownerId: string;
  weight: number;
};

const hashStringToUint32 = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const getEconomicBoomPropertyWeight = (developmentLevel: number) => {
  const normalizedLevel = Number.isFinite(developmentLevel)
    ? Math.max(0, Math.floor(developmentLevel))
    : 0;
  const cappedLevel = Math.min(
    normalizedLevel,
    ECONOMIC_BOOM_PROPERTY_WEIGHTS.length - 1,
  );
  return ECONOMIC_BOOM_PROPERTY_WEIGHTS[cappedLevel];
};

export const getEconomicBoomTileWeight = (
  tile: BoomTile,
  ownershipByTile: AuthoritativeRentOwnershipByTile,
) => {
  if (tile.type === "PROPERTY") {
    return getEconomicBoomPropertyWeight(ownershipByTile[tile.index]?.houses ?? 0);
  }
  if (tile.type === "RAIL") {
    return ECONOMIC_BOOM_RAIL_WEIGHT;
  }
  if (tile.type === "UTILITY") {
    return ECONOMIC_BOOM_UTILITY_WEIGHT;
  }
  return 0;
};

export const isEconomicBoomEligibleTile = ({
  tile,
  ownershipByTile,
  playersById,
}: {
  tile: BoomTile;
  ownershipByTile: AuthoritativeRentOwnershipByTile;
  playersById: Map<string, BoomPlayer>;
}) => {
  if (!ECONOMIC_BOOM_ELIGIBLE_TYPES.has(tile.type)) {
    return false;
  }
  const ownership = ownershipByTile[tile.index];
  if (!ownership?.owner_player_id) {
    return false;
  }
  if (ownership.collateral_loan_id) {
    return false;
  }
  const owner = playersById.get(ownership.owner_player_id);
  return Boolean(owner && !owner.is_eliminated);
};

export const weightedDrawWithoutReplacement = <T extends { weight: number }>({
  candidates,
  drawCount,
  seedKey,
}: {
  candidates: T[];
  drawCount: number;
  seedKey: string;
}) => {
  const rng = mulberry32(hashStringToUint32(seedKey));
  const remaining = [...candidates];
  const selected: T[] = [];
  const limit = Math.min(Math.max(0, drawCount), remaining.length);

  for (let draw = 0; draw < limit; draw += 1) {
    const totalWeight = remaining.reduce(
      (total, candidate) => total + Math.max(0, candidate.weight),
      0,
    );
    if (totalWeight <= 0) {
      break;
    }
    let threshold = rng() * totalWeight;
    const selectedIndex = remaining.findIndex((candidate) => {
      threshold -= Math.max(0, candidate.weight);
      return threshold < 0;
    });
    const [candidate] = remaining.splice(
      selectedIndex >= 0 ? selectedIndex : remaining.length - 1,
      1,
    );
    selected.push(candidate);
  }

  return selected;
};

export const shouldTriggerEconomicBoomSeason = ({
  tableRoundAdvanced,
  nextRound,
  lastEconomicBoomRound,
  isGameOver,
}: {
  tableRoundAdvanced: boolean;
  nextRound: number;
  lastEconomicBoomRound: number | null;
  isGameOver: boolean;
}) =>
  tableRoundAdvanced &&
  !isGameOver &&
  nextRound > 0 &&
  nextRound % ECONOMIC_BOOM_INTERVAL_ROUNDS === 0 &&
  lastEconomicBoomRound !== nextRound;

export const buildEconomicBoomSeason = ({
  gameId,
  round,
  boardTiles,
  ownershipByTile,
  players,
  balances,
  activeMacroEffects,
  boardPackEconomy,
}: {
  gameId: string;
  round: number;
  boardTiles: BoomTile[];
  ownershipByTile: AuthoritativeRentOwnershipByTile;
  players: BoomPlayer[];
  balances: Record<string, number>;
  activeMacroEffects: AuthoritativeRentActiveMacroEffectV1[];
  boardPackEconomy: BoardPackEconomy;
}) => {
  const boomId = `economic-boom:${gameId}:${round}`;
  const seedKey = `${boomId}:weighted-attraction`;
  const playersById = new Map(players.map((player) => [player.id, player]));
  const candidates = boardTiles
    .filter((tile) => isEconomicBoomEligibleTile({ tile, ownershipByTile, playersById }))
    .map((tile): EconomicBoomCandidate | null => {
      const ownership = ownershipByTile[tile.index];
      const owner = ownership ? playersById.get(ownership.owner_player_id) : null;
      if (!ownership || !owner) {
        return null;
      }
      return {
        tile,
        owner,
        ownerId: ownership.owner_player_id,
        weight: getEconomicBoomTileWeight(tile, ownershipByTile),
      };
    })
    .filter((candidate): candidate is EconomicBoomCandidate =>
      Boolean(candidate && candidate.weight > 0),
    );

  const selected = weightedDrawWithoutReplacement({
    candidates,
    drawCount: ECONOMIC_BOOM_DRAWS,
    seedKey,
  });

  let updatedBalances = { ...balances };
  const events: EconomicBoomEvent[] = [
    {
      event_type: "ECONOMIC_BOOM_STARTED",
      payload: {
        boom_id: boomId,
        round,
        interval_rounds: ECONOMIC_BOOM_INTERVAL_ROUNDS,
        total_draws_requested: ECONOMIC_BOOM_DRAWS,
        eligible_tile_count: candidates.length,
        selected_tile_count: selected.length,
        payout_rate: ECONOMIC_BOOM_PAYOUT_RATE,
        utility_rent_basis_roll: ECONOMIC_BOOM_UTILITY_RENT_BASIS_ROLL,
        seed_key: seedKey,
      },
    },
  ];

  selected.forEach((candidate, index) => {
    const rentResult = calculateAuthoritativeRent({
      tile: candidate.tile,
      ownerId: candidate.ownerId,
      currentPlayerId: candidate.ownerId,
      allowOwnerAsPayer: true,
      boardTiles,
      ownershipByTile,
      diceTotal:
        candidate.tile.type === "UTILITY"
          ? ECONOMIC_BOOM_UTILITY_RENT_BASIS_ROLL
          : null,
      activeMacroEffects,
      boardPackEconomy,
    });
    const rentBasis = rentResult.amount;
    const payoutAmount = Math.round(rentBasis * ECONOMIC_BOOM_PAYOUT_RATE);
    const ownership = ownershipByTile[candidate.tile.index];
    updatedBalances = {
      ...updatedBalances,
      [candidate.ownerId]: (updatedBalances[candidate.ownerId] ?? 0) + payoutAmount,
    };

    const revenuePayload = {
      boom_id: boomId,
      round,
      draw_number: index + 1,
      total_draws: selected.length,
      tile_index: candidate.tile.index,
      tile_id: candidate.tile.tile_id,
      tile_name: candidate.tile.name,
      tile_type: candidate.tile.type,
      owner_player_id: candidate.ownerId,
      owner_player_name: candidate.owner.display_name,
      weight: candidate.weight,
      rent_basis: rentBasis,
      rent_basis_meta: rentResult.meta,
      payout_amount: payoutAmount,
      payout_rate: ECONOMIC_BOOM_PAYOUT_RATE,
      ...(candidate.tile.type === "UTILITY"
        ? { utility_rent_basis_roll: ECONOMIC_BOOM_UTILITY_RENT_BASIS_ROLL }
        : {}),
      collateral_loan_id: null,
      purchase_mortgage_id: ownership?.purchase_mortgage_id ?? null,
      narrative_variant: `consumer-demand-${(index % 3) + 1}`,
    };

    events.push(
      {
        event_type: "ECONOMIC_BOOM_REVENUE",
        payload: revenuePayload,
      },
      {
        event_type: "CASH_CREDIT",
        payload: {
          player_id: candidate.ownerId,
          amount: payoutAmount,
          reason: "ECONOMIC_BOOM_REVENUE",
          tile_index: candidate.tile.index,
          source_event_type: "ECONOMIC_BOOM_REVENUE",
          boom_id: boomId,
          round,
        },
      },
    );
  });

  return {
    boomId,
    seedKey,
    events,
    balances: updatedBalances,
    balancesChanged: selected.length > 0,
    selectedTileIndexes: selected.map((entry) => entry.tile.index),
    eligibleTileCount: candidates.length,
  };
};
