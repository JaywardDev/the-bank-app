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
};

type GameState = {
  game_id: string;
  version: number;
  current_player_id: string | null;
  balances: Record<string, number> | null;
};

type GameEvent = {
  id: string;
  event_type: string;
  created_at: string;
  version: number;
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
      `players?select=id,user_id,display_name,created_at,position&game_id=eq.${gameId}&order=created_at.asc`,
      { method: "GET" },
      accessToken,
    );
    setPlayers(rows);
  }, []);

  const loadGameState = useCallback(async (gameId: string, accessToken?: string) => {
    const [stateRow] = await supabaseClient.fetchFromSupabase<GameState[]>(
      `game_state?select=game_id,version,current_player_id,balances&game_id=eq.${gameId}&limit=1`,
      { method: "GET" },
      accessToken,
    );
    setGameState(stateRow ?? null);
  }, []);

  const loadEvents = useCallback(async (gameId: string, accessToken?: string) => {
    const rows = await supabaseClient.fetchFromSupabase<GameEvent[]>(
      `game_events?select=id,event_type,created_at,version&game_id=eq.${gameId}&order=version.desc&limit=100`,
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
      leftDrawerContent={selectedTile ? (
        <TitleDeedPreview
          tile={selectedTile}
          bandColor={getTileBandColor(selectedTile)}
          boardPackEconomy={selectedBoardPack?.economy ?? DEFAULT_BOARD_PACK_ECONOMY}
          price={selectedTile.price}
          ownedRailCount={selectedOwnerRailCount}
          ownedUtilityCount={selectedOwnerUtilityCount}
          mode="readonly"
        />
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
