import { NextResponse } from "next/server";

type TradeActionRequest = {
  action?: string;
  counterpartyPlayerId?: string;
  offerCash?: number;
  offerFreeBuildTokens?: number;
  offerFreeUpgradeTokens?: number;
  offerTiles?: number[];
  requestCash?: number;
  requestFreeBuildTokens?: number;
  requestFreeUpgradeTokens?: number;
  requestTiles?: number[];
  tradeId?: string;
};

type PlayerRow = {
  id: string;
  user_id: string;
  display_name: string | null;
  free_build_tokens?: number;
  free_upgrade_tokens?: number;
};

type GameStateRow = {
  balances: Record<string, number> | null;
  rules: Record<string, unknown> | null;
};

type OwnershipRow = {
  tile_index: number;
  owner_player_id: string | null;
  collateral_loan_id: string | null;
  purchase_mortgage_id: string | null;
  houses: number | null;
};

type TradeSnapshotTile = {
  tile_index: number;
  collateral_loan_id: string | null;
  purchase_mortgage_id: string | null;
  houses: number;
};

type TradeProposalRow = {
  id: string;
  game_id: string;
  proposer_player_id: string;
  counterparty_player_id: string;
  offer_cash: number;
  offer_free_build_tokens: number;
  offer_free_upgrade_tokens: number;
  offer_tile_indices: number[];
  request_cash: number;
  request_free_build_tokens: number;
  request_free_upgrade_tokens: number;
  request_tile_indices: number[];
  snapshot: TradeSnapshotTile[] | { tiles: TradeSnapshotTile[] } | null;
  status: string;
  created_at: string | null;
};

type AcceptTradeAtomicResult = {
  status: "ACCEPTED" | "REJECTED";
  rejection_reason: string | null;
};

type OwnershipByTile = Record<number, { owner_player_id: string | null }>;

type HandleTradeActionParams<
  TGameState extends GameStateRow,
  TOwnershipByTile extends OwnershipByTile,
  TBoardPack,
> = {
  body: TradeActionRequest;
  gameId: string;
  gameState: TGameState;
  players: PlayerRow[];
  currentUserPlayer: PlayerRow;
  currentVersion: number;
  user: { id: string };
  boardPack: TBoardPack;
  fetchFromSupabaseWithService: <T>(path: string, options: RequestInit) => Promise<T | null>;
  emitGameEvents: (
    gameId: string,
    startVersion: number,
    events: Array<{ event_type: string; payload: Record<string, unknown> }>,
    actorUserId: string,
  ) => Promise<void>;
  loadOwnershipByTile: (gameId: string) => Promise<TOwnershipByTile>;
  maybeUnlockCommunicationUtility: (params: {
    gameState: TGameState;
    boardPack: TBoardPack;
    ownershipByTile: TOwnershipByTile;
    events: Array<{ event_type: string; payload: Record<string, unknown> }>;
  }) => unknown;
};

const GAME_STATE_SELECT =
  "game_state?select=game_id,version,current_player_id,balances,last_roll,doubles_count,rounds_elapsed,last_macro_event_id,active_macro_effects,active_macro_effects_v1,turn_phase,pending_action,pending_card_active,pending_card_deck,pending_card_id,pending_card_title,pending_card_kind,pending_card_payload,pending_card_drawn_by_player_id,pending_card_drawn_at,pending_card_source_tile_index,skip_next_roll_by_player,income_tax_baseline_cash_by_player,betting_market_state,inland_explored_cells,chance_index,community_index,chance_order,community_order,chance_draw_ptr,community_draw_ptr,chance_seed,community_seed,chance_reshuffle_count,community_reshuffle_count,free_parking_pot,rules,auction_active,auction_tile_index,auction_initiator_player_id,auction_current_bid,auction_current_winner_player_id,auction_turn_player_id,auction_turn_ends_at,auction_eligible_player_ids,auction_passed_player_ids,auction_min_increment";

const toInteger = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const parseNonNegativeInteger = (
  value: unknown,
  fieldName: string,
): { value: number; error: string | null } => {
  if (value === undefined || value === null) {
    return { value: 0, error: null };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || Number.isNaN(value)) {
      return {
        value: 0,
        error: `${fieldName} must be a non-negative integer.`,
      };
    }
    if (!Number.isInteger(value)) {
      return {
        value: 0,
        error: `${fieldName} must be a non-negative integer.`,
      };
    }
    if (value < 0) {
      return {
        value: 0,
        error: `${fieldName} must be a non-negative integer.`,
      };
    }
    return { value, error: null };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return { value: 0, error: null };
    }
    if (!/^\d+$/.test(trimmed)) {
      return {
        value: 0,
        error: `${fieldName} must be a non-negative integer.`,
      };
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
      return {
        value: 0,
        error: `${fieldName} must be a non-negative integer.`,
      };
    }
    return { value: parsed, error: null };
  }

  return {
    value: 0,
    error: `${fieldName} must be a non-negative integer.`,
  };
};

const normalizeTileIndices = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const indices = value
    .map((entry) => toInteger(entry))
    .filter((entry): entry is number => entry !== null);
  return Array.from(new Set(indices));
};

const normalizeTradeSnapshot = (
  snapshot: TradeProposalRow["snapshot"],
): TradeSnapshotTile[] => {
  if (!snapshot) {
    return [];
  }
  if (Array.isArray(snapshot)) {
    return snapshot;
  }
  if (
    typeof snapshot === "object" &&
    "tiles" in snapshot &&
    Array.isArray(snapshot.tiles)
  ) {
    return snapshot.tiles;
  }
  return [];
};

const computeTradeCashDeltas = (trade: TradeProposalRow) => {
  const offerCash = Math.max(0, trade.offer_cash ?? 0);
  const requestCash = Math.max(0, trade.request_cash ?? 0);
  const proposerDelta = -offerCash + requestCash;
  const counterpartyDelta = -requestCash + offerCash;
  const transfers: Array<{
    from_player_id: string;
    to_player_id: string;
    amount: number;
    side: "offer_cash" | "request_cash";
  }> = [];

  if (offerCash > 0) {
    transfers.push({
      from_player_id: trade.proposer_player_id,
      to_player_id: trade.counterparty_player_id,
      amount: offerCash,
      side: "offer_cash",
    });
  }

  if (requestCash > 0) {
    transfers.push({
      from_player_id: trade.counterparty_player_id,
      to_player_id: trade.proposer_player_id,
      amount: requestCash,
      side: "request_cash",
    });
  }

  return {
    offerCash,
    requestCash,
    proposerDelta,
    counterpartyDelta,
    transfers,
  };
};

export const handleTradeAction = async <
  TGameState extends GameStateRow,
  TOwnershipByTile extends OwnershipByTile,
  TBoardPack,
>({
  body,
  gameId,
  gameState,
  players,
  currentUserPlayer,
  currentVersion,
  user,
  boardPack,
  fetchFromSupabaseWithService,
  emitGameEvents,
  loadOwnershipByTile,
  maybeUnlockCommunicationUtility,
}: HandleTradeActionParams<
  TGameState,
  TOwnershipByTile,
  TBoardPack
>): Promise<NextResponse | null> => {
  const isTradeAction =
    body.action === "PROPOSE_TRADE" ||
    body.action === "ACCEPT_TRADE" ||
    body.action === "REJECT_TRADE" ||
    body.action === "CANCEL_TRADE";

  if (!isTradeAction) {
    return null;
  }

  const balances = gameState.balances ?? {};

  if (body.action === "PROPOSE_TRADE") {
    const counterpartyId = body.counterpartyPlayerId;
    const { value: offerCash, error: offerCashError } = parseNonNegativeInteger(
      body.offerCash,
      "offerCash",
    );
    if (offerCashError) {
      return NextResponse.json({ error: offerCashError }, { status: 400 });
    }
    const { value: offerFreeBuildTokens, error: offerFreeBuildTokensError } =
      parseNonNegativeInteger(body.offerFreeBuildTokens, "offerFreeBuildTokens");
    if (offerFreeBuildTokensError) {
      return NextResponse.json(
        { error: offerFreeBuildTokensError },
        { status: 400 },
      );
    }
    const {
      value: offerFreeUpgradeTokens,
      error: offerFreeUpgradeTokensError,
    } = parseNonNegativeInteger(
      body.offerFreeUpgradeTokens,
      "offerFreeUpgradeTokens",
    );
    if (offerFreeUpgradeTokensError) {
      return NextResponse.json(
        { error: offerFreeUpgradeTokensError },
        { status: 400 },
      );
    }
    const { value: requestCash, error: requestCashError } = parseNonNegativeInteger(
      body.requestCash,
      "requestCash",
    );
    if (requestCashError) {
      return NextResponse.json({ error: requestCashError }, { status: 400 });
    }
    const {
      value: requestFreeBuildTokens,
      error: requestFreeBuildTokensError,
    } = parseNonNegativeInteger(
      body.requestFreeBuildTokens,
      "requestFreeBuildTokens",
    );
    if (requestFreeBuildTokensError) {
      return NextResponse.json(
        { error: requestFreeBuildTokensError },
        { status: 400 },
      );
    }
    const {
      value: requestFreeUpgradeTokens,
      error: requestFreeUpgradeTokensError,
    } = parseNonNegativeInteger(
      body.requestFreeUpgradeTokens,
      "requestFreeUpgradeTokens",
    );
    if (requestFreeUpgradeTokensError) {
      return NextResponse.json(
        { error: requestFreeUpgradeTokensError },
        { status: 400 },
      );
    }
    const offerTiles = normalizeTileIndices(body.offerTiles);
    const requestTiles = normalizeTileIndices(body.requestTiles);

    if (!counterpartyId) {
      return NextResponse.json(
        { error: "Missing counterpartyPlayerId." },
        { status: 400 },
      );
    }

    if (counterpartyId === currentUserPlayer.id) {
      return NextResponse.json(
        { error: "You cannot trade with yourself." },
        { status: 400 },
      );
    }

    const counterpartyPlayer = players.find((player) => player.id === counterpartyId);

    if (!counterpartyPlayer) {
      return NextResponse.json(
        { error: "Counterparty is not in this game." },
        { status: 404 },
      );
    }

    const proposerBalance = balances[currentUserPlayer.id] ?? 0;
    if (offerCash > proposerBalance) {
      return NextResponse.json(
        { error: "Not enough cash to make that offer." },
        { status: 409 },
      );
    }
    const proposerFreeBuildTokens = currentUserPlayer.free_build_tokens ?? 0;
    if (offerFreeBuildTokens > proposerFreeBuildTokens) {
      return NextResponse.json(
        { error: "Not enough free build vouchers to make that offer." },
        { status: 409 },
      );
    }
    const proposerFreeUpgradeTokens = currentUserPlayer.free_upgrade_tokens ?? 0;
    if (offerFreeUpgradeTokens > proposerFreeUpgradeTokens) {
      return NextResponse.json(
        { error: "Not enough free upgrade vouchers to make that offer." },
        { status: 409 },
      );
    }

    const pendingTrades =
      (await fetchFromSupabaseWithService<Pick<TradeProposalRow, "id">[]>(
        `trade_proposals?select=id&game_id=eq.${gameId}&status=eq.PENDING&or=(proposer_player_id.eq.${currentUserPlayer.id},counterparty_player_id.eq.${currentUserPlayer.id},proposer_player_id.eq.${counterpartyId},counterparty_player_id.eq.${counterpartyId})`,
        { method: "GET" },
      )) ?? [];

    if (pendingTrades.length > 0) {
      return NextResponse.json(
        { error: "One of the players already has a pending trade." },
        { status: 409 },
      );
    }

    const tradeTileIndices = Array.from(new Set([...offerTiles, ...requestTiles]));
    let ownershipRows: OwnershipRow[] = [];
    if (tradeTileIndices.length > 0) {
      ownershipRows =
        (await fetchFromSupabaseWithService<OwnershipRow[]>(
          `property_ownership?select=tile_index,owner_player_id,collateral_loan_id,purchase_mortgage_id,houses&game_id=eq.${gameId}&tile_index=in.(${tradeTileIndices.join(",")})`,
          { method: "GET" },
        )) ?? [];
    }

    const ownershipByIndex = ownershipRows.reduce<Record<number, OwnershipRow>>(
      (acc, row) => {
        acc[row.tile_index] = row;
        return acc;
      },
      {},
    );

    for (const tileIndex of offerTiles) {
      const ownership = ownershipByIndex[tileIndex];
      if (!ownership?.owner_player_id) {
        return NextResponse.json(
          { error: `Tile ${tileIndex} is not owned.` },
          { status: 409 },
        );
      }
      if (ownership.owner_player_id !== currentUserPlayer.id) {
        return NextResponse.json(
          { error: `You do not own tile ${tileIndex}.` },
          { status: 409 },
        );
      }
    }

    for (const tileIndex of requestTiles) {
      const ownership = ownershipByIndex[tileIndex];
      if (!ownership?.owner_player_id) {
        return NextResponse.json(
          { error: `Tile ${tileIndex} is not owned.` },
          { status: 409 },
        );
      }
      if (ownership.owner_player_id !== counterpartyId) {
        return NextResponse.json(
          { error: `Counterparty does not own tile ${tileIndex}.` },
          { status: 409 },
        );
      }
    }

    const snapshotTiles: TradeSnapshotTile[] = [];
    for (const tileIndex of tradeTileIndices) {
      const ownership = ownershipByIndex[tileIndex];
      if (!ownership) {
        return NextResponse.json(
          { error: `Missing ownership for tile ${tileIndex}.` },
          { status: 409 },
        );
      }
      snapshotTiles.push({
        tile_index: tileIndex,
        collateral_loan_id: ownership.collateral_loan_id ?? null,
        purchase_mortgage_id: ownership.purchase_mortgage_id ?? null,
        houses: ownership.houses ?? 0,
      });
    }

    let tradeProposal: TradeProposalRow | null = null;
    try {
      [tradeProposal] =
        (await fetchFromSupabaseWithService<TradeProposalRow[]>(
          "trade_proposals?select=id,game_id,proposer_player_id,counterparty_player_id,offer_cash,offer_free_build_tokens,offer_free_upgrade_tokens,offer_tile_indices,request_cash,request_free_build_tokens,request_free_upgrade_tokens,request_tile_indices,snapshot,status,created_at",
          {
            method: "POST",
            headers: {
              Prefer: "return=representation",
            },
            body: JSON.stringify({
              game_id: gameId,
              proposer_player_id: currentUserPlayer.id,
              counterparty_player_id: counterpartyId,
              offer_cash: offerCash,
              offer_free_build_tokens: offerFreeBuildTokens,
              offer_free_upgrade_tokens: offerFreeUpgradeTokens,
              offer_tile_indices: offerTiles,
              request_cash: requestCash,
              request_free_build_tokens: requestFreeBuildTokens,
              request_free_upgrade_tokens: requestFreeUpgradeTokens,
              request_tile_indices: requestTiles,
              snapshot: snapshotTiles,
              status: "PENDING",
            }),
          },
        )) ?? [];
    } catch (error) {
      if (error instanceof Error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json(
        { error: "Unable to create trade proposal." },
        { status: 500 },
      );
    }

    if (!tradeProposal) {
      return NextResponse.json(
        { error: "Unable to create trade proposal." },
        { status: 500 },
      );
    }

    const events = [
      {
        event_type: "TRADE_PROPOSED",
        payload: {
          trade_id: tradeProposal.id,
          proposer_player_id: currentUserPlayer.id,
          counterparty_player_id: counterpartyId,
          offer_cash: offerCash,
          offer_free_build_tokens: offerFreeBuildTokens,
          offer_free_upgrade_tokens: offerFreeUpgradeTokens,
          offer_tile_indices: offerTiles,
          request_cash: requestCash,
          request_free_build_tokens: requestFreeBuildTokens,
          request_free_upgrade_tokens: requestFreeUpgradeTokens,
          request_tile_indices: requestTiles,
        },
      },
    ];

    const finalVersion = currentVersion + events.length;
    const [updatedState] =
      (await fetchFromSupabaseWithService<GameStateRow[]>(
        `${GAME_STATE_SELECT}&game_id=eq.${gameId}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            version: finalVersion,
            updated_at: new Date().toISOString(),
          }),
        },
      )) ?? [];

    await emitGameEvents(gameId, currentVersion + 1, events, user.id);

    return NextResponse.json({ gameState: updatedState, tradeId: tradeProposal.id });
  }

  const tradeId = body.tradeId;
  if (!tradeId) {
    return NextResponse.json({ error: "Missing tradeId." }, { status: 400 });
  }

  const [tradeProposal] =
    (await fetchFromSupabaseWithService<TradeProposalRow[]>(
      `trade_proposals?select=id,game_id,proposer_player_id,counterparty_player_id,offer_cash,offer_free_build_tokens,offer_free_upgrade_tokens,offer_tile_indices,request_cash,request_free_build_tokens,request_free_upgrade_tokens,request_tile_indices,snapshot,status,created_at&id=eq.${tradeId}&game_id=eq.${gameId}&limit=1`,
      { method: "GET" },
    )) ?? [];

  if (!tradeProposal) {
    return NextResponse.json(
      { error: "Trade proposal not found." },
      { status: 404 },
    );
  }

  if (tradeProposal.status !== "PENDING") {
    return NextResponse.json(
      { error: "Trade proposal is no longer pending." },
      { status: 409 },
    );
  }

  if (body.action === "REJECT_TRADE") {
    if (tradeProposal.counterparty_player_id !== currentUserPlayer.id) {
      return NextResponse.json(
        { error: "Only the counterparty can reject this trade." },
        { status: 403 },
      );
    }

    const [updatedTrade] =
      (await fetchFromSupabaseWithService<TradeProposalRow[]>(
        `trade_proposals?id=eq.${tradeProposal.id}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            status: "REJECTED",
          }),
        },
      )) ?? [];

    if (!updatedTrade) {
      return NextResponse.json(
        { error: "Unable to reject trade proposal." },
        { status: 500 },
      );
    }

    const events = [
      {
        event_type: "TRADE_REJECTED",
        payload: {
          trade_id: tradeProposal.id,
          proposer_player_id: tradeProposal.proposer_player_id,
          counterparty_player_id: tradeProposal.counterparty_player_id,
          rejected_by_player_id: currentUserPlayer.id,
        },
      },
    ];
    const finalVersion = currentVersion + events.length;
    const [updatedState] =
      (await fetchFromSupabaseWithService<GameStateRow[]>(
        `${GAME_STATE_SELECT}&game_id=eq.${gameId}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            version: finalVersion,
            updated_at: new Date().toISOString(),
          }),
        },
      )) ?? [];

    await emitGameEvents(gameId, currentVersion + 1, events, user.id);

    return NextResponse.json({ gameState: updatedState });
  }

  if (body.action === "CANCEL_TRADE") {
    if (tradeProposal.proposer_player_id !== currentUserPlayer.id) {
      return NextResponse.json(
        { error: "Only the proposer can cancel this trade." },
        { status: 403 },
      );
    }

    const [updatedTrade] =
      (await fetchFromSupabaseWithService<TradeProposalRow[]>(
        `trade_proposals?id=eq.${tradeProposal.id}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            status: "CANCELLED",
          }),
        },
      )) ?? [];

    if (!updatedTrade) {
      return NextResponse.json(
        { error: "Unable to cancel trade proposal." },
        { status: 500 },
      );
    }

    return NextResponse.json({ status: "cancelled" });
  }

  if (tradeProposal.counterparty_player_id !== currentUserPlayer.id) {
    return NextResponse.json(
      { error: "Only the counterparty can accept this trade." },
      { status: 403 },
    );
  }

  const cashDeltas = computeTradeCashDeltas(tradeProposal);
  const offerCash = cashDeltas.offerCash;
  const requestCash = cashDeltas.requestCash;
  const offerFreeBuildTokens = Math.max(0, tradeProposal.offer_free_build_tokens ?? 0);
  const offerFreeUpgradeTokens = Math.max(
    0,
    tradeProposal.offer_free_upgrade_tokens ?? 0,
  );
  const requestFreeBuildTokens = Math.max(
    0,
    tradeProposal.request_free_build_tokens ?? 0,
  );
  const requestFreeUpgradeTokens = Math.max(
    0,
    tradeProposal.request_free_upgrade_tokens ?? 0,
  );
  const offerTiles = tradeProposal.offer_tile_indices ?? [];
  const requestTiles = tradeProposal.request_tile_indices ?? [];

  const snapshotTiles = normalizeTradeSnapshot(tradeProposal.snapshot);

  const propertyTransferUpdates: Array<{
    tile_index: number;
    from_player_id: string;
    to_player_id: string;
    collateral_loan_id: string | null;
    purchase_mortgage_id: string | null;
    houses: number;
  }> = [];

  for (const tileIndex of offerTiles) {
    const snapshot =
      snapshotTiles.find((entry) => entry.tile_index === tileIndex) ?? null;
    propertyTransferUpdates.push({
      tile_index: tileIndex,
      from_player_id: tradeProposal.proposer_player_id,
      to_player_id: tradeProposal.counterparty_player_id,
      collateral_loan_id: snapshot?.collateral_loan_id ?? null,
      purchase_mortgage_id: snapshot?.purchase_mortgage_id ?? null,
      houses: snapshot?.houses ?? 0,
    });
  }

  for (const tileIndex of requestTiles) {
    const snapshot =
      snapshotTiles.find((entry) => entry.tile_index === tileIndex) ?? null;
    propertyTransferUpdates.push({
      tile_index: tileIndex,
      from_player_id: tradeProposal.counterparty_player_id,
      to_player_id: tradeProposal.proposer_player_id,
      collateral_loan_id: snapshot?.collateral_loan_id ?? null,
      purchase_mortgage_id: snapshot?.purchase_mortgage_id ?? null,
      houses: snapshot?.houses ?? 0,
    });
  }

  const loanAssumptions: Array<{
    loan_id: string;
    tile_index: number;
    from_player_id: string;
    to_player_id: string;
    loan_type: "COLLATERAL" | "PURCHASE_MORTGAGE";
  }> = [];

  for (const transfer of propertyTransferUpdates) {
    if (transfer.collateral_loan_id) {
      loanAssumptions.push({
        loan_id: transfer.collateral_loan_id,
        tile_index: transfer.tile_index,
        from_player_id: transfer.from_player_id,
        to_player_id: transfer.to_player_id,
        loan_type: "COLLATERAL",
      });
    }
    if (transfer.purchase_mortgage_id) {
      loanAssumptions.push({
        loan_id: transfer.purchase_mortgage_id,
        tile_index: transfer.tile_index,
        from_player_id: transfer.from_player_id,
        to_player_id: transfer.to_player_id,
        loan_type: "PURCHASE_MORTGAGE",
      });
    }
  }

  let acceptResult: AcceptTradeAtomicResult;
  try {
    const [rpcResult] =
      (await fetchFromSupabaseWithService<AcceptTradeAtomicResult[]>(
        "rpc/accept_trade_proposal_atomic",
        {
          method: "POST",
          body: JSON.stringify({
            p_game_id: gameId,
            p_trade_id: tradeProposal.id,
            p_counterparty_player_id: currentUserPlayer.id,
            p_expected_version: currentVersion,
            p_actor_user_id: user.id,
          }),
        },
      )) ?? [];
    if (!rpcResult) {
      return NextResponse.json(
        { error: "Unable to accept trade proposal." },
        { status: 500 },
      );
    }
    acceptResult = rpcResult;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to accept trade proposal.";
    if (message.includes("TRADE_STATUS_INVALID")) {
      return NextResponse.json(
        { error: "Trade proposal is no longer pending." },
        { status: 409 },
      );
    }
    if (message.includes("ONLY_COUNTERPARTY_CAN_ACCEPT")) {
      return NextResponse.json(
        { error: "Only the counterparty can accept this trade." },
        { status: 403 },
      );
    }
    if (message.includes("INSUFFICIENT_PROPOSER_CASH")) {
      return NextResponse.json(
        { error: "Proposer no longer has enough cash for this trade." },
        { status: 409 },
      );
    }
    if (message.includes("INSUFFICIENT_COUNTERPARTY_CASH")) {
      return NextResponse.json(
        { error: "You no longer have enough cash for this trade." },
        { status: 409 },
      );
    }
    if (message.includes("INSUFFICIENT_PROPOSER_BUILD_VOUCHERS")) {
      return NextResponse.json(
        { error: "Proposer no longer has enough free build vouchers for this trade." },
        { status: 409 },
      );
    }
    if (message.includes("INSUFFICIENT_PROPOSER_UPGRADE_VOUCHERS")) {
      return NextResponse.json(
        { error: "Proposer no longer has enough free upgrade vouchers for this trade." },
        { status: 409 },
      );
    }
    if (message.includes("INSUFFICIENT_COUNTERPARTY_BUILD_VOUCHERS")) {
      return NextResponse.json(
        { error: "You no longer have enough free build vouchers for this trade." },
        { status: 409 },
      );
    }
    if (message.includes("INSUFFICIENT_COUNTERPARTY_UPGRADE_VOUCHERS")) {
      return NextResponse.json(
        { error: "You no longer have enough free upgrade vouchers for this trade." },
        { status: 409 },
      );
    }
    if (message.includes("VERSION_MISMATCH")) {
      return NextResponse.json(
        { error: "Game state changed before this trade was accepted. Please retry." },
        { status: 409 },
      );
    }
    throw error;
  }

  if (acceptResult.status === "REJECTED") {
    const rejectionMessage =
      acceptResult.rejection_reason ?? "Trade is out of date and was rejected.";
    const events = [
      {
        event_type: "TRADE_REJECTED",
        payload: {
          trade_id: tradeProposal.id,
          proposer_player_id: tradeProposal.proposer_player_id,
          counterparty_player_id: tradeProposal.counterparty_player_id,
          rejected_by_player_id: currentUserPlayer.id,
          reason: rejectionMessage,
        },
      },
    ];
    const finalVersion = currentVersion + events.length;
    const [updatedState] =
      (await fetchFromSupabaseWithService<GameStateRow[]>(
        `${GAME_STATE_SELECT}&game_id=eq.${gameId}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            version: finalVersion,
            updated_at: new Date().toISOString(),
          }),
        },
      )) ?? [];

    await emitGameEvents(gameId, currentVersion + 1, events, user.id);

    return NextResponse.json(
      { error: rejectionMessage, gameState: updatedState },
      { status: 409 },
    );
  }

  const events: Array<{ event_type: string; payload: Record<string, unknown> }> = [
    {
      event_type: "TRADE_ACCEPTED",
      payload: {
        trade_id: tradeProposal.id,
        proposer_player_id: tradeProposal.proposer_player_id,
        counterparty_player_id: tradeProposal.counterparty_player_id,
        offer_cash: offerCash,
        offer_free_build_tokens: offerFreeBuildTokens,
        offer_free_upgrade_tokens: offerFreeUpgradeTokens,
        offer_tile_indices: offerTiles,
        request_cash: requestCash,
        request_free_build_tokens: requestFreeBuildTokens,
        request_free_upgrade_tokens: requestFreeUpgradeTokens,
        request_tile_indices: requestTiles,
      },
    },
  ];

  for (const transfer of cashDeltas.transfers) {
    events.push(
      {
        event_type: "CASH_DEBIT",
        payload: {
          player_id: transfer.from_player_id,
          amount: transfer.amount,
          reason: "TRADE",
          counterparty_player_id: transfer.to_player_id,
          trade_id: tradeProposal.id,
          from_player_id: transfer.from_player_id,
          to_player_id: transfer.to_player_id,
          side: transfer.side,
        },
      },
      {
        event_type: "CASH_CREDIT",
        payload: {
          player_id: transfer.to_player_id,
          amount: transfer.amount,
          reason: "TRADE",
          counterparty_player_id: transfer.from_player_id,
          trade_id: tradeProposal.id,
          from_player_id: transfer.from_player_id,
          to_player_id: transfer.to_player_id,
          side: transfer.side,
        },
      },
    );
  }

  for (const transfer of propertyTransferUpdates) {
    events.push({
      event_type: "PROPERTY_TRANSFERRED",
      payload: {
        trade_id: tradeProposal.id,
        tile_index: transfer.tile_index,
        from_player_id: transfer.from_player_id,
        to_player_id: transfer.to_player_id,
        collateral_loan_id: transfer.collateral_loan_id,
        purchase_mortgage_id: transfer.purchase_mortgage_id,
        houses: transfer.houses,
      },
    });
  }

  for (const assumption of loanAssumptions) {
    events.push({
      event_type: "LOAN_ASSUMED",
      payload: {
        trade_id: tradeProposal.id,
        loan_id: assumption.loan_id,
        tile_index: assumption.tile_index,
        from_player_id: assumption.from_player_id,
        to_player_id: assumption.to_player_id,
        loan_type: assumption.loan_type,
      },
    });
  }

  const refreshedOwnershipByTile = await loadOwnershipByTile(gameId);
  const nextRules = maybeUnlockCommunicationUtility({
    gameState,
    boardPack,
    ownershipByTile: refreshedOwnershipByTile,
    events,
  });
  const finalVersion = currentVersion + events.length;
  const [updatedState] =
    (await fetchFromSupabaseWithService<GameStateRow[]>(
      `${GAME_STATE_SELECT}&game_id=eq.${gameId}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          version: finalVersion,
          rules: nextRules,
          updated_at: new Date().toISOString(),
        }),
      },
    )) ?? [];

  await emitGameEvents(gameId, currentVersion + 1, events, user.id);

  return NextResponse.json({ gameState: updatedState });
};
