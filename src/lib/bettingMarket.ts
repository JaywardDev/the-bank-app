export type BettingMarketBetKind =
  | "TOTAL"
  | "PARITY"
  | "COMBINATION_ANY_ORDER"
  | "COMBINATION_EXACT_ORDER";

export type BettingMarketParity = "EVEN" | "ODD";

export type BettingMarketBetSelection =
  | { total: number }
  | { parity: BettingMarketParity }
  | { die1: number; die2: number };

export type BettingMarketBet = {
  id: string;
  player_id: string;
  target_roll_seq: number;
  kind: BettingMarketBetKind;
  stake: number;
  selection: BettingMarketBetSelection;
  created_at: string;
};

export type BettingMarketState = {
  next_roll_seq: number;
  bets: BettingMarketBet[];
  total_stake_by_player: Record<string, number>;
  last_resolution?: {
    roll_seq: number;
    dice: [number, number];
    resolved_bet_count: number;
    winner_count: number;
    resolved_at: string;
  };
};

export type BettingMarketSettlementEvent = {
  event_type: "CASH_CREDIT" | "BETTING_MARKET_BET_WON";
  payload: Record<string, unknown>;
};

export const settleBettingMarketForRoll = ({
  bettingMarketState,
  balances,
  playersById,
  dice,
}: {
  bettingMarketState: unknown;
  balances: Record<string, number>;
  playersById: Record<string, { display_name: string | null } | undefined>;
  dice: [number, number];
}): {
  bettingMarketState: BettingMarketState;
  balances: Record<string, number>;
  balancesChanged: boolean;
  events: BettingMarketSettlementEvent[];
} => {
  const [dieOne, dieTwo] = dice;
  const normalizedBettingState = normalizeBettingMarketState(bettingMarketState);
  const qualifyingRollSeq = normalizedBettingState.next_roll_seq;
  const betsForThisRoll = normalizedBettingState.bets.filter(
    (bet) => bet.target_roll_seq === qualifyingRollSeq,
  );
  const futureBets = normalizedBettingState.bets.filter(
    (bet) => bet.target_roll_seq !== qualifyingRollSeq,
  );
  const nextBettingTotals = futureBets.reduce<Record<string, number>>((acc, bet) => {
    acc[bet.player_id] = (acc[bet.player_id] ?? 0) + bet.stake;
    return acc;
  }, {});

  let updatedBalances = balances;
  let balancesChanged = false;
  const events: BettingMarketSettlementEvent[] = [];

  for (const bet of betsForThisRoll) {
    if (!doesBetWin(bet.kind, bet.selection, [dieOne, dieTwo])) {
      continue;
    }
    const multiplier = getBetPayoutMultiplier(bet.kind, bet.selection);
    const payout = Math.floor(bet.stake * multiplier);
    const winnerBalance = updatedBalances[bet.player_id] ?? 0;
    updatedBalances = {
      ...updatedBalances,
      [bet.player_id]: winnerBalance + payout,
    };
    balancesChanged = true;
    events.push({
      event_type: "CASH_CREDIT",
      payload: {
        player_id: bet.player_id,
        amount: payout,
        bet_id: bet.id,
        reason: "BETTING_MARKET_BET_PAYOUT",
        source_event_type: "BETTING_MARKET_BET_WON",
      },
    });
    events.push({
      event_type: "BETTING_MARKET_BET_WON",
      payload: {
        player_id: bet.player_id,
        player_name: playersById[bet.player_id]?.display_name ?? "Player",
        bet_id: bet.id,
        kind: bet.kind,
        selection: bet.selection,
        bet_label: formatBetLabel(bet.kind, bet.selection),
        target_roll_seq: qualifyingRollSeq,
      },
    });
  }

  return {
    bettingMarketState: {
      ...normalizedBettingState,
      next_roll_seq: qualifyingRollSeq + 1,
      bets: futureBets,
      total_stake_by_player: nextBettingTotals,
      last_resolution: {
        roll_seq: qualifyingRollSeq,
        dice: [dieOne, dieTwo],
        resolved_bet_count: betsForThisRoll.length,
        winner_count: events.filter((event) => event.event_type === "BETTING_MARKET_BET_WON")
          .length,
        resolved_at: new Date().toISOString(),
      },
    },
    balances: updatedBalances,
    balancesChanged,
    events,
  };
};

export const DEFAULT_BETTING_MARKET_STATE: BettingMarketState = {
  next_roll_seq: 1,
  bets: [],
  total_stake_by_player: {},
};

export const normalizeBettingMarketState = (
  value: unknown,
): BettingMarketState => {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_BETTING_MARKET_STATE };
  }
  const record = value as Record<string, unknown>;
  const nextRollSeq =
    typeof record.next_roll_seq === "number" &&
    Number.isInteger(record.next_roll_seq) &&
    record.next_roll_seq > 0
      ? record.next_roll_seq
      : DEFAULT_BETTING_MARKET_STATE.next_roll_seq;
  const bets = Array.isArray(record.bets)
    ? (record.bets.filter((entry): entry is BettingMarketBet => {
        if (!entry || typeof entry !== "object") {
          return false;
        }
        const bet = entry as Record<string, unknown>;
        return (
          typeof bet.id === "string" &&
          typeof bet.player_id === "string" &&
          typeof bet.target_roll_seq === "number" &&
          typeof bet.kind === "string" &&
          typeof bet.stake === "number" &&
          typeof bet.selection === "object" &&
          bet.selection !== null &&
          typeof bet.created_at === "string"
        );
      }) as BettingMarketBet[])
    : [];
  const totalStakeByPlayerRaw =
    record.total_stake_by_player && typeof record.total_stake_by_player === "object"
      ? (record.total_stake_by_player as Record<string, unknown>)
      : {};
  const totalStakeByPlayer = Object.entries(totalStakeByPlayerRaw).reduce<
    Record<string, number>
  >((acc, [playerId, total]) => {
    if (typeof total === "number" && Number.isFinite(total) && total >= 0) {
      acc[playerId] = Math.floor(total);
    }
    return acc;
  }, {});

  const normalized: BettingMarketState = {
    next_roll_seq: nextRollSeq,
    bets,
    total_stake_by_player: totalStakeByPlayer,
  };

  if (record.last_resolution && typeof record.last_resolution === "object") {
    const summary = record.last_resolution as Record<string, unknown>;
    if (
      typeof summary.roll_seq === "number" &&
      Array.isArray(summary.dice) &&
      summary.dice.length === 2 &&
      typeof summary.dice[0] === "number" &&
      typeof summary.dice[1] === "number" &&
      typeof summary.resolved_bet_count === "number" &&
      typeof summary.winner_count === "number" &&
      typeof summary.resolved_at === "string"
    ) {
      normalized.last_resolution = {
        roll_seq: summary.roll_seq,
        dice: [summary.dice[0], summary.dice[1]],
        resolved_bet_count: summary.resolved_bet_count,
        winner_count: summary.winner_count,
        resolved_at: summary.resolved_at,
      };
    }
  }

  return normalized;
};

export const validateBetSelection = (
  kind: BettingMarketBetKind,
  selection: unknown,
): { ok: true; value: BettingMarketBetSelection } | { ok: false; error: string } => {
  if (!selection || typeof selection !== "object") {
    return { ok: false, error: "Invalid bet selection." };
  }
  const record = selection as Record<string, unknown>;
  if (kind === "TOTAL") {
    const total = typeof record.total === "number" ? record.total : Number.NaN;
    if (!Number.isInteger(total) || total < 2 || total > 12) {
      return { ok: false, error: "Total bet must be between 2 and 12." };
    }
    return { ok: true, value: { total } };
  }
  if (kind === "PARITY") {
    const parity = typeof record.parity === "string" ? record.parity.toUpperCase() : "";
    if (parity !== "EVEN" && parity !== "ODD") {
      return { ok: false, error: "Parity bet must be EVEN or ODD." };
    }
    return { ok: true, value: { parity } };
  }

  const die1 = typeof record.die1 === "number" ? record.die1 : Number.NaN;
  const die2 = typeof record.die2 === "number" ? record.die2 : Number.NaN;
  if (!Number.isInteger(die1) || die1 < 1 || die1 > 6 || !Number.isInteger(die2) || die2 < 1 || die2 > 6) {
    return { ok: false, error: "Combination bet dice must both be between 1 and 6." };
  }
  return { ok: true, value: { die1, die2 } };
};

export const getBetPayoutMultiplier = (
  kind: BettingMarketBetKind,
  selection: BettingMarketBetSelection,
): number => {
  if (kind === "TOTAL" && "total" in selection) {
    const total = selection.total;
    if (total === 2 || total === 12) return 30;
    if (total === 3 || total === 11) return 15;
    if (total === 4 || total === 10) return 10;
    if (total === 5 || total === 9) return 6;
    if (total === 6 || total === 8) return 4;
    return 3;
  }
  if (kind === "PARITY") {
    return 1.8;
  }
  if (kind === "COMBINATION_ANY_ORDER") {
    return 10;
  }
  return 12;
};

export const doesBetWin = (
  kind: BettingMarketBetKind,
  selection: BettingMarketBetSelection,
  dice: [number, number],
): boolean => {
  const [die1, die2] = dice;
  if (kind === "TOTAL" && "total" in selection) {
    return die1 + die2 === selection.total;
  }
  if (kind === "PARITY" && "parity" in selection) {
    const total = die1 + die2;
    return selection.parity === "EVEN" ? total % 2 === 0 : total % 2 === 1;
  }
  if ("die1" in selection && "die2" in selection) {
    if (kind === "COMBINATION_ANY_ORDER") {
      return (
        (die1 === selection.die1 && die2 === selection.die2) ||
        (die1 === selection.die2 && die2 === selection.die1)
      );
    }
    return die1 === selection.die1 && die2 === selection.die2;
  }
  return false;
};

export const formatBetLabel = (
  kind: BettingMarketBetKind,
  selection: BettingMarketBetSelection,
): string => {
  if (kind === "TOTAL" && "total" in selection) {
    return `total ${selection.total}`;
  }
  if (kind === "PARITY" && "parity" in selection) {
    return selection.parity.toLowerCase();
  }
  if ("die1" in selection && "die2" in selection) {
    if (kind === "COMBINATION_EXACT_ORDER") {
      return `${selection.die1} then ${selection.die2}`;
    }
    return `${selection.die1} and ${selection.die2}`;
  }
  return "dice";
};
