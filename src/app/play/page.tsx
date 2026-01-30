"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import PageShell from "../components/PageShell";
import BoardMiniMap from "../components/BoardMiniMap";
import HousesDots from "../components/HousesDots";
import { getBoardPackById, type BoardTile } from "@/lib/boardPacks";
import {
  defaultMacroDeckId,
  getMacroDeckById,
  type MacroEventEffect,
} from "@/lib/macroDecks";
import { getRules } from "@/lib/rules";
import { supabaseClient, type SupabaseSession } from "@/lib/supabase/client";

const lastGameKey = "bank.lastGameId";
const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "true";
const JAIL_FINE_AMOUNT = 50;
const EVENT_FETCH_LIMIT = 100;
const EVENT_LOG_LIMIT = 10;
const TRANSACTION_DISPLAY_LIMIT = 30;
const PROPERTY_GROUP_COLORS: Record<string, string> = {
  brown: "#9a6b3f",
  "light-blue": "#7dd3fc",
  pink: "#f9a8d4",
  orange: "#fb923c",
  red: "#f87171",
  yellow: "#facc15",
  green: "#4ade80",
  "dark-blue": "#2563eb",
};
const DEFAULT_PROPERTY_BAND_COLOR = "#e5e7eb";
const fallbackExpandedTiles: BoardTile[] = Array.from(
  { length: 40 },
  (_, index) => ({
    index,
    tile_id: `tile-${index}`,
    type: index === 0 ? "START" : "PROPERTY",
    name: `Tile ${index}`,
  }),
);
const expandedOwnershipPalette = [
  { border: "rgba(37, 99, 235, 0.9)", inset: "rgba(37, 99, 235, 0.28)" },
  { border: "rgba(220, 38, 38, 0.9)", inset: "rgba(220, 38, 38, 0.26)" },
  { border: "rgba(5, 150, 105, 0.9)", inset: "rgba(5, 150, 105, 0.25)" },
  { border: "rgba(124, 58, 237, 0.9)", inset: "rgba(124, 58, 237, 0.26)" },
  { border: "rgba(217, 119, 6, 0.9)", inset: "rgba(217, 119, 6, 0.24)" },
  { border: "rgba(8, 145, 178, 0.9)", inset: "rgba(8, 145, 178, 0.24)" },
];

const getPlayerInitials = (name: string | null) => {
  if (!name) {
    return "P";
  }

  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0]?.slice(0, 2).toUpperCase() ?? "P";
  }

  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
};

const formatSignedPercent = (value: number) =>
  `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;

const formatMultiplier = (value: number) => `${value.toFixed(2)}×`;

const describeMacroEffect = (effect: MacroEventEffect) => {
  switch (effect.type) {
    case "rent_multiplier":
      return `Rent multiplier: ${formatMultiplier(effect.value)}`;
    case "loan_rate_modifier":
      return `Interest delta: ${formatSignedPercent(effect.value)} per turn`;
    case "maintenance_cost_multiplier":
      return `Maintenance multiplier: ${formatMultiplier(effect.value)}`;
    case "development_cost_multiplier":
      return `Development cost multiplier: ${formatMultiplier(effect.value)}`;
    case "cash_bonus":
      return `Cash bonus: +$${effect.value}`;
    case "cash_shock":
      return `Cash shock: -$${Math.abs(effect.value)}`;
    default:
      return effect.description ?? `Effect: ${effect.type}`;
  }
};

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
  purchase_mortgage_id: string | null;
  houses?: number | null;
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

type PurchaseMortgage = {
  id: string;
  player_id: string;
  tile_index: number;
  principal_original: number;
  principal_remaining: number;
  rate_per_turn: number;
  term_turns: number;
  turns_elapsed: number;
  accrued_interest_unpaid: number;
  status: string;
};

type TradeSnapshotTile = {
  tile_index: number;
  collateral_loan_id: string | null;
  purchase_mortgage_id: string | null;
  houses: number;
};

type TradeProposal = {
  id: string;
  game_id: string;
  proposer_player_id: string;
  counterparty_player_id: string;
  offer_cash: number;
  offer_tile_indices: number[];
  request_cash: number;
  request_tile_indices: number[];
  snapshot: TradeSnapshotTile[] | { tiles: TradeSnapshotTile[] } | null;
  status: string;
  created_at: string | null;
};

type TradeExecutionSummary = {
  tradeId: string;
  proposerPlayerId: string;
  counterpartyPlayerId: string;
  offerCash: number;
  offerTiles: number[];
  requestCash: number;
  requestTiles: number[];
  snapshotTiles: TradeSnapshotTile[];
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

const calculateMortgageInterestPerTurn = (
  principalRemaining: number | null | undefined,
  ratePerTurn: number | null | undefined,
) => {
  if (typeof principalRemaining !== "number" || typeof ratePerTurn !== "number") {
    return 0;
  }
  return Math.round(principalRemaining * ratePerTurn);
};

const normalizeTradeSnapshot = (
  snapshot: TradeProposal["snapshot"],
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
  const mortgageInterestDebitKeys = new Set<string>();

  for (const event of events) {
    const payload =
      event.payload && typeof event.payload === "object" ? event.payload : null;
    if (!payload) {
      continue;
    }
    if (event.event_type !== "CASH_DEBIT") {
      continue;
    }
    const reason = typeof payload.reason === "string" ? payload.reason : null;
    if (reason !== "PURCHASE_MORTGAGE_INTEREST") {
      continue;
    }
    const mortgageId =
      typeof payload.mortgage_id === "string" ? payload.mortgage_id : "unknown";
    const amount = parseNumber(payload.amount);
    if (amount === null) {
      continue;
    }
    const key = `${mortgageId}-${amount}-${event.created_at ?? ""}`;
    mortgageInterestDebitKeys.add(key);
  }

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
      case "CASH_DEBIT": {
        const playerId =
          typeof payload.player_id === "string" ? payload.player_id : null;
        if (playerId !== currentPlayerId) {
          break;
        }
        const reason =
          typeof payload.reason === "string" ? payload.reason : null;
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        if (reason === "TRADE") {
          const counterpartyId =
            typeof payload.counterparty_player_id === "string"
              ? payload.counterparty_player_id
              : null;
          const counterpartyName = counterpartyId
            ? getPlayerName(counterpartyId)
            : "another player";
          transactions.push({
            ...recordBase,
            id: event.id,
            title: "Trade payment",
            subtitle: `To ${counterpartyName}`,
            amount: -amount,
          });
          break;
        }
        if (reason === "PURCHASE_MORTGAGE_INTEREST") {
          const tileIndex = parseNumber(payload.tile_index);
          const tileName = getTileName(tileIndex);
          transactions.push({
            ...recordBase,
            id: event.id,
            title: "Mortgage interest",
            subtitle: tileName,
            amount: -amount,
          });
          break;
        }
        if (reason === "MACRO_MAINTENANCE") {
          const eventName =
            typeof payload.event_name === "string" ? payload.event_name : null;
          const houses = parseNumber(payload.houses);
          const subtitle = eventName
            ? `${eventName}${houses !== null ? ` · ${houses} houses` : ""}`
            : houses !== null
              ? `${houses} houses`
              : null;
          transactions.push({
            ...recordBase,
            id: event.id,
            title: "Macro maintenance",
            subtitle: subtitle ?? null,
            amount: -amount,
          });
          break;
        }
        if (reason === "MACRO_INTEREST_SURCHARGE") {
          const tileIndex = parseNumber(payload.tile_index);
          const tileName = getTileName(tileIndex);
          transactions.push({
            ...recordBase,
            id: event.id,
            title: "Macro interest surcharge",
            subtitle: tileName,
            amount: -amount,
          });
        }
        break;
      }
      case "CASH_CREDIT": {
        const playerId =
          typeof payload.player_id === "string" ? payload.player_id : null;
        if (playerId !== currentPlayerId) {
          break;
        }
        const reason =
          typeof payload.reason === "string" ? payload.reason : null;
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          break;
        }
        if (reason === "TRADE") {
          const counterpartyId =
            typeof payload.counterparty_player_id === "string"
              ? payload.counterparty_player_id
              : null;
          const counterpartyName = counterpartyId
            ? getPlayerName(counterpartyId)
            : "another player";
          transactions.push({
            ...recordBase,
            id: event.id,
            title: "Trade proceeds",
            subtitle: `From ${counterpartyName}`,
            amount,
          });
        }
        break;
      }
      case "PURCHASE_MORTGAGE_INTEREST_PAID": {
        const playerId =
          typeof payload.player_id === "string" ? payload.player_id : null;
        if (playerId !== currentPlayerId) {
          break;
        }
        const amount = parseNumber(payload.interest_amount);
        if (amount === null) {
          break;
        }
        const mortgageId =
          typeof payload.mortgage_id === "string" ? payload.mortgage_id : "unknown";
        const key = `${mortgageId}-${amount}-${event.created_at ?? ""}`;
        if (mortgageInterestDebitKeys.has(key)) {
          break;
        }
        const tileIndex = parseNumber(payload.tile_index);
        const tileName = getTileName(tileIndex);
        transactions.push({
          ...recordBase,
          id: event.id,
          title: "Mortgage interest",
          subtitle: tileName,
          amount: -amount,
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
  const [purchaseMortgages, setPurchaseMortgages] = useState<PurchaseMortgage[]>(
    [],
  );
  const [tradeProposals, setTradeProposals] = useState<TradeProposal[]>([]);
  const [tradeLoanDetails, setTradeLoanDetails] = useState<PlayerLoan[]>([]);
  const [tradeMortgageDetails, setTradeMortgageDetails] = useState<
    PurchaseMortgage[]
  >([]);
  const [tradeExecutionSummary, setTradeExecutionSummary] =
    useState<TradeExecutionSummary | null>(null);
  const [isProposeTradeOpen, setIsProposeTradeOpen] = useState(false);
  const [isIncomingTradeOpen, setIsIncomingTradeOpen] = useState(false);
  const [tradeCounterpartyId, setTradeCounterpartyId] = useState<string>("");
  const [tradeOfferCash, setTradeOfferCash] = useState<number>(0);
  const [tradeOfferTiles, setTradeOfferTiles] = useState<number[]>([]);
  const [tradeRequestCash, setTradeRequestCash] = useState<number>(0);
  const [tradeRequestTiles, setTradeRequestTiles] = useState<number[]>([]);
  const [payoffLoan, setPayoffLoan] = useState<PlayerLoan | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [auctionBidAmount, setAuctionBidAmount] = useState<number>(10);
  const [auctionNow, setAuctionNow] = useState<Date>(() => new Date());
  const [needsAuth, setNeedsAuth] = useState(false);
  const [isActivityPanelOpen, setIsActivityPanelOpen] = useState(false);
  const [activityTab, setActivityTab] = useState<"log" | "transactions">("log");
  const [isBoardExpanded, setIsBoardExpanded] = useState(false);
  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(
    null,
  );
  const [expandedBoardScale, setExpandedBoardScale] = useState(1);
  const [initialSnapshotReady, setInitialSnapshotReady] = useState(false);
  const [realtimeReady, setRealtimeReady] = useState(false);
  const [firstRoundResyncEnabled, setFirstRoundResyncEnabled] = useState(true);
  const [sessionInvalid, setSessionInvalid] = useState(false);
  const expandedBoardContainerRef = useRef<HTMLDivElement | null>(null);
  const expandedBoardRef = useRef<HTMLDivElement | null>(null);
  const expandedTileSheetRef = useRef<HTMLDivElement | null>(null);
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
  const lastTradeEventIdRef = useRef<string | null>(null);
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
  const tradeLoansById = useMemo(() => {
    const lookup = new Map<string, PlayerLoan>();
    tradeLoanDetails.forEach((loan) => lookup.set(loan.id, loan));
    return lookup;
  }, [tradeLoanDetails]);
  const tradeMortgagesById = useMemo(() => {
    const lookup = new Map<string, PurchaseMortgage>();
    tradeMortgageDetails.forEach((mortgage) => lookup.set(mortgage.id, mortgage));
    return lookup;
  }, [tradeMortgageDetails]);
  const incomingTradeProposal = useMemo(() => {
    if (!currentUserPlayer) {
      return null;
    }
    return (
      tradeProposals.find(
        (proposal) =>
          proposal.status === "PENDING" &&
          proposal.counterparty_player_id === currentUserPlayer.id,
      ) ?? null
    );
  }, [currentUserPlayer, tradeProposals]);
  const boardPack = getBoardPackById(gameMeta?.board_pack_id);
  const currentPlayerId = gameState?.current_player_id ?? null;
  const expandedBoardTiles =
    boardPack?.tiles && boardPack.tiles.length > 0
      ? boardPack.tiles
      : fallbackExpandedTiles;
  const expandedTilesByIndex = useMemo(() => {
    const lookup = new Map<number, BoardTile>();
    expandedBoardTiles.forEach((tile) => {
      lookup.set(tile.index, tile);
    });
    return lookup;
  }, [expandedBoardTiles]);
  const expandedPlayersByTile = useMemo(
    () =>
      players.reduce<Record<number, Player[]>>((acc, player) => {
        const position = Number.isFinite(player.position) ? player.position : 0;
        acc[position] = acc[position] ? [...acc[position], player] : [player];
        return acc;
      }, {}),
    [players],
  );
  const expandedOwnershipColorsByPlayer = useMemo(() => {
    return players.reduce<Record<string, { border: string; inset: string }>>(
      (acc, player, index) => {
        acc[player.id] =
          expandedOwnershipPalette[index % expandedOwnershipPalette.length];
        return acc;
      },
      {},
    );
  }, [players]);
  const expandedBoardEdges = useMemo(
    () => ({
      top: [20, 21, 22, 23, 24, 25],
      right: [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39],
      bottom: [5, 4, 3, 2, 1, 0],
      left: [19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6],
    }),
    [],
  );
  const getExpandedTileFaceLabel = useCallback((tileType: string) => {
    const normalized = tileType.toUpperCase();
    if (normalized === "PROPERTY") {
      return null;
    }
    switch (normalized) {
      case "START":
        return "GO";
      case "JAIL":
        return "JAIL";
      case "FREE_PARKING":
        return "FREE";
      case "GO_TO_JAIL":
        return "G2J";
      case "CHANCE":
        return "CHANCE";
      case "COMMUNITY_CHEST":
        return "CHEST";
      case "TAX":
        return "TAX";
      case "RAILROAD":
        return "RR";
      case "UTILITY":
        return "UTIL";
      default: {
        const fallback = normalized.replace(/_/g, " ");
        return fallback.length > 8 ? fallback.slice(0, 8) : fallback;
      }
    }
  }, []);
  const renderExpandedTile = useCallback(
    (tileIndex: number) => {
      const tile =
        expandedTilesByIndex.get(tileIndex) ??
        ({
          index: tileIndex,
          tile_id: `tile-${tileIndex}`,
          type: tileIndex === 0 ? "START" : "PROPERTY",
          name: `Tile ${tileIndex}`,
        } satisfies BoardTile);
      const tilePlayers = expandedPlayersByTile[tileIndex] ?? [];
      const isCurrentTile = tilePlayers.some(
        (player) => player.id === currentPlayerId,
      );
      const ownerId = ownershipByTile?.[tileIndex]?.owner_player_id;
      const ownershipColor = ownerId
        ? expandedOwnershipColorsByPlayer[ownerId]
        : undefined;
      const houses = ownershipByTile?.[tileIndex]?.houses ?? 0;
      const ownershipStyle = ownershipColor
        ? {
            borderColor: ownershipColor.border,
            boxShadow: `inset 0 0 0 2px ${ownershipColor.inset}`,
          }
        : undefined;

      const isSelectedTile = tileIndex === selectedTileIndex;
      const tileFaceLabel = getExpandedTileFaceLabel(tile.type);

      return (
        <div
          key={tile.tile_id}
          role="button"
          tabIndex={0}
          className="h-full w-full focus:outline-none"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedTileIndex(tileIndex);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              setSelectedTileIndex(tileIndex);
            }
          }}
        >
          <div
            style={ownershipStyle}
            className={`border bg-white text-neutral-700 ${
              isCurrentTile ? "ring-2 ring-emerald-400/70" : ""
            } ${isSelectedTile ? "outline outline-2 outline-indigo-300/60 outline-offset-2" : ""} h-full w-full rounded-md border-neutral-200 p-0.2 sm:p-0.2`}
          >
            <div className="relative flex h-full flex-col justify-end gap-2">
              <span className="absolute left-1 top-1 text-[9px] font-medium text-neutral-300/70">
                {tile.index}
              </span>
              {tileFaceLabel ? (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-0.5 text-[10px] font-semibold uppercase tracking-normal text-neutral-500">
                  <span className="w-full line-clamp-2 text-center">
                    {tileFaceLabel}
                  </span>
                </span>
              ) : null}
              {tile.type === "PROPERTY" ? (
                <div className="flex justify-end">
                  <HousesDots houses={houses} size="md" />
                </div>
              ) : null}
              {tilePlayers.length > 0 ? (
                <div className="flex flex-wrap justify-end gap-1">
                  {tilePlayers.map((player) => (
                    <div
                      key={player.id}
                      className={`flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-[9px] font-semibold uppercase text-white ${
                        player.id === currentPlayerId
                          ? "ring-2 ring-emerald-300"
                          : ""
                      }`}
                    >
                      {getPlayerInitials(player.display_name)}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      );
    },
    [
      currentPlayerId,
      expandedOwnershipColorsByPlayer,
      expandedPlayersByTile,
      expandedTilesByIndex,
      getExpandedTileFaceLabel,
      ownershipByTile,
      selectedTileIndex,
    ],
  );
  const getExpandedTileTypeLabel = useCallback((tileType: string) => {
    const normalized = tileType.toUpperCase();
    switch (normalized) {
      case "PROPERTY":
        return "Property";
      case "RAILROAD":
        return "Railroad";
      case "UTILITY":
        return "Utility";
      case "CHANCE":
        return "Chance";
      case "COMMUNITY_CHEST":
        return "Community Chest";
      case "TAX":
        return "Tax";
      case "JAIL":
        return "Jail";
      case "START":
        return "Go";
      case "GO_TO_JAIL":
        return "Go To Jail";
      case "FREE_PARKING":
        return "Free Parking";
      default:
        return "Other";
    }
  }, []);
  const selectedExpandedTile = useMemo(() => {
    if (selectedTileIndex === null) {
      return null;
    }
    return (
      expandedTilesByIndex.get(selectedTileIndex) ??
      ({
        index: selectedTileIndex,
        tile_id: `tile-${selectedTileIndex}`,
        type: selectedTileIndex === 0 ? "START" : "PROPERTY",
        name: `Tile ${selectedTileIndex}`,
      } satisfies BoardTile)
    );
  }, [expandedTilesByIndex, selectedTileIndex]);
  const selectedTileTypeLabel = useMemo(() => {
    if (!selectedExpandedTile) {
      return null;
    }
    return getExpandedTileTypeLabel(selectedExpandedTile.type);
  }, [getExpandedTileTypeLabel, selectedExpandedTile]);
  const selectedTileOwnerLabel = useMemo(() => {
    if (!selectedExpandedTile || selectedTileIndex === null) {
      return null;
    }
    const ownableTypes = new Set(["PROPERTY", "RAILROAD", "UTILITY"]);
    if (!ownableTypes.has(selectedExpandedTile.type)) {
      return "Not ownable";
    }
    const ownership = ownershipByTile[selectedTileIndex];
    if (!ownership?.owner_player_id) {
      return "Unowned";
    }
    const owner = players.find(
      (player) => player.id === ownership.owner_player_id,
    );
    return owner?.display_name ?? "Player";
  }, [ownershipByTile, players, selectedExpandedTile, selectedTileIndex]);
  const selectedTilePlayers = useMemo(() => {
    if (selectedTileIndex === null) {
      return [];
    }
    return expandedPlayersByTile[selectedTileIndex] ?? [];
  }, [expandedPlayersByTile, selectedTileIndex]);
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
  const getPlayerNameById = useCallback(
    (playerId: string | null) =>
      players.find((player) => player.id === playerId)?.display_name ?? "Player",
    [players],
  );
  const getTileNameByIndex = useCallback(
    (tileIndex: number | null) => {
      if (tileIndex === null || Number.isNaN(tileIndex)) {
        return "Tile";
      }
      return (
        boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name ??
        `Tile ${tileIndex}`
      );
    },
    [boardPack?.tiles],
  );
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

    if (event.event_type === "TRADE_PROPOSED") {
      const proposerId =
        typeof payload?.proposer_player_id === "string"
          ? payload.proposer_player_id
          : null;
      const counterpartyId =
        typeof payload?.counterparty_player_id === "string"
          ? payload.counterparty_player_id
          : null;
      const proposerName = proposerId
        ? players.find((player) => player.id === proposerId)?.display_name ??
          "Player"
        : "Player";
      const counterpartyName = counterpartyId
        ? players.find((player) => player.id === counterpartyId)?.display_name ??
          "Player"
        : "Player";
      return `Trade proposed · ${proposerName} → ${counterpartyName}`;
    }

    if (event.event_type === "TRADE_ACCEPTED") {
      const proposerId =
        typeof payload?.proposer_player_id === "string"
          ? payload.proposer_player_id
          : null;
      const counterpartyId =
        typeof payload?.counterparty_player_id === "string"
          ? payload.counterparty_player_id
          : null;
      const proposerName = proposerId
        ? players.find((player) => player.id === proposerId)?.display_name ??
          "Player"
        : "Player";
      const counterpartyName = counterpartyId
        ? players.find((player) => player.id === counterpartyId)?.display_name ??
          "Player"
        : "Player";
      return `Trade executed · ${proposerName} ⇄ ${counterpartyName}`;
    }

    if (event.event_type === "TRADE_REJECTED") {
      const rejectedId =
        typeof payload?.rejected_by_player_id === "string"
          ? payload.rejected_by_player_id
          : null;
      const rejectedName = rejectedId
        ? players.find((player) => player.id === rejectedId)?.display_name ??
          "Player"
        : "Player";
      return `Trade rejected · ${rejectedName}`;
    }

    if (event.event_type === "PROPERTY_TRANSFERRED") {
      const tileIndex = parseNumber(payload?.tile_index);
      const tileName = getTileNameByIndex(tileIndex);
      const fromId =
        typeof payload?.from_player_id === "string"
          ? payload.from_player_id
          : null;
      const toId =
        typeof payload?.to_player_id === "string"
          ? payload.to_player_id
          : null;
      const fromName = fromId
        ? players.find((player) => player.id === fromId)?.display_name ??
          "Player"
        : "Player";
      const toName = toId
        ? players.find((player) => player.id === toId)?.display_name ??
          "Player"
        : "Player";
      return `Property transferred · ${tileName} (${fromName} → ${toName})`;
    }

    if (event.event_type === "LOAN_ASSUMED") {
      const tileIndex = parseNumber(payload?.tile_index);
      const tileName = getTileNameByIndex(tileIndex);
      const toId =
        typeof payload?.to_player_id === "string"
          ? payload.to_player_id
          : null;
      const toName = toId
        ? players.find((player) => player.id === toId)?.display_name ??
          "Player"
        : "Player";
      return `Loan assumed · ${tileName} (${toName})`;
    }

    if (event.event_type === "START_GAME") {
      return "Game started";
    }

    if (event.event_type === "MACRO_EVENT") {
      const eventName =
        typeof payload?.event_name === "string"
          ? payload.event_name
          : "Macroeconomic shift";
      const rarityRaw = typeof payload?.rarity === "string" ? payload.rarity : null;
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
      const eventName =
        typeof payload?.event_name === "string"
          ? payload.event_name
          : "Macroeconomic shift";
      const rarityRaw = typeof payload?.rarity === "string" ? payload.rarity : null;
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
      const eventName =
        typeof payload?.event_name === "string"
          ? payload.event_name
          : "Macroeconomic shift";
      return `Macro event expired: ${eventName}`;
    }

    if (event.event_type === "MACRO_MAINTENANCE_CHARGED") {
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
      const rentMultiplierTotal = parseNumber(payload?.rent_multiplier_total);
      const macroLabel =
        rentMultiplierTotal !== null && rentMultiplierTotal !== 1
          ? ` (macro ×${rentMultiplierTotal.toFixed(2)})`
          : "";

      return rentAmount !== null
        ? `Paid $${rentAmount} rent to ${ownerName} (${tileLabel})${detailLabel}${macroLabel}`
        : `Paid rent to ${ownerName} (${tileLabel})${macroLabel}`;
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
  }, [boardPack?.tiles, getOwnershipLabel, getTileNameByIndex, players]);

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
        `property_ownership?select=tile_index,owner_player_id,collateral_loan_id,purchase_mortgage_id,houses&game_id=eq.${activeGameId}`,
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

  const loadPurchaseMortgages = useCallback(
    async (
      activeGameId: string,
      accessToken?: string,
      playerId?: string | null,
    ) => {
      if (!playerId) {
        setPurchaseMortgages([]);
        return;
      }
      const mortgageRows = await supabaseClient.fetchFromSupabase<
        PurchaseMortgage[]
      >(
        `purchase_mortgages?select=id,player_id,tile_index,principal_original,principal_remaining,rate_per_turn,term_turns,turns_elapsed,accrued_interest_unpaid,status&game_id=eq.${activeGameId}&player_id=eq.${playerId}`,
        { method: "GET" },
        accessToken,
      );
      setPurchaseMortgages(mortgageRows);
    },
    [],
  );

  const loadTradeProposals = useCallback(
    async (activeGameId: string, accessToken?: string) => {
      const proposalRows = await supabaseClient.fetchFromSupabase<
        TradeProposal[]
      >(
        `trade_proposals?select=id,game_id,proposer_player_id,counterparty_player_id,offer_cash,offer_tile_indices,request_cash,request_tile_indices,snapshot,status,created_at&game_id=eq.${activeGameId}&order=created_at.desc`,
        { method: "GET" },
        accessToken,
      );
      setTradeProposals(proposalRows);
    },
    [],
  );

  const loadTradeLiabilities = useCallback(
    async (
      activeGameId: string,
      accessToken: string,
      loanIds: string[],
      mortgageIds: string[],
    ) => {
      if (loanIds.length === 0) {
        setTradeLoanDetails([]);
      } else {
        const loanRows = await supabaseClient.fetchFromSupabase<PlayerLoan[]>(
          `player_loans?select=id,player_id,collateral_tile_index,principal,remaining_principal,rate_per_turn,term_turns,turns_remaining,payment_per_turn,status&game_id=eq.${activeGameId}&id=in.(${loanIds.join(",")})`,
          { method: "GET" },
          accessToken,
        );
        setTradeLoanDetails(loanRows);
      }

      if (mortgageIds.length === 0) {
        setTradeMortgageDetails([]);
      } else {
        const mortgageRows = await supabaseClient.fetchFromSupabase<
          PurchaseMortgage[]
        >(
          `purchase_mortgages?select=id,player_id,tile_index,principal_original,principal_remaining,rate_per_turn,term_turns,turns_elapsed,accrued_interest_unpaid,status&game_id=eq.${activeGameId}&id=in.(${mortgageIds.join(",")})`,
          { method: "GET" },
          accessToken,
        );
        setTradeMortgageDetails(mortgageRows);
      }
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

  const loadEvents = useCallback(
    async (activeGameId: string, accessToken?: string) => {
      const eventRows = await supabaseClient.fetchFromSupabase<GameEvent[]>(
        `game_events?select=id,event_type,payload,created_at,version&game_id=eq.${activeGameId}&order=version.desc&limit=${EVENT_FETCH_LIMIT}`,
        { method: "GET" },
        accessToken,
      );
      setEvents(eventRows);
    },
    [],
  );

  const loadGameData = useCallback(
    async (activeGameId: string, accessToken?: string) => {
      await Promise.all([
        loadGameMeta(activeGameId, accessToken),
        loadPlayers(activeGameId, accessToken),
        loadGameState(activeGameId, accessToken),
        loadEvents(activeGameId, accessToken),
        loadOwnership(activeGameId, accessToken),
        loadTradeProposals(activeGameId, accessToken),
      ]);
      if (!activeGameIdRef.current || activeGameIdRef.current === activeGameId) {
        setInitialSnapshotReady(true);
      }
    },
    [
      loadEvents,
      loadGameMeta,
      loadGameState,
      loadOwnership,
      loadPlayers,
      loadTradeProposals,
    ],
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
          table: "trade_proposals",
          filter: `game_id=eq.${gameId}`,
        },
        async (payload) => {
          if (DEBUG) {
            console.info("[Play][Realtime] payload", {
              table: "trade_proposals",
              eventType: payload.eventType,
              gameId,
            });
          }
          try {
            await loadTradeProposals(gameId, session?.access_token);
          } catch (error) {
            if (DEBUG) {
              console.error(
                "[Play][Realtime] trade_proposals handler error",
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
          table: "purchase_mortgages",
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          try {
            await loadPurchaseMortgages(
              gameId,
              session?.access_token,
              currentUserPlayer?.id,
            );
          } catch (error) {
            if (DEBUG) {
              console.error(
                "[Play][Realtime] purchase_mortgages handler error",
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
    currentUserPlayer?.id,
    loadEvents,
    loadGameMeta,
    loadGameState,
    loadLoans,
    loadPurchaseMortgages,
    loadPlayers,
    loadOwnership,
    loadTradeProposals,
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
          loadPurchaseMortgages(gameId, accessToken, currentUserPlayer?.id),
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
      loadPurchaseMortgages,
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
  const pendingMacroEvent = useMemo(() => {
    const pendingAction = gameState?.pending_action;
    if (!pendingAction || typeof pendingAction !== "object") {
      return null;
    }

    const candidate = pendingAction as {
      type?: unknown;
      macro_id?: unknown;
    };

    if (candidate.type !== "MACRO_EVENT" || typeof candidate.macro_id !== "string") {
      return null;
    }

    const macroDeck = getMacroDeckById(defaultMacroDeckId);
    const macroEvent =
      macroDeck?.events.find((event) => event.id === candidate.macro_id) ?? null;

    if (macroEvent) {
      return macroEvent;
    }

    return {
      id: candidate.macro_id,
      name: "Macroeconomic Shift",
      durationRounds: 0,
      effects: [],
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
  const pendingMacroDescription = useMemo(() => {
    if (!pendingMacroEvent) {
      return null;
    }
    const descriptions = pendingMacroEvent.effects
      .map((effect) => effect.description)
      .filter(Boolean);
    return descriptions.length > 0
      ? descriptions.join(" ")
      : "Market conditions are shifting across the board.";
  }, [pendingMacroEvent]);
  const pendingMacroEffects = useMemo(() => {
    if (!pendingMacroEvent) {
      return [];
    }
    const items = pendingMacroEvent.effects.map((effect) =>
      describeMacroEffect(effect),
    );
    if (pendingMacroEvent.durationRounds > 0) {
      items.push(`Duration: ${pendingMacroEvent.durationRounds} rounds`);
    }
    return items;
  }, [pendingMacroEvent]);
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
  const pendingRentByHouses =
    pendingTile?.rentByHouses && pendingTile.rentByHouses.length > 0
      ? pendingTile.rentByHouses
      : null;
  const pendingBaseRentDisplay =
    pendingRentByHouses?.[0] ?? pendingBaseRent ?? null;
  const pendingMaxRentDisplay =
    pendingRentByHouses && pendingRentByHouses.length > 0
      ? pendingRentByHouses[pendingRentByHouses.length - 1] ?? null
      : pendingBaseRent ?? null;
  const pendingMaxRentLabel = pendingRentByHouses
    ? "Rent with hotel (max build)"
    : "Rent with max build";
  const pendingRentRows = [
    { label: "Base rent", value: pendingBaseRentDisplay },
    { label: "Rent with 1 house", value: pendingRentByHouses?.[1] ?? null },
    { label: "Rent with 2 houses", value: pendingRentByHouses?.[2] ?? null },
    { label: "Rent with 3 houses", value: pendingRentByHouses?.[3] ?? null },
    { label: "Rent with 4 houses", value: pendingRentByHouses?.[4] ?? null },
    { label: pendingMaxRentLabel, value: pendingMaxRentDisplay },
  ];
  const pendingTileLabel =
    pendingTile?.name ??
    (pendingPurchase ? `Tile ${pendingPurchase.tile_index}` : null);
  const pendingBandColor = pendingTile?.colorGroup
    ? PROPERTY_GROUP_COLORS[pendingTile.colorGroup] ?? DEFAULT_PROPERTY_BAND_COLOR
    : DEFAULT_PROPERTY_BAND_COLOR;
  const hasPendingDecision = Boolean(pendingPurchase);
  const hasPendingMacroEvent = Boolean(pendingMacroEvent);
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
  const pendingMortgagePrincipal = pendingPurchase
    ? Math.round(pendingPurchase.price * 0.5)
    : 0;
  const pendingMortgageDownPayment = pendingPurchase
    ? pendingPurchase.price - pendingMortgagePrincipal
    : 0;
  const canAffordPendingMortgage = pendingPurchase
    ? myPlayerBalance >= pendingMortgageDownPayment
    : false;
  const hasPendingCard = Boolean(pendingCard);
  const canAct =
    initialSnapshotReady &&
    isMyTurn &&
    !isEliminated &&
    !isAuctionActive &&
    !hasPendingCard &&
    !hasPendingMacroEvent;
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
  const canConfirmMacroEvent =
    hasPendingMacroEvent &&
    isMyTurn &&
    gameState?.turn_phase === "AWAITING_CONFIRMATION";
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
    if (hasPendingMacroEvent) {
      return "Resolve macro event to continue";
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
    hasPendingMacroEvent,
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
  const mortgageBuyDisabledReason =
    actionLoading === "BUY_PROPERTY"
      ? "Buying…"
      : !canAffordPendingMortgage
        ? "Not enough cash for down payment"
        : null;
  const jailPayDisabledReason =
    actionLoading === "JAIL_PAY_FINE" ? "Paying…" : null;
  const confirmCardDisabledReason =
    actionLoading === "CONFIRM_PENDING_CARD" ? "Confirming…" : null;
  const confirmMacroDisabledReason =
    actionLoading === "CONFIRM_MACRO_EVENT" ? "Confirming…" : null;
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
    if (
      gameState?.turn_phase === "AWAITING_CONFIRMATION" ||
      hasPendingMacroEvent
    ) {
      return "Resolving macro event";
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
    hasPendingMacroEvent,
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
      .map((tile) => {
        const ownership = ownershipByTile[tile.index];
        const isCollateralized = Boolean(ownership?.collateral_loan_id);
        const isPurchaseMortgaged = Boolean(ownership?.purchase_mortgage_id);
        const colorGroup = tile.colorGroup ?? null;
        const groupTiles = colorGroup
          ? boardPack.tiles.filter(
              (entry) =>
                entry.type === "PROPERTY" && entry.colorGroup === colorGroup,
            )
          : [];
        const hasFullSet =
          colorGroup &&
          groupTiles.length > 0 &&
          groupTiles.every(
            (entry) =>
              ownershipByTile[entry.index]?.owner_player_id ===
              currentUserPlayer.id,
          );
        const houses = ownership?.houses ?? 0;
        const houseCost = tile.houseCost ?? 0;
        const canBuildHouse =
          canAct &&
          tile.type === "PROPERTY" &&
          hasFullSet &&
          !isCollateralized &&
          houseCost > 0 &&
          houses < 4 &&
          myPlayerBalance >= houseCost;
        const canSellHouse =
          canAct &&
          tile.type === "PROPERTY" &&
          hasFullSet &&
          !isCollateralized &&
          houseCost > 0 &&
          houses > 0;
        return {
          tile,
          isCollateralized,
          isPurchaseMortgaged,
          isCollateralEligible: !isCollateralized && !isPurchaseMortgaged,
          hasFullSet,
          houses,
          houseCost,
          canBuildHouse,
          canSellHouse,
        };
      });
  }, [
    boardPack?.tiles,
    canAct,
    currentUserPlayer,
    myPlayerBalance,
    ownershipByTile,
  ]);
  const availableTradeCounterparties = useMemo(() => {
    if (!currentUserPlayer) {
      return [];
    }
    return players.filter(
      (player) => player.id !== currentUserPlayer.id && !player.is_eliminated,
    );
  }, [currentUserPlayer, players]);
  const counterpartyOwnedProperties = useMemo(() => {
    if (!tradeCounterpartyId || !boardPack?.tiles) {
      return [];
    }
    return boardPack.tiles
      .filter(
        (tile) =>
          ["PROPERTY", "RAIL", "UTILITY"].includes(tile.type) &&
          ownershipByTile[tile.index]?.owner_player_id === tradeCounterpartyId,
      )
      .map((tile) => {
        const ownership = ownershipByTile[tile.index];
        return {
          tile,
          houses: ownership?.houses ?? 0,
        };
      });
  }, [boardPack?.tiles, ownershipByTile, tradeCounterpartyId]);
  const canSubmitTradeProposal = useMemo(() => {
    const hasAssets =
      tradeOfferCash > 0 ||
      tradeOfferTiles.length > 0 ||
      tradeRequestCash > 0 ||
      tradeRequestTiles.length > 0;
    return Boolean(tradeCounterpartyId) && hasAssets;
  }, [
    tradeCounterpartyId,
    tradeOfferCash,
    tradeOfferTiles.length,
    tradeRequestCash,
    tradeRequestTiles.length,
  ]);
  const activeLoans = playerLoans.filter((loan) => loan.status === "active");
  const activePurchaseMortgages = purchaseMortgages.filter(
    (mortgage) => mortgage.status === "active",
  );
  const latestMortgageInterestById = useMemo(() => {
    const latestById = new Map<
      string,
      { amount: number; version: number; ts: string | null }
    >();
    for (const event of events) {
      const payload =
        event.payload && typeof event.payload === "object"
          ? event.payload
          : null;
      if (!payload) {
        continue;
      }
      const version = typeof event.version === "number" ? event.version : 0;
      if (event.event_type === "CASH_DEBIT") {
        const reason =
          typeof payload.reason === "string" ? payload.reason : null;
        if (reason !== "PURCHASE_MORTGAGE_INTEREST") {
          continue;
        }
        const mortgageId =
          typeof payload.mortgage_id === "string" ? payload.mortgage_id : null;
        if (!mortgageId) {
          continue;
        }
        const amount = parseNumber(payload.amount);
        if (amount === null) {
          continue;
        }
        const existing = latestById.get(mortgageId);
        if (!existing || version > existing.version) {
          latestById.set(mortgageId, {
            amount,
            version,
            ts: event.created_at ?? null,
          });
        }
        continue;
      }
      if (
        event.event_type !== "PURCHASE_MORTGAGE_INTEREST_PAID" &&
        event.event_type !== "PURCHASE_MORTGAGE_INTEREST_ACCRUED"
      ) {
        continue;
      }
      const mortgageId =
        typeof payload.mortgage_id === "string" ? payload.mortgage_id : null;
      if (!mortgageId) {
        continue;
      }
      const amount = parseNumber(payload.interest_amount);
      if (amount === null) {
        continue;
      }
      const existing = latestById.get(mortgageId);
      if (!existing || version > existing.version) {
        latestById.set(mortgageId, {
          amount,
          version,
          ts: event.created_at ?? null,
        });
      }
    }
    return latestById;
  }, [events]);
  const netWorth = useMemo(() => {
    const propertyValue = ownedProperties.reduce((total, entry) => {
      if (entry.isCollateralized || entry.isPurchaseMortgaged) {
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
    const mortgageBalance = activePurchaseMortgages.reduce((total, mortgage) => {
      const principal = mortgage.principal_remaining ?? 0;
      const interest = mortgage.accrued_interest_unpaid ?? 0;
      return total + principal + interest;
    }, 0);
    return myPlayerBalance + propertyValue - outstandingPrincipal - mortgageBalance;
  }, [
    activeLoans,
    activePurchaseMortgages,
    myPlayerBalance,
    ownedProperties,
  ]);
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
  const [isMacroResolving, setIsMacroResolving] = useState(false);
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
  const isDecisionOverlayActive =
    showJailDecisionPanel ||
    pendingCard !== null ||
    isCardResolving ||
    pendingMacroEvent !== null ||
    isMacroResolving ||
    payoffLoan !== null ||
    isLoanPayoffResolving ||
    isAuctionActive ||
    isAuctionResolving;
  const isEventLogSuppressed =
    showJailDecisionPanel ||
    pendingCard !== null ||
    isCardResolving ||
    pendingMacroEvent !== null ||
    isMacroResolving ||
    payoffLoan !== null ||
    isLoanPayoffResolving ||
    isAuctionActive;
  const transactions = useMemo(() => {
    const derived = derivePlayerTransactions({
      events,
      currentPlayerId: currentUserPlayer?.id ?? null,
      players,
      boardPack,
      ownershipByTile,
    });
    return [...derived].sort(
      (a, b) => b.sourceEventVersion - a.sourceEventVersion,
    );
  }, [boardPack, currentUserPlayer?.id, events, ownershipByTile, players]);
  const displayEvents = useMemo(
    () => events.slice(0, EVENT_LOG_LIMIT),
    [events],
  );
  const displayTransactions = useMemo(
    () => transactions.slice(0, TRANSACTION_DISPLAY_LIMIT),
    [transactions],
  );
  const formatSignedCurrency = (amount: number) =>
    `${amount < 0 ? "-" : "+"}$${Math.abs(amount)}`;
  const incomingTradeSnapshotTiles = useMemo(
    () =>
      incomingTradeProposal
        ? normalizeTradeSnapshot(incomingTradeProposal.snapshot)
        : [],
    [incomingTradeProposal],
  );
  const incomingTradeOfferTiles =
    incomingTradeProposal?.offer_tile_indices ?? [];
  const incomingTradeRequestTiles =
    incomingTradeProposal?.request_tile_indices ?? [];
  const incomingTradeOfferCash = incomingTradeProposal?.offer_cash ?? 0;
  const incomingTradeRequestCash = incomingTradeProposal?.request_cash ?? 0;
  const incomingTradeCounterpartyName = incomingTradeProposal
    ? getPlayerNameById(incomingTradeProposal.proposer_player_id)
    : "Player";
  const incomingTradeLiabilities = useMemo(() => {
    if (!incomingTradeProposal) {
      return [];
    }
    return incomingTradeOfferTiles.map((tileIndex) => {
      const snapshot = incomingTradeSnapshotTiles.find(
        (entry) => entry.tile_index === tileIndex,
      );
      const collateralLoan = snapshot?.collateral_loan_id
        ? tradeLoansById.get(snapshot.collateral_loan_id)
        : null;
      const mortgage = snapshot?.purchase_mortgage_id
        ? tradeMortgagesById.get(snapshot.purchase_mortgage_id)
        : null;
      return {
        tileIndex,
        collateralPayment: collateralLoan?.payment_per_turn ?? null,
        mortgageInterest: mortgage
          ? calculateMortgageInterestPerTurn(
              mortgage.principal_remaining,
              mortgage.rate_per_turn,
            )
          : null,
      };
    });
  }, [
    incomingTradeOfferTiles,
    incomingTradeProposal,
    incomingTradeSnapshotTiles,
    tradeLoansById,
    tradeMortgagesById,
  ]);
  const tradeExecutionPerspective = useMemo(() => {
    if (!tradeExecutionSummary || !currentUserPlayer) {
      return null;
    }
    const isProposer =
      currentUserPlayer.id === tradeExecutionSummary.proposerPlayerId;
    const giveTiles = isProposer
      ? tradeExecutionSummary.offerTiles
      : tradeExecutionSummary.requestTiles;
    const receiveTiles = isProposer
      ? tradeExecutionSummary.requestTiles
      : tradeExecutionSummary.offerTiles;
    const giveCash = isProposer
      ? tradeExecutionSummary.offerCash
      : tradeExecutionSummary.requestCash;
    const receiveCash = isProposer
      ? tradeExecutionSummary.requestCash
      : tradeExecutionSummary.offerCash;
    const counterpartyName = isProposer
      ? getPlayerNameById(tradeExecutionSummary.counterpartyPlayerId)
      : getPlayerNameById(tradeExecutionSummary.proposerPlayerId);
    return {
      giveTiles,
      receiveTiles,
      giveCash,
      receiveCash,
      counterpartyName,
      snapshotTiles: tradeExecutionSummary.snapshotTiles,
    };
  }, [currentUserPlayer, getPlayerNameById, tradeExecutionSummary]);
  const updateExpandedBoardScale = useCallback(() => {
    const container = expandedBoardContainerRef.current;
    const board = expandedBoardRef.current;
    if (!container || !board) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const boardWidth = board.offsetWidth;
    const boardHeight = board.offsetHeight;
    if (
      containerRect.width === 0 ||
      containerRect.height === 0 ||
      boardWidth === 0 ||
      boardHeight === 0
    ) {
      return;
    }
    const rawScale = Math.min(
      containerRect.width / boardWidth,
      containerRect.height / boardHeight,
    );
    const paddedScale = rawScale * 0.95;
    const nextScale = Math.min(2, Math.max(0.4, paddedScale));
    setExpandedBoardScale(nextScale);
  }, []);

  useEffect(() => {
    if (isEventLogSuppressed && isActivityPanelOpen) {
      setIsActivityPanelOpen(false);
    }
  }, [isActivityPanelOpen, isEventLogSuppressed]);
  useEffect(() => {
    if (isDecisionOverlayActive && isBoardExpanded) {
      setIsBoardExpanded(false);
    }
  }, [isBoardExpanded, isDecisionOverlayActive]);
  useEffect(() => {
    if (!isBoardExpanded) {
      setSelectedTileIndex(null);
    }
  }, [isBoardExpanded]);
  useEffect(() => {
    if (!isBoardExpanded) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (selectedTileIndex !== null) {
          setSelectedTileIndex(null);
          return;
        }
        setIsBoardExpanded(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isBoardExpanded, selectedTileIndex]);
  useEffect(() => {
    if (!isBoardExpanded) {
      return undefined;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isBoardExpanded]);
  useEffect(() => {
    if (!isBoardExpanded) {
      return undefined;
    }
    const container = expandedBoardContainerRef.current;
    const board = expandedBoardRef.current;
    if (!container || !board) {
      return undefined;
    }
    updateExpandedBoardScale();
    const observer = new ResizeObserver(() => {
      updateExpandedBoardScale();
    });
    observer.observe(container);
    observer.observe(board);
    return () => {
      observer.disconnect();
    };
  }, [isBoardExpanded, updateExpandedBoardScale]);
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
    void loadPurchaseMortgages(
      gameId,
      session.access_token,
      currentUserPlayer?.id,
    );
  }, [
    currentUserPlayer?.id,
    gameId,
    loadLoans,
    loadPurchaseMortgages,
    session?.access_token,
  ]);

  useEffect(() => {
    setTradeRequestTiles([]);
  }, [tradeCounterpartyId]);

  useEffect(() => {
    if (!incomingTradeProposal) {
      setIsIncomingTradeOpen(false);
    }
  }, [incomingTradeProposal]);

  useEffect(() => {
    if (!gameId || !session?.access_token) {
      return;
    }
    const pendingTrades = tradeProposals.filter(
      (proposal) => proposal.status === "PENDING",
    );
    const loanIds = new Set<string>();
    const mortgageIds = new Set<string>();
    for (const proposal of pendingTrades) {
      const snapshotTiles = normalizeTradeSnapshot(proposal.snapshot);
      for (const tile of snapshotTiles) {
        if (tile.collateral_loan_id) {
          loanIds.add(tile.collateral_loan_id);
        }
        if (tile.purchase_mortgage_id) {
          mortgageIds.add(tile.purchase_mortgage_id);
        }
      }
    }
    void loadTradeLiabilities(
      gameId,
      session.access_token,
      Array.from(loanIds),
      Array.from(mortgageIds),
    );
  }, [
    gameId,
    loadTradeLiabilities,
    session?.access_token,
    tradeProposals,
  ]);

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
    if (!initialSnapshotReady || lastTradeEventIdRef.current) {
      return;
    }
    const tradeEvent = events.find(
      (event) => event.event_type === "TRADE_ACCEPTED",
    );
    if (tradeEvent) {
      lastTradeEventIdRef.current = tradeEvent.id;
    }
  }, [events, initialSnapshotReady]);

  useEffect(() => {
    if (!currentUserPlayer) {
      return;
    }
    const tradeEvent = events.find(
      (event) => event.event_type === "TRADE_ACCEPTED",
    );
    if (!tradeEvent || tradeEvent.id === lastTradeEventIdRef.current) {
      return;
    }
    const payload =
      tradeEvent.payload && typeof tradeEvent.payload === "object"
        ? tradeEvent.payload
        : null;
    const tradeId =
      payload && typeof payload.trade_id === "string" ? payload.trade_id : null;
    if (!tradeId) {
      return;
    }
    const proposerId =
      payload && typeof payload.proposer_player_id === "string"
        ? payload.proposer_player_id
        : null;
    const counterpartyId =
      payload && typeof payload.counterparty_player_id === "string"
        ? payload.counterparty_player_id
        : null;
    if (
      currentUserPlayer.id !== proposerId &&
      currentUserPlayer.id !== counterpartyId
    ) {
      return;
    }
    const proposal = tradeProposals.find((trade) => trade.id === tradeId);
    const offerCash =
      proposal?.offer_cash ??
      (payload && typeof payload.offer_cash === "number" ? payload.offer_cash : 0);
    const requestCash =
      proposal?.request_cash ??
      (payload && typeof payload.request_cash === "number"
        ? payload.request_cash
        : 0);
    const offerTiles =
      proposal?.offer_tile_indices ??
      (Array.isArray(payload?.offer_tile_indices)
        ? payload?.offer_tile_indices.filter((entry): entry is number =>
            typeof entry === "number",
          )
        : []);
    const requestTiles =
      proposal?.request_tile_indices ??
      (Array.isArray(payload?.request_tile_indices)
        ? payload?.request_tile_indices.filter((entry): entry is number =>
            typeof entry === "number",
          )
        : []);
    const snapshotTiles = proposal
      ? normalizeTradeSnapshot(proposal.snapshot)
      : [];
    setTradeExecutionSummary({
      tradeId,
      proposerPlayerId: proposerId ?? proposal?.proposer_player_id ?? "",
      counterpartyPlayerId:
        counterpartyId ?? proposal?.counterparty_player_id ?? "",
      offerCash,
      offerTiles,
      requestCash,
      requestTiles,
      snapshotTiles,
    });
    lastTradeEventIdRef.current = tradeEvent.id;
  }, [currentUserPlayer, events, tradeProposals]);

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
            | "CONFIRM_PENDING_CARD"
            | "CONFIRM_MACRO_EVENT";
        }
        | {
          action: "DECLINE_PROPERTY" | "BUY_PROPERTY";
          tileIndex: number;
          financing?: "MORTGAGE";
        }
        | { action: "AUCTION_BID"; amount: number }
        | { action: "AUCTION_PASS" }
        | { action: "TAKE_COLLATERAL_LOAN"; tileIndex: number }
        | { action: "BUILD_HOUSE" | "SELL_HOUSE"; tileIndex: number }
        | { action: "PAYOFF_COLLATERAL_LOAN"; loanId: string }
        | { action: "PAYOFF_PURCHASE_MORTGAGE"; mortgageId: string }
        | {
            action: "PROPOSE_TRADE";
            counterpartyPlayerId: string;
            offerCash?: number;
            offerTiles?: number[];
            requestCash?: number;
            requestTiles?: number[];
          }
        | { action: "ACCEPT_TRADE" | "REJECT_TRADE" | "CANCEL_TRADE"; tradeId: string },
    ) => {
      const { action } = request;
      const tileIndex = "tileIndex" in request ? request.tileIndex : undefined;
      const amount = "amount" in request ? request.amount : undefined;
      const loanId = "loanId" in request ? request.loanId : undefined;
      const mortgageId =
        "mortgageId" in request ? request.mortgageId : undefined;
      const financing =
        "financing" in request ? request.financing : undefined;
      const tradeId = "tradeId" in request ? request.tradeId : undefined;
      const counterpartyPlayerId =
        "counterpartyPlayerId" in request
          ? request.counterpartyPlayerId
          : undefined;
      const offerCash = "offerCash" in request ? request.offerCash : undefined;
      const offerTiles = "offerTiles" in request ? request.offerTiles : undefined;
      const requestCash =
        "requestCash" in request ? request.requestCash : undefined;
      const requestTiles =
        "requestTiles" in request ? request.requestTiles : undefined;
      if (!session || !gameId) {
        setNotice("Join a game lobby first.");
        return false;
      }

      if (!isInProgress) {
        setNotice("Waiting for the host to start the game.");
        return false;
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
              mortgageId,
              financing,
              tradeId,
              counterpartyPlayerId,
              offerCash,
              offerTiles,
              requestCash,
              requestTiles,
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
            return false;
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
            return false;
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
            const tileIndex = responseBody.ownership.tile_index;
            const existing = prev[tileIndex];
            return {
              ...prev,
              [tileIndex]: {
                owner_player_id: responseBody.ownership.owner_player_id,
                collateral_loan_id:
                  responseBody.ownership.collateral_loan_id ??
                  existing?.collateral_loan_id ??
                  null,
                purchase_mortgage_id:
                  responseBody.ownership.purchase_mortgage_id ??
                  existing?.purchase_mortgage_id ??
                  null,
                houses:
                  responseBody.ownership.houses ?? existing?.houses ?? 0,
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
          loadPurchaseMortgages(gameId, accessToken, currentUserPlayer?.id),
          loadTradeProposals(gameId, accessToken),
        ]);

        if (firstRoundResyncEnabled) {
          requestFirstRoundResync(accessToken);
        }
        return true;
      } catch (error) {
        if (error instanceof Error) {
          setNotice(error.message);
        } else {
          setNotice("Unable to perform action.");
        }
        return false;
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
      loadPurchaseMortgages,
      loadPlayers,
      loadTradeProposals,
      currentUserPlayer?.id,
      requestFirstRoundResync,
      session,
    ],
  );

  const openIncomingTradeModal = useCallback(() => {
    if (!incomingTradeProposal) {
      console.info("[Play] No incoming trades to review.");
      setNotice("No incoming trades yet.");
      return;
    }
    setIsIncomingTradeOpen(true);
  }, [incomingTradeProposal]);

  const openProposeTradeModal = useCallback(() => {
    if (!currentUserPlayer) {
      setNotice("Join a game lobby first.");
      return;
    }
    const availableCounterparties = players.filter(
      (player) => player.id !== currentUserPlayer.id && !player.is_eliminated,
    );
    if (availableCounterparties.length === 0) {
      setNotice("No other players are available to trade.");
      return;
    }
    if (ownedProperties.length === 0 && myPlayerBalance <= 0) {
      setNotice("You don't have any assets to offer yet.");
    }
    const defaultCounterparty = availableCounterparties[0]?.id ?? "";
    setTradeCounterpartyId(defaultCounterparty);
    setTradeOfferCash(0);
    setTradeOfferTiles([]);
    setTradeRequestCash(0);
    setTradeRequestTiles([]);
    setIsProposeTradeOpen(true);
  }, [currentUserPlayer, myPlayerBalance, ownedProperties.length, players]);

  const handleSubmitTradeProposal = useCallback(async () => {
    if (!tradeCounterpartyId) {
      setNotice("Select a player to trade with.");
      return;
    }
    // Trade contract: offer_* is what the proposer gives; request_* is what they receive.
    const offerCash = tradeOfferCash;
    const requestCash = tradeRequestCash;
    const hasTradeValue =
      offerCash > 0 ||
      tradeOfferTiles.length > 0 ||
      requestCash > 0 ||
      tradeRequestTiles.length > 0;
    if (!hasTradeValue) {
      setNotice("Add cash or properties to the trade.");
      return;
    }
    const success = await handleBankAction({
      action: "PROPOSE_TRADE",
      counterpartyPlayerId: tradeCounterpartyId,
      offerCash: offerCash > 0 ? offerCash : undefined,
      offerTiles: tradeOfferTiles.length > 0 ? tradeOfferTiles : undefined,
      requestCash: requestCash > 0 ? requestCash : undefined,
      requestTiles: tradeRequestTiles.length > 0 ? tradeRequestTiles : undefined,
    });
    if (success) {
      setNotice("Trade sent.");
      setIsProposeTradeOpen(false);
    }
  }, [
    handleBankAction,
    tradeCounterpartyId,
    tradeOfferCash,
    tradeOfferTiles,
    tradeRequestCash,
    tradeRequestTiles,
  ]);

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

  const handleBuyPropertyWithMortgage = useCallback(() => {
    if (!pendingPurchase) {
      return;
    }

    void handleBankAction({
      action: "BUY_PROPERTY",
      tileIndex: pendingPurchase.tile_index,
      financing: "MORTGAGE",
    });
  }, [handleBankAction, pendingPurchase]);

  const handleAcceptTrade = useCallback(
    (tradeId: string) => {
      void handleBankAction({ action: "ACCEPT_TRADE", tradeId });
    },
    [handleBankAction],
  );

  const handleRejectTrade = useCallback(
    (tradeId: string) => {
      void handleBankAction({ action: "REJECT_TRADE", tradeId });
    },
    [handleBankAction],
  );

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

  const handleConfirmMacroEvent = useCallback(() => {
    if (!canConfirmMacroEvent) {
      return;
    }
    setIsMacroResolving(true);
    window.setTimeout(() => {
      setIsMacroResolving(false);
    }, UI_RESOLVE_DELAY_MS);
    void handleBankAction({ action: "CONFIRM_MACRO_EVENT" });
  }, [UI_RESOLVE_DELAY_MS, canConfirmMacroEvent, handleBankAction]);

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

      <section className="rounded-2xl border bg-white p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              View mode
            </p>
            <p className="text-sm text-neutral-600">
              Wallet controls with a live mini-board projection.
            </p>
            <p className="text-xs text-neutral-400">
              Board pack: {boardPack?.displayName ?? "Unknown"}
            </p>
          </div>
          <button
            className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-800 disabled:cursor-not-allowed disabled:border-neutral-100 disabled:text-neutral-300"
            type="button"
            onClick={() => setIsBoardExpanded(true)}
            disabled={isDecisionOverlayActive}
            title={
              isDecisionOverlayActive
                ? "Resolve the current decision to open the full board."
                : "Open the full board view"
            }
          >
            Expand board
          </button>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[320px]">
            <BoardMiniMap
              tiles={boardPack?.tiles}
              players={players}
              currentPlayerId={currentPlayer?.id}
              ownershipByTile={ownershipByTile}
              showOwnership
              size="compact"
            />
          </div>
        </div>
        {players.length > 0 ? (
          <p className="text-xs text-neutral-500">
            Turn order:{" "}
            {players.map((player, index) => (
              <span
                key={player.id}
                className={
                  player.id === currentPlayer?.id
                    ? "font-semibold text-neutral-900"
                    : "text-neutral-500"
                }
              >
                {player.display_name ?? "Player"}
                {index < players.length - 1 ? " · " : ""}
              </span>
            ))}
          </p>
        ) : null}
      </section>

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
            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white text-sm text-neutral-900 shadow-sm">
              <div
                className="h-4 w-full"
                style={{ backgroundColor: pendingBandColor }}
              />
              <div className="px-4 pb-4 pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Pending decision
                </p>
                <p className="mt-1 text-lg font-black uppercase tracking-wide text-neutral-900">
                  {pendingTileLabel}
                </p>
                <p className="text-xs font-medium text-neutral-500">
                  Price ${pendingPurchase.price}
                </p>
                <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                    Rent
                  </p>
                  <div className="mt-2 space-y-1 text-xs">
                    {pendingRentRows.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between text-neutral-600"
                      >
                        <span>{row.label}</span>
                        <span className="font-semibold text-neutral-900">
                          {row.value !== null ? `$${row.value}` : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 border-t border-neutral-200 pt-2 text-xs font-medium text-neutral-700">
                    House cost:{" "}
                    {pendingTile?.houseCost
                      ? `$${pendingTile.houseCost} each`
                      : "—"}
                  </div>
                </div>
                <div className="mt-4 border-t border-neutral-200 pt-3">
                  <div className="grid gap-2">
                    <button
                      className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
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
                      className="rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-400"
                      type="button"
                      onClick={handleBuyPropertyWithMortgage}
                      disabled={
                        actionLoading === "BUY_PROPERTY" || !canAffordPendingMortgage
                      }
                      title={
                        canAffordPendingMortgage
                          ? "Buy with a 50% down payment"
                          : "Not enough cash for down payment"
                      }
                    >
                      {actionLoading === "BUY_PROPERTY"
                        ? "Buying…"
                        : `Buy with Mortgage ($${pendingMortgageDownPayment} down)`}
                    </button>
                    <button
                      className="rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-400"
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
                  {buyDisabledReason ? (
                    <p className="mt-2 text-xs text-neutral-400">
                      {buyDisabledReason}
                    </p>
                  ) : null}
                  {!buyDisabledReason && mortgageBuyDisabledReason ? (
                    <p className="mt-2 text-xs text-neutral-400">
                      {mortgageBuyDisabledReason}
                    </p>
                  ) : null}
                  {!canAffordPendingPurchase ? (
                    <p className="mt-2 text-[11px] text-neutral-500">
                      You need ${pendingPurchase.price - myPlayerBalance} more to
                      buy this property.
                    </p>
                  ) : null}
                </div>
              </div>
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
        {pendingMacroEvent || isMacroResolving ? (
          <>
            <div className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
            <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
              <div className="w-full max-w-md rounded-3xl border border-sky-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-500">
                  Macroeconomic Shift
                </p>
                <p className="text-lg font-semibold text-neutral-900">
                  {pendingMacroEvent?.name ?? "Macroeconomic Shift"}
                </p>
                {pendingMacroDescription ? (
                  <p className="mt-1 text-sm text-neutral-600">
                    {pendingMacroDescription}
                  </p>
                ) : null}
                {pendingMacroEffects.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-sm text-neutral-700">
                    {pendingMacroEffects.map((effect) => (
                      <li key={effect} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-sky-400" />
                        <span>{effect}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {canConfirmMacroEvent && !isMacroResolving ? (
                  <div className="mt-4 space-y-1">
                    <button
                      className="w-full rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-sky-200"
                      type="button"
                      onClick={handleConfirmMacroEvent}
                      disabled={
                        actionLoading === "CONFIRM_MACRO_EVENT" || isMacroResolving
                      }
                    >
                      {actionLoading === "CONFIRM_MACRO_EVENT"
                        ? "Confirming…"
                        : isMacroResolving
                          ? "Resolving…"
                          : "Acknowledge"}
                    </button>
                    {confirmMacroDisabledReason ? (
                      <p className="text-xs text-neutral-400">
                        {confirmMacroDisabledReason}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-neutral-500">
                    {isMacroResolving
                      ? "Resolving…"
                      : `Waiting for ${
                          currentPlayer?.display_name ?? "the current player"
                        } to acknowledge…`}
                  </p>
                )}
              </div>
            </div>
          </>
        ) : null}
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
        {isProposeTradeOpen ? (
          <>
            <div className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
            <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
              <div className="w-full max-w-2xl rounded-3xl border border-indigo-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                      Propose trade
                    </p>
                    <p className="text-lg font-semibold text-neutral-900">
                      Craft a trade offer
                    </p>
                  </div>
                  <button
                    className="rounded-full border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-700"
                    type="button"
                    onClick={() => setIsProposeTradeOpen(false)}
                    aria-label="Close trade proposal"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Counterparty
                    </label>
                    <select
                      className="w-full rounded-2xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700"
                      value={tradeCounterpartyId}
                      onChange={(event) =>
                        setTradeCounterpartyId(event.target.value)
                      }
                    >
                      {availableTradeCounterparties.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.display_name ?? "Player"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Offer
                      </p>
                      <label className="text-xs text-neutral-500">
                        Cash
                        <input
                          className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700"
                          type="number"
                          min={0}
                          max={myPlayerBalance}
                          value={tradeOfferCash}
                          onChange={(event) =>
                            setTradeOfferCash(
                              Math.max(0, Number(event.target.value)),
                            )
                          }
                        />
                      </label>
                      <div className="space-y-1">
                        <p className="text-xs text-neutral-500">Properties</p>
                        {ownedProperties.length === 0 ? (
                          <p className="text-xs text-neutral-400">
                            No owned properties to offer.
                          </p>
                        ) : (
                          <div className="max-h-40 space-y-2 overflow-y-auto pr-2 text-sm text-neutral-700">
                            {ownedProperties.map(({ tile, houses }) => (
                              <label
                                key={`offer-${tile.index}`}
                                className="flex items-center gap-2"
                              >
                                <input
                                  type="checkbox"
                                  checked={tradeOfferTiles.includes(tile.index)}
                                  onChange={(event) => {
                                    setTradeOfferTiles((prev) =>
                                      event.target.checked
                                        ? [...prev, tile.index]
                                        : prev.filter(
                                            (entry) => entry !== tile.index,
                                          ),
                                    );
                                  }}
                                />
                                <span>
                                  {tile.name}
                                  {houses > 0
                                    ? ` · ${houses} ${
                                        houses === 1 ? "house" : "houses"
                                      }`
                                    : ""}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Request
                      </p>
                      <label className="text-xs text-neutral-500">
                        Cash
                        <input
                          className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700"
                          type="number"
                          min={0}
                          value={tradeRequestCash}
                          onChange={(event) =>
                            setTradeRequestCash(
                              Math.max(0, Number(event.target.value)),
                            )
                          }
                        />
                      </label>
                      <div className="space-y-1">
                        <p className="text-xs text-neutral-500">Properties</p>
                        {tradeCounterpartyId ? (
                          counterpartyOwnedProperties.length === 0 ? (
                            <p className="text-xs text-neutral-400">
                              No properties owned by the selected player.
                            </p>
                          ) : (
                            <div className="max-h-40 space-y-2 overflow-y-auto pr-2 text-sm text-neutral-700">
                              {counterpartyOwnedProperties.map(
                                ({ tile, houses }) => (
                                  <label
                                    key={`request-${tile.index}`}
                                    className="flex items-center gap-2"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={tradeRequestTiles.includes(
                                        tile.index,
                                      )}
                                      onChange={(event) => {
                                        setTradeRequestTiles((prev) =>
                                          event.target.checked
                                            ? [...prev, tile.index]
                                            : prev.filter(
                                                (entry) =>
                                                  entry !== tile.index,
                                              ),
                                        );
                                      }}
                                    />
                                    <span>
                                      {tile.name}
                                      {houses > 0
                                        ? ` · ${houses} ${
                                            houses === 1 ? "house" : "houses"
                                          }`
                                        : ""}
                                    </span>
                                  </label>
                                ),
                              )}
                            </div>
                          )
                        ) : (
                          <p className="text-xs text-neutral-400">
                            Select a player to see their properties.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-neutral-400">
                      Trades are sent to the bank for review before delivery.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded-2xl border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
                        type="button"
                        onClick={() => setIsProposeTradeOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        className="rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-indigo-200"
                        type="button"
                        onClick={handleSubmitTradeProposal}
                        disabled={
                          actionLoading === "PROPOSE_TRADE" ||
                          !canSubmitTradeProposal
                        }
                      >
                        {actionLoading === "PROPOSE_TRADE"
                          ? "Sending…"
                          : "Send trade"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
        {incomingTradeProposal && isIncomingTradeOpen ? (
          <>
            <div className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
            <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
              <div className="w-full max-w-lg rounded-3xl border border-indigo-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                      Incoming trade offer
                    </p>
                    <p className="text-lg font-semibold text-neutral-900">
                      {incomingTradeCounterpartyName} wants to trade
                    </p>
                  </div>
                  <button
                    className="rounded-full border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-700"
                    type="button"
                    onClick={() => setIsIncomingTradeOpen(false)}
                    aria-label="Close incoming trade"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                      You give
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                      {incomingTradeRequestCash > 0 ? (
                        <li>Cash: ${incomingTradeRequestCash}</li>
                      ) : null}
                      {incomingTradeRequestTiles.length > 0 ? (
                        incomingTradeRequestTiles.map((tileIndex) => {
                          const snapshot = incomingTradeSnapshotTiles.find(
                            (entry) => entry.tile_index === tileIndex,
                          );
                          const houses = snapshot?.houses ?? 0;
                          return (
                            <li key={`give-${tileIndex}`}>
                              {getTileNameByIndex(tileIndex)}
                              {houses > 0
                                ? ` · ${houses} ${houses === 1 ? "house" : "houses"}`
                                : ""}
                            </li>
                          );
                        })
                      ) : incomingTradeRequestCash === 0 ? (
                        <li className="text-neutral-400">No properties</li>
                      ) : null}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                      You receive
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                      {incomingTradeOfferCash > 0 ? (
                        <li>Cash: ${incomingTradeOfferCash}</li>
                      ) : null}
                      {incomingTradeOfferTiles.length > 0 ? (
                        incomingTradeOfferTiles.map((tileIndex) => {
                          const snapshot = incomingTradeSnapshotTiles.find(
                            (entry) => entry.tile_index === tileIndex,
                          );
                          const houses = snapshot?.houses ?? 0;
                          return (
                            <li key={`receive-${tileIndex}`}>
                              {getTileNameByIndex(tileIndex)}
                              {houses > 0
                                ? ` · ${houses} ${houses === 1 ? "house" : "houses"}`
                                : ""}
                            </li>
                          );
                        })
                      ) : incomingTradeOfferCash === 0 ? (
                        <li className="text-neutral-400">No properties</li>
                      ) : null}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                      Liabilities assumed
                    </p>
                    {incomingTradeLiabilities.some(
                      (entry) =>
                        entry.collateralPayment !== null ||
                        entry.mortgageInterest !== null,
                    ) ? (
                      <ul className="mt-2 space-y-2 text-sm text-neutral-700">
                        {incomingTradeLiabilities.map((entry) => {
                          const details = [];
                          if (entry.collateralPayment !== null) {
                            details.push(
                              `Collateral: $${entry.collateralPayment}/turn`,
                            );
                          }
                          if (entry.mortgageInterest !== null) {
                            details.push(
                              `Mortgage interest: $${entry.mortgageInterest}/turn`,
                            );
                          }
                          if (details.length === 0) {
                            return null;
                          }
                          return (
                            <li
                              key={`liability-${entry.tileIndex}`}
                              className="rounded-xl bg-white px-3 py-2"
                            >
                              <p className="text-xs font-semibold text-neutral-500">
                                {getTileNameByIndex(entry.tileIndex)}
                              </p>
                              <p className="text-sm text-neutral-800">
                                {details.join(" · ")}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-neutral-500">
                        No liabilities on incoming properties.
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    className="rounded-2xl border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:border-neutral-100 disabled:text-neutral-400"
                    type="button"
                    onClick={() => {
                      setIsIncomingTradeOpen(false);
                      handleRejectTrade(incomingTradeProposal.id);
                    }}
                    disabled={actionLoading === "REJECT_TRADE"}
                  >
                    {actionLoading === "REJECT_TRADE" ? "Rejecting…" : "Reject"}
                  </button>
                  <button
                    className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                    type="button"
                    onClick={() => {
                      setIsIncomingTradeOpen(false);
                      handleAcceptTrade(incomingTradeProposal.id);
                    }}
                    disabled={actionLoading === "ACCEPT_TRADE"}
                  >
                    {actionLoading === "ACCEPT_TRADE" ? "Accepting…" : "Accept"}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : null}
        {tradeExecutionSummary && tradeExecutionPerspective ? (
          <>
            <div className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
            <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
              <div className="w-full max-w-lg rounded-3xl border border-emerald-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500">
                  Trade executed
                </p>
                <p className="text-lg font-semibold text-neutral-900">
                  Trade completed with {tradeExecutionPerspective.counterpartyName}
                </p>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                      You gave
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                      {tradeExecutionPerspective.giveCash > 0 ? (
                        <li>Cash: ${tradeExecutionPerspective.giveCash}</li>
                      ) : null}
                      {tradeExecutionPerspective.giveTiles.length > 0 ? (
                        tradeExecutionPerspective.giveTiles.map((tileIndex) => {
                          const snapshot =
                            tradeExecutionPerspective.snapshotTiles.find(
                              (entry) => entry.tile_index === tileIndex,
                            );
                          const houses = snapshot?.houses ?? 0;
                          return (
                            <li key={`gave-${tileIndex}`}>
                              {getTileNameByIndex(tileIndex)}
                              {houses > 0
                                ? ` · ${houses} ${houses === 1 ? "house" : "houses"}`
                                : ""}
                            </li>
                          );
                        })
                      ) : tradeExecutionPerspective.giveCash === 0 ? (
                        <li className="text-neutral-400">Nothing</li>
                      ) : null}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                      You received
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                      {tradeExecutionPerspective.receiveCash > 0 ? (
                        <li>Cash: ${tradeExecutionPerspective.receiveCash}</li>
                      ) : null}
                      {tradeExecutionPerspective.receiveTiles.length > 0 ? (
                        tradeExecutionPerspective.receiveTiles.map((tileIndex) => {
                          const snapshot =
                            tradeExecutionPerspective.snapshotTiles.find(
                              (entry) => entry.tile_index === tileIndex,
                            );
                          const houses = snapshot?.houses ?? 0;
                          return (
                            <li key={`received-${tileIndex}`}>
                              {getTileNameByIndex(tileIndex)}
                              {houses > 0
                                ? ` · ${houses} ${houses === 1 ? "house" : "houses"}`
                                : ""}
                            </li>
                          );
                        })
                      ) : tradeExecutionPerspective.receiveCash === 0 ? (
                        <li className="text-neutral-400">Nothing</li>
                      ) : null}
                    </ul>
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    className="w-full rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                    type="button"
                    onClick={() => setTradeExecutionSummary(null)}
                  >
                    Close
                  </button>
                </div>
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
          {ownedProperties.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No owned properties available.
            </p>
          ) : (
            <div className="space-y-2">
              {ownedProperties.map(
                ({
                  tile,
                  houses,
                  isCollateralEligible,
                  canBuildHouse,
                  canSellHouse,
                }) => {
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
                        <span className="uppercase tracking-wide text-neutral-400">
                          Houses
                        </span>
                        <span className="font-semibold text-neutral-700">
                          {tile.type === "PROPERTY" ? houses : "—"}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {tile.type === "PROPERTY" ? (
                        <div className="flex items-center gap-2">
                          <button
                            className="rounded-full bg-neutral-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                            type="button"
                            onClick={() =>
                              void handleBankAction({
                                action: "BUILD_HOUSE",
                                tileIndex: tile.index,
                              })
                            }
                            disabled={
                              !canBuildHouse || actionLoading === "BUILD_HOUSE"
                            }
                          >
                            {actionLoading === "BUILD_HOUSE"
                              ? "Building…"
                              : "Build"}
                          </button>
                          <button
                            className="rounded-full border border-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
                            type="button"
                            onClick={() =>
                              void handleBankAction({
                                action: "SELL_HOUSE",
                                tileIndex: tile.index,
                              })
                            }
                            disabled={
                              !canSellHouse || actionLoading === "SELL_HOUSE"
                            }
                          >
                            {actionLoading === "SELL_HOUSE"
                              ? "Selling…"
                              : "Sell"}
                          </button>
                        </div>
                      ) : null}
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
                          !isCollateralEligible ||
                          actionLoading === "TAKE_COLLATERAL_LOAN"
                        }
                      >
                        {actionLoading === "TAKE_COLLATERAL_LOAN"
                          ? "Collateralizing…"
                          : "Collateralize"}
                      </button>
                    </div>
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
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Purchase mortgages
          </p>
          <p className="text-xs text-neutral-500">
            Interest is charged each turn; unpaid interest accumulates.
          </p>
          {activePurchaseMortgages.length === 0 ? (
            <p className="text-sm text-neutral-500">No purchase mortgages.</p>
          ) : (
            <div className="space-y-2">
              {activePurchaseMortgages.map((mortgage) => {
                const tile =
                  boardPack?.tiles?.find(
                    (entry) => entry.index === mortgage.tile_index,
                  ) ?? null;
                const tileName = tile?.name ?? `Tile ${mortgage.tile_index}`;
                const groupLabel = getTileGroupLabel(tile);
                const payoffAmount =
                  (mortgage.principal_remaining ?? 0) +
                  (mortgage.accrued_interest_unpaid ?? 0);
                const interestPerTurn = calculateMortgageInterestPerTurn(
                  mortgage.principal_remaining,
                  mortgage.rate_per_turn,
                );
                const lastCharged = latestMortgageInterestById.get(mortgage.id);
                const canPayoff =
                  canAct && payoffAmount > 0 && myPlayerBalance >= payoffAmount;
                return (
                  <div
                    key={mortgage.id}
                    className="flex items-center justify-between rounded-2xl border px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-neutral-900">
                        {tileName}
                      </p>
                      <p className="text-xs text-neutral-500">{groupLabel}</p>
                      <p className="text-xs text-neutral-500">
                        Principal remaining: ${mortgage.principal_remaining}
                      </p>
                      <p className="text-xs text-neutral-500">
                        Accrued interest: ${mortgage.accrued_interest_unpaid}
                      </p>
                      <p className="text-xs text-neutral-500">
                        Interest per turn: ${interestPerTurn}
                      </p>
                      <p className="text-xs text-neutral-500">
                        Payoff amount: ${payoffAmount}
                      </p>
                    </div>
                    <button
                      className="rounded-full border border-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
                      type="button"
                      onClick={() =>
                        void handleBankAction({
                          action: "PAYOFF_PURCHASE_MORTGAGE",
                          mortgageId: mortgage.id,
                        })
                      }
                      disabled={
                        !canPayoff ||
                        actionLoading === "PAYOFF_PURCHASE_MORTGAGE"
                      }
                      title={
                        canPayoff
                          ? "Pay off this mortgage"
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
            onClick={openProposeTradeModal}
          >
            Propose Trade
          </button>
          {incomingTradeProposal ? (
            <button
              className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white"
              type="button"
              onClick={openIncomingTradeModal}
            >
              Accept Trade
            </button>
          ) : (
            <div className="flex items-center rounded-2xl border border-dashed border-neutral-200 px-4 py-3 text-sm text-neutral-400">
              No incoming trades yet.
            </div>
          )}
        </div>
      </section>
      {isBoardExpanded ? (
        <div
          className="fixed inset-0 z-50 flex bg-black/60 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Board"
          onClick={() => setIsBoardExpanded(false)}
        >
          <div
            className="relative flex h-full w-full flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(event) => {
              event.stopPropagation();
              if (selectedTileIndex === null) {
                return;
              }
              const target = event.target as Node;
              if (expandedTileSheetRef.current?.contains(target)) {
                return;
              }
              setSelectedTileIndex(null);
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 sm:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Board
                </p>
                <p className="hidden text-xs text-neutral-400 [@media(orientation:portrait)]:block">
                  Rotate your phone for full board view.
                </p>
              </div>
              <button
                className="rounded-full border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-700"
                type="button"
                onClick={() => setIsBoardExpanded(false)}
                aria-label="Close board"
              >
                ✕
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col px-3 pb-6 pt-4 sm:px-5">
              <div
                ref={expandedBoardContainerRef}
                className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden"
              >
                <div
                  ref={expandedBoardRef}
                  className="flex items-center justify-center"
                  style={{
                    transform: `scale(${expandedBoardScale})`,
                    transformOrigin: "center",
                  }}
                >
                  <div className="w-full max-w-5xl">
                    <div className="aspect-[6/16] w-full">
                      <div className="grid h-full w-full grid-cols-[repeat(6,minmax(0,1fr))] grid-rows-[repeat(16,minmax(0,1fr))] gap-1 rounded-xl border border-neutral-200 bg-white p-1 text-neutral-700 sm:gap-1.5 sm:p-1.5">
                        {expandedBoardEdges.top.map((index, position) => (
                          <div
                            key={`top-${index}`}
                            className="col-span-1 row-span-1 flex"
                            style={{ gridColumn: position + 1, gridRow: 1 }}
                          >
                            {renderExpandedTile(index)}
                          </div>
                        ))}
                        {expandedBoardEdges.left.map((index, position) => (
                          <div
                            key={`left-${index}`}
                            className="col-span-1 row-span-1 flex"
                            style={{ gridColumn: 1, gridRow: position + 2 }}
                          >
                            {renderExpandedTile(index)}
                          </div>
                        ))}
                        {expandedBoardEdges.right.map((index, position) => (
                          <div
                            key={`right-${index}`}
                            className="col-span-1 row-span-1 flex"
                            style={{ gridColumn: 6, gridRow: position + 2 }}
                          >
                            {renderExpandedTile(index)}
                          </div>
                        ))}
                        {expandedBoardEdges.bottom.map((index, position) => (
                          <div
                            key={`bottom-${index}`}
                            className="col-span-1 row-span-1 flex"
                            style={{ gridColumn: position + 1, gridRow: 16 }}
                          >
                            {renderExpandedTile(index)}
                          </div>
                        ))}
                        <div className="col-start-2 row-start-2 col-span-4 row-span-14 flex items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400 sm:text-sm">
                          The Bank
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {selectedTileIndex !== null && selectedExpandedTile ? (
                <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4 sm:px-6 sm:pb-6">
                  <div
                    ref={expandedTileSheetRef}
                    className="w-full max-w-3xl rounded-3xl border border-neutral-200 bg-white p-4 shadow-2xl sm:p-6"
                    onClick={(event) => event.stopPropagation()}
                    role="dialog"
                    aria-label="Tile details"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                          Tile details · {selectedTileIndex}
                        </p>
                      </div>
                      <button
                        className="rounded-full border border-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-700"
                        type="button"
                        onClick={() => setSelectedTileIndex(null)}
                        aria-label="Close tile details"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="mt-4">
                      <p className="text-lg font-semibold text-neutral-900 sm:text-xl">
                        {selectedExpandedTile.name?.trim() ||
                          selectedTileTypeLabel ||
                          "Tile"}
                      </p>
                    </div>
                    <div className="mt-4 space-y-3 text-sm text-neutral-600">
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-neutral-50 px-3 py-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                          Type
                        </span>
                        <span className="font-medium text-neutral-800">
                          {selectedTileTypeLabel ?? "Other"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-neutral-50 px-3 py-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                          Owner
                        </span>
                        <span className="font-medium text-neutral-800">
                          {selectedTileOwnerLabel ?? "Unowned"}
                        </span>
                      </div>
                      <div className="rounded-2xl bg-neutral-50 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            Players here
                          </span>
                          {currentUserPlayer &&
                          currentUserPlayer.position === selectedTileIndex ? (
                            <span className="text-xs font-semibold uppercase tracking-wide text-emerald-500">
                              You are here
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedTilePlayers.length > 0 ? (
                            selectedTilePlayers.map((player) => (
                              <div
                                key={player.id}
                                className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700"
                              >
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-[9px] font-semibold uppercase text-white">
                                  {getPlayerInitials(player.display_name)}
                                </span>
                                <span>
                                  {player.display_name ||
                                    getPlayerInitials(player.display_name)}
                                </span>
                              </div>
                            ))
                          ) : (
                            <span className="text-xs text-neutral-400">
                              None
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
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
                    {displayEvents.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-neutral-200 p-4 text-center text-neutral-500">
                        Events will appear once the game starts.
                      </div>
                    ) : (
                      displayEvents.map((event) => (
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
                    {displayTransactions.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-neutral-200 p-4 text-center text-neutral-500">
                        No transactions yet.
                      </div>
                    ) : (
                      displayTransactions.map((transaction) => (
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
    </PageShell>
  );
}
