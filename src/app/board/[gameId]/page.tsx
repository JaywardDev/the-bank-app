"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageShell from "@/app/components/PageShell";
import BoardMiniMap from "@/app/components/BoardMiniMap";
import HousesDots from "@/app/components/HousesDots";
import { getBoardPackById } from "@/lib/boardPacks";
import { getRules } from "@/lib/rules";
import { supabaseClient, type SupabaseSession } from "@/lib/supabase/client";

const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "true";

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

type BoardDisplayPageProps = {
  params: {
    gameId: string;
  };
};

export default function BoardDisplayPage({ params }: BoardDisplayPageProps) {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [gameMeta, setGameMeta] = useState<GameMeta | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [ownershipByTile, setOwnershipByTile] = useState<OwnershipByTile>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const unmountingRef = useRef(false);

  const isConfigured = useMemo(() => supabaseClient.isConfigured(), []);

  const loadPlayers = useCallback(
    async (accessToken?: string) => {
      const playerRows = await supabaseClient.fetchFromSupabase<Player[]>(
        `players?select=id,user_id,display_name,created_at,position,is_eliminated,eliminated_at&game_id=eq.${params.gameId}&order=created_at.asc`,
        { method: "GET" },
        accessToken,
      );
      setPlayers(playerRows);
    },
    [params.gameId],
  );

  const loadGameMeta = useCallback(
    async (accessToken?: string) => {
      const [game] = await supabaseClient.fetchFromSupabase<GameMeta[]>(
        `games?select=id,board_pack_id&id=eq.${params.gameId}&limit=1`,
        { method: "GET" },
        accessToken,
      );
      setGameMeta(game ?? null);
    },
    [params.gameId],
  );

  const loadGameState = useCallback(
    async (accessToken?: string) => {
      const [stateRow] = await supabaseClient.fetchFromSupabase<GameState[]>(
        `game_state?select=game_id,version,current_player_id,last_roll,chance_index,community_index,free_parking_pot,rules,auction_active,auction_tile_index,auction_current_bid,auction_current_winner_player_id,auction_turn_player_id,pending_card_active,pending_card_deck,pending_card_id,pending_card_title,pending_card_kind,pending_card_payload,pending_card_drawn_by_player_id,pending_card_drawn_at,pending_card_source_tile_index&game_id=eq.${params.gameId}&limit=1`,
        { method: "GET" },
        accessToken,
      );
      setGameState(stateRow ?? null);
    },
    [params.gameId],
  );

  const loadEvents = useCallback(
    async (accessToken?: string) => {
      const eventRows = await supabaseClient.fetchFromSupabase<GameEvent[]>(
        `game_events?select=id,event_type,payload,created_at,version&game_id=eq.${params.gameId}&order=version.desc&limit=12`,
        { method: "GET" },
        accessToken,
      );
      setEvents(eventRows);
    },
    [params.gameId],
  );

  const loadOwnership = useCallback(
    async (accessToken?: string) => {
      const ownershipRows = await supabaseClient.fetchFromSupabase<
        OwnershipRow[]
      >(
        `property_ownership?select=tile_index,owner_player_id,collateral_loan_id,purchase_mortgage_id,houses&game_id=eq.${params.gameId}`,
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
    [params.gameId],
  );

  const loadBoardData = useCallback(async () => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const currentSession = await supabaseClient.getSession();
      setSession(currentSession);

      await Promise.all([
        loadGameMeta(currentSession?.access_token),
        loadPlayers(currentSession?.access_token),
        loadGameState(currentSession?.access_token),
        loadEvents(currentSession?.access_token),
        loadOwnership(currentSession?.access_token),
      ]);
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Unable to load board data.");
      }
    } finally {
      setLoading(false);
    }
  }, [
    isConfigured,
    loadEvents,
    loadGameMeta,
    loadGameState,
    loadOwnership,
    loadPlayers,
  ]);

  useEffect(() => {
    void loadBoardData();
  }, [loadBoardData]);

  useEffect(() => {
    if (!isConfigured) {
      return;
    }

    const realtimeClient = supabaseClient.getRealtimeClient();
    if (!realtimeClient) {
      return;
    }

    const channelName = `board-display:${params.gameId}`;
    if (DEBUG) {
      console.info("[Board][Realtime] create channel", {
        channel: channelName,
        gameId: params.gameId,
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
          filter: `game_id=eq.${params.gameId}`,
        },
        async (payload) => {
          if (DEBUG) {
            console.info("[Board][Realtime] payload", {
              table: "players",
              eventType: payload.eventType,
              gameId: params.gameId,
            });
          }
          try {
            await loadPlayers(session?.access_token);
          } catch (error) {
            if (DEBUG) {
              console.error("[Board][Realtime] players handler error", error);
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
          filter: `game_id=eq.${params.gameId}`,
        },
        async (payload) => {
          if (DEBUG) {
            console.info("[Board][Realtime] payload", {
              table: "game_state",
              eventType: payload.eventType,
              gameId: params.gameId,
            });
          }
          try {
            await loadGameState(session?.access_token);
          } catch (error) {
            if (DEBUG) {
              console.error("[Board][Realtime] game_state handler error", error);
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
          filter: `game_id=eq.${params.gameId}`,
        },
        async (payload) => {
          if (DEBUG) {
            console.info("[Board][Realtime] payload", {
              table: "game_events",
              eventType: payload.eventType,
              gameId: params.gameId,
            });
          }
          try {
            await loadEvents(session?.access_token);
          } catch (error) {
            if (DEBUG) {
              console.error("[Board][Realtime] game_events handler error", error);
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
          filter: `game_id=eq.${params.gameId}`,
        },
        async (payload) => {
          if (DEBUG) {
            console.info("[Board][Realtime] payload", {
              table: "property_ownership",
              eventType: payload.eventType,
              gameId: params.gameId,
            });
          }
          try {
            await loadOwnership(session?.access_token);
          } catch (error) {
            if (DEBUG) {
              console.error(
                "[Board][Realtime] property_ownership handler error",
                error,
              );
            }
          }
        },
      )
      .subscribe((status) => {
        if (DEBUG) {
          console.info("[Board][Realtime] status", {
            status,
            gameId: params.gameId,
          });
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
    params.gameId,
    session?.access_token,
  ]);

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
  const auctionTileIndex = gameState?.auction_tile_index ?? null;
  const auctionTileName =
    auctionTileIndex !== null
      ? boardPack?.tiles?.find((tile) => tile.index === auctionTileIndex)?.name ??
        `Tile ${auctionTileIndex}`
      : null;
  const auctionCurrentBid = gameState?.auction_current_bid ?? 0;
  const auctionTurnPlayerName =
    players.find((player) => player.id === gameState?.auction_turn_player_id)
      ?.display_name ?? "Player";
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
  const currentTileHouses =
    currentPlayerTile?.index !== undefined
      ? ownershipByTile[currentPlayerTile.index]?.houses ?? 0
      : 0;
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

      if (event.event_type === "MACRO_EVENT_EXPIRED") {
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

  return (
    <PageShell
      title="Board Display"
      subtitle="Read-only, large-screen projection of the live table."
      variant="board"
    >
      {!isConfigured ? (
        <div className="rounded-3xl border border-amber-200/30 bg-amber-500/10 p-6 text-amber-100">
          Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to
          enable live board updates.
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-lg text-white/70">
          Loading board…
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-3xl border border-rose-300/40 bg-rose-500/10 p-6 text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      {pendingCard ? (
        <>
          <div className="fixed inset-0 z-20 bg-black/50 backdrop-blur-[1px]" />
          <div className="fixed inset-0 z-30 flex items-center justify-center p-6">
            <div className="w-full max-w-md rounded-3xl border border-emerald-200/40 bg-white/95 p-6 text-neutral-900 shadow-2xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">
                Card revealed
              </p>
              <p className="mt-1 text-lg font-semibold">{pendingDeckLabel}</p>
              <p className="mt-3 text-base font-semibold">
                {pendingCard.title}
              </p>
              {pendingCardDescription ? (
                <p className="mt-2 text-sm text-neutral-600">
                  {pendingCardDescription}
                </p>
              ) : null}
              <p className="mt-4 text-sm text-neutral-500">
                Waiting for {pendingCardActorName ?? "the current player"} to
                confirm…
              </p>
            </div>
          </div>
        </>
      ) : null}

      {isAuctionActive ? (
        <div className="rounded-3xl border border-indigo-200/30 bg-indigo-500/10 p-5 text-indigo-100">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200/70">
            Auction in progress
          </p>
          <p className="mt-1 text-lg font-semibold text-white">
            {auctionTileName ?? "Unowned tile"} — Current bid ${auctionCurrentBid}
          </p>
          <p className="text-sm text-indigo-100/80">
            Waiting for {auctionTurnPlayerName}…
          </p>
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8 space-y-5 flex flex-col min-h-[360px] lg:min-h-[70vh]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
                Board map
              </p>
              <p className="text-xs text-white/50">
                Board pack: {boardPack?.displayName ?? "Unknown"}
              </p>
            </div>
            <span className="text-xs text-white/50">Projection only</span>
          </div>
          <div className="rounded-3xl border border-white/10 bg-black/30 p-4 md:p-6 flex-1">
            <BoardMiniMap
              tiles={boardPack?.tiles}
              players={players}
              currentPlayerId={currentPlayer?.id}
              lastMovedPlayerId={lastMovedPlayerId}
              lastMovedTileIndex={lastMovedTileIndex}
              ownershipByTile={ownershipByTile}
              variant="dark"
              size="large"
            />
          </div>
          <p className="text-xs text-white/50">
            Live player positions are highlighted for the active turn and the
            most recent move.
          </p>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
                Current turn
              </p>
              <p className="text-3xl font-semibold">
                {currentPlayer?.display_name ?? "Waiting for start"}
              </p>
              <p className="text-sm text-white/70">
                Last roll: {gameState?.last_roll ?? "—"}
              </p>
              {currentPlayerTile ? (
                <div className="mt-3">
                  <p className="text-xs uppercase tracking-wide text-white/50">
                    Current tile
                  </p>
                  <p className="text-sm font-semibold text-white/80">
                    {currentPlayerTile.name}
                  </p>
                  <HousesDots houses={currentTileHouses} size="md" />
                </div>
              ) : null}
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-3">
              <p className="text-xs uppercase tracking-wide text-white/50">
                Active phase
              </p>
              <p className="text-lg font-semibold">
                Rolling + trade confirmation
              </p>
              <p className="text-sm text-white/60">Next: TBD</p>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
              Turn order
            </p>
            <ol className="space-y-3 text-lg">
              {players.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-white/20 bg-black/30 px-4 py-6 text-center text-sm text-white/60">
                  No players yet.
                </li>
              ) : (
                players.map((player, index) => (
                  <li
                    key={player.id}
                    className={`flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3 ${
                      player.id === currentPlayer?.id
                        ? "bg-white/10"
                        : "bg-black/20"
                    }`}
                  >
                    <span>{player.display_name ?? "Player"}</span>
                    <span className="text-sm text-white/60">#{index + 1}</span>
                  </li>
                ))
              )}
            </ol>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-7 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
                Event log
              </p>
              <span className="text-xs text-white/50">Read-only feed</span>
            </div>
            <ul className="space-y-3 text-base max-h-[40vh] overflow-y-auto pr-1">
              {events.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-white/20 bg-black/30 px-4 py-5 text-center text-xs text-white/50">
                  Events will appear once the game starts.
                </li>
              ) : (
                events.map((event) => (
                  <li
                    key={event.id}
                    className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3"
                  >
                    <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                      <span>{event.event_type.replaceAll("_", " ")}</span>
                      <span>v{event.version}</span>
                    </div>
                    <p className="mt-2 text-sm text-white/80">
                      {formatEventDescription(event)}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
