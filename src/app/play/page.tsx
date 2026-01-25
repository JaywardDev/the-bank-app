"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import PageShell from "../components/PageShell";
import BoardMiniMap from "../components/BoardMiniMap";
import { getBoardPackById } from "@/lib/boardPacks";
import { supabaseClient, type SupabaseSession } from "@/lib/supabase/client";

const lastGameKey = "bank.lastGameId";
const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "true";
const JAIL_FINE_AMOUNT = 50;

type Player = {
  id: string;
  user_id: string;
  display_name: string | null;
  created_at: string | null;
  position: number;
  is_in_jail: boolean;
  jail_turns_remaining: number;
};

type GameMeta = {
  id: string;
  board_pack_id: string | null;
  status: string | null;
  created_by: string | null;
};

type GameState = {
  game_id: string;
  version: number;
  // References players.id (not auth user_id).
  current_player_id: string | null;
  balances: Record<string, number> | null;
  last_roll: number | null;
  doubles_count: number | null;
  turn_phase: string | null;
  pending_action: Record<string, unknown> | null;
};

type GameEvent = {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  version: number;
};

type OwnershipRow = {
  tile_index: number;
  owner_player_id: string;
};

type OwnershipByTile = Record<number, { owner_player_id: string }>;

type PendingPurchaseAction = {
  type: "BUY_PROPERTY";
  tile_index: number;
  price: number;
};

export default function PlayPage() {
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [gameMeta, setGameMeta] = useState<GameMeta | null>(null);
  const [gameMetaError, setGameMetaError] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [ownershipByTile, setOwnershipByTile] = useState<OwnershipByTile>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"wallet" | "board">("wallet");
  const [boardZoomed, setBoardZoomed] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [initialSnapshotReady, setInitialSnapshotReady] = useState(false);
  const [realtimeReady, setRealtimeReady] = useState(false);
  const [firstRoundResyncEnabled, setFirstRoundResyncEnabled] = useState(true);
  const [sessionInvalid, setSessionInvalid] = useState(false);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef(false);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const realtimeReconciledRef = useRef(false);
  const firstRoundEndTurnsRef = useRef<Set<string>>(new Set());
  const firstRoundResyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const realtimeContextRef = useRef<{
    gameId: string;
    accessToken: string;
    channelName: string;
  } | null>(null);
  const activeGameIdRef = useRef<string | null>(null);
  const unmountingRef = useRef(false);
  const invalidTokenRef = useRef<string | null>(null);

  const isConfigured = useMemo(() => supabaseClient.isConfigured(), []);
  const latestRollEvent = useMemo(
    () => events.find((event) => event.event_type === "ROLL_DICE"),
    [events],
  );
  const latestRolledDoubleEvent = useMemo(
    () => events.find((event) => event.event_type === "ROLLED_DOUBLE"),
    [events],
  );
  const latestRollPayload = useMemo(() => {
    const payload = latestRollEvent?.payload;
    return payload && typeof payload === "object"
      ? (payload as {
          dice?: unknown;
          doubles_count?: unknown;
          roll?: unknown;
        })
      : null;
  }, [latestRollEvent]);
  const latestDoublePayload = useMemo(() => {
    const payload = latestRolledDoubleEvent?.payload;
    return payload && typeof payload === "object"
      ? (payload as { doubles_count?: unknown })
      : null;
  }, [latestRolledDoubleEvent]);
  const latestDiceValues = useMemo(() => {
    if (!latestRollPayload) {
      return null;
    }
    const dice = latestRollPayload.dice;
    if (!Array.isArray(dice) || dice.length < 2) {
      return null;
    }
    const [first, second] = dice;
    if (typeof first !== "number" || typeof second !== "number") {
      return null;
    }
    return [first, second] as const;
  }, [latestRollPayload]);
  const latestDiceDisplay = useMemo(() => {
    if (!latestDiceValues) {
      return null;
    }
    return `🎲 ${latestDiceValues[0]} + ${latestDiceValues[1]}`;
  }, [latestDiceValues]);
  const latestDoubleStreak = useMemo(() => {
    const candidate =
      latestRollPayload?.doubles_count ?? latestDoublePayload?.doubles_count;
    return typeof candidate === "number" ? candidate : null;
  }, [latestDoublePayload, latestRollPayload]);
  const boardPack = getBoardPackById(gameMeta?.board_pack_id);
  const latestRolledDoubleConfirmed = useMemo(() => {
    if (!latestRollEvent || !latestRolledDoubleEvent) {
      return false;
    }
    return latestRolledDoubleEvent.version === latestRollEvent.version + 1;
  }, [latestRollEvent, latestRolledDoubleEvent]);
  const latestIsDouble = useMemo(() => {
    if (latestDiceValues) {
      return (
        latestRolledDoubleConfirmed ||
        latestDiceValues[0] === latestDiceValues[1]
      );
    }
    return false;
  }, [latestDiceValues, latestRolledDoubleConfirmed]);
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

  const formatEventDescription = useCallback((event: GameEvent) => {
    const payload = event.payload as
      | {
          roll?: number;
          to_player_name?: string;
          dice?: unknown;
          doubles_count?: unknown;
          tile_index?: unknown;
          tile_name?: unknown;
          price?: unknown;
          from_player_id?: unknown;
          to_player_id?: unknown;
          amount?: unknown;
          payer_display_name?: unknown;
          display_name?: unknown;
          from_tile_index?: unknown;
          to_jail_tile_index?: unknown;
          player_name?: unknown;
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
    const doublesCount =
      typeof payload?.doubles_count === "number"
        ? payload.doubles_count
        : null;

    if (event.event_type === "ROLL_DICE") {
      if (diceDisplay) {
        return `Rolled ${diceDisplay}`;
      }
      if (typeof payload?.roll === "number") {
        return `Rolled ${payload.roll}`;
      }
      return "Dice rolled";
    }

    if (event.event_type === "ROLLED_DOUBLE") {
      return doublesCount !== null
        ? `Double rolled (streak ${doublesCount})`
        : "Double rolled";
    }

    if (event.event_type === "END_TURN" && payload?.to_player_name) {
      return `Turn → ${payload.to_player_name}`;
    }

    if (event.event_type === "START_GAME") {
      return "Game started";
    }

    if (event.event_type === "LAND_ON_TILE") {
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

    if (event.event_type === "OFFER_PURCHASE") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromPayload =
        typeof payload?.tile_name === "string" ? payload.tile_name : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ??
        tileNameFromPayload ??
        (tileIndex !== null ? `Tile ${tileIndex}` : "this tile");
      const price =
        typeof payload?.price === "number"
          ? payload.price
          : typeof payload?.price === "string"
            ? Number.parseInt(payload.price, 10)
            : null;

      return price !== null
        ? `Offer: Buy ${tileLabel} for $${price}`
        : `Offer: Buy ${tileLabel}`;
    }

    if (event.event_type === "DECLINE_PROPERTY") {
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
      return `Auction: ${tileLabel}`;
    }

    if (event.event_type === "PAY_RENT") {
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
        typeof payload?.to_player_id === "string" ? payload.to_player_id : null;
      const ownerName =
        players.find((player) => player.id === ownerId)?.display_name ??
        "Player";

      return rentAmount !== null
        ? `Paid $${rentAmount} rent to ${ownerName} (${tileLabel})`
        : `Paid rent to ${ownerName} (${tileLabel})`;
    }

    if (event.event_type === "PAY_TAX") {
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

    if (event.event_type === "GO_TO_JAIL") {
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
  }, [boardPack?.tiles, getOwnershipLabel, players]);

  const clearResumeStorage = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const { localStorage } = window;
    localStorage.removeItem(lastGameKey);

    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith("bank.lobby")) {
        localStorage.removeItem(key);
      }
    }
  }, []);

  const loadPlayers = useCallback(
    async (activeGameId: string, accessToken?: string) => {
      const playerRows = await supabaseClient.fetchFromSupabase<Player[]>(
        `players?select=id,user_id,display_name,created_at,position,is_in_jail,jail_turns_remaining&game_id=eq.${activeGameId}&order=created_at.asc`,
        { method: "GET" },
        accessToken,
      );
      setPlayers(playerRows);
    },
    [],
  );

  const loadOwnership = useCallback(
    async (activeGameId: string, accessToken?: string) => {
      const ownershipRows = await supabaseClient.fetchFromSupabase<
        OwnershipRow[]
      >(
        `property_ownership?select=tile_index,owner_player_id&game_id=eq.${activeGameId}`,
        { method: "GET" },
        accessToken,
      );
      const mapped = ownershipRows.reduce<OwnershipByTile>((acc, row) => {
        acc[row.tile_index] = { owner_player_id: row.owner_player_id };
        return acc;
      }, {});
      setOwnershipByTile(mapped);
    },
    [],
  );

  const loadGameMeta = useCallback(
    async (activeGameId: string, accessToken?: string) => {
      const [game] = await supabaseClient.fetchFromSupabase<GameMeta[]>(
        `games?select=id,board_pack_id,status,created_by&id=eq.${activeGameId}&limit=1`,
        { method: "GET" },
        accessToken,
      );
      if (!game) {
        setGameMeta(null);
        setGameMetaError(
          "Game exists but is not visible — membership or RLS issue.",
        );
        return;
      }

      setGameMeta(game);
      setGameMetaError(null);
    },
    [],
  );

  const loadGameState = useCallback(
    async (activeGameId: string, accessToken?: string) => {
      const [stateRow] = await supabaseClient.fetchFromSupabase<GameState[]>(
        `game_state?select=game_id,version,current_player_id,balances,last_roll,doubles_count,turn_phase,pending_action&game_id=eq.${activeGameId}&limit=1`,
        { method: "GET" },
        accessToken,
      );
      setGameState(stateRow ?? null);
    },
    [],
  );

  const loadEvents = useCallback(async (activeGameId: string, accessToken?: string) => {
    const eventRows = await supabaseClient.fetchFromSupabase<GameEvent[]>(
      `game_events?select=id,event_type,payload,created_at,version&game_id=eq.${activeGameId}&order=version.desc&limit=10`,
      { method: "GET" },
      accessToken,
    );
    setEvents(eventRows);
  }, []);

  const loadGameData = useCallback(
    async (activeGameId: string, accessToken?: string) => {
      await Promise.all([
        loadGameMeta(activeGameId, accessToken),
        loadPlayers(activeGameId, accessToken),
        loadGameState(activeGameId, accessToken),
        loadEvents(activeGameId, accessToken),
        loadOwnership(activeGameId, accessToken),
      ]);
      if (!activeGameIdRef.current || activeGameIdRef.current === activeGameId) {
        setInitialSnapshotReady(true);
      }
    },
    [loadEvents, loadGameMeta, loadGameState, loadOwnership, loadPlayers],
  );

  const setupRealtimeChannel = useCallback(() => {
    if (!isConfigured || !gameId || !session?.access_token || sessionInvalid) {
      return;
    }

    const realtimeClient = supabaseClient.getRealtimeClient();
    if (!realtimeClient) {
      return;
    }

    const existingChannel = realtimeChannelRef.current;
    const existingContext = realtimeContextRef.current;
    const hasMatchingContext =
      existingContext?.gameId === gameId &&
      existingContext.accessToken === session.access_token;
    const channelIsClosedOrErrored =
      existingChannel?.state === "closed" ||
      existingChannel?.state === "errored";

    if (existingChannel && hasMatchingContext && !channelIsClosedOrErrored) {
      if (existingChannel.state === "joined") {
        setRealtimeReady(true);
      }
      return;
    }

    if (existingChannel && (!hasMatchingContext || channelIsClosedOrErrored)) {
      realtimeClient.removeChannel(existingChannel);
      realtimeChannelRef.current = null;
      realtimeContextRef.current = null;
    }

    setRealtimeReady(false);
    const channelName = `player-console:${gameId}`;
    if (DEBUG) {
      console.info("[Play][Realtime] create channel", {
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
            console.info("[Play][Realtime] payload", {
              table: "players",
              eventType: payload.eventType,
              gameId,
            });
          }
          try {
            await loadPlayers(gameId, session?.access_token);
          } catch (error) {
            if (DEBUG) {
              console.error("[Play][Realtime] players handler error", error);
            }
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
            console.info("[Play][Realtime] payload", {
              table: "game_state",
              eventType: payload.eventType,
              gameId,
            });
          }
          try {
            await loadGameState(gameId, session?.access_token);
          } catch (error) {
            if (DEBUG) {
              console.error("[Play][Realtime] game_state handler error", error);
            }
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
            console.info("[Play][Realtime] payload", {
              table: "game_events",
              eventType: payload.eventType,
              gameId,
            });
          }
          try {
            await loadEvents(gameId, session?.access_token);
          } catch (error) {
            if (DEBUG) {
              console.error("[Play][Realtime] game_events handler error", error);
            }
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
            console.info("[Play][Realtime] payload", {
              table: "property_ownership",
              eventType: payload.eventType,
              gameId,
            });
          }
          try {
            await loadOwnership(gameId, session?.access_token);
          } catch (error) {
            if (DEBUG) {
              console.error(
                "[Play][Realtime] property_ownership handler error",
                error,
              );
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        async (payload) => {
          if (DEBUG) {
            console.info("[Play][Realtime] payload", {
              table: "games",
              eventType: payload.eventType,
              gameId,
            });
          }
          try {
            await loadGameMeta(gameId, session?.access_token);
          } catch (error) {
            if (DEBUG) {
              console.error("[Play][Realtime] games handler error", error);
            }
          }
        },
      )
      .subscribe((status) => {
        if (DEBUG) {
          console.info("[Play][Realtime] status", { status, gameId });
        }
        const isReady = status === "SUBSCRIBED";
        setRealtimeReady(isReady);

        if (isReady && !realtimeReconciledRef.current) {
          realtimeReconciledRef.current = true;
          void loadGameData(gameId, session.access_token);
        }
      });

    realtimeChannelRef.current = channel;
    realtimeContextRef.current = {
      gameId,
      accessToken: session.access_token,
      channelName,
    };
  }, [
    gameId,
    isConfigured,
    loadEvents,
    loadGameMeta,
    loadGameState,
    loadPlayers,
    loadOwnership,
    loadGameData,
    session?.access_token,
  ]);

  const requestRefresh = useCallback(() => {
    if (!gameId || !session?.access_token || sessionInvalid) {
      return;
    }

    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = setTimeout(async () => {
      if (refreshInFlightRef.current) {
        return;
      }

      refreshInFlightRef.current = true;

      try {
        await loadGameData(gameId, session.access_token);
        const channel = realtimeChannelRef.current;
        const channelIsClosedOrErrored =
          channel?.state === "closed" || channel?.state === "errored";
        if (!channel || channelIsClosedOrErrored) {
          setupRealtimeChannel();
        }
      } finally {
        refreshInFlightRef.current = false;
      }
    }, 400);
  }, [
    gameId,
    loadGameData,
    session?.access_token,
    sessionInvalid,
    setupRealtimeChannel,
  ]);

  const requestFirstRoundResync = useCallback(
    (accessTokenOverride?: string) => {
      const accessToken = accessTokenOverride ?? session?.access_token;
      if (!firstRoundResyncEnabled || !gameId || !accessToken || sessionInvalid) {
        return;
      }

      if (firstRoundResyncTimeoutRef.current) {
        clearTimeout(firstRoundResyncTimeoutRef.current);
      }

      firstRoundResyncTimeoutRef.current = setTimeout(async () => {
        await Promise.all([
          loadPlayers(gameId, accessToken),
          loadGameState(gameId, accessToken),
          loadEvents(gameId, accessToken),
          loadOwnership(gameId, accessToken),
        ]);
      }, 350);
    },
    [
      firstRoundResyncEnabled,
      gameId,
      loadEvents,
      loadGameState,
      loadPlayers,
      loadOwnership,
      session?.access_token,
      sessionInvalid,
    ],
  );

  useEffect(() => {
    let isMounted = true;

    const hydrate = async () => {
      if (!isConfigured) {
        setLoading(false);
        return;
      }

      const currentSession = await supabaseClient.getSession();
      if (!isMounted) {
        return;
      }

      setSession(currentSession);
      setNeedsAuth(false);

      if (typeof window !== "undefined") {
        const storedGameId = window.localStorage.getItem(lastGameKey);
        const accessToken = currentSession?.access_token;
        setGameId(storedGameId);

        if (storedGameId && !accessToken) {
          setNeedsAuth(true);
          setLoading(false);
          return;
        }

        if (storedGameId && accessToken) {
          try {
            await loadGameData(storedGameId, accessToken);
          } catch (error) {
            if (error instanceof Error) {
              setNotice(error.message);
            } else {
              setNotice("Unable to load game data.");
            }
          }
        }
      }

      setLoading(false);
    };

    hydrate();

    return () => {
      isMounted = false;
    };
  }, [isConfigured, loadGameData]);

  useEffect(() => {
    if (!gameId) {
      setGameMetaError(null);
    }
  }, [gameId]);

  useEffect(() => {
    activeGameIdRef.current = gameId;
    setInitialSnapshotReady(false);
    setFirstRoundResyncEnabled(true);
    firstRoundEndTurnsRef.current = new Set();
    setOwnershipByTile({});
  }, [gameId]);

  useEffect(() => {
    if (gameMeta?.status === "lobby" && gameId) {
      router.replace(`/lobby/${gameId}`);
    }
  }, [gameId, gameMeta?.status, router]);

  useEffect(() => {
    if (gameMeta?.status !== "ended") {
      return;
    }

    clearResumeStorage();
    setGameId(null);
    setGameMeta(null);
    setGameMetaError(null);
    setPlayers([]);
    setGameState(null);
    setEvents([]);
    setOwnershipByTile({});
    setNotice("This session has ended.");
    router.replace("/");
  }, [clearResumeStorage, gameMeta?.status, router]);

  useEffect(() => {
    if (!isConfigured || !gameId || !session?.access_token) {
      return;
    }

    setupRealtimeChannel();

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      const realtimeClient = supabaseClient.getRealtimeClient();
      if (realtimeClient && realtimeChannelRef.current) {
        realtimeClient.removeChannel(realtimeChannelRef.current);
      }
      if (DEBUG) {
        const channelName =
          realtimeContextRef.current?.channelName ??
          (gameId ? `player-console:${gameId}` : "player-console:unknown");
        console.info("[Play][Realtime] cleanup", {
          channel: channelName,
          reason: unmountingRef.current ? "unmount" : "dependency change",
        });
      }
      realtimeChannelRef.current = null;
      realtimeContextRef.current = null;
      setRealtimeReady(false);
      realtimeReconciledRef.current = false;
    };
  }, [
    gameId,
    isConfigured,
    loadEvents,
    loadGameState,
    loadPlayers,
    session?.access_token,
    sessionInvalid,
    setupRealtimeChannel,
  ]);

  useEffect(() => {
    setRealtimeReady(false);
    realtimeReconciledRef.current = false;
  }, [gameId]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        requestRefresh();
      }
    };

    const handleFocus = () => {
      requestRefresh();
    };

    const handleOnline = () => {
      requestRefresh();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);

      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      if (firstRoundResyncTimeoutRef.current) {
        clearTimeout(firstRoundResyncTimeoutRef.current);
      }
    };
  }, [requestRefresh]);

  useEffect(() => {
    if (!initialSnapshotReady || !gameId) {
      return;
    }

    if (realtimeReady || !firstRoundResyncEnabled) {
      return;
    }

    const refreshIntervalMs = 1750;
    const maxDurationMs = 20000;
    const intervalId = setInterval(() => {
      requestRefresh();
    }, refreshIntervalMs);
    const timeoutId = setTimeout(() => {
      clearInterval(intervalId);
    }, maxDurationMs);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [
    firstRoundResyncEnabled,
    gameId,
    initialSnapshotReady,
    realtimeReady,
    requestRefresh,
  ]);

  useEffect(() => {
    if (!firstRoundResyncEnabled || players.length === 0) {
      return;
    }

    events.forEach((event) => {
      if (event.event_type !== "END_TURN") {
        return;
      }

      const payload = event.payload as { from_player_id?: unknown } | null;
      const fromPlayerId =
        typeof payload?.from_player_id === "string"
          ? payload.from_player_id
          : null;

      if (fromPlayerId && !firstRoundEndTurnsRef.current.has(fromPlayerId)) {
        firstRoundEndTurnsRef.current.add(fromPlayerId);
      }
    });

    if (firstRoundEndTurnsRef.current.size >= players.length) {
      setFirstRoundResyncEnabled(false);
    }
  }, [events, firstRoundResyncEnabled, players.length]);

  useEffect(() => {
    return () => {
      unmountingRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionInvalid) {
      return;
    }

    if (
      session?.access_token &&
      session.access_token !== invalidTokenRef.current
    ) {
      invalidTokenRef.current = null;
      setSessionInvalid(false);
      setNotice(null);
    }
  }, [session?.access_token, sessionInvalid]);

  const isInProgress = gameMeta?.status === "in_progress";
  const hasGameMetaError = Boolean(gameMetaError);
  const currentPlayer = players.find(
    (player) => player.id === gameState?.current_player_id,
  );
  const currentUserPlayer = players.find(
    (player) => session && player.user_id === session.user.id,
  );
  const isMyTurn = Boolean(
    isInProgress &&
      session &&
      currentUserPlayer &&
      gameState?.current_player_id === currentUserPlayer.id,
  );
  const pendingPurchase = useMemo<PendingPurchaseAction | null>(() => {
    const pendingAction = gameState?.pending_action;
    if (!pendingAction || typeof pendingAction !== "object") {
      return null;
    }

    const candidate = pendingAction as {
      type?: unknown;
      tile_index?: unknown;
      price?: unknown;
    };

    if (candidate.type !== "BUY_PROPERTY") {
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
      tile_index: candidate.tile_index,
      price: candidate.price,
    };
  }, [gameState?.pending_action]);
  const pendingTile = useMemo(() => {
    if (!pendingPurchase) {
      return null;
    }
    return (
      boardPack?.tiles?.find((tile) => tile.index === pendingPurchase.tile_index) ??
      null
    );
  }, [boardPack?.tiles, pendingPurchase]);
  const pendingBaseRent =
    pendingTile && typeof pendingTile.baseRent === "number"
      ? pendingTile.baseRent
      : null;
  const pendingTileLabel =
    pendingTile?.name ??
    (pendingPurchase ? `Tile ${pendingPurchase.tile_index}` : null);
  const hasPendingDecision = Boolean(pendingPurchase);
  const showPendingDecisionCard = hasPendingDecision && isMyTurn;
  const showPendingDecisionBanner = hasPendingDecision && !isMyTurn;
  const myPlayerBalance =
    gameState?.balances && currentUserPlayer
      ? gameState.balances[currentUserPlayer.id] ?? 0
      : 0;
  const canAffordPendingPurchase = pendingPurchase
    ? myPlayerBalance >= pendingPurchase.price
    : false;
  const canAct = initialSnapshotReady && isMyTurn;
  const isAwaitingJailDecision =
    isMyTurn && gameState?.turn_phase === "AWAITING_JAIL_DECISION";
  const canRoll =
    canAct &&
    !hasPendingDecision &&
    !isAwaitingJailDecision &&
    (gameState?.last_roll == null || (gameState?.doubles_count ?? 0) > 0);
  const canEndTurn =
    canAct && !hasPendingDecision && gameState?.last_roll != null;
  const realtimeStatusLabel = realtimeReady ? "Live" : "Syncing…";
  const isHost = Boolean(
    session && gameMeta?.created_by && session.user.id === gameMeta.created_by,
  );

  const handleBankAction = useCallback(
    async (
      request:
        | { action: "ROLL_DICE" | "END_TURN" | "JAIL_PAY_FINE" }
        | { action: "DECLINE_PROPERTY" | "BUY_PROPERTY"; tileIndex: number },
    ) => {
      const { action } = request;
      const tileIndex = "tileIndex" in request ? request.tileIndex : undefined;
      if (!session || !gameId) {
        setNotice("Join a game lobby first.");
        return;
      }

      if (!isInProgress) {
        setNotice("Waiting for the host to start the game.");
        return;
      }

      const snapshotVersion = gameState?.version ?? 0;
      const snapshotLastRoll = gameState?.last_roll ?? null;
      console.info("[Play] action request", {
        action,
        gameId,
        tileIndex: tileIndex ?? null,
        expectedVersion: snapshotVersion,
        currentVersion: gameState?.version ?? null,
        last_roll: snapshotLastRoll,
      });

      setActionLoading(action);
      setNotice(null);

      try {
        let accessToken = session.access_token;
        const logAuthState = (context: {
          action: string;
          status: number;
          responseError?: string | null;
          phase: string;
          sessionSnapshot?: SupabaseSession | null;
        }) => {
          const sessionSnapshot = context.sessionSnapshot ?? session;
          const expiresAt =
            typeof sessionSnapshot?.expires_at === "number"
              ? new Date(sessionSnapshot.expires_at * 1000).toISOString()
              : null;

          console.info("[Play][Auth] 401 response", {
            action: context.action,
            phase: context.phase,
            status: context.status,
            responseError: context.responseError ?? null,
            hasSession: Boolean(sessionSnapshot),
            hasAccessToken: Boolean(sessionSnapshot?.access_token),
            expiresAt,
          });
        };

        const performBankAction = async (accessToken: string) => {
          const response = await fetch("/api/bank/action", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              gameId,
              action,
              tileIndex,
              expectedVersion: snapshotVersion,
            }),
          });

          let responseBody: { error?: string; gameState?: GameState } | null =
            null;
          try {
            responseBody = (await response.json()) as {
              error?: string;
              gameState?: GameState;
            };
          } catch {
            responseBody = null;
          }

          console.info("[Play] action response", {
            action,
            status: response.status,
            body: responseBody,
          });

          return { response, responseBody };
        };

        let { response, responseBody } = await performBankAction(accessToken);

        if (response.status === 401) {
          logAuthState({
            action,
            status: response.status,
            responseError: responseBody?.error ?? null,
            phase: "initial",
          });

          const refreshedSession = await supabaseClient.getSession();
          setSession(refreshedSession);

          if (!refreshedSession?.access_token) {
            invalidTokenRef.current = session.access_token ?? null;
            setSessionInvalid(true);
            setNotice("Invalid session. Tap to re-auth.");
            return;
          }

          accessToken = refreshedSession.access_token;
          const retryResult = await performBankAction(
            accessToken,
          );

          if (retryResult.response.status === 401) {
            logAuthState({
              action,
              status: retryResult.response.status,
              responseError: retryResult.responseBody?.error ?? null,
              phase: "retry",
              sessionSnapshot: refreshedSession,
            });
            invalidTokenRef.current = accessToken;
            setSessionInvalid(true);
            setNotice("Invalid session. Tap to re-auth.");
            return;
          }

          response = retryResult.response;
          responseBody = retryResult.responseBody;
          invalidTokenRef.current = null;
          setSessionInvalid(false);
          setNotice(null);
        }

        if (!response.ok) {
          if (response.status === 409) {
            setNotice("Syncing…");
            await loadGameData(gameId, accessToken);
            throw new Error(responseBody?.error ?? "Game updated. Try again.");
          }
          throw new Error(responseBody?.error ?? "Unable to perform action.");
        }

        if (responseBody?.gameState) {
          setGameState(responseBody.gameState);
        }

        await Promise.all([
          loadPlayers(gameId, accessToken),
          loadEvents(gameId, accessToken),
          loadOwnership(gameId, accessToken),
        ]);

        if (firstRoundResyncEnabled) {
          requestFirstRoundResync(accessToken);
        }
      } catch (error) {
        if (error instanceof Error) {
          setNotice(error.message);
        } else {
          setNotice("Unable to perform action.");
        }
      } finally {
        setActionLoading(null);
      }
    },
    [
      firstRoundResyncEnabled,
      gameId,
      gameState,
      isInProgress,
      loadEvents,
      loadGameData,
      loadOwnership,
      loadPlayers,
      requestFirstRoundResync,
      session,
    ],
  );

  const handleDeclineProperty = useCallback(() => {
    if (!pendingPurchase) {
      return;
    }

    void handleBankAction({
      action: "DECLINE_PROPERTY",
      tileIndex: pendingPurchase.tile_index,
    });
  }, [handleBankAction, pendingPurchase]);

  const handleBuyProperty = useCallback(() => {
    if (!pendingPurchase) {
      return;
    }

    void handleBankAction({
      action: "BUY_PROPERTY",
      tileIndex: pendingPurchase.tile_index,
    });
  }, [handleBankAction, pendingPurchase]);

  const handlePayJailFine = useCallback(() => {
    void handleBankAction({ action: "JAIL_PAY_FINE" });
  }, [handleBankAction]);

  const handleLeaveTable = useCallback(() => {
    clearResumeStorage();
    setGameId(null);
    setGameMeta(null);
    setGameMetaError(null);
    setPlayers([]);
    setGameState(null);
    setEvents([]);
    setOwnershipByTile({});
    setNotice(null);
    router.push("/");
  }, [clearResumeStorage, router]);

  const handleSignInAgain = useCallback(() => {
    clearResumeStorage();
    router.push("/");
  }, [clearResumeStorage, router]);

  const handleEndSession = useCallback(async () => {
    if (!session || !gameId) {
      setNotice("Join a game lobby first.");
      return;
    }

    setActionLoading("END_GAME");
    setNotice(null);

    try {
      const response = await fetch("/api/bank/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          gameId,
          action: "END_GAME",
          expectedVersion: gameState?.version ?? 0,
        }),
      });

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        if (response.status === 409) {
          await loadGameData(gameId, session.access_token);
          throw new Error(error.error ?? "Game updated. Try again.");
        }
        throw new Error(error.error ?? "Unable to end the session.");
      }

      clearResumeStorage();
      setGameId(null);
      setGameMeta(null);
      setGameMetaError(null);
      setPlayers([]);
      setGameState(null);
      setEvents([]);
      setOwnershipByTile({});
      router.push("/");
    } catch (error) {
      if (error instanceof Error) {
        setNotice(error.message);
      } else {
        setNotice("Unable to end the session.");
      }
    } finally {
      setActionLoading(null);
    }
  }, [
    clearResumeStorage,
    gameId,
    gameState?.version,
    loadGameData,
    router,
    session,
  ]);

  return (
    <PageShell
      title="Player Console"
      subtitle="Mobile-first tools for wallet, assets, actions, and trades."
      headerActions={
        <div className="flex items-center gap-3">
          {isHost ? (
            <button
              className="text-xs font-medium text-rose-600 hover:text-rose-700"
              type="button"
              onClick={handleEndSession}
              disabled={actionLoading === "END_GAME"}
            >
              {actionLoading === "END_GAME" ? "Ending…" : "End session"}
            </button>
          ) : null}
          <button
            className="text-xs font-medium text-neutral-500 hover:text-neutral-900"
            type="button"
            onClick={handleLeaveTable}
          >
            Leave table
          </button>
        </div>
      }
    >
      {!isConfigured ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to see
          live game updates.
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border bg-white p-5 text-sm text-neutral-500">
          Loading player console…
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          {notice}
        </div>
      ) : null}

      {needsAuth ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Please sign in again to load this game.</p>
          <button
            className="mt-3 rounded-full bg-amber-900 px-4 py-2 text-xs font-semibold text-white"
            type="button"
            onClick={handleSignInAgain}
          >
            Please sign in again
          </button>
        </div>
      ) : null}

      {gameMetaError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {gameMetaError}
        </div>
      ) : null}

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              View mode
            </p>
            <p className="text-sm text-neutral-600">
              Switch between wallet controls and a read-only board projection.
            </p>
            <p className="text-xs text-neutral-400">
              Board pack: {boardPack?.displayName ?? "Unknown"}
            </p>
          </div>
          <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-100 p-1">
            {(["wallet", "board"] as const).map((mode) => (
              <button
                key={mode}
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                  viewMode === mode
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-500 hover:text-neutral-700"
                }`}
                type="button"
                onClick={() => setViewMode(mode)}
              >
                {mode === "wallet" ? "Wallet view" : "Board view"}
              </button>
            ))}
          </div>
        </div>
      </section>

      {viewMode === "wallet" ? (
        <>
          <section className="space-y-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Current turn
              </p>
              <p className="text-2xl font-semibold text-neutral-900">
                {hasGameMetaError
                  ? "Game not visible"
                  : isInProgress
                    ? currentPlayer?.display_name ?? "Waiting for start"
                    : "Waiting for start"}
              </p>
              <p className="text-sm text-neutral-500">
                Last roll:{" "}
                {hasGameMetaError
                  ? "—"
                  : isInProgress
                    ? gameState?.last_roll ?? "—"
                    : "—"}
              </p>
              {latestDiceDisplay ? (
                <div className="mt-2 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
                    <span className="font-semibold text-neutral-900">
                      {latestDiceDisplay}
                    </span>
                    {latestIsDouble ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase text-amber-800">
                        DOUBLE!
                      </span>
                    ) : null}
                  </div>
                  {latestDoubleStreak !== null ? (
                    <p className="text-xs text-neutral-500">
                      Double streak: {latestDoubleStreak}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-neutral-400">
                Turn status
              </p>
              <p className="text-sm font-semibold text-neutral-700">
                {hasGameMetaError
                  ? "Check access"
                  : isInProgress
                    ? isMyTurn
                      ? "Your turn"
                      : "Stand by"
                    : "Waiting"}
              </p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                {realtimeStatusLabel}
              </p>
            </div>
          </div>
          {isAwaitingJailDecision ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                Jail decision
              </p>
              <p className="mt-1 text-base font-semibold text-rose-900">
                You are in jail.
              </p>
              <p className="text-sm text-rose-800">
                Turns remaining: {currentUserPlayer?.jail_turns_remaining ?? 0}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  className="rounded-2xl bg-rose-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-rose-300"
                  type="button"
                  onClick={handlePayJailFine}
                  disabled={actionLoading === "JAIL_PAY_FINE"}
                >
                  {actionLoading === "JAIL_PAY_FINE"
                    ? "Paying…"
                    : `Pay $${JAIL_FINE_AMOUNT} fine`}
                </button>
                <button
                  className="rounded-2xl border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-900 disabled:cursor-not-allowed disabled:border-rose-200 disabled:text-rose-400"
                  type="button"
                  disabled
                  title="Roll for doubles (coming soon)"
                >
                  Roll for doubles
                </button>
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
              type="button"
              onClick={() => void handleBankAction({ action: "ROLL_DICE" })}
              disabled={
                !canRoll ||
                actionLoading === "ROLL_DICE"
              }
            >
              {actionLoading === "ROLL_DICE" ? "Rolling…" : "Roll Dice"}
            </button>
            <button
              className="rounded-2xl border px-4 py-3 text-sm font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
              type="button"
              onClick={() => void handleBankAction({ action: "END_TURN" })}
              disabled={
                !canEndTurn ||
                actionLoading === "END_TURN"
              }
            >
              {actionLoading === "END_TURN" ? "Ending…" : "End Turn"}
            </button>
          </div>
          {showPendingDecisionCard && pendingPurchase ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Pending decision
              </p>
              <p className="mt-1 text-base font-semibold text-amber-900">
                {pendingTileLabel}
              </p>
              <p className="text-sm text-amber-800">
                Price: ${pendingPurchase.price}
              </p>
              {pendingBaseRent !== null ? (
                <p className="text-xs text-amber-700">
                  Base rent preview: ${pendingBaseRent}
                </p>
              ) : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  className="rounded-2xl bg-amber-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-amber-300"
                  type="button"
                  onClick={handleBuyProperty}
                  disabled={
                    actionLoading === "BUY_PROPERTY" || !canAffordPendingPurchase
                  }
                  title={
                    canAffordPendingPurchase
                      ? "Buy this property"
                      : "Not enough cash to buy"
                  }
                >
                  {actionLoading === "BUY_PROPERTY" ? "Buying…" : "Buy"}
                </button>
                <button
                  className="rounded-2xl border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900 disabled:cursor-not-allowed disabled:border-amber-200 disabled:text-amber-400"
                  type="button"
                  onClick={handleDeclineProperty}
                  disabled={actionLoading === "DECLINE_PROPERTY"}
                  title="Phase 7C: treat as decline/auction placeholder"
                >
                  {actionLoading === "DECLINE_PROPERTY"
                    ? "Auctioning…"
                    : "Auction"}
                </button>
              </div>
              {!canAffordPendingPurchase ? (
                <p className="mt-2 text-[11px] text-amber-700">
                  You need ${pendingPurchase.price - myPlayerBalance} more to buy
                  this property.
                </p>
              ) : null}
            </div>
          ) : null}
          {showPendingDecisionBanner ? (
            <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-sm text-amber-900">
              Waiting for {currentPlayer?.display_name ?? "the current player"} to
              decide on {pendingTileLabel ?? "this tile"}…
            </div>
          ) : null}
          {!initialSnapshotReady ? (
            <p className="text-xs text-neutral-400">Loading snapshot…</p>
          ) : null}
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Balance
              </p>
              <p className="text-3xl font-semibold text-neutral-900">
                ${myPlayerBalance}
              </p>
              <p className="text-sm text-neutral-500">Available to spend</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-neutral-400">
                Net worth
              </p>
              <p className="text-lg font-semibold text-neutral-700">$26,200</p>
            </div>
          </div>
          <div className="grid gap-3 rounded-2xl border border-dashed border-neutral-200 p-3 text-sm text-neutral-600">
            <div className="flex items-center justify-between">
              <span>Recent income</span>
              <span className="font-medium text-emerald-600">+$1,800</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Recent expenses</span>
              <span className="font-medium text-rose-500">-$950</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Cash flow target</span>
              <span className="font-medium text-neutral-700">$15,000</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Event log
            </p>
            <p className="text-sm text-neutral-600">
              Recent table actions synced live from the bank.
            </p>
          </div>
          <div className="space-y-3 text-sm">
            {events.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-200 p-4 text-center text-neutral-500">
                Events will appear once the game starts.
              </div>
            ) : (
              events.map((event) => (
                <div key={event.id} className="rounded-2xl border px-4 py-3">
                  <div className="flex items-center justify-between text-xs uppercase text-neutral-400">
                    <span>{event.event_type.replaceAll("_", " ")}</span>
                    <span>v{event.version}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-neutral-800">
                    {formatEventDescription(event)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Properties
            </p>
            <p className="text-lg font-semibold text-neutral-900">
              Current holdings
            </p>
          </div>
          <div className="space-y-3">
            {[
              {
                name: "Pacific Avenue",
                group: "Green Set",
                rent: "$1,200",
              },
              { name: "Reading Railroad", group: "Railroads", rent: "$200" },
              { name: "Electric Company", group: "Utilities", rent: "$150" },
            ].map((property) => (
              <div
                key={property.name}
                className="rounded-2xl border px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-neutral-900">
                      {property.name}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {property.group}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase text-neutral-400">Rent</p>
                    <p className="text-sm font-semibold text-neutral-700">
                      {property.rent}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Actions
          </p>
          <span className="text-xs text-neutral-400">Coming soon</span>
        </div>
        <div className="grid gap-3">
          {[
            "Pay Bank",
            "Receive from Bank",
            "Mortgage / Unmortgage",
            "Build / Sell Houses",
          ].map((label) => (
            <button
              key={label}
              className="w-full rounded-2xl border bg-white px-4 py-4 text-left text-base font-semibold text-neutral-800 shadow-sm opacity-50 cursor-not-allowed"
              type="button"
              disabled
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Transaction History
          </p>
          <p className="text-sm text-neutral-600">
            Latest activity synced to your wallet.
          </p>
        </div>
        <div className="space-y-3 text-sm">
          {[
            {
              title: "Rent paid to Indigo",
              amount: "-$1,200",
              detail: "Pacific Avenue",
            },
            {
              title: "Dividend from bank",
              amount: "+$200",
              detail: "Community payout",
            },
            {
              title: "Utility charge",
              amount: "-$150",
              detail: "Electric Company",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="flex items-center justify-between rounded-2xl border px-4 py-3"
            >
              <div>
                <p className="font-medium text-neutral-800">{item.title}</p>
                <p className="text-xs text-neutral-500">{item.detail}</p>
              </div>
              <p
                className={`text-sm font-semibold ${
                  item.amount.startsWith("-")
                    ? "text-rose-500"
                    : "text-emerald-600"
                }`}
              >
                {item.amount}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Trade Confirm
          </p>
          <p className="text-sm text-neutral-600">
            Verify the terms before both sides accept.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            className="rounded-2xl border px-4 py-3 text-sm font-semibold text-neutral-700"
            type="button"
          >
            Propose Trade
          </button>
          <button
            className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white"
            type="button"
          >
            Accept Trade
          </button>
        </div>
      </section>
        </>
      ) : (
        <section className="space-y-4">
          <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Board projection
                </p>
                <p className="text-lg font-semibold text-neutral-900">
                  Read-only landscape view
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-neutral-400">
                <button
                  className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-700 transition hover:border-neutral-300"
                  type="button"
                  onClick={() => setBoardZoomed((prev) => !prev)}
                >
                  {boardZoomed ? "Reset zoom" : "Zoom board"}
                </button>
                <span>Actions hidden</span>
              </div>
            </div>
            <div className="overflow-x-auto pb-2">
              <div
                className={`origin-top-left transition-transform ${
                  boardZoomed ? "scale-[1.12]" : "scale-100"
                }`}
              >
                <BoardMiniMap
                  tiles={boardPack?.tiles}
                  players={players}
                  currentPlayerId={currentPlayer?.id}
                  ownershipByTile={ownershipByTile}
                  showOwnership
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Current turn
              </p>
              <p className="text-2xl font-semibold text-neutral-900">
                {hasGameMetaError
                  ? "Game not visible"
                  : isInProgress
                    ? currentPlayer?.display_name ?? "Waiting for start"
                    : "Waiting for start"}
              </p>
              <p className="text-sm text-neutral-500">
                Last roll:{" "}
                {hasGameMetaError
                  ? "—"
                  : isInProgress
                    ? gameState?.last_roll ?? "—"
                    : "—"}
              </p>
              {latestDiceDisplay ? (
                <div className="mt-2 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
                    <span className="font-semibold text-neutral-900">
                      {latestDiceDisplay}
                    </span>
                    {latestIsDouble ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase text-amber-800">
                        DOUBLE!
                      </span>
                    ) : null}
                  </div>
                  {latestDoubleStreak !== null ? (
                    <p className="text-xs text-neutral-500">
                      Double streak: {latestDoubleStreak}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="grid gap-3 pt-2 sm:grid-cols-2">
                <div className="rounded-2xl border border-dashed border-neutral-200 p-3 text-sm text-neutral-600">
                  Active phase placeholder
                </div>
                <div className="rounded-2xl border border-dashed border-neutral-200 p-3 text-sm text-neutral-600">
                  Next player placeholder
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Turn order
              </p>
              <ol className="space-y-3 text-sm">
                {players.length === 0 ? (
                  <li className="rounded-2xl border border-dashed border-neutral-200 p-4 text-center text-neutral-500">
                    No players yet.
                  </li>
                ) : (
                  players.map((player, index) => (
                    <li
                      key={player.id}
                      className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
                        player.id === currentPlayer?.id
                          ? "border-neutral-900 bg-neutral-50"
                          : "border-neutral-200"
                      }`}
                    >
                      <span className="font-medium text-neutral-800">
                        {player.display_name ?? "Player"}
                      </span>
                      <span className="text-xs text-neutral-400">
                        #{index + 1}
                      </span>
                    </li>
                  ))
                )}
              </ol>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Event log
                </p>
                <p className="text-sm text-neutral-600">
                  Live board feed synced from the bank.
                </p>
              </div>
              <div className="space-y-3 text-sm">
                {events.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-neutral-200 p-4 text-center text-neutral-500">
                    Events will appear once the game starts.
                  </div>
                ) : (
                  events.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-2xl border border-neutral-200 px-4 py-3"
                    >
                      <div className="flex items-center justify-between text-xs uppercase text-neutral-400">
                        <span>{event.event_type.replaceAll("_", " ")}</span>
                        <span>v{event.version}</span>
                      </div>
                      <p className="mt-2 text-sm text-neutral-700">
                        {formatEventDescription(event)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Economy summary
              </p>
              <div className="space-y-3 text-sm">
                {[
                  { label: "Bank balance", value: "$205,000" },
                  { label: "Cash in circulation", value: "$74,300" },
                  { label: "Properties owned", value: "16 / 28" },
                  { label: "Trades pending", value: "3" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-dashed border-neutral-200 p-3"
                  >
                    <p className="text-xs uppercase tracking-wide text-neutral-400">
                      {item.label}
                    </p>
                    <p className="text-lg font-semibold text-neutral-900">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </PageShell>
  );
}
