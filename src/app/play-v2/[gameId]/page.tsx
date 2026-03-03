"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseClient, type SupabaseSession } from "@/lib/supabase/client";
import PlayV2Shell from "@/components/play-v2/PlayV2Shell";
import BoardViewport from "@/components/play-v2/BoardViewport";
import { TitleDeedPreview } from "@/app/components/TitleDeedPreview";
import { DEFAULT_BOARD_PACK_ECONOMY, getBoardPackById } from "@/lib/boardPacks";
import { getTileBandColor } from "@/lib/boardTileStyles";
import { getRules } from "@/lib/rules";
import { getCurrentTileRent } from "@/lib/rent";

type GameMeta = {
  id: string;
  board_pack_id: string | null;
  status: string;
  created_by: string | null;
};

type Player = {
  id: string;
  user_id: string;
  display_name: string;
  created_at: string;
  position: number | null;
  is_in_jail: boolean;
  jail_turns_remaining: number;
  get_out_of_jail_free_count: number;
  is_eliminated: boolean;
  eliminated_at: string | null;
};

type ActiveMacroEffectV1 = {
  id?: string;
  name?: string;
  effects?: {
    house_build_blocked?: boolean;
    loan_mortgage_new_blocked?: boolean;
  };
};

type GameState = {
  game_id: string;
  version: number;
  current_player_id: string | null;
  balances: Record<string, number> | null;
  last_roll: number | null;
  doubles_count: number | null;
  turn_phase: string | null;
  pending_action: Record<string, unknown> | null;
  pending_card_active: boolean | null;
  pending_card_deck: "CHANCE" | "COMMUNITY" | null;
  pending_card_id: string | null;
  pending_card_title: string | null;
  pending_card_kind: string | null;
  pending_card_payload: Record<string, unknown> | null;
  pending_card_drawn_by_player_id: string | null;
  pending_card_drawn_at: string | null;
  pending_card_source_tile_index: number | null;
  chance_index: number | null;
  community_index: number | null;
  free_parking_pot: number | null;
  rules: Partial<ReturnType<typeof getRules>> | null;
  auction_active: boolean | null;
  auction_tile_index: number | null;
  auction_initiator_player_id: string | null;
  auction_current_bid: number | null;
  auction_current_winner_player_id: string | null;
  auction_turn_player_id: string | null;
  auction_turn_ends_at: string | null;
  auction_eligible_player_ids: string[] | null;
  auction_passed_player_ids: string[] | null;
  auction_min_increment: number | null;
  active_macro_effects_v1: ActiveMacroEffectV1[] | null;
  skip_next_roll_by_player: Record<string, boolean> | null;
};

type GameEvent = {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  version: number;
};

type PendingPurchaseAction = {
  type: "BUY_PROPERTY";
  player_id: string | null;
  tile_index: number;
  price: number;
};

type OwnershipRow = {
  tile_index: number;
  owner_player_id: string | null;
  collateral_loan_id: string | null;
  purchase_mortgage_id: string | null;
  houses: number | null;
};

type OwnershipByTile = Record<
  number,
  {
    owner_player_id: string;
    collateral_loan_id: string | null;
    purchase_mortgage_id: string | null;
    houses: number;
  }
>;

type TradeProposal = {
  id: string;
  status: string;
  created_at: string;
};

type PlayerLoan = {
  id: string;
  player_id: string;
  status: string;
};

type PurchaseMortgage = {
  id: string;
  player_id: string;
  status: string;
};

const SESSION_EXPIRED_MESSAGE = "Session expired — please sign in again";

const formatMoney = (value: number | null) => {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
};

export default function PlayV2Page() {
  const router = useRouter();
  const params = useParams<{ gameId?: string | string[] }>();
  const routeGameId = useMemo(() => {
    const param = params?.gameId;
    return Array.isArray(param) ? param[0] : param;
  }, [params]);

  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [gameMeta, setGameMeta] = useState<GameMeta | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [ownershipByTile, setOwnershipByTile] = useState<OwnershipByTile>({});
  const [tradeProposals, setTradeProposals] = useState<TradeProposal[]>([]);
  const [playerLoans, setPlayerLoans] = useState<PlayerLoan[]>([]);
  const [purchaseMortgages, setPurchaseMortgages] = useState<PurchaseMortgage[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(null);
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState(false);

  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);

  const loadGameMeta = useCallback(async (gameId: string, accessToken?: string) => {
    const [game] = await supabaseClient.fetchFromSupabase<GameMeta[]>(
      `games?select=id,board_pack_id,status,created_by&id=eq.${gameId}&limit=1`,
      { method: "GET" },
      accessToken,
    );
    setGameMeta(game ?? null);
  }, []);

  const loadPlayers = useCallback(async (gameId: string, accessToken?: string) => {
    const rows = await supabaseClient.fetchFromSupabase<Player[]>(
      `players?select=id,user_id,display_name,created_at,position,is_in_jail,jail_turns_remaining,get_out_of_jail_free_count,is_eliminated,eliminated_at&game_id=eq.${gameId}&order=created_at.asc`,
      { method: "GET" },
      accessToken,
    );
    setPlayers(rows);
  }, []);

  const loadGameState = useCallback(async (gameId: string, accessToken?: string) => {
    const [stateRow] = await supabaseClient.fetchFromSupabase<GameState[]>(
      `game_state?select=game_id,version,current_player_id,balances,last_roll,doubles_count,turn_phase,pending_action,pending_card_active,pending_card_deck,pending_card_id,pending_card_title,pending_card_kind,pending_card_payload,pending_card_drawn_by_player_id,pending_card_drawn_at,pending_card_source_tile_index,active_macro_effects_v1,skip_next_roll_by_player,chance_index,community_index,free_parking_pot,rules,auction_active,auction_tile_index,auction_initiator_player_id,auction_current_bid,auction_current_winner_player_id,auction_turn_player_id,auction_turn_ends_at,auction_eligible_player_ids,auction_passed_player_ids,auction_min_increment&game_id=eq.${gameId}&limit=1`,
      { method: "GET" },
      accessToken,
    );
    setGameState(stateRow ?? null);
  }, []);

  const loadEvents = useCallback(async (gameId: string, accessToken?: string) => {
    const rows = await supabaseClient.fetchFromSupabase<GameEvent[]>(
      `game_events?select=id,event_type,payload,created_at,version&game_id=eq.${gameId}&order=version.desc&limit=100`,
      { method: "GET" },
      accessToken,
    );
    setEvents(rows);
  }, []);

  const loadOwnership = useCallback(async (gameId: string, accessToken?: string) => {
    const rows = await supabaseClient.fetchFromSupabase<OwnershipRow[]>(
      `property_ownership?select=tile_index,owner_player_id,collateral_loan_id,purchase_mortgage_id,houses&game_id=eq.${gameId}`,
      { method: "GET" },
      accessToken,
    );
    const mapped = rows.reduce<OwnershipByTile>((acc, row) => {
      if (row.owner_player_id) {
        acc[row.tile_index] = {
          owner_player_id: row.owner_player_id,
          collateral_loan_id: row.collateral_loan_id ?? null,
          purchase_mortgage_id: row.purchase_mortgage_id ?? null,
          houses: row.houses ?? 0,
        };
      }
      return acc;
    }, {});
    setOwnershipByTile(mapped);
  }, []);

  const loadTradeProposals = useCallback(async (gameId: string, accessToken?: string) => {
    const rows = await supabaseClient.fetchFromSupabase<TradeProposal[]>(
      `trade_proposals?select=id,status,created_at&game_id=eq.${gameId}&order=created_at.desc`,
      { method: "GET" },
      accessToken,
    );
    setTradeProposals(rows);
  }, []);

  const loadLoans = useCallback(async (gameId: string, accessToken?: string) => {
    const rows = await supabaseClient.fetchFromSupabase<PlayerLoan[]>(
      `player_loans?select=id,player_id,status&game_id=eq.${gameId}`,
      { method: "GET" },
      accessToken,
    );
    setPlayerLoans(rows);
  }, []);

  const loadPurchaseMortgages = useCallback(async (gameId: string, accessToken?: string) => {
    const rows = await supabaseClient.fetchFromSupabase<PurchaseMortgage[]>(
      `purchase_mortgages?select=id,player_id,status&game_id=eq.${gameId}`,
      { method: "GET" },
      accessToken,
    );
    setPurchaseMortgages(rows);
  }, []);

  const loadAllSlices = useCallback(async (gameId: string, accessToken?: string) => {
    await Promise.all([
      loadGameMeta(gameId, accessToken),
      loadPlayers(gameId, accessToken),
      loadGameState(gameId, accessToken),
      loadEvents(gameId, accessToken),
      loadOwnership(gameId, accessToken),
      loadTradeProposals(gameId, accessToken),
      loadLoans(gameId, accessToken),
      loadPurchaseMortgages(gameId, accessToken),
    ]);
  }, [
    loadEvents,
    loadGameMeta,
    loadGameState,
    loadLoans,
    loadOwnership,
    loadPlayers,
    loadPurchaseMortgages,
    loadTradeProposals,
  ]);

  useEffect(() => {
    let isMounted = true;

    const hydrate = async () => {
      const currentSession = await supabaseClient.getSession();
      if (!isMounted) return;
      setSession(currentSession);

      if (!routeGameId) {
        router.replace("/");
        setLoading(false);
        return;
      }

      const accessToken = currentSession?.access_token;
      if (!accessToken) {
        setNeedsAuth(true);
        setLoading(false);
        return;
      }

      try {
        await loadAllSlices(routeGameId, accessToken);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load game";
        if (message === SESSION_EXPIRED_MESSAGE) {
          setNeedsAuth(true);
        }
        setNotice(message);
      }

      setLoading(false);
    };

    void hydrate();

    return () => {
      isMounted = false;
    };
  }, [loadAllSlices, routeGameId, router]);

  useEffect(() => {
    if (!routeGameId || !session?.access_token) {
      return;
    }

    const realtimeClient = supabaseClient.getRealtimeClient();
    if (!realtimeClient) {
      return;
    }

    const channel = realtimeClient
      .channel(`play-v2:${routeGameId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `game_id=eq.${routeGameId}` }, async () => loadPlayers(routeGameId, session.access_token))
      .on("postgres_changes", { event: "*", schema: "public", table: "game_state", filter: `game_id=eq.${routeGameId}` }, async () => loadGameState(routeGameId, session.access_token))
      .on("postgres_changes", { event: "*", schema: "public", table: "game_events", filter: `game_id=eq.${routeGameId}` }, async () => loadEvents(routeGameId, session.access_token))
      .on("postgres_changes", { event: "*", schema: "public", table: "property_ownership", filter: `game_id=eq.${routeGameId}` }, async () => loadOwnership(routeGameId, session.access_token))
      .on("postgres_changes", { event: "*", schema: "public", table: "trade_proposals", filter: `game_id=eq.${routeGameId}` }, async () => loadTradeProposals(routeGameId, session.access_token))
      .on("postgres_changes", { event: "*", schema: "public", table: "player_loans", filter: `game_id=eq.${routeGameId}` }, async () => loadLoans(routeGameId, session.access_token))
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_mortgages", filter: `game_id=eq.${routeGameId}` }, async () => loadPurchaseMortgages(routeGameId, session.access_token))
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${routeGameId}` }, async () => loadGameMeta(routeGameId, session.access_token))
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      if (realtimeChannelRef.current) {
        realtimeClient.removeChannel(realtimeChannelRef.current);
      }
      realtimeChannelRef.current = null;
    };
  }, [
    loadEvents,
    loadGameMeta,
    loadGameState,
    loadLoans,
    loadOwnership,
    loadPlayers,
    loadPurchaseMortgages,
    loadTradeProposals,
    routeGameId,
    session,
  ]);

  const turnPlayerId = gameState?.current_player_id ?? null;

  const currentTurnPlayer = useMemo(
    () => players.find((player) => player.id === turnPlayerId) ?? null,
    [players, turnPlayerId],
  );

  const currentUserPlayer = useMemo(
    () => players.find((player) => player.user_id === session?.user.id) ?? null,
    [players, session?.user.id],
  );

  const currentUserCash = useMemo(() => {
    if (!currentUserPlayer) return null;
    return gameState?.balances?.[currentUserPlayer.id] ?? null;
  }, [currentUserPlayer, gameState?.balances]);

  const isInProgress = gameMeta?.status === "IN_PROGRESS";
  const isEliminated = Boolean(currentUserPlayer?.is_eliminated);
  const auctionActive = Boolean(gameState?.auction_active);
  const isMyTurn = Boolean(
    isInProgress &&
      session &&
      currentUserPlayer &&
      gameState?.current_player_id === currentUserPlayer.id &&
      !currentUserPlayer.is_eliminated,
  );
  const pendingPurchase = useMemo<PendingPurchaseAction | null>(() => {
    const pendingAction = gameState?.pending_action;
    if (!pendingAction || typeof pendingAction !== "object") {
      return null;
    }

    const candidate = pendingAction as {
      type?: unknown;
      player_id?: unknown;
      tile_index?: unknown;
      price?: unknown;
    };

    if (candidate.type !== "BUY_PROPERTY") {
      return null;
    }

    const pendingPlayerId =
      typeof candidate.player_id === "string" ? candidate.player_id : null;
    if (
      pendingPlayerId &&
      gameState?.current_player_id &&
      pendingPlayerId !== gameState.current_player_id
    ) {
      return null;
    }

    if (
      typeof candidate.tile_index !== "number" ||
      typeof candidate.price !== "number"
    ) {
      return null;
    }

    return {
      type: "BUY_PROPERTY",
      player_id: pendingPlayerId,
      tile_index: candidate.tile_index,
      price: candidate.price,
    };
  }, [gameState?.current_player_id, gameState?.pending_action]);
  const pendingMacroEvent = useMemo(() => {
    const pendingAction = gameState?.pending_action;
    if (!pendingAction || typeof pendingAction !== "object") {
      return null;
    }

    const candidate = pendingAction as { type?: unknown };
    if (candidate.type !== "MACRO_EVENT") {
      return null;
    }

    return candidate;
  }, [gameState?.pending_action]);
  const pendingCard = useMemo(() => {
    if (!gameState?.pending_card_active) {
      return null;
    }
    return {
      id: gameState.pending_card_id ?? null,
      deck: gameState.pending_card_deck ?? null,
      title: gameState.pending_card_title ?? "Card",
      kind: gameState.pending_card_kind ?? null,
      payload: gameState.pending_card_payload ?? null,
      drawnBy: gameState.pending_card_drawn_by_player_id ?? null,
    };
  }, [
    gameState?.pending_card_active,
    gameState?.pending_card_deck,
    gameState?.pending_card_drawn_by_player_id,
    gameState?.pending_card_id,
    gameState?.pending_card_kind,
    gameState?.pending_card_payload,
    gameState?.pending_card_title,
  ]);
  const pendingGoToJail = useMemo(() => {
    if (!currentUserPlayer) {
      return null;
    }
    for (const event of events) {
      if (event.event_type !== "LAND_GO_TO_JAIL") {
        continue;
      }
      const payload = event.payload;
      const playerId =
        payload && typeof payload.player_id === "string"
          ? payload.player_id
          : null;
      if (playerId === currentUserPlayer.id) {
        return {
          eventId: event.id,
          eventVersion: event.version,
        };
      }
    }
    return null;
  }, [currentUserPlayer, events]);
  const hasBlockingPendingAction =
    pendingGoToJail !== null ||
    pendingCard !== null ||
    pendingMacroEvent !== null ||
    pendingPurchase !== null;
  const isAwaitingJailDecision =
    isMyTurn && gameState?.turn_phase === "AWAITING_JAIL_DECISION";
  const canAct = isMyTurn && !isEliminated && !auctionActive && !hasBlockingPendingAction;
  const canRoll =
    canAct &&
    !isAwaitingJailDecision &&
    (gameState?.last_roll == null || (gameState?.doubles_count ?? 0) > 0);
  const canEndTurn = canAct && gameState?.last_roll != null;

  const rollDiceDisabledReason = useMemo(() => {
    if (!(actionLoading === "ROLL_DICE" || !canRoll)) {
      return null;
    }
    if (actionLoading === "ROLL_DICE") {
      return "Rolling…";
    }
    if (!isMyTurn) {
      return `Waiting for ${currentTurnPlayer?.display_name ?? "another player"}…`;
    }
    if (auctionActive) {
      return "Auction in progress";
    }
    if (hasBlockingPendingAction) {
      return "Resolve pending action to continue";
    }
    if (isAwaitingJailDecision) {
      return "You are in jail – choose an option";
    }
    if (gameState?.last_roll != null) {
      return "End your turn";
    }
    return null;
  }, [
    actionLoading,
    auctionActive,
    canRoll,
    currentTurnPlayer?.display_name,
    gameState?.last_roll,
    hasBlockingPendingAction,
    isAwaitingJailDecision,
    isMyTurn,
  ]);

  const handleBankAction = useCallback(async (action: "ROLL_DICE" | "END_TURN") => {
    if (!routeGameId || !session?.access_token) {
      return;
    }

    setActionLoading(action);
    setNotice(null);
    try {
      const response = await fetch("/api/bank/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action,
          gameId: routeGameId,
          expectedVersion: gameState?.version ?? 0,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setNotice(payload?.error ?? `Action failed (${response.status})`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  }, [gameState?.version, routeGameId, session?.access_token]);

  const turnPlayerMissingFromPlayers = Boolean(turnPlayerId) && !currentTurnPlayer;

  const lastFiveEvents = useMemo(() => events.slice(0, 5), [events]);

  const selectedBoardPack = useMemo(() => getBoardPackById(gameMeta?.board_pack_id ?? null), [gameMeta?.board_pack_id]);

  const selectedTile = useMemo(() => {
    if (selectedTileIndex === null) {
      return null;
    }
    const boardTiles = selectedBoardPack?.tiles ?? [];
    return boardTiles.find((tile) => tile.index === selectedTileIndex) ?? null;
  }, [selectedBoardPack, selectedTileIndex]);

  const selectedOwnerId = selectedTileIndex === null
    ? null
    : ownershipByTile[selectedTileIndex]?.owner_player_id ?? null;

  const selectedOwnerLabel = useMemo(() => {
    if (!selectedOwnerId) {
      return "Unowned";
    }
    return players.find((player) => player.id === selectedOwnerId)?.display_name ?? selectedOwnerId;
  }, [players, selectedOwnerId]);

  const selectedTileStatus = useMemo(() => {
    if (selectedTileIndex === null) {
      return "None";
    }
    const ownership = ownershipByTile[selectedTileIndex];
    if (!ownership) {
      return "None";
    }
    if (ownership.purchase_mortgage_id) {
      return "Mortgaged";
    }
    if (ownership.collateral_loan_id) {
      return "Collateralized";
    }
    return "None";
  }, [ownershipByTile, selectedTileIndex]);

  const selectedTileCurrentRent = useMemo(() => {
    if (!selectedTile || !selectedBoardPack) {
      return null;
    }
    return getCurrentTileRent({
      tile: selectedTile,
      ownershipByTile,
      boardTiles: selectedBoardPack.tiles,
      economy: selectedBoardPack.economy,
    });
  }, [ownershipByTile, selectedBoardPack, selectedTile]);

  const selectedOwnerRailCount = useMemo(() => {
    if (!selectedOwnerId) {
      return 0;
    }
    const boardTiles = selectedBoardPack?.tiles ?? [];
    return boardTiles.filter(
      (tile) => tile.type === "RAIL" && ownershipByTile[tile.index]?.owner_player_id === selectedOwnerId,
    ).length;
  }, [ownershipByTile, selectedBoardPack, selectedOwnerId]);

  const selectedOwnerUtilityCount = useMemo(() => {
    if (!selectedOwnerId) {
      return 0;
    }
    const boardTiles = selectedBoardPack?.tiles ?? [];
    return boardTiles.filter(
      (tile) => tile.type === "UTILITY" && ownershipByTile[tile.index]?.owner_player_id === selectedOwnerId,
    ).length;
  }, [ownershipByTile, selectedBoardPack, selectedOwnerId]);

  const onRefetch = useCallback(async () => {
    if (!routeGameId || !session?.access_token) return;
    await loadAllSlices(routeGameId, session.access_token);
  }, [loadAllSlices, routeGameId, session]);

  if (needsAuth) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Play V2 Debug</h1>
        <p className="mt-3 text-sm text-neutral-700">Please sign in to view this game.</p>
      </main>
    );
  }

  const turnPlayerLabel = currentTurnPlayer
    ? `${currentTurnPlayer.display_name}`
    : turnPlayerId ?? "—";

  return (
    <PlayV2Shell
      cashLabel={formatMoney(currentUserCash)}
      netWorthLabel={formatMoney(currentUserCash)}
      turnPlayerLabel={turnPlayerLabel}
      loading={loading}
      notice={notice}
      leftOpen={isLeftDrawerOpen}
      onLeftOpenChange={setIsLeftDrawerOpen}
      canRoll={canRoll}
      canEndTurn={canEndTurn}
      actionLoading={actionLoading}
      rollDiceDisabledReason={rollDiceDisabledReason}
      onRollDice={() => void handleBankAction("ROLL_DICE")}
      onEndTurn={() => void handleBankAction("END_TURN")}
      leftDrawerContent={selectedTile ? (
        <div className="h-full space-y-2">
          <TitleDeedPreview
            tile={selectedTile}
            bandColor={getTileBandColor(selectedTile)}
            boardPackEconomy={selectedBoardPack?.economy ?? DEFAULT_BOARD_PACK_ECONOMY}
            price={selectedTile.price}
            ownedRailCount={selectedOwnerRailCount}
            ownedUtilityCount={selectedOwnerUtilityCount}
            mode="readonly"
            size="compact"
          />
          <div className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs text-white/90">
            <p>Current Rent: {selectedTileCurrentRent !== null ? formatMoney(selectedTileCurrentRent) : "—"}</p>
            <p>Owner: {selectedOwnerLabel}</p>
            <p>Status: {selectedTileStatus}</p>
          </div>          
        </div>
      ) : (
        <p className="text-sm text-white/70">Select a tile to view the title deed</p>
      )}
      boardViewport={(
        <BoardViewport
          boardPackId={gameMeta?.board_pack_id ?? null}
          players={players}
          ownershipByTile={ownershipByTile}
          currentPlayerId={turnPlayerId}
          selectedTileIndex={selectedTileIndex}
          onSelectTileIndex={(tileIndex) => {
            setSelectedTileIndex(tileIndex);
            setIsLeftDrawerOpen(true);
          }}
        />
      )}
      debugPanel={(
        <div className="space-y-4">
          <h1 className="text-xl font-semibold">Play V2 Debug</h1>
          <section className="rounded border p-4 text-sm">
            <p><strong>gameId:</strong> {routeGameId ?? "—"}</p>
            <p><strong>current user id:</strong> {session?.user.id ?? "—"}</p>
            <p><strong>gameMeta.status:</strong> {gameMeta?.status ?? "—"}</p>
            <p><strong>turnPlayerId (game_state.current_player_id):</strong> {turnPlayerId ?? "—"}</p>
            <p><strong>current turn player:</strong> {currentTurnPlayer ? `${currentTurnPlayer.id} / ${currentTurnPlayer.display_name}` : "—"}</p>
            {turnPlayerMissingFromPlayers ? (
              <p className="text-red-600"><strong>warning:</strong> Turn player id {turnPlayerId} not found in players list</p>
            ) : null}
            <p><strong>gameState.version:</strong> {gameState?.version ?? "—"}</p>
            <p><strong>ownership rows:</strong> {Object.keys(ownershipByTile).length}</p>
            <p><strong>trade proposals:</strong> {tradeProposals.length}</p>
            <p><strong>loans:</strong> {playerLoans.length}</p>
            <p><strong>mortgages:</strong> {purchaseMortgages.length}</p>
          </section>

          <section className="rounded border p-4 text-sm">
            <h2 className="font-semibold">Players</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {players.map((player) => (
                <li key={player.id}>
                  {player.display_name} — id: {player.id} — cash: {gameState?.balances?.[player.id] ?? "—"}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded border p-4 text-sm">
            <h2 className="font-semibold">Last 5 game events</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {lastFiveEvents.map((event) => (
                <li key={event.id}>{event.event_type} — {event.created_at}</li>
              ))}
            </ul>
          </section>

          <button
            type="button"
            onClick={() => void onRefetch()}
            className="rounded bg-black px-3 py-2 text-sm text-white"
          >
            Refetch all slices
          </button>
        </div>
      )}
    />
  );
}
