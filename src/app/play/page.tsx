"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import PageShell from "../components/PageShell";
import BoardMiniMap from "../components/BoardMiniMap";
import { getBoardPackById, type BoardTile } from "@/lib/boardPacks";
import { getRules } from "@/lib/rules";
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
  get_out_of_jail_free_count: number;
  is_eliminated: boolean;
  eliminated_at: string | null;
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
};

type GameEvent = {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  version: number;
};

type TransactionItem = {
  id: string;
  ts: string | null;
  title: string;
  subtitle: string | null;
  amount: number;
  sourceEventVersion: number;
  sourceEventId: string;
};

type OwnershipRow = {
  tile_index: number;
  owner_player_id: string | null;
  collateral_loan_id: string | null;
};

type OwnershipByTile = Record<
  number,
  { owner_player_id: string; collateral_loan_id: string | null }
>;

type PlayerLoan = {
  id: string;
  player_id: string;
  collateral_tile_index: number;
  principal: number;
  remaining_principal: number;
  rate_per_turn: number;
  term_turns: number;
  turns_remaining: number;
  payment_per_turn: number;
  status: string;
};

type PendingPurchaseAction = {
  type: "BUY_PROPERTY";
  tile_index: number;
  price: number;
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

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const getTileGroupLabel = (tile: BoardTile | null | undefined) => {
  if (!tile) {
    return "Property";
  }
  switch (tile.type) {
    case "RAIL":
      return "Railroads";
    case "UTILITY":
      return "Utilities";
    case "PROPERTY":
      return "Property";
    default:
      return "Property";
  }
};

const derivePlayerTransactions = ({
  events,
  currentPlayerId,
  players,
  boardPack,
  ownershipByTile,
}: {
  events: GameEvent[];
  currentPlayerId: string | null;
  players: Player[];
  boardPack: ReturnType<typeof getBoardPackById> | null;
  ownershipByTile: OwnershipByTile;
}): TransactionItem[] => {
  if (!currentPlayerId) {
    return [];
  }

  const getPlayerName = (playerId: string | null) =>
    players.find((player) => player.id === playerId)?.display_name ?? "Player";
  const getTileName = (tileIndex: number | null) => {
    if (tileIndex === null) {
      return "Tile";
    }
    return (
      boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name ??
      `Tile ${tileIndex}`
    );
  };

  const transactions: TransactionItem[] = [];

  for (const event of events) {
    const payload =
      event.payload && typeof event.payload === "object" ? event.payload : null;
    if (!payload) {
      continue;
    }

    const recordBase = {
      ts: event.created_at ?? null,
      sourceEventVersion: event.version,
      sourceEventId: event.id,
    };

    switch (event.event_type) {
      case "COLLECT_GO": {
        const playerId =
          typeof payload.player_id === "string" ? payload.player_id : null;
        if (playerId !== currentPlayerId) {
          break;
        }
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        const reason =
          typeof payload.reason === "string" ? payload.reason : null;
        const reasonLabel =
          reason === "LAND_GO"
            ? "Landing on GO"
            : reason === "PASS_START"
              ? "Passing GO"
              : null;
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "GO salary",
          subtitle: reasonLabel,
          amount,
        });
        break;
      }
      case "CARD_PAY": {
        const playerId =
          typeof payload.player_id === "string" ? payload.player_id : null;
        if (playerId !== currentPlayerId) {
          break;
        }
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        const cardTitle =
          typeof payload.card_title === "string" ? payload.card_title : null;
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "Card payment",
          subtitle: cardTitle,
          amount: -amount,
        });
        break;
      }
      case "CARD_RECEIVE": {
        const playerId =
          typeof payload.player_id === "string" ? payload.player_id : null;
        if (playerId !== currentPlayerId) {
          break;
        }
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        const cardTitle =
          typeof payload.card_title === "string" ? payload.card_title : null;
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "Card payout",
          subtitle: cardTitle,
          amount,
        });
        break;
      }
      case "PAY_RENT": {
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        const fromPlayerId =
          typeof payload.from_player_id === "string"
            ? payload.from_player_id
            : null;
        const toPlayerId =
          typeof payload.to_player_id === "string"
            ? payload.to_player_id
            : null;
        const tileIndex = parseNumber(payload.tile_index);
        const tileName = getTileName(tileIndex);

        if (fromPlayerId === currentPlayerId) {
          transactions.push({
            ...recordBase,
            id: `${event.id}-paid`,
            title: "Rent paid",
            subtitle: `${tileName} → ${getPlayerName(toPlayerId)}`,
            amount: -amount,
          });
          break;
        }
        if (toPlayerId === currentPlayerId) {
          transactions.push({
            ...recordBase,
            id: `${event.id}-received`,
            title: "Rent received",
            subtitle: `${tileName} ← ${getPlayerName(fromPlayerId)}`,
            amount,
          });
        }
        break;
      }
      case "PAY_TAX": {
        const payerId =
          typeof payload.payer_player_id === "string"
            ? payload.payer_player_id
            : null;
        if (payerId !== currentPlayerId) {
          break;
        }
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        const tileIndex = parseNumber(payload.tile_index);
        const tileName =
          typeof payload.tile_name === "string"
            ? payload.tile_name
            : getTileName(tileIndex);
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "Tax paid",
          subtitle: tileName,
          amount: -amount,
        });
        break;
      }
      case "JAIL_PAY_FINE": {
        const playerId =
          typeof payload.player_id === "string" ? payload.player_id : null;
        if (playerId !== currentPlayerId) {
          break;
        }
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "Jail fine",
          subtitle: "Paid to leave jail",
          amount: -amount,
        });
        break;
      }
      case "BUY_PROPERTY": {
        const playerId =
          typeof payload.owner_player_id === "string"
            ? payload.owner_player_id
            : null;
        if (playerId !== currentPlayerId) {
          break;
        }
        const amount = parseNumber(payload.price);
        if (amount === null) {
          break;
        }
        const tileIndex = parseNumber(payload.tile_index);
        const tileName = getTileName(tileIndex);
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "Property purchase",
          subtitle: tileName,
          amount: -amount,
        });
        break;
      }
      case "AUCTION_WON": {
        const winnerId =
          typeof payload.winner_id === "string" ? payload.winner_id : null;
        if (winnerId !== currentPlayerId) {
          break;
        }
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        const tileIndex = parseNumber(payload.tile_index);
        const tileName = getTileName(tileIndex);
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "Auction won",
          subtitle: tileName,
          amount: -amount,
        });
        break;
      }
      case "COLLATERAL_LOAN_TAKEN": {
        const playerId =
          typeof payload.player_id === "string" ? payload.player_id : null;
        if (playerId !== currentPlayerId) {
          break;
        }
        const amount = parseNumber(payload.principal);
        if (amount === null) {
          break;
        }
        const tileIndex = parseNumber(payload.tile_index);
        const tileName = getTileName(tileIndex);
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "Loan proceeds",
          subtitle: tileName,
          amount,
        });
        break;
      }
      case "COLLATERAL_LOAN_PAYMENT": {
        const playerId =
          typeof payload.player_id === "string" ? payload.player_id : null;
        if (playerId !== currentPlayerId) {
          break;
        }
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        const tileIndex = parseNumber(payload.tile_index);
        const tileName = getTileName(tileIndex);
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "Loan payment",
          subtitle: tileName,
          amount: -amount,
        });
        break;
      }
      case "LOAN_PAID_OFF": {
        const tileIndex = parseNumber(payload.tile_index);
        if (
          tileIndex === null ||
          ownershipByTile[tileIndex]?.owner_player_id !== currentPlayerId
        ) {
          break;
        }
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        const tileName = getTileName(tileIndex);
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "Loan payoff",
          subtitle: tileName,
          amount: -amount,
        });
        break;
      }
      default:
        break;
    }
  }

  return transactions.slice(0, 10);
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
  const [playerLoans, setPlayerLoans] = useState<PlayerLoan[]>([]);
  const [payoffLoan, setPayoffLoan] = useState<PlayerLoan | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"wallet" | "board">("wallet");
  const [boardZoomed, setBoardZoomed] = useState(false);
  const [auctionBidAmount, setAuctionBidAmount] = useState<number>(10);
  const [auctionNow, setAuctionNow] = useState<Date>(() => new Date());
  const [needsAuth, setNeedsAuth] = useState(false);
  const [isActivityPanelOpen, setIsActivityPanelOpen] = useState(false);
  const [activityTab, setActivityTab] = useState<"log" | "transactions">("log");
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
  const currentUserPlayer = useMemo(
    () => players.find((player) => session && player.user_id === session.user.id),
    [players, session],
  );
  const boardPack = getBoardPackById(gameMeta?.board_pack_id);
  const rules = useMemo(() => getRules(gameState?.rules), [gameState?.rules]);
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
    const payload =
      event.payload && typeof event.payload === "object" ? event.payload : null;

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

    if (event.event_type === "CARD_UTILITY_ROLL") {
      if (diceDisplay) {
        return `Rolled ${diceDisplay} for utility rent (card effect)`;
      }
      if (typeof payload?.roll === "number") {
        return `Rolled ${payload.roll} for utility rent (card effect)`;
      }
      return "Rolled for utility rent (card effect)";
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
      const reasonLabel = reason === "LAND_GO" ? "for landing on GO" : "for passing GO";
      return amount !== null
        ? `${playerName} collected $${amount} ${reasonLabel}`
        : `${playerName} collected GO salary`;
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

    if (event.event_type === "DRAW_CARD") {
      const deck =
        typeof payload?.deck === "string" ? payload.deck : "Card";
      const cardTitle =
        typeof payload?.card_title === "string" ? payload.card_title : "Card";
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      return `${playerName} drew ${deck}: ${cardTitle}`;
    }

    if (event.event_type === "CARD_REVEALED") {
      const deck =
        typeof payload?.deck === "string" ? payload.deck : "Card";
      const cardTitle =
        typeof payload?.card_title === "string" ? payload.card_title : "Card";
      return `${deck} card revealed: ${cardTitle}`;
    }

    if (event.event_type === "CARD_PAY") {
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
      const cardTitle =
        typeof payload?.card_title === "string" ? payload.card_title : "Card";
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      return `${playerName} went to jail (${cardTitle})`;
    }

    if (event.event_type === "CARD_GET_OUT_OF_JAIL_FREE_RECEIVED") {
      const cardTitle =
        typeof payload?.card_title === "string"
          ? payload.card_title
          : "Get Out of Jail Free";
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      const totalCards =
        typeof payload?.total_cards === "number"
          ? payload.total_cards
          : typeof payload?.total_cards === "string"
            ? Number.parseInt(payload.total_cards, 10)
            : null;
      return totalCards !== null
        ? `${playerName} received a ${cardTitle} card (${totalCards} total)`
        : `${playerName} received a ${cardTitle} card`;
    }

    if (event.event_type === "CARD_GET_OUT_OF_JAIL_FREE_USED") {
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      const remainingCards =
        typeof payload?.remaining_cards === "number"
          ? payload.remaining_cards
          : typeof payload?.remaining_cards === "string"
            ? Number.parseInt(payload.remaining_cards, 10)
            : null;
      return remainingCards !== null
        ? `${playerName} used a Get Out of Jail Free card (${remainingCards} left)`
        : `${playerName} used a Get Out of Jail Free card`;
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

    if (event.event_type === "AUCTION_STARTED") {
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
      const minIncrement =
        typeof payload?.min_increment === "number"
          ? payload.min_increment
          : typeof payload?.min_increment === "string"
            ? Number.parseInt(payload.min_increment, 10)
            : null;
      return minIncrement !== null
        ? `Auction started for ${tileLabel} (min +$${minIncrement})`
        : `Auction started for ${tileLabel}`;
    }

    if (event.event_type === "AUCTION_BID") {
      const amount =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      const playerId =
        typeof payload?.player_id === "string" ? payload.player_id : null;
      const playerName =
        players.find((player) => player.id === playerId)?.display_name ??
        "Player";
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
        ? `${playerName} bid $${amount} on ${tileLabel}`
        : `${playerName} bid on ${tileLabel}`;
    }

    if (event.event_type === "AUCTION_PASS") {
      const playerId =
        typeof payload?.player_id === "string" ? payload.player_id : null;
      const playerName =
        players.find((player) => player.id === playerId)?.display_name ??
        "Player";
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
      const isAuto = payload?.auto === true;
      return isAuto
        ? `${playerName} auto-passed on ${tileLabel}`
        : `${playerName} passed on ${tileLabel}`;
    }

    if (event.event_type === "AUCTION_WON") {
      const winnerId =
        typeof payload?.winner_id === "string" ? payload.winner_id : null;
      const winnerName =
        players.find((player) => player.id === winnerId)?.display_name ??
        "Player";
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
        ? `${winnerName} won ${tileLabel} for $${amount}`
        : `${winnerName} won ${tileLabel}`;
    }

    if (event.event_type === "AUCTION_SKIPPED") {
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
      return `Auction skipped for ${tileLabel}`;
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

      return rentAmount !== null
        ? `Paid $${rentAmount} rent to ${ownerName} (${tileLabel})${detailLabel}`
        : `Paid rent to ${ownerName} (${tileLabel})`;
    }

    if (event.event_type === "RENT_SKIPPED_COLLATERAL") {
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

    if (event.event_type === "BANKRUPTCY") {
      const playerId =
        typeof payload?.player_id === "string" ? payload.player_id : null;
      const playerName =
        players.find((player) => player.id === playerId)?.display_name ??
        "Player";
      const reason =
        typeof payload?.reason === "string" ? payload.reason : "PAYMENT";
      const returnedIds = Array.isArray(payload?.returned_property_ids)
        ? payload.returned_property_ids
        : [];
      const propertyCount =
        returnedIds.length > 0 ? ` (${returnedIds.length} properties)` : "";
      return `${playerName} went bankrupt (${reason})${propertyCount}`;
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

    if (event.event_type === "JAIL_DOUBLES_SUCCESS") {
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

    if (event.event_type === "GAME_OVER") {
      const winnerName =
        typeof payload?.winner_player_name === "string"
          ? payload.winner_player_name
          : "Player";
      return `Game over · Winner: ${winnerName}`;
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
        `players?select=id,user_id,display_name,created_at,position,is_in_jail,jail_turns_remaining,get_out_of_jail_free_count,is_eliminated,eliminated_at&game_id=eq.${activeGameId}&order=created_at.asc`,
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
        `property_ownership?select=tile_index,owner_player_id,collateral_loan_id&game_id=eq.${activeGameId}`,
        { method: "GET" },
        accessToken,
      );
      const mapped = ownershipRows.reduce<OwnershipByTile>((acc, row) => {
        if (row.owner_player_id) {
          acc[row.tile_index] = {
            owner_player_id: row.owner_player_id,
            collateral_loan_id: row.collateral_loan_id ?? null,
          };
        }
        return acc;
      }, {});
      setOwnershipByTile(mapped);
    },
    [],
  );

  const loadLoans = useCallback(
    async (
      activeGameId: string,
      accessToken?: string,
      playerId?: string | null,
    ) => {
      if (!playerId) {
        setPlayerLoans([]);
        return;
      }
      const loanRows = await supabaseClient.fetchFromSupabase<PlayerLoan[]>(
        `player_loans?select=id,player_id,collateral_tile_index,principal,remaining_principal,rate_per_turn,term_turns,turns_remaining,payment_per_turn,status&game_id=eq.${activeGameId}&player_id=eq.${playerId}`,
        { method: "GET" },
        accessToken,
      );
      setPlayerLoans(loanRows);
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
        `game_state?select=game_id,version,current_player_id,balances,last_roll,doubles_count,turn_phase,pending_action,pending_card_active,pending_card_deck,pending_card_id,pending_card_title,pending_card_kind,pending_card_payload,pending_card_drawn_by_player_id,pending_card_drawn_at,pending_card_source_tile_index,chance_index,community_index,free_parking_pot,rules,auction_active,auction_tile_index,auction_initiator_player_id,auction_current_bid,auction_current_winner_player_id,auction_turn_player_id,auction_turn_ends_at,auction_eligible_player_ids,auction_passed_player_ids,auction_min_increment&game_id=eq.${activeGameId}&limit=1`,
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
          table: "player_loans",
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          try {
            await loadLoans(gameId, session?.access_token, currentUserPlayer?.id);
          } catch (error) {
            if (DEBUG) {
              console.error("[Play][Realtime] player_loans handler error", error);
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
    currentUserPlayer?.id,
    loadEvents,
    loadGameMeta,
    loadGameState,
    loadLoans,
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
          loadLoans(gameId, accessToken, currentUserPlayer?.id),
        ]);
      }, 350);
    },
    [
      currentUserPlayer?.id,
      firstRoundResyncEnabled,
      gameId,
      loadEvents,
      loadGameState,
      loadLoans,
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
  const isEliminated = Boolean(currentUserPlayer?.is_eliminated);
  const isAuctionActive = Boolean(gameState?.auction_active);
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
  const showPendingDecisionCard =
    hasPendingDecision && isMyTurn && !isAuctionActive;
  const showPendingDecisionBanner =
    hasPendingDecision && !isMyTurn && !isAuctionActive;
  const myPlayerBalance =
    gameState?.balances && currentUserPlayer
      ? gameState.balances[currentUserPlayer.id] ?? 0
      : 0;
  const canAffordPendingPurchase = pendingPurchase
    ? myPlayerBalance >= pendingPurchase.price
    : false;
  const hasPendingCard = Boolean(pendingCard);
  const canAct =
    initialSnapshotReady &&
    isMyTurn &&
    !isEliminated &&
    !isAuctionActive &&
    !hasPendingCard;
  const isAwaitingJailDecision =
    isMyTurn && gameState?.turn_phase === "AWAITING_JAIL_DECISION";
  const showJailDecisionPanel =
    isAwaitingJailDecision && currentUserPlayer?.is_in_jail;
  const canRollForDoubles =
    isAwaitingJailDecision && currentUserPlayer?.is_in_jail;
  const getOutOfJailFreeCount =
    currentUserPlayer?.get_out_of_jail_free_count ?? 0;
  const hasGetOutOfJailFree = getOutOfJailFreeCount > 0;
  const canRoll =
    canAct &&
    !hasPendingDecision &&
    !isAwaitingJailDecision &&
    (gameState?.last_roll == null || (gameState?.doubles_count ?? 0) > 0);
  const canEndTurn =
    canAct && !hasPendingDecision && gameState?.last_roll != null;
  const canConfirmPendingCard =
    Boolean(pendingCard) &&
    currentUserPlayer?.id === pendingCard?.drawnBy &&
    gameState?.turn_phase === "AWAITING_CARD_CONFIRM";
  const rollDiceDisabledReason = useMemo(() => {
    if (!(actionLoading === "ROLL_DICE" || !canRoll)) {
      return null;
    }
    if (actionLoading === "ROLL_DICE") {
      return "Rolling…";
    }
    if (!initialSnapshotReady) {
      return "Loading snapshot…";
    }
    if (isEliminated) {
      return "You are eliminated";
    }
    if (isAuctionActive) {
      return "Auction in progress";
    }
    if (hasPendingCard) {
      return "Resolve card to continue";
    }
    if (hasPendingDecision) {
      return "Resolve property decision";
    }
    if (isAwaitingJailDecision) {
      return "You are in jail – choose an option";
    }
    if (!isMyTurn) {
      return `Waiting for ${currentPlayer?.display_name ?? "another player"}…`;
    }
    if (gameState?.last_roll != null && (gameState?.doubles_count ?? 0) <= 0) {
      return "End your turn";
    }
    return null;
  }, [
    actionLoading,
    canRoll,
    currentPlayer?.display_name,
    gameState?.doubles_count,
    gameState?.last_roll,
    hasPendingCard,
    hasPendingDecision,
    initialSnapshotReady,
    isAuctionActive,
    isAwaitingJailDecision,
    isEliminated,
    isMyTurn,
  ]);
  const buyDisabledReason =
    actionLoading === "BUY_PROPERTY"
      ? "Buying…"
      : !canAffordPendingPurchase
        ? "Not enough cash"
        : null;
  const jailPayDisabledReason =
    actionLoading === "JAIL_PAY_FINE" ? "Paying…" : null;
  const confirmCardDisabledReason =
    actionLoading === "CONFIRM_PENDING_CARD" ? "Confirming…" : null;
  const payoffLoanDisabledReason =
    actionLoading === "PAYOFF_COLLATERAL_LOAN"
      ? "Paying…"
      : payoffLoan && payoffLoan.remaining_principal > myPlayerBalance
        ? "Not enough cash"
        : null;
  const pendingDeckLabel =
    pendingCard?.deck === "CHANCE"
      ? "Chance"
      : pendingCard?.deck === "COMMUNITY"
        ? "Community"
        : "Card";
  const turnPhaseLabel = useMemo(() => {
    if (gameState?.auction_active) {
      return "Auction in progress";
    }
    if (gameState?.turn_phase === "AWAITING_JAIL_DECISION") {
      return "In jail – choose option";
    }
    if (
      gameState?.turn_phase === "AWAITING_CARD_CONFIRM" ||
      gameState?.pending_card_active
    ) {
      return "Resolving card";
    }
    if (gameState?.turn_phase === "AWAITING_ROLL") {
      return "Rolling";
    }
    if (gameState?.current_player_id) {
      return "Waiting for other player";
    }
    return "Waiting";
  }, [
    gameState?.auction_active,
    gameState?.current_player_id,
    gameState?.pending_card_active,
    gameState?.turn_phase,
  ]);
  const realtimeStatusLabel = realtimeReady ? "Live" : "Syncing…";
  const isHost = Boolean(
    session && gameMeta?.created_by && session.user.id === gameMeta.created_by,
  );
  const ownedProperties = useMemo(() => {
    if (!boardPack?.tiles || !currentUserPlayer) {
      return [];
    }
    return boardPack.tiles
      .filter(
        (tile) =>
          ["PROPERTY", "RAIL", "UTILITY"].includes(tile.type) &&
          ownershipByTile[tile.index]?.owner_player_id === currentUserPlayer.id,
      )
      .map((tile) => ({
        tile,
        isCollateralized: Boolean(
          ownershipByTile[tile.index]?.collateral_loan_id,
        ),
      }));
  }, [boardPack?.tiles, currentUserPlayer, ownershipByTile]);
  const eligibleCollateralTiles = ownedProperties.filter(
    (entry) => !entry.isCollateralized,
  );
  const activeLoans = playerLoans.filter((loan) => loan.status === "active");
  const netWorth = useMemo(() => {
    const propertyValue = ownedProperties.reduce((total, entry) => {
      if (entry.isCollateralized) {
        return total;
      }
      return total + (entry.tile.price ?? 0);
    }, 0);
    const outstandingPrincipal = activeLoans.reduce((total, loan) => {
      if (typeof loan.remaining_principal === "number") {
        return total + loan.remaining_principal;
      }
      return total + loan.principal;
    }, 0);
    return myPlayerBalance + propertyValue - outstandingPrincipal;
  }, [activeLoans, myPlayerBalance, ownedProperties]);
  const auctionTurnPlayerId = gameState?.auction_turn_player_id ?? null;
  const auctionTileIndex = gameState?.auction_tile_index ?? null;
  const auctionTile =
    auctionTileIndex !== null && auctionTileIndex !== undefined
      ? boardPack?.tiles?.find((tile) => tile.index === auctionTileIndex) ?? null
      : null;
  const auctionCurrentBid = gameState?.auction_current_bid ?? 0;
  const auctionMinIncrement =
    gameState?.auction_min_increment ?? rules.auctionMinIncrement;
  const auctionBidMinimum =
    auctionCurrentBid > 0 ? auctionCurrentBid + auctionMinIncrement : 10;
  const auctionTurnEndsAt = gameState?.auction_turn_ends_at ?? null;
  const auctionWinnerId = gameState?.auction_current_winner_player_id ?? null;
  const auctionWinnerName =
    players.find((player) => player.id === auctionWinnerId)?.display_name ??
    (auctionWinnerId ? "Player" : null);
  const auctionTurnPlayerName =
    players.find((player) => player.id === auctionTurnPlayerId)?.display_name ??
    (auctionTurnPlayerId ? "Player" : null);
  const isCurrentAuctionBidder =
    Boolean(currentUserPlayer?.id) &&
    currentUserPlayer?.id === auctionTurnPlayerId;
  const UI_RESOLVE_DELAY_MS = 250;
  const [isCardResolving, setIsCardResolving] = useState(false);
  const [isAuctionResolving, setIsAuctionResolving] = useState(false);
  const [isLoanPayoffResolving, setIsLoanPayoffResolving] = useState(false);
  const [cardDisplaySnapshot, setCardDisplaySnapshot] = useState<{
    deckLabel: string;
    title: string;
    description: string | null;
    actorName: string | null;
  } | null>(null);
  const [auctionDisplaySnapshot, setAuctionDisplaySnapshot] = useState<{
    tileName: string;
    tileType: string;
    currentBid: number;
    winnerName: string | null;
    turnPlayerName: string | null;
    countdownLabel: string;
  } | null>(null);
  const currentBidderCash =
    currentUserPlayer && gameState?.balances
      ? gameState.balances[currentUserPlayer.id] ?? 0
      : 0;
  const isEventLogSuppressed =
    viewMode !== "wallet" ||
    showJailDecisionPanel ||
    pendingCard !== null ||
    isCardResolving ||
    payoffLoan !== null ||
    isLoanPayoffResolving ||
    isAuctionActive;
  const transactions = useMemo(
    () =>
      derivePlayerTransactions({
        events,
        currentPlayerId: currentUserPlayer?.id ?? null,
        players,
        boardPack,
        ownershipByTile,
      }),
    [boardPack, currentUserPlayer?.id, events, ownershipByTile, players],
  );
  const formatSignedCurrency = (amount: number) =>
    `${amount < 0 ? "-" : "+"}$${Math.abs(amount)}`;

  useEffect(() => {
    if (isEventLogSuppressed && isActivityPanelOpen) {
      setIsActivityPanelOpen(false);
    }
  }, [isActivityPanelOpen, isEventLogSuppressed]);
  const auctionRemainingSeconds = useMemo(() => {
    if (!auctionTurnEndsAt) {
      return null;
    }
    const endMs = Date.parse(auctionTurnEndsAt);
    if (Number.isNaN(endMs)) {
      return null;
    }
    const diffMs = endMs - auctionNow.getTime();
    return Math.max(0, Math.ceil(diffMs / 1000));
  }, [auctionNow, auctionTurnEndsAt]);
  const auctionCountdownLabel =
    typeof auctionRemainingSeconds === "number"
      ? `${Math.floor(auctionRemainingSeconds / 60)}:${String(
          auctionRemainingSeconds % 60,
        ).padStart(2, "0")}`
      : "—";
  const canIncreaseAuctionBid =
    isCurrentAuctionBidder && auctionBidAmount + 10 <= currentBidderCash;
  const canDecreaseAuctionBid =
    isCurrentAuctionBidder && auctionBidAmount - 10 >= auctionBidMinimum;
  const canSubmitAuctionBid =
    isCurrentAuctionBidder &&
    auctionBidAmount >= auctionBidMinimum &&
    auctionBidAmount <= currentBidderCash;
  const auctionBidDisabledReason =
    actionLoading === "AUCTION_BID"
      ? "Submitting bid…"
      : !canSubmitAuctionBid
        ? auctionBidAmount < auctionBidMinimum
          ? `Minimum bid is $${auctionBidMinimum}`
          : auctionBidAmount > currentBidderCash
            ? "Not enough cash"
            : null
        : null;

  useEffect(() => {
    if (!gameId || !session?.access_token) {
      return;
    }
    void loadLoans(gameId, session.access_token, currentUserPlayer?.id);
  }, [currentUserPlayer?.id, gameId, loadLoans, session?.access_token]);

  useEffect(() => {
    if (!isAuctionActive) {
      return;
    }
    setAuctionDisplaySnapshot({
      tileName:
        auctionTile?.name ??
        (auctionTileIndex !== null
          ? `Tile ${auctionTileIndex}`
          : "Unowned tile"),
      tileType: auctionTile?.type ?? "Ownable tile",
      currentBid: auctionCurrentBid,
      winnerName: auctionWinnerName,
      turnPlayerName: auctionTurnPlayerName,
      countdownLabel: auctionCountdownLabel,
    });
    setAuctionNow(new Date());
    const interval = setInterval(() => {
      setAuctionNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, [
    auctionCountdownLabel,
    auctionCurrentBid,
    auctionTile?.name,
    auctionTile?.type,
    auctionTileIndex,
    auctionTurnEndsAt,
    auctionTurnPlayerName,
    auctionWinnerName,
    isAuctionActive,
  ]);

  useEffect(() => {
    if (!pendingCard) {
      return;
    }
    setCardDisplaySnapshot({
      deckLabel: pendingDeckLabel,
      title: pendingCard.title,
      description: pendingCardDescription ?? null,
      actorName: pendingCardActorName ?? null,
    });
  }, [
    pendingCard,
    pendingCardActorName,
    pendingCardDescription,
    pendingDeckLabel,
  ]);

  useEffect(() => {
    if (!isAuctionActive && auctionDisplaySnapshot) {
      setIsAuctionResolving(true);
      const timeout = window.setTimeout(() => {
        setIsAuctionResolving(false);
      }, UI_RESOLVE_DELAY_MS);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [UI_RESOLVE_DELAY_MS, auctionDisplaySnapshot, isAuctionActive]);

  useEffect(() => {
    if (!isAuctionActive || !isCurrentAuctionBidder) {
      return;
    }
    setAuctionBidAmount((prev) => {
      const minValue = auctionBidMinimum;
      const maxValue = currentBidderCash;
      if (prev < minValue) {
        return minValue;
      }
      if (prev > maxValue) {
        return maxValue;
      }
      return prev;
    });
  }, [
    auctionBidMinimum,
    currentBidderCash,
    isAuctionActive,
    isCurrentAuctionBidder,
  ]);

  const handleBankAction = useCallback(
    async (
      request:
        | {
          action:
            | "ROLL_DICE"
            | "END_TURN"
            | "JAIL_PAY_FINE"
            | "JAIL_ROLL_FOR_DOUBLES"
            | "USE_GET_OUT_OF_JAIL_FREE"
            | "CONFIRM_PENDING_CARD";
        }
        | { action: "DECLINE_PROPERTY" | "BUY_PROPERTY"; tileIndex: number }
        | { action: "AUCTION_BID"; amount: number }
        | { action: "AUCTION_PASS" }
        | { action: "TAKE_COLLATERAL_LOAN"; tileIndex: number }
        | { action: "PAYOFF_COLLATERAL_LOAN"; loanId: string },
    ) => {
      const { action } = request;
      const tileIndex = "tileIndex" in request ? request.tileIndex : undefined;
      const amount = "amount" in request ? request.amount : undefined;
      const loanId = "loanId" in request ? request.loanId : undefined;
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
              amount,
              loanId,
              expectedVersion: snapshotVersion,
            }),
          });

          let responseBody:
            | {
                error?: string;
                gameState?: GameState;
                ownership?: OwnershipRow;
                loan?: PlayerLoan | null;
              }
            | null = null;
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
        if (responseBody?.ownership) {
          setOwnershipByTile((prev) => {
            if (!responseBody.ownership?.owner_player_id) {
              return prev;
            }
            return {
              ...prev,
              [responseBody.ownership.tile_index]: {
                owner_player_id: responseBody.ownership.owner_player_id,
                collateral_loan_id:
                  responseBody.ownership.collateral_loan_id ?? null,
              },
            };
          });
        }
        if (responseBody?.loan) {
          setPlayerLoans((prev) => {
            const existingIndex = prev.findIndex(
              (loan) => loan.id === responseBody?.loan?.id,
            );
            if (existingIndex >= 0) {
              const next = [...prev];
              next[existingIndex] = responseBody.loan as PlayerLoan;
              return next;
            }
            return [...prev, responseBody.loan as PlayerLoan];
          });
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

  const handleConfirmPendingCard = useCallback(() => {
    if (!canConfirmPendingCard) {
      return;
    }
    setIsCardResolving(true);
    window.setTimeout(() => {
      setIsCardResolving(false);
    }, UI_RESOLVE_DELAY_MS);
    void handleBankAction({ action: "CONFIRM_PENDING_CARD" });
  }, [UI_RESOLVE_DELAY_MS, canConfirmPendingCard, handleBankAction]);

  const handleAuctionBid = useCallback(() => {
    if (!isCurrentAuctionBidder) {
      return;
    }
    void handleBankAction({
      action: "AUCTION_BID",
      amount: auctionBidAmount,
    });
  }, [auctionBidAmount, handleBankAction, isCurrentAuctionBidder]);

  const handleAuctionPass = useCallback(() => {
    if (!isCurrentAuctionBidder) {
      return;
    }
    void handleBankAction({ action: "AUCTION_PASS" });
  }, [handleBankAction, isCurrentAuctionBidder]);

  const handlePayJailFine = useCallback(() => {
    void handleBankAction({ action: "JAIL_PAY_FINE" });
  }, [handleBankAction]);

  const handleRollForDoubles = useCallback(() => {
    void handleBankAction({ action: "JAIL_ROLL_FOR_DOUBLES" });
  }, [handleBankAction]);

  const handleUseGetOutOfJailFree = useCallback(() => {
    void handleBankAction({ action: "USE_GET_OUT_OF_JAIL_FREE" });
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
        <div className="relative">
        <div
          className={`rounded-2xl border bg-white p-5 shadow-sm space-y-4 ${
            isAuctionActive ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Current turn
                </p>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  {turnPhaseLabel}
                </span>
              </div>
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
          {showJailDecisionPanel ? (
            <>
              <div className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
              <div className="relative z-30 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 shadow-2xl ring-1 ring-black/10">
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
                  <div className="space-y-1">
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
                    {jailPayDisabledReason ? (
                      <p className="text-xs text-neutral-400">
                        {jailPayDisabledReason}
                      </p>
                    ) : null}
                  </div>
                  {hasGetOutOfJailFree ? (
                    <button
                      className="rounded-2xl border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-900 disabled:cursor-not-allowed disabled:border-rose-200 disabled:text-rose-400"
                      type="button"
                      onClick={handleUseGetOutOfJailFree}
                      disabled={actionLoading === "USE_GET_OUT_OF_JAIL_FREE"}
                    >
                      {actionLoading === "USE_GET_OUT_OF_JAIL_FREE"
                        ? "Using…"
                        : "Use Get Out of Jail Free"}
                    </button>
                  ) : null}
                  <button
                    className="rounded-2xl border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-900 disabled:cursor-not-allowed disabled:border-rose-200 disabled:text-rose-400"
                    type="button"
                    onClick={handleRollForDoubles}
                    disabled={
                      !canRollForDoubles ||
                      actionLoading === "JAIL_ROLL_FOR_DOUBLES"
                    }
                  >
                    {actionLoading === "JAIL_ROLL_FOR_DOUBLES"
                      ? "Rolling…"
                      : "Roll for doubles"}
                  </button>
                </div>
              </div>
            </>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <button
                className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                type="button"
                onClick={() => void handleBankAction({ action: "ROLL_DICE" })}
                disabled={!canRoll || actionLoading === "ROLL_DICE"}
              >
                {actionLoading === "ROLL_DICE" ? "Rolling…" : "Roll Dice"}
              </button>
              {rollDiceDisabledReason ? (
                <p className="text-xs text-neutral-400">
                  {rollDiceDisabledReason}
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <button
                className="rounded-2xl border px-4 py-3 text-sm font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
                type="button"
                onClick={() => void handleBankAction({ action: "END_TURN" })}
                disabled={!canEndTurn || actionLoading === "END_TURN"}
              >
                {actionLoading === "END_TURN" ? "Ending…" : "End Turn"}
              </button>
            </div>
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
                <div className="space-y-1">
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
                  {buyDisabledReason ? (
                    <p className="text-xs text-neutral-400">
                      {buyDisabledReason}
                    </p>
                  ) : null}
                </div>
                <button
                  className="rounded-2xl border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900 disabled:cursor-not-allowed disabled:border-amber-200 disabled:text-amber-400"
                  type="button"
                  onClick={handleDeclineProperty}
                  disabled={actionLoading === "DECLINE_PROPERTY"}
                  title="Start auction for this property"
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
        {pendingCard || isCardResolving ? (
          <>
            <div className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
            <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
              <div className="w-full max-w-md rounded-3xl border border-emerald-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500">
                  {pendingCard ? "Card revealed" : "Resolving card"}
                </p>
                <p className="text-lg font-semibold text-neutral-900">
                  {pendingCard ? pendingDeckLabel : cardDisplaySnapshot?.deckLabel}
                </p>
                <p className="mt-2 text-base font-semibold text-neutral-900">
                  {pendingCard?.title ?? cardDisplaySnapshot?.title}
                </p>
                {pendingCardDescription || cardDisplaySnapshot?.description ? (
                  <p className="mt-1 text-sm text-neutral-600">
                    {pendingCardDescription ?? cardDisplaySnapshot?.description}
                  </p>
                ) : null}
                {canConfirmPendingCard && !isCardResolving ? (
                  <div className="mt-4 space-y-1">
                    <button
                      className="w-full rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-emerald-200"
                      type="button"
                      onClick={handleConfirmPendingCard}
                      disabled={
                        actionLoading === "CONFIRM_PENDING_CARD" || isCardResolving
                      }
                    >
                      {actionLoading === "CONFIRM_PENDING_CARD"
                        ? "Confirming…"
                        : isCardResolving
                          ? "Resolving…"
                        : "OK"}
                    </button>
                    {confirmCardDisabledReason ? (
                      <p className="text-xs text-neutral-400">
                        {confirmCardDisabledReason}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-neutral-500">
                    {isCardResolving
                      ? "Resolving…"
                      : `Waiting for ${
                          pendingCardActorName ??
                          cardDisplaySnapshot?.actorName ??
                          "the current player"
                        } to confirm…`}
                  </p>
                )}
              </div>
            </div>
          </>
        ) : null}
        {payoffLoan ? (
          <>
            <div className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
            <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
              <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Pay off loan
                </p>
                <p className="text-lg font-semibold text-neutral-900">
                  {boardPack?.tiles?.find(
                    (entry) => entry.index === payoffLoan.collateral_tile_index,
                  )?.name ?? `Tile ${payoffLoan.collateral_tile_index}`}
                </p>
                <p className="mt-2 text-sm text-neutral-600">
                  Pay ${payoffLoan.remaining_principal} to release the collateral
                  and re-enable rent immediately.
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    className="rounded-2xl border px-4 py-2 text-sm font-semibold text-neutral-700"
                    type="button"
                    onClick={() => setPayoffLoan(null)}
                    disabled={actionLoading === "PAYOFF_COLLATERAL_LOAN"}
                  >
                    Cancel
                  </button>
                  <div className="space-y-1">
                    <button
                      className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                      type="button"
                      onClick={() => {
                        setIsLoanPayoffResolving(true);
                        void handleBankAction({
                          action: "PAYOFF_COLLATERAL_LOAN",
                          loanId: payoffLoan.id,
                        });
                        window.setTimeout(() => {
                          setIsLoanPayoffResolving(false);
                          setPayoffLoan(null);
                        }, UI_RESOLVE_DELAY_MS);
                      }}
                      disabled={
                        actionLoading === "PAYOFF_COLLATERAL_LOAN" ||
                        payoffLoan.remaining_principal > myPlayerBalance ||
                        isLoanPayoffResolving
                      }
                    >
                      {actionLoading === "PAYOFF_COLLATERAL_LOAN"
                        ? "Paying…"
                        : isLoanPayoffResolving
                          ? "Resolving…"
                          : `Pay $${payoffLoan.remaining_principal}`}
                    </button>
                    {payoffLoanDisabledReason ? (
                      <p className="text-xs text-neutral-400">
                        {payoffLoanDisabledReason}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
        {isAuctionActive || isAuctionResolving ? (
          <>
            <div className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
            <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
              <div className="w-full max-w-md scale-[1.02] rounded-3xl border border-indigo-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                      {isAuctionActive ? "Auction in progress" : "Resolving auction"}
                    </p>
                    <p className="text-lg font-semibold text-neutral-900">
                      {isAuctionActive
                        ? auctionTile?.name ??
                          (auctionTileIndex !== null
                            ? `Tile ${auctionTileIndex}`
                            : "Unowned tile")
                        : auctionDisplaySnapshot?.tileName ?? "Unowned tile"}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {isAuctionActive
                        ? auctionTile?.type ?? "Ownable tile"
                        : auctionDisplaySnapshot?.tileType ?? "Ownable tile"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-neutral-400">
                      {isAuctionActive ? "Time left" : "Finalizing"}
                    </p>
                    <p
                      className={`text-lg font-semibold ${
                        isCurrentAuctionBidder
                          ? "text-rose-600"
                          : "text-neutral-800"
                      }`}
                    >
                      {isAuctionActive
                        ? auctionCountdownLabel
                        : auctionDisplaySnapshot?.countdownLabel ?? "—"}
                    </p>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3 text-sm text-indigo-900">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                    Current bid
                  </p>
                  <p className="text-base font-semibold text-indigo-900">
                    $
                    {isAuctionActive
                      ? auctionCurrentBid
                      : auctionDisplaySnapshot?.currentBid ?? 0}
                  </p>
                  <p className="text-xs text-indigo-700">
                    {isAuctionActive
                      ? auctionWinnerName
                        ? `Leading: ${auctionWinnerName}`
                        : "No bids yet"
                      : auctionDisplaySnapshot?.winnerName
                        ? `Leading: ${auctionDisplaySnapshot.winnerName}`
                        : "No bids yet"}
                  </p>
                </div>
                {isAuctionActive ? (
                  <>
                    <p className="mt-3 text-sm text-neutral-600">
                      Waiting for{" "}
                      <span className="font-semibold text-neutral-900">
                        {auctionTurnPlayerName ?? "next bidder"}
                      </span>
                      …
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-neutral-600">
                    Resolving…
                  </p>
                )}
                {isCurrentAuctionBidder && isAuctionActive ? (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Your bid
                    </p>
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-2">
                      <button
                        className="rounded-full border border-neutral-200 px-3 py-1 text-sm font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:text-neutral-300"
                        type="button"
                        onClick={() =>
                          setAuctionBidAmount((prev) => prev - 10)
                        }
                        disabled={!canDecreaseAuctionBid}
                      >
                        –
                      </button>
                      <div className="text-lg font-semibold text-neutral-900">
                        ${auctionBidAmount}
                      </div>
                      <button
                        className="rounded-full border border-neutral-200 px-3 py-1 text-sm font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:text-neutral-300"
                        type="button"
                        onClick={() =>
                          setAuctionBidAmount((prev) => prev + 10)
                        }
                        disabled={!canIncreaseAuctionBid}
                      >
                        +
                      </button>
                    </div>
                    <p className="text-xs text-neutral-500">
                      Minimum bid: ${auctionBidMinimum} · Cash:{" "}
                      {currentBidderCash}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <button
                          className="rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-indigo-200"
                          type="button"
                          onClick={handleAuctionBid}
                          disabled={
                            actionLoading === "AUCTION_BID" ||
                            !canSubmitAuctionBid
                          }
                        >
                          {actionLoading === "AUCTION_BID" ? "Bidding…" : "Bid"}
                        </button>
                        {auctionBidDisabledReason ? (
                          <p className="text-xs text-neutral-400">
                            {auctionBidDisabledReason}
                          </p>
                        ) : null}
                      </div>
                      <button
                        className="rounded-2xl border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:border-neutral-100 disabled:text-neutral-300"
                        type="button"
                        onClick={handleAuctionPass}
                        disabled={actionLoading === "AUCTION_PASS"}
                      >
                        {actionLoading === "AUCTION_PASS" ? "Passing…" : "Pass"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-neutral-500">
                    {isAuctionActive
                      ? "Watch the auction update live. Actions unlock when it is your turn to bid or pass."
                      : "Updating auction results..."}
                  </p>
                )}
              </div>
            </div>
          </>
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
              {getOutOfJailFreeCount > 0 ? (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Get Out of Jail Free: {getOutOfJailFreeCount}
                </div>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-neutral-400">
                Net worth
              </p>
              <p className="text-lg font-semibold text-neutral-700">
                ${netWorth}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Loan with Collateral
          </p>
          <p className="text-sm text-neutral-600">
            Raise cash by collateralizing an owned property. Rent is paused while
            the loan is active.
          </p>
        </div>
        <div className="rounded-2xl border border-dashed border-neutral-200 p-3 text-xs text-neutral-600">
          <p className="font-semibold text-neutral-700">Terms</p>
          <p>
            LTV: {Math.round(rules.collateralLtv * 100)}% · Rate:{" "}
            {(rules.loanRatePerTurn * 100).toFixed(2)}% per turn · Term:{" "}
            {rules.loanTermTurns} turns
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Owned properties
          </p>
          {eligibleCollateralTiles.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No eligible properties available.
            </p>
          ) : (
            <div className="space-y-2">
              {eligibleCollateralTiles.map(({ tile }) => {
                const principalPreview = Math.round(
                  (tile.price ?? 0) * rules.collateralLtv,
                );
                const baseRent =
                  typeof tile.baseRent === "number" ? tile.baseRent : null;
                const groupLabel = getTileGroupLabel(tile);
                return (
                  <div
                    key={tile.index}
                    className="flex items-center justify-between rounded-2xl border px-4 py-3 text-sm"
                  >
                    <div className="space-y-1">
                      <div>
                        <p className="font-semibold text-neutral-900">
                          {tile.name}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {groupLabel}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                        <span className="font-semibold text-neutral-700">
                          Principal: ${principalPreview}
                        </span>
                        <span className="uppercase tracking-wide text-neutral-400">
                          Rent
                        </span>
                        <span className="font-semibold text-neutral-700">
                          {baseRent !== null ? `$${baseRent}` : "—"}
                        </span>
                      </div>
                    </div>
                    <button
                      className="rounded-full bg-neutral-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                      type="button"
                      onClick={() =>
                        void handleBankAction({
                          action: "TAKE_COLLATERAL_LOAN",
                          tileIndex: tile.index,
                        })
                      }
                      disabled={
                        !canAct ||
                        !rules.loanCollateralEnabled ||
                        actionLoading === "TAKE_COLLATERAL_LOAN"
                      }
                    >
                      {actionLoading === "TAKE_COLLATERAL_LOAN"
                        ? "Collateralizing…"
                        : "Collateralize"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Active loans
          </p>
          {activeLoans.length === 0 ? (
            <p className="text-sm text-neutral-500">No active loans.</p>
          ) : (
            <div className="space-y-2">
              {activeLoans.map((loan) => {
                const tile =
                  boardPack?.tiles?.find(
                    (entry) => entry.index === loan.collateral_tile_index,
                  ) ?? null;
                const tileName =
                  tile?.name ?? `Tile ${loan.collateral_tile_index}`;
                const groupLabel = getTileGroupLabel(tile);
                const payoffAmount =
                  typeof loan.remaining_principal === "number"
                    ? loan.remaining_principal
                    : loan.principal;
                const canPayoff =
                  canAct &&
                  payoffAmount > 0 &&
                  myPlayerBalance >= payoffAmount;
                return (
                  <div
                    key={loan.id}
                    className="flex items-center justify-between rounded-2xl border px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-neutral-900">
                        {tileName}
                      </p>
                      <p className="text-xs text-neutral-500">{groupLabel}</p>
                      <p className="text-xs text-neutral-400">
                        Rent paused while collateralized.
                      </p>
                      <p className="text-xs text-neutral-500">
                        Payment: ${loan.payment_per_turn} · Turns remaining:{" "}
                        {loan.turns_remaining}
                      </p>
                      <p className="text-xs text-neutral-500">
                        Remaining balance: ${payoffAmount}
                      </p>
                    </div>
                    <button
                      className="rounded-full border border-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
                      type="button"
                      onClick={() => setPayoffLoan(loan)}
                      disabled={
                        !canPayoff ||
                        actionLoading === "PAYOFF_COLLATERAL_LOAN"
                      }
                      title={
                        canPayoff
                          ? "Pay off this loan"
                          : "Not enough cash to pay off"
                      }
                    >
                      Pay off
                    </button>
                  </div>
                );
              })}
            </div>
          )}
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
      {!isEventLogSuppressed ? (
        <>
          <button
            className="fixed bottom-6 right-6 z-10 rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-lg shadow-neutral-900/20 transition hover:bg-neutral-800"
            type="button"
            onClick={() => {
              setActivityTab("log");
              setIsActivityPanelOpen(true);
            }}
          >
            Activity
          </button>
          {isActivityPanelOpen ? (
            <div
              className="fixed inset-0 z-30"
              onClick={() => setIsActivityPanelOpen(false)}
            >
              <div className="absolute inset-0 bg-black/20" />
              <div
                className="absolute bottom-20 right-6 z-40 w-[min(92vw,380px)] rounded-2xl border bg-white p-4 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Activity"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Activity
                    </p>
                    <p className="text-sm text-neutral-600">
                      Wallet-impacting updates and live table events.
                    </p>
                  </div>
                  <button
                    className="rounded-full border border-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-700"
                    type="button"
                    onClick={() => setIsActivityPanelOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-full bg-neutral-100 p-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  <button
                    className={`flex-1 rounded-full px-3 py-1 transition ${
                      activityTab === "log"
                        ? "bg-white text-neutral-900 shadow-sm"
                        : "text-neutral-500 hover:text-neutral-700"
                    }`}
                    type="button"
                    onClick={() => setActivityTab("log")}
                  >
                    Log
                  </button>
                  <button
                    className={`flex-1 rounded-full px-3 py-1 transition ${
                      activityTab === "transactions"
                        ? "bg-white text-neutral-900 shadow-sm"
                        : "text-neutral-500 hover:text-neutral-700"
                    }`}
                    type="button"
                    onClick={() => setActivityTab("transactions")}
                  >
                    Transactions
                  </button>
                </div>
                {activityTab === "log" ? (
                  <div className="mt-4 max-h-[50vh] space-y-3 overflow-y-auto text-sm">
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
                ) : (
                  <div className="mt-4 max-h-[50vh] space-y-3 overflow-y-auto text-sm">
                    {transactions.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-neutral-200 p-4 text-center text-neutral-500">
                        No transactions yet.
                      </div>
                    ) : (
                      transactions.map((transaction) => (
                        <div
                          key={transaction.id}
                          className="flex items-center justify-between rounded-2xl border px-4 py-3"
                        >
                          <div>
                            <p className="font-medium text-neutral-800">
                              {transaction.title}
                            </p>
                            {transaction.subtitle ? (
                              <p className="text-xs text-neutral-500">
                                {transaction.subtitle}
                              </p>
                            ) : null}
                          </div>
                          <p
                            className={`text-sm font-semibold ${
                              transaction.amount < 0
                                ? "text-rose-500"
                                : "text-emerald-600"
                            }`}
                          >
                            {formatSignedCurrency(transaction.amount)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
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
                        {player.is_eliminated ? (
                          <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-rose-700">
                            Eliminated
                          </span>
                        ) : null}
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
