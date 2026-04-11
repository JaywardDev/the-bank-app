import { NextResponse } from "next/server";
import type { BoardPackEconomy } from "@/lib/boardPacks";

type AuctionActionRequest = {
  action?: string;
  amount?: number;
  tileIndex?: number;
};

type GameStateRow = {
  auction_active: boolean | null;
  auction_tile_index: number | null;
  auction_passed_player_ids: string[] | null;
  auction_turn_player_id: string | null;
  auction_turn_ends_at: string | null;
  auction_current_bid: number | null;
  auction_current_winner_player_id: string | null;
  auction_eligible_player_ids: string[] | null;
  auction_min_increment: number | null;
  balances: Record<string, number> | null;
};

type PlayerRow = {
  id: string;
  display_name: string | null;
  is_eliminated: boolean;
};

type SupabaseUser = {
  id: string;
};

type RuleConfig = {
  auctionEnabled: boolean;
  auctionAllowInitiatorToBid: boolean;
  auctionTurnSeconds: number;
};

type AuctionTimeoutProgressResult = {
  eligiblePlayerIds: string[];
  passedPlayerIds: Set<string>;
  currentBid: number;
  currentWinnerId: string | null;
  turnPlayerId: string | null;
  turnEndsAt: Date | null;
  minIncrement: number;
  timeoutEvents: Array<{
    event_type: string;
    payload: Record<string, unknown>;
  }>;
};

type HandleAuctionActionParams = {
  auctionAction: "START_AUCTION" | null;
  body: AuctionActionRequest;
  gameState: GameStateRow;
  players: PlayerRow[];
  currentUserPlayer: PlayerRow;
  currentPlayer: PlayerRow;
  gameId: string;
  currentVersion: number;
  rules: RuleConfig;
  boardPack: unknown;
  boardPackEconomy: BoardPackEconomy;
  startingCash: number;
  user: SupabaseUser;
  fetchFromSupabaseWithService: <T>(path: string, options: RequestInit) => Promise<T | null>;
  emitGameEvents: (
    gameId: string,
    startVersion: number,
    events: Array<{ event_type: string; payload: Record<string, unknown> }>,
    actorUserId: string,
  ) => Promise<void>;
  loadOwnershipByTile: (
    gameId: string,
  ) => Promise<Record<number, { owner_player_id: string | null }>>;
  assignPropertyOwnership: (params: {
    gameId: string;
    tileIndex: number;
    ownerPlayerId: string;
  }) => Promise<{ ok: boolean; alreadyOwned?: boolean; errorText?: string }>;
  maybeUnlockCommunicationUtility: (params: {
    gameState: unknown;
    boardPack: unknown;
    ownershipByTile: Record<number, { owner_player_id: string | null }>;
    events: Array<{ event_type: string; payload: Record<string, unknown> }>;
  }) => Record<string, unknown> | null;
  normalizePlayerIdArray: (value: unknown) => string[];
  getNextEligibleAuctionPlayerId: (
    players: Array<{ id: string; is_eliminated: boolean }>,
    startingPlayerId: string | null,
    eligibleIds: string[],
    passedIds: Set<string>,
  ) => string | null;
  advanceAuctionForExpiredTurns: (params: {
    gameState: unknown;
    players: Array<{ id: string; is_eliminated: boolean }>;
    rules: unknown;
    boardPackEconomy: BoardPackEconomy;
    now: Date;
  }) => AuctionTimeoutProgressResult;
  startAuctionEvents: Array<{ event_type: string; payload: Record<string, unknown> }> | null;
  startAuctionTileIndex: number | null;
  advanceTurnAfterAuctionSkipped:
    | ((params: {
        extraEvents: Array<{ event_type: string; payload: Record<string, unknown> }>;
      }) => Promise<NextResponse>)
    | null;
  isAuctionAction: boolean;
};

export const handleAuctionAction = async ({
  auctionAction,
  body,
  gameState,
  players,
  currentUserPlayer,
  currentPlayer,
  gameId,
  currentVersion,
  rules,
  boardPack,
  boardPackEconomy,
  startingCash,
  user,
  fetchFromSupabaseWithService,
  emitGameEvents,
  loadOwnershipByTile,
  assignPropertyOwnership,
  maybeUnlockCommunicationUtility,
  normalizePlayerIdArray,
  getNextEligibleAuctionPlayerId,
  advanceAuctionForExpiredTurns,
  startAuctionEvents,
  startAuctionTileIndex,
  advanceTurnAfterAuctionSkipped,
  isAuctionAction,
}: HandleAuctionActionParams): Promise<NextResponse | null> => {
  if (auctionAction === "START_AUCTION") {
    if (!startAuctionEvents || !Number.isInteger(startAuctionTileIndex)) {
      return null;
    }

    const activePlayers = players.filter((player) => !player.is_eliminated);
    const eligiblePlayers = rules.auctionAllowInitiatorToBid
      ? activePlayers
      : activePlayers.filter((player) => player.id !== currentPlayer.id);
    const eligibleIds = eligiblePlayers.map((player) => player.id);

    if (eligibleIds.length <= 1) {
      startAuctionEvents.push({
        event_type: "AUCTION_SKIPPED",
        payload: {
          tile_index: startAuctionTileIndex,
        },
      });

      if (!advanceTurnAfterAuctionSkipped) {
        return null;
      }

      return await advanceTurnAfterAuctionSkipped({
        extraEvents: startAuctionEvents,
      });
    }

    const nextTurnPlayerId = getNextEligibleAuctionPlayerId(
      players,
      currentPlayer.id,
      eligibleIds,
      new Set(),
    );

    if (!nextTurnPlayerId) {
      return NextResponse.json(
        { error: "Unable to start auction." },
        { status: 409 },
      );
    }

    startAuctionEvents.push({
      event_type: "AUCTION_STARTED",
      payload: {
        tile_index: startAuctionTileIndex,
        min_increment: boardPackEconomy.auctionMinIncrement ?? 10,
      },
    });

    const finalVersion = currentVersion + startAuctionEvents.length;
    const [updatedState] =
      (await fetchFromSupabaseWithService<GameStateRow[]>(
        `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            version: finalVersion,
            pending_action: null,
            turn_phase: "AUCTION",
            auction_active: true,
            auction_tile_index: startAuctionTileIndex,
            auction_initiator_player_id: currentPlayer.id,
            auction_current_bid: 0,
            auction_current_winner_player_id: null,
            auction_turn_player_id: nextTurnPlayerId,
            auction_turn_ends_at: new Date(
              Date.now() + rules.auctionTurnSeconds * 1000,
            ).toISOString(),
            auction_eligible_player_ids: eligibleIds,
            auction_passed_player_ids: [],
            auction_min_increment: boardPackEconomy.auctionMinIncrement ?? 10,
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

    await emitGameEvents(gameId, currentVersion + 1, startAuctionEvents, user.id);

    return NextResponse.json({ gameState: updatedState });
  }

  if (!isAuctionAction) {
    return null;
  }

  if (!gameState.auction_active) {
    return NextResponse.json(
      { error: "No auction is active." },
      { status: 409 },
    );
  }

  const auctionTileIndex = gameState.auction_tile_index;
  if (!Number.isInteger(auctionTileIndex)) {
    return NextResponse.json(
      { error: "Auction tile is missing." },
      { status: 409 },
    );
  }

  const now = new Date();
  const {
    eligiblePlayerIds,
    passedPlayerIds,
    currentBid: normalizedCurrentBid,
    currentWinnerId: normalizedCurrentWinnerId,
    turnPlayerId: normalizedTurnPlayerId,
    turnEndsAt: normalizedTurnEndsAt,
    minIncrement,
    timeoutEvents,
  } = advanceAuctionForExpiredTurns({
    gameState,
    players,
    rules,
    boardPackEconomy,
    now,
  });
  if (eligiblePlayerIds.length === 0) {
    return NextResponse.json(
      { error: "Auction has no eligible bidders." },
      { status: 409 },
    );
  }

  let currentBid = normalizedCurrentBid;
  let currentWinnerId = normalizedCurrentWinnerId;
  let turnPlayerId = normalizedTurnPlayerId;
  let turnEndsAt = normalizedTurnEndsAt;
  const auctionEvents: Array<{
    event_type: string;
    payload: Record<string, unknown>;
  }> = [...timeoutEvents];

  const advanceTurn = (fromPlayerId: string | null) =>
    getNextEligibleAuctionPlayerId(
      players,
      fromPlayerId,
      eligiblePlayerIds,
      passedPlayerIds,
    );

  const allEligiblePassed = eligiblePlayerIds.every((id) =>
    passedPlayerIds.has(id),
  );
  const allOthersPassed =
    Boolean(currentWinnerId) &&
    eligiblePlayerIds
      .filter((id) => id !== currentWinnerId)
      .every((id) => passedPlayerIds.has(id));

  const finalizeAuction = async ({
    winnerId,
    amount,
    skipped,
  }: {
    winnerId: string | null;
    amount: number;
    skipped: boolean;
  }) => {
    const events = [...auctionEvents];
    if (winnerId && !skipped) {
      events.push({
        event_type: "AUCTION_WON",
        payload: {
          tile_index: auctionTileIndex,
          winner_id: winnerId,
          amount,
        },
      });
      events.push({
        event_type: "CASH_DEBIT",
        payload: {
          player_id: winnerId,
          amount,
          reason: "AUCTION_WON",
          tile_index: auctionTileIndex,
          source_event_type: "AUCTION_WON",
        },
      });
    } else if (skipped) {
      events.push({
        event_type: "AUCTION_SKIPPED",
        payload: {
          tile_index: auctionTileIndex,
          reason: "NO_BIDS",
        },
      });
    }

    const finalVersion = currentVersion + events.length;
    const patchPayload: Record<string, unknown> = {
      version: finalVersion,
      auction_active: false,
      auction_tile_index: null,
      auction_initiator_player_id: null,
      auction_current_bid: 0,
      auction_current_winner_player_id: null,
      auction_turn_player_id: null,
      auction_turn_ends_at: null,
      auction_eligible_player_ids: [],
      auction_passed_player_ids: [],
      auction_min_increment: boardPackEconomy.auctionMinIncrement ?? 10,
      turn_phase: "AWAITING_ROLL",
      pending_action: null,
      updated_at: new Date().toISOString(),
    };

    let updatedBalances = gameState.balances ?? {};
    if (!skipped && !winnerId) {
      return NextResponse.json(
        { error: "Auction winner is missing." },
        { status: 400 },
      );
    }

    if (winnerId && !skipped) {
      if (auctionTileIndex == null) {
        return NextResponse.json(
          { error: "Auction tile is missing." },
          { status: 400 },
        );
      }

      const currentBalance =
        updatedBalances[winnerId] ?? startingCash;
      updatedBalances = {
        ...updatedBalances,
        [winnerId]: currentBalance - amount,
      };
      patchPayload.balances = updatedBalances;

      const ownershipResult = await assignPropertyOwnership({
        gameId,
        tileIndex: auctionTileIndex,
        ownerPlayerId: winnerId,
      });

      if (!ownershipResult.ok) {
        if (ownershipResult.alreadyOwned) {
          return NextResponse.json(
            { error: "Property already owned." },
            { status: 409 },
          );
        }

        return NextResponse.json(
          {
            error:
              ownershipResult.errorText ||
              "Unable to record auction ownership.",
          },
          { status: 500 },
        );
      }

      const refreshedOwnershipByTile = await loadOwnershipByTile(gameId);
      patchPayload.rules = maybeUnlockCommunicationUtility({
        gameState,
        boardPack,
        ownershipByTile: refreshedOwnershipByTile,
        events,
      });
    }

    const [updatedState] = (await fetchFromSupabaseWithService<
      GameStateRow[]
    >(`game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`, {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(patchPayload),
    })) ?? [];

    if (!updatedState) {
      return NextResponse.json(
        { error: "Version mismatch." },
        { status: 409 },
      );
    }

    if (events.length > 0) {
      await emitGameEvents(gameId, currentVersion + 1, events, user.id);
    }

    return NextResponse.json({ gameState: updatedState });
  };

  if (currentWinnerId && allOthersPassed) {
    return await finalizeAuction({
      winnerId: currentWinnerId,
      amount: currentBid,
      skipped: false,
    });
  }

  if (!currentWinnerId && allEligiblePassed) {
    return await finalizeAuction({
      winnerId: null,
      amount: 0,
      skipped: true,
    });
  }

  if (turnPlayerId !== currentUserPlayer.id) {
    const nextPassedIds = Array.from(passedPlayerIds);
    const existingPassedIds = normalizePlayerIdArray(
      gameState.auction_passed_player_ids,
    );
    const shouldUpdateState =
      auctionEvents.length > 0 ||
      turnPlayerId !== gameState.auction_turn_player_id ||
      nextPassedIds.length !== existingPassedIds.length;

    if (shouldUpdateState) {
      const stateOnlyMutationCount = auctionEvents.length === 0 ? 1 : 0;
      const finalVersion =
        currentVersion + auctionEvents.length + stateOnlyMutationCount;
      const [updatedState] = (await fetchFromSupabaseWithService<
        GameStateRow[]
      >(`game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`, {
        method: "PATCH",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          version: finalVersion,
          auction_turn_player_id: turnPlayerId,
          auction_turn_ends_at: turnEndsAt
            ? turnEndsAt.toISOString()
            : null,
          auction_passed_player_ids: nextPassedIds,
          auction_eligible_player_ids: eligiblePlayerIds,
          auction_current_bid: currentBid,
          auction_current_winner_player_id: currentWinnerId,
          auction_min_increment: minIncrement,
          updated_at: new Date().toISOString(),
        }),
      })) ?? [];

      if (updatedState && auctionEvents.length > 0) {
        await emitGameEvents(
          gameId,
          currentVersion + 1,
          auctionEvents,
          user.id,
        );
      }
    }

    return NextResponse.json(
      { error: "Auction turn advanced. Sync to continue." },
      { status: 409 },
    );
  }

  if (body.action === "AUCTION_BID") {
    const amount = body.amount;
    if (typeof amount !== "number" || Number.isNaN(amount)) {
      return NextResponse.json(
        { error: "Invalid bid amount." },
        { status: 400 },
      );
    }

    const minBid = currentBid === 0 ? minIncrement : currentBid + minIncrement;
    if (amount < minBid) {
      return NextResponse.json(
        { error: `Bid must be at least $${minBid}.` },
        { status: 409 },
      );
    }

    const balances = gameState.balances ?? {};
    const currentBalance =
      balances[currentUserPlayer.id] ?? startingCash;
    if (amount > currentBalance) {
      return NextResponse.json(
        { error: "Insufficient cash for that bid." },
        { status: 409 },
      );
    }

    currentBid = amount;
    currentWinnerId = currentUserPlayer.id;
    auctionEvents.push({
      event_type: "AUCTION_BID",
      payload: {
        tile_index: auctionTileIndex,
        player_id: currentUserPlayer.id,
        amount,
      },
    });

    turnPlayerId = advanceTurn(turnPlayerId);
    turnEndsAt = turnPlayerId
      ? new Date(now.getTime() + rules.auctionTurnSeconds * 1000)
      : null;
  }

  if (body.action === "AUCTION_PASS") {
    passedPlayerIds.add(currentUserPlayer.id);
    auctionEvents.push({
      event_type: "AUCTION_PASS",
      payload: {
        tile_index: auctionTileIndex,
        player_id: currentUserPlayer.id,
      },
    });
    turnPlayerId = advanceTurn(turnPlayerId);
    turnEndsAt = turnPlayerId
      ? new Date(now.getTime() + rules.auctionTurnSeconds * 1000)
      : null;
  }

  const finalAllOthersPassed =
    Boolean(currentWinnerId) &&
    eligiblePlayerIds
      .filter((id) => id !== currentWinnerId)
      .every((id) => passedPlayerIds.has(id));
  const finalAllPassed = eligiblePlayerIds.every((id) =>
    passedPlayerIds.has(id),
  );

  if (currentWinnerId && finalAllOthersPassed) {
    return await finalizeAuction({
      winnerId: currentWinnerId,
      amount: currentBid,
      skipped: false,
    });
  }

  if (!currentWinnerId && finalAllPassed) {
    return await finalizeAuction({
      winnerId: null,
      amount: 0,
      skipped: true,
    });
  }

  const finalVersion = currentVersion + auctionEvents.length;
  const [updatedState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
    `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        version: finalVersion,
        auction_turn_player_id: turnPlayerId,
        auction_turn_ends_at: turnEndsAt ? turnEndsAt.toISOString() : null,
        auction_passed_player_ids: Array.from(passedPlayerIds),
        auction_eligible_player_ids: eligiblePlayerIds,
        auction_current_bid: currentBid,
        auction_current_winner_player_id: currentWinnerId,
        auction_min_increment: minIncrement,
        turn_phase: "AUCTION",
        pending_action: null,
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

  if (auctionEvents.length > 0) {
    await emitGameEvents(
      gameId,
      currentVersion + 1,
      auctionEvents,
      user.id,
    );
  }

  return NextResponse.json({ gameState: updatedState });
};
