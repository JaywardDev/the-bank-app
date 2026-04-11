import { NextResponse } from "next/server";
import type { BoardPackEconomy } from "@/lib/boardPacks";
import {
  formatBetLabel,
  normalizeBettingMarketState,
  validateBetSelection,
  type BettingMarketBet,
  type BettingMarketBetKind,
} from "@/lib/bettingMarket";

type BettingActionRequest = {
  action?: string;
  kind?: BettingMarketBetKind;
  stake?: number;
  selection?: Record<string, unknown>;
  betId?: string;
};

type GameStateRow = {
  balances: Record<string, number> | null;
  betting_market_state: Record<string, unknown> | null;
};

type PlayerRow = {
  id: string;
  display_name: string | null;
};

type SupabaseUser = {
  id: string;
};

type HandleBettingActionParams = {
  body: BettingActionRequest;
  boardPackEconomy: BoardPackEconomy;
  gameState: GameStateRow;
  gameId: string;
  currentVersion: number;
  currentUserPlayer: PlayerRow;
  user: SupabaseUser;
  fetchFromSupabaseWithService: <T>(path: string, options: RequestInit) => Promise<T | null>;
  emitGameEvents: (
    gameId: string,
    startVersion: number,
    events: Array<{ event_type: string; payload: Record<string, unknown> }>,
    actorUserId: string,
  ) => Promise<void>;
};

export const handleBettingAction = async ({
  body,
  boardPackEconomy,
  gameState,
  gameId,
  currentVersion,
  currentUserPlayer,
  user,
  fetchFromSupabaseWithService,
  emitGameEvents,
}: HandleBettingActionParams): Promise<NextResponse | null> => {
  if (body.action === "PLACE_BETTING_MARKET_BET") {
    const bettingConfig = boardPackEconomy.bettingMarket;
    if (!bettingConfig) {
      return NextResponse.json(
        { error: "Betting market is not enabled for this board pack." },
        { status: 409 },
      );
    }

    const kind = body.kind;
    const stakeRaw = body.stake;
    if (!Number.isInteger(stakeRaw) || stakeRaw <= 0) {
      return NextResponse.json(
        { error: "Stake must be a positive integer." },
        { status: 400 },
      );
    }
    const stake = stakeRaw;
    if (stake < bettingConfig.minStakePerBet) {
      return NextResponse.json(
        { error: "Stake is below board minimum." },
        { status: 400 },
      );
    }

    const selectionResult = validateBetSelection(kind, body.selection);
    if (!selectionResult.ok) {
      return NextResponse.json(
        { error: selectionResult.error },
        { status: 400 },
      );
    }

    const balances = gameState.balances ?? {};
    const currentCash = balances[currentUserPlayer.id] ?? 0;
    if (currentCash < stake) {
      return NextResponse.json(
        { error: "Insufficient cash to place this bet." },
        { status: 409 },
      );
    }

    const bettingState = normalizeBettingMarketState(gameState.betting_market_state);
    const targetRollSeq = bettingState.next_roll_seq;
    const currentStakeForRoll = bettingState.bets
      .filter(
        (bet) =>
          bet.player_id === currentUserPlayer.id &&
          bet.target_roll_seq === targetRollSeq,
      )
      .reduce((sum, bet) => sum + bet.stake, 0);
    if (currentStakeForRoll + stake > bettingConfig.maxTotalStakePerRoll) {
      return NextResponse.json(
        { error: "Total stake limit for the next roll exceeded." },
        { status: 409 },
      );
    }

    const bet: BettingMarketBet = {
      id: crypto.randomUUID(),
      player_id: currentUserPlayer.id,
      target_roll_seq: targetRollSeq,
      kind,
      stake,
      selection: selectionResult.value,
      created_at: new Date().toISOString(),
    };
    const nextBets = [...bettingState.bets, bet];
    const nextBettingState = {
      ...bettingState,
      bets: nextBets,
      total_stake_by_player: {
        ...bettingState.total_stake_by_player,
        [currentUserPlayer.id]: currentStakeForRoll + stake,
      },
    };
    const nextBalances = {
      ...balances,
      [currentUserPlayer.id]: currentCash - stake,
    };

    const eventPayload = {
      player_id: currentUserPlayer.id,
      player_name: currentUserPlayer.display_name,
      bet_id: bet.id,
      kind: bet.kind,
      selection: bet.selection,
      bet_label: formatBetLabel(bet.kind, bet.selection),
      target_roll_seq: targetRollSeq,
    } satisfies Record<string, unknown>;
    const finalVersion = currentVersion + 2;
    const [updatedState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
      `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          version: finalVersion,
          balances: nextBalances,
          betting_market_state: nextBettingState,
          updated_at: new Date().toISOString(),
        }),
      },
    )) ?? [];
    if (!updatedState) {
      return NextResponse.json(
        { error: "Version mismatch." },
        { status: 409 },
      );
    }

    await emitGameEvents(
      gameId,
      currentVersion + 1,
      [
        {
          event_type: "CASH_DEBIT",
          payload: {
            player_id: currentUserPlayer.id,
            amount: stake,
            reason: "BETTING_MARKET_BET_PLACED",
            bet_id: bet.id,
            source_event_type: "BETTING_MARKET_BET_PLACED",
          },
        },
        {
          event_type: "BETTING_MARKET_BET_PLACED",
          payload: eventPayload,
        },
      ],
      user.id,
    );

    return NextResponse.json({ gameState: updatedState });
  }

  if (body.action === "CANCEL_BETTING_MARKET_BET") {
    const betId = body.betId;
    if (!betId || typeof betId !== "string") {
      return NextResponse.json(
        { error: "betId is required." },
        { status: 400 },
      );
    }
    const bettingState = normalizeBettingMarketState(gameState.betting_market_state);
    const bet = bettingState.bets.find((entry) => entry.id === betId);
    if (!bet) {
      return NextResponse.json(
        { error: "Bet not found." },
        { status: 404 },
      );
    }
    if (bet.player_id !== currentUserPlayer.id) {
      return NextResponse.json(
        { error: "You can only cancel your own bet." },
        { status: 403 },
      );
    }
    if (bet.target_roll_seq !== bettingState.next_roll_seq) {
      return NextResponse.json(
        { error: "Bet can no longer be canceled." },
        { status: 409 },
      );
    }

    const nextBets = bettingState.bets.filter((entry) => entry.id !== bet.id);
    const nextStakeForPlayer = nextBets
      .filter(
        (entry) =>
          entry.player_id === currentUserPlayer.id &&
          entry.target_roll_seq === bettingState.next_roll_seq,
      )
      .reduce((sum, entry) => sum + entry.stake, 0);
    const nextTotalStakeByPlayer = { ...bettingState.total_stake_by_player };
    if (nextStakeForPlayer > 0) {
      nextTotalStakeByPlayer[currentUserPlayer.id] = nextStakeForPlayer;
    } else {
      delete nextTotalStakeByPlayer[currentUserPlayer.id];
    }
    const nextBettingState = {
      ...bettingState,
      bets: nextBets,
      total_stake_by_player: nextTotalStakeByPlayer,
    };
    const balances = gameState.balances ?? {};
    const currentCash = balances[currentUserPlayer.id] ?? 0;
    const nextBalances = {
      ...balances,
      [currentUserPlayer.id]: currentCash + bet.stake,
    };
    const finalVersion = currentVersion + 1;
    const [updatedState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
      `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          version: finalVersion,
          balances: nextBalances,
          betting_market_state: nextBettingState,
          updated_at: new Date().toISOString(),
        }),
      },
    )) ?? [];
    if (!updatedState) {
      return NextResponse.json(
        { error: "Version mismatch." },
        { status: 409 },
      );
    }

    await emitGameEvents(
      gameId,
      currentVersion + 1,
      [
        {
          event_type: "CASH_CREDIT",
          payload: {
            player_id: currentUserPlayer.id,
            amount: bet.stake,
            reason: "BETTING_MARKET_BET_CANCELED",
            bet_id: bet.id,
            source_event_type: "BETTING_MARKET_BET_CANCELED",
          },
        },
      ],
      user.id,
    );

    return NextResponse.json({ gameState: updatedState });
  }

  return null;
};
