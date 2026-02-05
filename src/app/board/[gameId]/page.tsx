"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import BoardLayoutShell from "@/app/components/BoardLayoutShell";
import BoardDashboard from "@/app/components/BoardDashboard";
import BoardSquare from "@/app/components/BoardSquare";
import BoardTrack from "@/app/components/BoardTrack";
import CenterHub from "@/app/components/CenterHub";
import { getBoardPackById } from "@/lib/boardPacks";
import { getRules } from "@/lib/rules";
import { supabaseClient, type SupabaseSession } from "@/lib/supabase/client";

const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "true";
const SNAPSHOT_POLL_INTERVAL_MS = 1500;
const REALTIME_STALE_TIMEOUT_MS = 10_000;
const REFRESH_DEBOUNCE_MS = 350;
const MAX_BOARD_HIGHLIGHTS = 18;

type Player = {
  id: string;
  user_id: string;
  display_name: string | null;
  created_at: string | null;
  position: number;
  is_eliminated: boolean;
  eliminated_at: string | null;
};

type GameMeta = {
  id: string;
  board_pack_id: string | null;
  status?: string | null;
};

type GameState = {
  game_id: string;
  version: number;
  // References players.id (not auth user_id).
  current_player_id: string | null;
  last_roll: number | null;
  chance_index: number | null;
  community_index: number | null;
  free_parking_pot: number | null;
  rules: Partial<ReturnType<typeof getRules>> | null;
  auction_active: boolean | null;
  auction_tile_index: number | null;
  auction_current_bid: number | null;
  auction_current_winner_player_id: string | null;
  auction_turn_player_id: string | null;
  pending_card_active: boolean | null;
  pending_card_deck: "CHANCE" | "COMMUNITY" | null;
  pending_card_id: string | null;
  pending_card_title: string | null;
  pending_card_kind: string | null;
  pending_card_payload: Record<string, unknown> | null;
  pending_card_drawn_by_player_id: string | null;
  pending_card_drawn_at: string | null;
  pending_card_source_tile_index: number | null;
};

type GameEvent = {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  version: number;
};

type BoardHighlight = {
  id: string;
  version: number;
  title: string;
  subtext: string | null;
};

const getTurnsRemainingFromPayload = (payload: unknown): number | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const value =
    "turns_remaining" in record
      ? record.turns_remaining
      : record.turns_remaining_after;
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const getPendingCardDescription = (
  kind: string | null,
  payload: Record<string, unknown> | null,
  boardPack: ReturnType<typeof getBoardPackById> | null,
) => {
  if (!kind) {
    return "Card effect pending.";
  }
  const data = payload ?? {};
  if (kind === "PAY" || kind === "RECEIVE") {
    const amount =
      typeof data.amount === "number"
        ? data.amount
        : typeof data.amount === "string"
          ? Number.parseInt(data.amount, 10)
          : null;
    if (amount !== null) {
      return kind === "PAY"
        ? `Pay $${amount}.`
        : `Receive $${amount}.`;
    }
    return kind === "PAY" ? "Pay the bank." : "Receive money from the bank.";
  }
  if (kind === "MOVE_TO") {
    const tileIndex =
      typeof data.tile_index === "number"
        ? data.tile_index
        : typeof data.tile_index === "string"
          ? Number.parseInt(data.tile_index, 10)
          : null;
    const tileName =
      tileIndex !== null
        ? boardPack?.tiles?.find((tile) => tile.index === tileIndex)?.name ??
          `Tile ${tileIndex}`
        : "a specific tile";
    return `Move to ${tileName}.`;
  }
  if (kind === "MOVE_REL") {
    const spaces =
      typeof data.relative_spaces === "number"
        ? data.relative_spaces
        : typeof data.spaces === "number"
          ? data.spaces
          : typeof data.relative_spaces === "string"
            ? Number.parseInt(data.relative_spaces, 10)
            : typeof data.spaces === "string"
              ? Number.parseInt(data.spaces, 10)
              : null;
    if (spaces !== null) {
      return spaces >= 0
        ? `Move forward ${spaces} spaces.`
        : `Move back ${Math.abs(spaces)} spaces.`;
    }
    return "Move to a new space.";
  }
  if (kind === "GET_OUT_OF_JAIL_FREE") {
    return "Keep this card to use later.";
  }
  if (kind === "GO_TO_JAIL") {
    return "Go directly to jail.";
  }
  return "Card effect pending.";
};


const meaningfulEventTypes = new Set([
  "MOVE_PLAYER",
  "MOVE_RESOLVED",
  "PLAYER_MOVED",
  "BUY_PROPERTY",
  "PROPERTY_PURCHASED",
  "AUCTION_STARTED",
  "AUCTION_BID",
  "AUCTION_WON",
  "AUCTION_PASS",
  "RENT_PAID",
  "GO_TO_JAIL",
  "JAIL_DECISION",
  "JAIL_RELEASED",
  "JAIL_PAY_FINE",
  "JAIL_DOUBLES_SUCCESS",
  "JAIL_DOUBLES_FAIL",
  "CARD_REVEALED",
  "CARD_RESOLVED",
  "DRAW_CARD",
  "CARD_MOVE_TO",
  "CARD_MOVE_REL",
  "CARD_GO_TO_JAIL",
  "CARD_PAY",
  "CARD_RECEIVE",
  "TURN_STARTED",
  "END_TURN",
  "PASS_GO",
  "PAY_TAX",
  "LAND_ON_TILE",
  "MACRO_EVENT",
  "MACRO_EVENT_TRIGGERED",
  "MACRO_EVENT_EXPIRED",
  "MACRO_EXPIRED",
]);

const isMeaningfulBoardEvent = (eventType: string, description: string) => {
  if (!description || description === "Update received") {
    return false;
  }

  return meaningfulEventTypes.has(eventType);
};

const mergeBoardEvents = (incoming: GameEvent[], existing: GameEvent[]) => {
  const merged = [...incoming, ...existing];
  const seen = new Set<string>();
  return merged
    .sort((a, b) => b.version - a.version)
    .filter((event) => {
      if (seen.has(event.id)) {
        return false;
      }
      seen.add(event.id);
      return true;
    })
    .slice(0, 30);
};

const dedupeBoardHighlights = (highlights: BoardHighlight[]) => {
  const deduped: BoardHighlight[] = [];

  for (const highlight of highlights) {
    const previous = deduped[deduped.length - 1];
    if (!previous) {
      deduped.push(highlight);
      continue;
    }

    const sameText =
      previous.title === highlight.title && previous.subtext === highlight.subtext;
    const closeVersions = Math.abs(previous.version - highlight.version) <= 1;

    if (sameText && closeVersions) {
      continue;
    }

    deduped.push(highlight);
  }

  return deduped;
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

type SnapshotResponse = {
  gameMeta: GameMeta;
  players: Player[];
  gameState: GameState | null;
  events: GameEvent[];
  ownershipRows: OwnershipRow[];
};

type BoardDisplayPageProps = {
  params: {
    gameId: string;
  };
};

export default function BoardDisplayPage({ params }: BoardDisplayPageProps) {
  const routeParams = useParams<{ gameId: string }>();
  const gameId = routeParams?.gameId ?? params.gameId;
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [gameMeta, setGameMeta] = useState<GameMeta | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [ownershipByTile, setOwnershipByTile] = useState<OwnershipByTile>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveUpdatesNotice, setLiveUpdatesNotice] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? false : !navigator.onLine,
  );
  const unmountingRef = useRef(false);
  const refreshRequestInFlightRef = useRef(false);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeFailedRef = useRef(false);
  const lastRealtimeUpdateAtRef = useRef<number | null>(null);

  const isConfigured = useMemo(() => supabaseClient.isConfigured(), []);

  const loadPlayers = useCallback(
    async (accessToken?: string) => {
      const playerRows = await supabaseClient.fetchFromSupabase<Player[]>(
        `players?select=id,user_id,display_name,created_at,position,is_eliminated,eliminated_at&game_id=eq.${gameId}&order=created_at.asc`,
        { method: "GET" },
        accessToken,
      );
      setPlayers(playerRows);
    },
    [gameId],
  );

  const loadGameState = useCallback(
    async (accessToken?: string) => {
      const [stateRow] = await supabaseClient.fetchFromSupabase<GameState[]>(
        `game_state?select=game_id,version,current_player_id,last_roll,chance_index,community_index,free_parking_pot,rules,auction_active,auction_tile_index,auction_current_bid,auction_current_winner_player_id,auction_turn_player_id,pending_card_active,pending_card_deck,pending_card_id,pending_card_title,pending_card_kind,pending_card_payload,pending_card_drawn_by_player_id,pending_card_drawn_at,pending_card_source_tile_index&game_id=eq.${gameId}&limit=1`,
        { method: "GET" },
        accessToken,
      );
      setGameState(stateRow ?? null);
    },
    [gameId],
  );

  const loadEvents = useCallback(
    async (accessToken?: string) => {
      const eventRows = await supabaseClient.fetchFromSupabase<GameEvent[]>(
        `game_events?select=id,event_type,payload,created_at,version&game_id=eq.${gameId}&order=version.desc&limit=30`,
        { method: "GET" },
        accessToken,
      );
      setEvents((existingEvents) => mergeBoardEvents(eventRows, existingEvents));
    },
    [gameId],
  );

  const loadOwnership = useCallback(
    async (accessToken?: string) => {
      const ownershipRows = await supabaseClient.fetchFromSupabase<
        OwnershipRow[]
      >(
        `property_ownership?select=tile_index,owner_player_id,collateral_loan_id,purchase_mortgage_id,houses&game_id=eq.${gameId}`,
        { method: "GET" },
        accessToken,
      );
      const mapped = ownershipRows.reduce<OwnershipByTile>((acc, row) => {
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
    },
    [gameId],
  );

  const loadBoardData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    if (!silent) {
      setLoading(true);
      setErrorMessage(null);
    }

    try {
      const currentSession = await supabaseClient.getSession();
      setSession(currentSession);

      const snapshotResponse = await fetch("/api/board/snapshot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ gameId }),
      });

      if (!snapshotResponse.ok) {
        if (snapshotResponse.status === 404) {
          throw new Error("This game is unavailable or no longer watchable.");
        }
        throw new Error("Unable to load the board right now.");
      }

      const snapshot = (await snapshotResponse.json()) as SnapshotResponse;

      setGameMeta(snapshot.gameMeta ?? null);
      setPlayers(snapshot.players ?? []);
      setGameState(snapshot.gameState ?? null);
      setEvents((existingEvents) =>
        mergeBoardEvents(snapshot.events ?? [], existingEvents),
      );

      const mapped = (snapshot.ownershipRows ?? []).reduce<OwnershipByTile>(
        (acc, row) => {
          if (row.owner_player_id) {
            acc[row.tile_index] = {
              owner_player_id: row.owner_player_id,
              collateral_loan_id: row.collateral_loan_id ?? null,
              purchase_mortgage_id: row.purchase_mortgage_id ?? null,
              houses: row.houses ?? 0,
            };
          }
          return acc;
        },
        {},
      );
      setOwnershipByTile(mapped);
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Unable to load board data.");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [gameId, isConfigured]);

  const requestRefresh = useCallback((reason: string) => {
    if (!isConfigured) {
      return;
    }

    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = setTimeout(async () => {
      if (refreshRequestInFlightRef.current) {
        return;
      }

      refreshRequestInFlightRef.current = true;
      try {
        if (DEBUG) {
          console.info("[Board][Refresh] requested", { reason, gameId });
        }
        await loadBoardData({ silent: true });
      } finally {
        refreshRequestInFlightRef.current = false;
      }
    }, REFRESH_DEBOUNCE_MS);
  }, [gameId, isConfigured, loadBoardData]);

  useEffect(() => {
    void loadBoardData();
  }, [loadBoardData]);

  useEffect(() => {
    if (!isConfigured) {
      return;
    }

    setLiveUpdatesNotice(null);

    const realtimeClient = supabaseClient.getRealtimeClient();
    if (!realtimeClient) {
      return;
    }

    const channelName = `board-display:${gameId}`;
    if (DEBUG) {
      console.info("[Board][Realtime] create channel", {
        channel: channelName,
        gameId,
        hasAccessToken: Boolean(session?.access_token),
      });
    }
    const channel = realtimeClient
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `game_id=eq.${gameId}`,
        },
        async (payload) => {
          if (DEBUG) {
            console.info("[Board][Realtime] payload", {
              table: "players",
              eventType: payload.eventType,
              gameId,
            });
          }
          try {
            await loadPlayers(session?.access_token);
            lastRealtimeUpdateAtRef.current = Date.now();
          } catch (error) {
            if (DEBUG) {
              console.error("[Board][Realtime] players handler error", error);
            }
            setLiveUpdatesNotice("Live updates unavailable — syncing via snapshot.");
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_state",
          filter: `game_id=eq.${gameId}`,
        },
        async (payload) => {
          if (DEBUG) {
            console.info("[Board][Realtime] payload", {
              table: "game_state",
              eventType: payload.eventType,
              gameId,
            });
          }
          try {
            await loadGameState(session?.access_token);
            lastRealtimeUpdateAtRef.current = Date.now();
          } catch (error) {
            if (DEBUG) {
              console.error("[Board][Realtime] game_state handler error", error);
            }
            setLiveUpdatesNotice("Live updates unavailable — syncing via snapshot.");
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_events",
          filter: `game_id=eq.${gameId}`,
        },
        async (payload) => {
          if (DEBUG) {
            console.info("[Board][Realtime] payload", {
              table: "game_events",
              eventType: payload.eventType,
              gameId,
            });
          }
          try {
            await loadEvents(session?.access_token);
            lastRealtimeUpdateAtRef.current = Date.now();
          } catch (error) {
            if (DEBUG) {
              console.error("[Board][Realtime] game_events handler error", error);
            }
            setLiveUpdatesNotice("Live updates unavailable — syncing via snapshot.");
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "property_ownership",
          filter: `game_id=eq.${gameId}`,
        },
        async (payload) => {
          if (DEBUG) {
            console.info("[Board][Realtime] payload", {
              table: "property_ownership",
              eventType: payload.eventType,
              gameId,
            });
          }
          try {
            await loadOwnership(session?.access_token);
            lastRealtimeUpdateAtRef.current = Date.now();
          } catch (error) {
            if (DEBUG) {
              console.error(
                "[Board][Realtime] property_ownership handler error",
                error,
              );
            }
            setLiveUpdatesNotice("Live updates unavailable — syncing via snapshot.");
          }
        },
      )
      .subscribe((status) => {
        if (DEBUG) {
          console.info("[Board][Realtime] status", {
            status,
            gameId,
          });
        }

        if (status === "SUBSCRIBED") {
          realtimeFailedRef.current = false;
          setLiveUpdatesNotice(null);
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          realtimeFailedRef.current = true;
          setLiveUpdatesNotice("Live updates unavailable — syncing via snapshot.");
        }
      });

    return () => {
      if (DEBUG) {
        console.info("[Board][Realtime] cleanup", {
          channel: channelName,
          reason: unmountingRef.current ? "unmount" : "dependency change",
        });
      }
      realtimeClient.removeChannel(channel);
    };
  }, [
    isConfigured,
    loadEvents,
    loadGameState,
    loadOwnership,
    loadPlayers,
    gameId,
    session?.access_token,
  ]);

  useEffect(() => {
    if (!isConfigured) {
      return;
    }

    const shouldPoll = () => {
      if (!session) {
        return true;
      }

      if (realtimeFailedRef.current) {
        return true;
      }

      if (
        lastRealtimeUpdateAtRef.current !== null &&
        Date.now() - lastRealtimeUpdateAtRef.current > REALTIME_STALE_TIMEOUT_MS
      ) {
        return true;
      }

      return false;
    };

    const pollSnapshot = () => {
      if (!shouldPoll()) {
        return;
      }
      requestRefresh("poll");
    };

    const intervalId = window.setInterval(() => {
      pollSnapshot();
    }, SNAPSHOT_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isConfigured, requestRefresh, session]);


  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        requestRefresh("visibility");
      }
    };

    const handleFocus = () => {
      requestRefresh("focus");
    };

    const handleOnline = () => {
      setIsOffline(false);
      requestRefresh("online");
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);

      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [requestRefresh]);

  useEffect(() => {
    return () => {
      unmountingRef.current = true;
    };
  }, []);

  const currentPlayer = players.find(
    (player) => player.id === gameState?.current_player_id,
  );
  const lastMoveEvent = events.find(
    (event) => event.event_type === "MOVE_PLAYER",
  );
  const lastMovePayload = lastMoveEvent?.payload ?? {};
  const lastMovedPlayerId =
    typeof lastMovePayload.player_id === "string"
      ? lastMovePayload.player_id
      : null;
  const lastMovedTileIndexValue =
    typeof lastMovePayload.to === "number"
      ? lastMovePayload.to
      : typeof lastMovePayload.to === "string"
        ? Number.parseInt(lastMovePayload.to, 10)
        : null;
  const lastMovedTileIndex = Number.isFinite(lastMovedTileIndexValue)
    ? Number(lastMovedTileIndexValue)
    : null;
  const boardPack = getBoardPackById(gameMeta?.board_pack_id);
  const isAuctionActive = Boolean(gameState?.auction_active);
  const auctionSummary = useMemo(() => {
    if (!isAuctionActive) {
      return null;
    }

    const tileIndex = gameState?.auction_tile_index;
    const tileName =
      tileIndex !== null && tileIndex !== undefined
        ? boardPack?.tiles?.find((tile) => tile.index === tileIndex)?.name ??
          `Tile ${tileIndex}`
        : "Property";

    const highestBidderId = gameState?.auction_current_winner_player_id ?? null;
    const highestBidderName =
      players.find((player) => player.id === highestBidderId)?.display_name ??
      (highestBidderId ? "Player" : null);
    const currentBid =
      typeof gameState?.auction_current_bid === "number"
        ? gameState.auction_current_bid
        : null;
    const activeBidderId = gameState?.auction_turn_player_id ?? null;
    const activeBidderName =
      players.find((player) => player.id === activeBidderId)?.display_name ??
      (activeBidderId ? "Player" : null);

    const statusLine = highestBidderName
      ? `Highest bidder: ${highestBidderName}`
      : activeBidderName
        ? `Waiting for bids · Next: ${activeBidderName}`
        : "Waiting for bids";

    return {
      tileName,
      currentBid,
      highestBidderName,
      statusLine,
    };
  }, [
    boardPack?.tiles,
    gameState?.auction_current_bid,
    gameState?.auction_current_winner_player_id,
    gameState?.auction_tile_index,
    gameState?.auction_turn_player_id,
    isAuctionActive,
    players,
  ]);
  const pendingCard = useMemo(() => {
    if (!gameState?.pending_card_active) {
      return null;
    }
    return {
      deck: gameState.pending_card_deck ?? null,
      title: gameState.pending_card_title ?? "Card",
      kind: gameState.pending_card_kind ?? null,
      payload: gameState.pending_card_payload ?? null,
      drawnBy: gameState.pending_card_drawn_by_player_id ?? null,
    };
  }, [
    gameState?.pending_card_active,
    gameState?.pending_card_deck,
    gameState?.pending_card_kind,
    gameState?.pending_card_payload,
    gameState?.pending_card_title,
    gameState?.pending_card_drawn_by_player_id,
  ]);
  const pendingCardDescription = useMemo(
    () =>
      pendingCard
        ? getPendingCardDescription(pendingCard.kind, pendingCard.payload, boardPack)
        : null,
    [boardPack, pendingCard],
  );
  const pendingCardActorName = useMemo(() => {
    if (!pendingCard?.drawnBy) {
      return null;
    }
    return (
      players.find((player) => player.id === pendingCard.drawnBy)?.display_name ??
      "Player"
    );
  }, [pendingCard?.drawnBy, players]);
  const pendingDeckLabel =
    pendingCard?.deck === "CHANCE"
      ? "Chance"
      : pendingCard?.deck === "COMMUNITY"
        ? "Community"
        : "Card";
  const currentPlayerTile = useMemo(() => {
    if (!currentPlayer || !boardPack?.tiles) {
      return null;
    }
    return (
      boardPack.tiles.find((tile) => tile.index === currentPlayer.position) ??
      null
    );
  }, [boardPack?.tiles, currentPlayer]);
  const getOwnershipLabel = useCallback(
    (tileIndex: number | null) => {
      if (tileIndex === null || Number.isNaN(tileIndex)) {
        return null;
      }

      const ownership = ownershipByTile[tileIndex];
      if (!ownership) {
        return "Unowned";
      }

      const owner = players.find(
        (player) => player.id === ownership.owner_player_id,
      );
      return `Owned by ${owner?.display_name ?? "Player"}`;
    },
    [ownershipByTile, players],
  );
  const formatEventDescription = useCallback(
    (event: GameEvent) => {
      const payload = (event.payload ?? {}) as Partial<{
        amount: number | string;
        dice_total: number | string;
        multiplier: number | string;
        player_name: string;
        reason: string;
        rent: number | string;
      }>;

      if (event.event_type === "LAND_ON_TILE") {
        const payload = event.payload as { tile_index?: unknown } | null;
        const tileIndexRaw = payload?.tile_index;
        const tileIndex =
          typeof tileIndexRaw === "number"
            ? tileIndexRaw
            : typeof tileIndexRaw === "string"
              ? Number.parseInt(tileIndexRaw, 10)
              : null;
        const tile = boardPack?.tiles?.find((entry) => entry.index === tileIndex);
        const tileLabel = tile
          ? `${tile.index} ${tile.name}`
          : tileIndex !== null
            ? `Tile ${tileIndex}`
            : "Tile";
        const ownershipLabel = getOwnershipLabel(tileIndex);
        return ownershipLabel
          ? `Landed on ${tileLabel} · ${ownershipLabel}`
          : `Landed on ${tileLabel}`;
      }

      if (event.event_type === "MACRO_EVENT") {
        const payload = event.payload as
          | {
              event_name?: unknown;
              rarity?: unknown;
              duration_rounds?: unknown;
            }
          | null;
        const eventName =
          typeof payload?.event_name === "string"
            ? payload.event_name
            : "Macroeconomic shift";
        const rarityRaw =
          typeof payload?.rarity === "string" ? payload.rarity : null;
        const rarity = rarityRaw ? rarityRaw.replaceAll("_", " ") : null;
        const duration =
          typeof payload?.duration_rounds === "number"
            ? payload.duration_rounds
            : typeof payload?.duration_rounds === "string"
              ? Number.parseInt(payload.duration_rounds, 10)
              : null;
        const durationLabel = duration !== null ? ` · ${duration} rounds` : "";
        const rarityLabel = rarity ? ` (${rarity})` : "";
        return `Macro event: ${eventName}${rarityLabel}${durationLabel}`;
      }

      if (event.event_type === "MACRO_EVENT_TRIGGERED") {
        const payload = event.payload as
          | {
              event_name?: unknown;
              rarity?: unknown;
              duration_rounds?: unknown;
            }
          | null;
        const eventName =
          typeof payload?.event_name === "string"
            ? payload.event_name
            : "Macroeconomic shift";
        const rarityRaw =
          typeof payload?.rarity === "string" ? payload.rarity : null;
        const rarity = rarityRaw ? rarityRaw.replaceAll("_", " ") : null;
        const duration =
          typeof payload?.duration_rounds === "number"
            ? payload.duration_rounds
            : typeof payload?.duration_rounds === "string"
              ? Number.parseInt(payload.duration_rounds, 10)
              : null;
        const durationLabel = duration !== null ? ` · ${duration} rounds` : "";
        const rarityLabel = rarity ? ` (${rarity})` : "";
        return `Macro event triggered: ${eventName}${rarityLabel}${durationLabel}`;
      }

      if (
        event.event_type === "MACRO_EVENT_EXPIRED" ||
        event.event_type === "MACRO_EXPIRED"
      ) {
        const payload = event.payload as { event_name?: unknown } | null;
        const eventName =
          typeof payload?.event_name === "string"
            ? payload.event_name
            : "Macroeconomic shift";
        return `Macro event expired: ${eventName}`;
      }

      if (event.event_type === "MACRO_MAINTENANCE_CHARGED") {
        const payload = event.payload as
          | { event_name?: unknown; per_house?: unknown }
          | null;
        const perHouse =
          typeof payload?.per_house === "number"
            ? payload.per_house
            : typeof payload?.per_house === "string"
              ? Number.parseInt(payload.per_house, 10)
              : null;
        const eventName =
          typeof payload?.event_name === "string"
            ? payload.event_name
            : "Macro maintenance";
        return perHouse !== null
          ? `${eventName} maintenance charged ($${perHouse} per house)`
          : `${eventName} maintenance charged`;
      }

      if (event.event_type === "MACRO_INTEREST_SURCHARGE") {
        const payload = event.payload as
          | { amount?: unknown; tile_index?: unknown }
          | null;
        const amount =
          typeof payload?.amount === "number"
            ? payload.amount
            : typeof payload?.amount === "string"
              ? Number.parseInt(payload.amount, 10)
              : null;
        const tileIndexRaw = payload?.tile_index;
        const tileIndex =
          typeof tileIndexRaw === "number"
            ? tileIndexRaw
            : typeof tileIndexRaw === "string"
              ? Number.parseInt(tileIndexRaw, 10)
              : null;
        const tileNameFromBoard =
          tileIndex !== null
            ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
            : null;
        const tileLabel =
          tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
        return amount !== null
          ? `Macro interest surcharge: $${amount} (${tileLabel})`
          : `Macro interest surcharge (${tileLabel})`;
      }

      if (event.event_type === "DRAW_CARD") {
        const payload = event.payload as
          | {
              deck?: unknown;
              card_title?: unknown;
              player_name?: unknown;
            }
          | null;
        const deck = typeof payload?.deck === "string" ? payload.deck : "Card";
        const cardTitle =
          typeof payload?.card_title === "string" ? payload.card_title : "Card";
        const playerName =
          typeof payload?.player_name === "string"
            ? payload.player_name
            : "Player";
        return `${playerName} drew ${deck}: ${cardTitle}`;
      }

      if (event.event_type === "CARD_REVEALED") {
        const payload = event.payload as
          | {
              deck?: unknown;
              card_title?: unknown;
            }
          | null;
        const deck = typeof payload?.deck === "string" ? payload.deck : "Card";
        const cardTitle =
          typeof payload?.card_title === "string" ? payload.card_title : "Card";
        return `${deck} card revealed: ${cardTitle}`;
      }

      if (event.event_type === "CARD_UTILITY_ROLL") {
        const payload = event.payload as
          | {
              roll?: unknown;
              dice?: unknown;
            }
          | null;
        const dice = payload?.dice;
        const diceDisplay =
          Array.isArray(dice) &&
          dice.length >= 2 &&
          typeof dice[0] === "number" &&
          typeof dice[1] === "number"
            ? `🎲 ${dice[0]} + ${dice[1]}`
            : null;
        if (diceDisplay) {
          return `Rolled ${diceDisplay} for utility rent (card effect)`;
        }
        const roll =
          typeof payload?.roll === "number"
            ? payload.roll
            : typeof payload?.roll === "string"
              ? Number.parseInt(payload.roll, 10)
              : null;
        return roll !== null
          ? `Rolled ${roll} for utility rent (card effect)`
          : "Rolled for utility rent (card effect)";
      }

      if (event.event_type === "CARD_PAY") {
        const payload = event.payload as
          | {
              amount?: unknown;
              card_title?: unknown;
              player_name?: unknown;
            }
          | null;
        const amount =
          typeof payload?.amount === "number"
            ? payload.amount
            : typeof payload?.amount === "string"
              ? Number.parseInt(payload.amount, 10)
              : null;
        const cardTitle =
          typeof payload?.card_title === "string" ? payload.card_title : "Card";
        const playerName =
          typeof payload?.player_name === "string"
            ? payload.player_name
            : "Player";
        return amount !== null
          ? `${playerName} paid $${amount} (${cardTitle})`
          : `${playerName} paid (${cardTitle})`;
      }

      if (event.event_type === "CARD_RECEIVE") {
        const payload = event.payload as
          | {
              amount?: unknown;
              card_title?: unknown;
              player_name?: unknown;
            }
          | null;
        const amount =
          typeof payload?.amount === "number"
            ? payload.amount
            : typeof payload?.amount === "string"
              ? Number.parseInt(payload.amount, 10)
              : null;
        const cardTitle =
          typeof payload?.card_title === "string" ? payload.card_title : "Card";
        const playerName =
          typeof payload?.player_name === "string"
            ? payload.player_name
            : "Player";
        return amount !== null
          ? `${playerName} received $${amount} (${cardTitle})`
          : `${playerName} received (${cardTitle})`;
      }

      if (
        event.event_type === "CARD_MOVE_TO" ||
        event.event_type === "CARD_MOVE_REL"
      ) {
        const payload = event.payload as
          | {
              to_tile_index?: unknown;
              card_title?: unknown;
              player_name?: unknown;
            }
          | null;
        const toIndexRaw = payload?.to_tile_index;
        const toIndex =
          typeof toIndexRaw === "number"
            ? toIndexRaw
            : typeof toIndexRaw === "string"
              ? Number.parseInt(toIndexRaw, 10)
              : null;
        const tileNameFromBoard =
          toIndex !== null
            ? boardPack?.tiles?.find((entry) => entry.index === toIndex)?.name
            : null;
        const tileLabel =
          tileNameFromBoard ?? (toIndex !== null ? `Tile ${toIndex}` : "tile");
        const cardTitle =
          typeof payload?.card_title === "string" ? payload.card_title : "Card";
        const playerName =
          typeof payload?.player_name === "string"
            ? payload.player_name
            : "Player";
        return `${playerName} moved to ${tileLabel} (${cardTitle})`;
      }

      if (event.event_type === "CARD_GO_TO_JAIL") {
        const payload = event.payload as
          | {
              card_title?: unknown;
              player_name?: unknown;
            }
          | null;
        const cardTitle =
          typeof payload?.card_title === "string" ? payload.card_title : "Card";
        const playerName =
          typeof payload?.player_name === "string"
            ? payload.player_name
            : "Player";
        return `${playerName} went to jail (${cardTitle})`;
      }

      if (event.event_type === "CARD_GET_OUT_OF_JAIL_FREE_RECEIVED") {
        const payload = event.payload as
          | {
              card_title?: unknown;
              player_name?: unknown;
              total_cards?: unknown;
            }
          | null;
        const cardTitle =
          typeof payload?.card_title === "string"
            ? payload.card_title
            : "Get Out of Jail Free";
        const playerName =
          typeof payload?.player_name === "string"
            ? payload.player_name
            : "Player";
        const totalCardsRaw = payload?.total_cards;
        const totalCards =
          typeof totalCardsRaw === "number"
            ? totalCardsRaw
            : typeof totalCardsRaw === "string"
              ? Number.parseInt(totalCardsRaw, 10)
              : null;
        return totalCards !== null
          ? `${playerName} received a ${cardTitle} card (${totalCards} total)`
          : `${playerName} received a ${cardTitle} card`;
      }

      if (event.event_type === "CARD_GET_OUT_OF_JAIL_FREE_USED") {
        const payload = event.payload as
          | {
              player_name?: unknown;
              remaining_cards?: unknown;
            }
          | null;
        const playerName =
          typeof payload?.player_name === "string"
            ? payload.player_name
            : "Player";
        const remainingRaw = payload?.remaining_cards;
        const remainingCards =
          typeof remainingRaw === "number"
            ? remainingRaw
            : typeof remainingRaw === "string"
              ? Number.parseInt(remainingRaw, 10)
              : null;
        return remainingCards !== null
          ? `${playerName} used a Get Out of Jail Free card (${remainingCards} left)`
          : `${playerName} used a Get Out of Jail Free card`;
      }

      if (event.event_type === "START_GAME") {
        return "Game started";
      }

      if (event.event_type === "COLLECT_GO") {
        const amount =
          typeof payload?.amount === "number"
            ? payload.amount
            : typeof payload?.amount === "string"
              ? Number.parseInt(payload.amount, 10)
              : null;
        const playerName =
          typeof payload?.player_name === "string"
            ? payload.player_name
            : "Player";
        const reason =
          typeof payload?.reason === "string" ? payload.reason : "PASS_START";
        const reasonLabel =
          reason === "LAND_GO" ? "for landing on GO" : "for passing GO";
        return amount !== null
          ? `${playerName} collected $${amount} ${reasonLabel}`
          : `${playerName} collected GO salary`;
      }

      if (event.event_type === "END_TURN") {
        const payload = event.payload as { to_player_name?: unknown } | null;
        return typeof payload?.to_player_name === "string"
          ? `Turn → ${payload.to_player_name}`
          : "Turn ended";
      }

      if (event.event_type === "PAY_RENT") {
        const payload = event.payload as
          | {
              tile_index?: unknown;
              amount?: unknown;
              dice_total?: unknown;
              multiplier?: unknown;
              rent_type?: unknown;
              rent_multiplier_total?: unknown;
              to_player_id?: unknown;
            }
          | null;
        const tileIndexRaw = payload?.tile_index;
        const tileIndex =
          typeof tileIndexRaw === "number"
            ? tileIndexRaw
            : typeof tileIndexRaw === "string"
              ? Number.parseInt(tileIndexRaw, 10)
              : null;
        const tileNameFromBoard =
          tileIndex !== null
            ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
            : null;
        const tileLabel =
          tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
        const rentAmount =
          typeof payload?.amount === "number"
            ? payload.amount
            : typeof payload?.amount === "string"
              ? Number.parseInt(payload.amount, 10)
              : null;
        const ownerId =
          typeof payload?.to_player_id === "string"
            ? payload.to_player_id
            : null;
        const ownerName =
          players.find((player) => player.id === ownerId)?.display_name ??
          "Player";
        const diceTotal =
          typeof payload?.dice_total === "number"
            ? payload.dice_total
            : typeof payload?.dice_total === "string"
              ? Number.parseInt(payload.dice_total, 10)
              : null;
        const multiplier =
          typeof payload?.multiplier === "number"
            ? payload.multiplier
            : typeof payload?.multiplier === "string"
              ? Number.parseInt(payload.multiplier, 10)
              : null;
        const rentType =
          typeof payload?.rent_type === "string" ? payload.rent_type : null;
        const detailLabel =
          rentType === "UTILITY" && diceTotal !== null && multiplier !== null
            ? ` (dice ${diceTotal} × ${multiplier})`
            : "";
        const rentMultiplierTotal =
          typeof payload?.rent_multiplier_total === "number"
            ? payload.rent_multiplier_total
            : typeof payload?.rent_multiplier_total === "string"
              ? Number.parseFloat(payload.rent_multiplier_total)
              : null;
        const macroLabel =
          rentMultiplierTotal !== null && rentMultiplierTotal !== 1
            ? ` (macro ×${rentMultiplierTotal.toFixed(2)})`
            : "";

        return rentAmount !== null
          ? `Paid $${rentAmount} rent to ${ownerName} (${tileLabel})${detailLabel}${macroLabel}`
          : `Paid rent to ${ownerName} (${tileLabel})${macroLabel}`;
      }

      if (event.event_type === "RENT_SKIPPED_COLLATERAL") {
        const payload = event.payload as { tile_index?: unknown } | null;
        const tileIndexRaw = payload?.tile_index;
        const tileIndex =
          typeof tileIndexRaw === "number"
            ? tileIndexRaw
            : typeof tileIndexRaw === "string"
              ? Number.parseInt(tileIndexRaw, 10)
              : null;
        const tileNameFromBoard =
          tileIndex !== null
            ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
            : null;
        const tileLabel =
          tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
        return `Rent skipped on ${tileLabel} (collateralized)`;
      }

      if (event.event_type === "COLLATERAL_LOAN_TAKEN") {
        const payload = event.payload as
          | {
              tile_index?: unknown;
              principal?: unknown;
              payment_per_turn?: unknown;
              term_turns?: unknown;
            }
          | null;
        const tileIndexRaw = payload?.tile_index;
        const tileIndex =
          typeof tileIndexRaw === "number"
            ? tileIndexRaw
            : typeof tileIndexRaw === "string"
              ? Number.parseInt(tileIndexRaw, 10)
              : null;
        const tileNameFromBoard =
          tileIndex !== null
            ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
            : null;
        const tileLabel =
          tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
        const principal =
          typeof payload?.principal === "number"
            ? payload.principal
            : typeof payload?.principal === "string"
              ? Number.parseInt(payload.principal, 10)
              : null;
        const payment =
          typeof payload?.payment_per_turn === "number"
            ? payload.payment_per_turn
            : typeof payload?.payment_per_turn === "string"
              ? Number.parseInt(payload.payment_per_turn, 10)
              : null;
        const termTurns =
          typeof payload?.term_turns === "number"
            ? payload.term_turns
            : typeof payload?.term_turns === "string"
              ? Number.parseInt(payload.term_turns, 10)
              : null;
        const principalLabel =
          principal !== null ? ` for $${principal}` : "";
        const paymentLabel =
          payment !== null && termTurns !== null
            ? ` · $${payment}/turn × ${termTurns}`
            : "";
        return `Collateral loan on ${tileLabel}${principalLabel}${paymentLabel}`;
      }

      if (event.event_type === "COLLATERAL_LOAN_PAYMENT") {
        const payload = event.payload as
          | {
              tile_index?: unknown;
              amount?: unknown;
              turns_remaining_after?: unknown;
            }
          | null;
        const tileIndexRaw = payload?.tile_index;
        const tileIndex =
          typeof tileIndexRaw === "number"
            ? tileIndexRaw
            : typeof tileIndexRaw === "string"
              ? Number.parseInt(tileIndexRaw, 10)
              : null;
        const tileNameFromBoard =
          tileIndex !== null
            ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
            : null;
        const tileLabel =
          tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
        const payment =
          typeof payload?.amount === "number"
            ? payload.amount
            : typeof payload?.amount === "string"
              ? Number.parseInt(payload.amount, 10)
              : null;
        const turnsRemaining = getTurnsRemainingFromPayload(payload);
        if (payment !== null && turnsRemaining !== null) {
          return `Loan payment $${payment} on ${tileLabel} · ${turnsRemaining} turns left`;
        }
        if (payment !== null) {
          return `Loan payment $${payment} on ${tileLabel}`;
        }
        return `Loan payment on ${tileLabel}`;
      }

      if (event.event_type === "COLLATERAL_LOAN_PAID") {
        const payload = event.payload as { tile_index?: unknown } | null;
        const tileIndexRaw = payload?.tile_index;
        const tileIndex =
          typeof tileIndexRaw === "number"
            ? tileIndexRaw
            : typeof tileIndexRaw === "string"
              ? Number.parseInt(tileIndexRaw, 10)
              : null;
        const tileNameFromBoard =
          tileIndex !== null
            ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
            : null;
        const tileLabel =
          tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
        return `Loan paid off on ${tileLabel}`;
      }

      if (event.event_type === "LOAN_PAID_OFF") {
        const payload = event.payload as
          | {
              tile_index?: unknown;
              amount?: unknown;
            }
          | null;
        const tileIndexRaw = payload?.tile_index;
        const tileIndex =
          typeof tileIndexRaw === "number"
            ? tileIndexRaw
            : typeof tileIndexRaw === "string"
              ? Number.parseInt(tileIndexRaw, 10)
              : null;
        const tileNameFromBoard =
          tileIndex !== null
            ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
            : null;
        const tileLabel =
          tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
        const amount =
          typeof payload?.amount === "number"
            ? payload.amount
            : typeof payload?.amount === "string"
              ? Number.parseInt(payload.amount, 10)
              : null;
        if (amount !== null) {
          return `Loan paid off early on ${tileLabel} for $${amount}`;
        }
        return `Loan paid off early on ${tileLabel}`;
      }

      if (event.event_type === "PAY_TAX") {
        const payload = event.payload as
          | {
              tile_index?: unknown;
              amount?: unknown;
              payer_display_name?: unknown;
            }
          | null;
        const tileIndexRaw = payload?.tile_index;
        const tileIndex =
          typeof tileIndexRaw === "number"
            ? tileIndexRaw
            : typeof tileIndexRaw === "string"
              ? Number.parseInt(tileIndexRaw, 10)
              : null;
        const tileNameFromBoard =
          tileIndex !== null
            ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
            : null;
        const tileLabel =
          tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
        const taxAmount =
          typeof payload?.amount === "number"
            ? payload.amount
            : typeof payload?.amount === "string"
              ? Number.parseInt(payload.amount, 10)
              : null;
        const payerName =
          typeof payload?.payer_display_name === "string"
            ? payload.payer_display_name
            : "Player";

        return taxAmount !== null
          ? `${payerName} paid $${taxAmount} tax (${tileLabel})`
          : `${payerName} paid tax (${tileLabel})`;
      }

      if (event.event_type === "JAIL_PAY_FINE") {
        const payload = event.payload as
          | {
              amount?: unknown;
              player_name?: unknown;
            }
          | null;
        const fineAmount =
          typeof payload?.amount === "number"
            ? payload.amount
            : typeof payload?.amount === "string"
              ? Number.parseInt(payload.amount, 10)
              : null;
        const playerName =
          typeof payload?.player_name === "string"
            ? payload.player_name
            : "Player";
        return fineAmount !== null
          ? `${playerName} paid $${fineAmount} to get out of jail`
          : `${playerName} paid a jail fine`;
      }

      if (event.event_type === "JAIL_DOUBLES_SUCCESS") {
        const payload = event.payload as
          | {
              dice?: unknown;
              player_name?: unknown;
            }
          | null;
        const dice = Array.isArray(payload?.dice) ? payload?.dice : null;
        const diceValues =
          dice && dice.length >= 2 && dice.every((value) => typeof value === "number")
            ? dice.slice(0, 2)
            : null;
        const playerName =
          typeof payload?.player_name === "string"
            ? payload.player_name
            : "Player";
        return diceValues
          ? `${playerName} rolled doubles to leave jail (${diceValues[0]} + ${diceValues[1]})`
          : `${playerName} rolled doubles to leave jail`;
      }

      if (event.event_type === "JAIL_DOUBLES_FAIL") {
        const payload =
          event.payload && typeof event.payload === "object" ? event.payload : null;
        const dice = Array.isArray(payload?.dice) ? payload?.dice : null;
        const diceValues =
          dice && dice.length >= 2 && dice.every((value) => typeof value === "number")
            ? dice.slice(0, 2)
            : null;
        const turnsRemaining = getTurnsRemainingFromPayload(payload);
        const playerName =
          typeof payload?.player_name === "string"
            ? payload.player_name
            : "Player";
        if (diceValues && turnsRemaining !== null) {
          return `${playerName} missed doubles (${diceValues[0]} + ${diceValues[1]}). Turns remaining: ${turnsRemaining}`;
        }
        if (diceValues) {
          return `${playerName} missed doubles (${diceValues[0]} + ${diceValues[1]})`;
        }
        return `${playerName} missed doubles in jail`;
      }

      if (event.event_type === "GO_TO_JAIL") {
        const payload = event.payload as
          | {
              from_tile_index?: unknown;
              to_jail_tile_index?: unknown;
              display_name?: unknown;
              tile_index?: unknown;
              player_name?: unknown;
            }
          | null;
        const fromIndexRaw = payload?.from_tile_index;
        const fromIndex =
          typeof fromIndexRaw === "number"
            ? fromIndexRaw
            : typeof fromIndexRaw === "string"
              ? Number.parseInt(fromIndexRaw, 10)
              : null;
        const toIndexRaw = payload?.to_jail_tile_index;
        const toIndexCandidate =
          toIndexRaw ?? (payload?.tile_index as typeof toIndexRaw);
        const toIndex =
          typeof toIndexCandidate === "number"
            ? toIndexCandidate
            : typeof toIndexCandidate === "string"
              ? Number.parseInt(toIndexCandidate, 10)
              : null;
        const fromLabel =
          fromIndex !== null ? `tile ${fromIndex}` : "Go To Jail";
        const toLabel = toIndex !== null ? `jail ${toIndex}` : "jail";
        const playerName =
          typeof payload?.display_name === "string"
            ? payload.display_name
            : typeof payload?.player_name === "string"
              ? payload.player_name
              : "Player";
        return `${playerName} went to ${toLabel} from ${fromLabel}`;
      }

      return "Update received";
    },
    [boardPack?.tiles, getOwnershipLabel, players],
  );

  const playerColorPalette = [
    "#60a5fa",
    "#f87171",
    "#34d399",
    "#c084fc",
    "#fbbf24",
    "#22d3ee",
  ];
  const playerColorsById = players.reduce<Record<string, string>>((acc, player, index) => {
    acc[player.id] = playerColorPalette[index % playerColorPalette.length];
    return acc;
  }, {});
  const currentPlayerColor = currentPlayer?.id
    ? playerColorsById[currentPlayer.id] ?? "#e5e7eb"
    : "#e5e7eb";
  const phaseLabel = gameState?.pending_card_active
    ? "Card resolution pending"
    : isAuctionActive
      ? "Auction in progress"
      : gameMeta?.status === "lobby"
        ? "Lobby / waiting for players"
        : currentPlayer
          ? `Turn: ${currentPlayer.display_name ?? "Player"}`
          : "Awaiting turn";
  const currentPlayerJailTurnsRaw =
    currentPlayer &&
    typeof (currentPlayer as Player & { jail_turns_remaining?: unknown }).jail_turns_remaining ===
      "number"
      ? (currentPlayer as Player & { jail_turns_remaining?: number }).jail_turns_remaining
      : null;
  const jailStatusLabel =
    currentPlayerJailTurnsRaw && currentPlayerJailTurnsRaw > 0
      ? `In jail (${currentPlayerJailTurnsRaw} turns remaining)`
      : null;
  const eventHighlights = useMemo(() => {
    const highlights = [...events]
      .sort((a, b) => b.version - a.version)
      .map((event) => {
        const description = formatEventDescription(event);
        if (!isMeaningfulBoardEvent(event.event_type, description)) {
          return null;
        }

        const [titlePart, ...rest] = description.split(" · ");
        return {
          id: event.id,
          version: event.version,
          title: titlePart,
          subtext: rest.length > 0 ? rest.join(" · ") : null,
        } satisfies BoardHighlight;
      })
      .filter((highlight): highlight is BoardHighlight => highlight !== null);

    return dedupeBoardHighlights(highlights).slice(0, MAX_BOARD_HIGHLIGHTS);
  }, [events, formatEventDescription]);

  const boardNotice = isOffline
    ? "Offline — showing last known state"
    : liveUpdatesNotice;

  return (
    <BoardLayoutShell
      dashboard={
        <BoardDashboard
          boardPackName={boardPack?.displayName ?? "Unknown board pack"}
          gameStatus={gameMeta?.status ?? "unknown"}
          currentPlayerName={currentPlayer?.display_name ?? "Waiting for start"}
          currentPlayerColor={currentPlayerColor}
          lastRoll={gameState?.last_roll ?? null}
          currentTileName={currentPlayerTile?.name ?? "—"}
          jailStatusLabel={jailStatusLabel}
          phaseLabel={phaseLabel}
          pendingCard={
            pendingCard
              ? {
                  deckLabel: pendingDeckLabel,
                  title: pendingCard.title,
                  description: pendingCardDescription,
                  actorName: pendingCardActorName,
                }
              : null
          }
          auctionSummary={auctionSummary}
          eventHighlights={eventHighlights}
          liveUpdatesNotice={boardNotice}
          onManualRefresh={() => requestRefresh("manual")}
        />
      }
      board={
        <>
          {!isConfigured ? (
            <div className="mb-3 rounded-2xl border border-amber-200/30 bg-amber-500/10 p-4 text-amber-100">
              Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable live board updates.
            </div>
          ) : null}

          {loading ? (
            <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-white/70">Loading board…</div>
          ) : null}

          {errorMessage ? (
            <div className="mb-3 rounded-2xl border border-rose-300/40 bg-rose-500/10 p-4 text-rose-100">{errorMessage}</div>
          ) : null}

          <BoardSquare>
            <div className="relative h-full w-full">
              <BoardTrack
                tiles={boardPack?.tiles}
                players={players}
                ownershipByTile={ownershipByTile}
                playerColorsById={playerColorsById}
                currentPlayerId={currentPlayer?.id}
                lastMovedPlayerId={lastMovedPlayerId}
                lastMovedTileIndex={lastMovedTileIndex}
              />
              <CenterHub
                boardPackName={boardPack?.displayName ?? "Board"}
                lastRoll={gameState?.last_roll ?? null}
                revealedCard={
                  pendingCard && pendingCard.deck
                    ? {
                        deck: pendingCard.deck,
                        title: pendingCard.title,
                        description: pendingCardDescription,
                        statusLine: `Waiting for ${pendingCardActorName ?? "the current player"} to confirm…`,
                      }
                    : null
                }
              />
            </div>
          </BoardSquare>

        </>
      }
    />
  );
}
