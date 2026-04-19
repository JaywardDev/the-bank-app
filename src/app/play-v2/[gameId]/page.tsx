"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import Image from "next/image";
import { supabaseClient, type SupabaseSession } from "@/lib/supabase/client";
import PlayV2Shell from "@/components/play-v2/PlayV2Shell";
import BoardViewport from "@/components/play-v2/BoardViewport";
import GoToJailModalV2 from "@/components/play-v2/GoToJailModalV2";
import PendingCardModalV2 from "@/components/play-v2/PendingCardModalV2";
import PendingMacroModalV2 from "@/components/play-v2/PendingMacroModalV2";
import SuperTaxModalV2 from "@/components/play-v2/SuperTaxModalV2";
import IncomeTaxModalV2 from "@/components/play-v2/IncomeTaxModalV2";
import PendingPurchaseModalV2 from "@/components/play-v2/PendingPurchaseModalV2";
import AuctionOverlayV2 from "@/components/play-v2/AuctionOverlayV2";
import JailDecisionModalV2 from "@/components/play-v2/JailDecisionModalV2";
import ConfirmActionModalV2 from "@/components/play-v2/ConfirmActionModalV2";
import RotateToLandscapeOverlay from "@/components/play-v2/RotateToLandscapeOverlay";
import ActivityPopupV2 from "@/components/play-v2/ActivityPopupV2";
import EndedGameResultsPanel from "@/components/play-v2/EndedGameResultsPanel";
import TileInfoPanelV2 from "@/components/play-v2/TileInfoPanelV2";
import BettingMarketPanelV2 from "@/components/play-v2/BettingMarketPanelV2";
import { TitleDeedPreview } from "@/app/components/TitleDeedPreview";
import {
  getBuildUpgradeConfirmationCopy,
  getDevelopmentLevelLabel,
  getDevelopmentUpgradePresentation,
} from "@/components/play-v2/utils/developmentLabels";
import { DEFAULT_BOARD_PACK_ECONOMY, getBoardPackById } from "@/lib/boardPacks";
import { resolveBoardTilesForRules } from "@/lib/resolvedBoardTiles";
import { getTileBandColor } from "@/lib/boardTileStyles";
import { postGameActionRequest } from "@/lib/client/postGameActionRequest";
import {
  computeTaxableAssetValueForLuxuryTax,
} from "@/lib/assetValue";
import { computeAuthoritativeNetWorthBreakdown } from "@/lib/netWorth";
import { getRules } from "@/lib/rules";
import {
  getCurrentTileRent,
  getPropertyRentWithDevelopment,
  ownsFullColorSet,
} from "@/lib/rent";
import { formatCurrency, getCurrencyMetaFromBoardPack } from "@/lib/currency";
import {
  canExploreInlandCell,
  getInlandBankSalePrice,
  getInlandDevelopmentCost,
  getInlandExplorationCost,
  getInlandPassiveIncomePerTurn,
  getInlandResourceConfig,
  getInlandSellValue,
  isBankSellableInlandCell,
  isDevelopableResource,
  isInstantSellResource,
  isNoneResource,
  normalizeInlandCellRecords,
  toInlandCellKey,
  type InlandCell,
} from "@/lib/inlandExploration";
import { getInlandResourceIconSrc } from "@/lib/inlandResourceIcons";
import {
  calculateAmortizedPaymentPerTurn,
  calculateDownPaymentAmount,
  calculateMortgagePrincipalFromDownPayment,
  defaultPurchaseDownPaymentPercentFromMortgageLtv,
  PURCHASE_DOWN_PAYMENT_PERCENTS,
  type PurchaseDownPaymentPercent,
} from "@/lib/loanMath";
import {
  normalizeBettingMarketState,
  type BettingMarketBetKind,
  type BettingMarketBetSelection,
} from "@/lib/bettingMarket";
import {
  hasTradeValue,
  normalizeTradeSnapshot,
  toOptionalPositiveCash,
  toOptionalTileIndices,
} from "@/features/trade/utils";
import type { TradeProposal } from "@/features/trade/types";

type GameMeta = {
  id: string;
  board_pack_id: string | null;
  game_mode: "classic" | "round_mode" | null;
  round_limit: number | null;
  status: string;
  created_by: string | null;
};

type LoadGameMetaResult =
  | { status: "success"; gameMeta: GameMeta }
  | { status: "missing" }
  | { status: "stale" };

type Player = {
  id: string;
  user_id: string;
  display_name: string;
  created_at: string;
  position: number | null;
  is_in_jail: boolean;
  jail_turns_remaining: number;
  get_out_of_jail_free_count: number;
  tax_exemption_pass_count: number;
  free_build_tokens: number;
  free_upgrade_tokens: number;
  is_eliminated: boolean;
  eliminated_at: string | null;
};

type ActiveMacroEffectV1 = {
  id?: string;
  name?: string;
  rarity?: string | null;
  effects?: {
    house_build_blocked?: boolean;
    loan_mortgage_new_blocked?: boolean;
    [key: string]: unknown;
  };
  roundsRemaining?: number;
  roundsApplied?: number;
  tooltip?: string;
};

type GameState = {
  game_id: string;
  version: number;
  current_player_id: string | null;
  balances: Record<string, number> | null;
  last_roll: number | null;
  doubles_count: number | null;
  rounds_elapsed: number | null;
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
  betting_market_state: Record<string, unknown> | null;
  inland_explored_cells: unknown[] | null;
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
  base_price?: number;
  property_purchase_discount_pct?: number;
  property_purchase_discount_macro_name?: string | null;
};

type InsolvencyRecoveryAction = {
  type: "INSOLVENCY_RECOVERY";
  player_id: string | null;
  reason: string | null;
  amount_due: number;
  cash_available: number;
  shortfall: number;
  owed_to_player_id: string | null;
  tile_index: number | null;
  tile_id: string | null;
  label: string | null;
};

type SuperTaxPendingAction = {
  type: "SUPER_TAX_CONFIRM";
  player_id: string | null;
  tile_id: string;
  tile_index: number;
  tile_name: string;
  boardpack_id: string | null;
  current_cash: number;
  asset_value: number;
  total_liabilities: number;
  net_worth_for_tax: number;
  tax_rate: number;
  tax_amount: number;
  uses_custom_formula: boolean;
  currency_code: string;
  currency_symbol: string;
  tax_exemption_pass_count: number;
};

type IncomeTaxPendingAction = {
  type: "INCOME_TAX_CONFIRM";
  player_id: string | null;
  tile_id: string;
  tile_index: number;
  tile_name: string;
  boardpack_id: string | null;
  current_cash: number;
  baseline_cash: number;
  taxable_gain: number;
  tax_rate: number;
  tax_amount: number;
  currency_code: string;
  currency_symbol: string;
  tax_exemption_pass_count: number;
};

type ActiveDecisionType =
  | "GO_TO_JAIL"
  | "JAIL_DECISION"
  | "PENDING_CARD"
  | "MACRO_EVENT"
  | "BUY_PROPERTY"
  | "INSOLVENCY_RECOVERY"
  | "INCOME_TAX_CONFIRM"
  | "SUPER_TAX_CONFIRM";

type BankAction =
  | "ROLL_DICE"
  | "END_TURN"
  | "CONFIRM_GO_TO_JAIL"
  | "JAIL_PAY_FINE"
  | "JAIL_ROLL_FOR_DOUBLES"
  | "USE_GET_OUT_OF_JAIL_FREE"
  | "CONFIRM_PENDING_CARD"
  | "CONFIRM_MACRO_EVENT"
  | "CONFIRM_INCOME_TAX"
  | "CONFIRM_SUPER_TAX"
  | "USE_TAX_EXEMPTION_PASS"
  | "CONFIRM_INSOLVENCY_PAYMENT"
  | "DECLARE_BANKRUPTCY"
  | "SURRENDER_GAME"
  | "BUY_PROPERTY"
  | "DECLINE_PROPERTY"
  | "AUCTION_BID"
  | "AUCTION_PASS"
  | "BUILD_HOUSE"
  | "SELL_HOUSE"
  | "SELL_HOTEL"
  | "SELL_TO_MARKET"
  | "TAKE_COLLATERAL_LOAN"
  | "PAYOFF_COLLATERAL_LOAN"
  | "DEFAULT_PROPERTY"
  | "PAYOFF_PURCHASE_MORTGAGE"
  | "PLACE_BETTING_MARKET_BET"
  | "CANCEL_BETTING_MARKET_BET"
  | "EXPLORE_INTERIOR"
  | "SELL_INTERIOR_RESOURCE"
  | "DEVELOP_INTERIOR_SITE"
  | "DEFER_INTERIOR_RESOURCE_DECISION"
  | "BUY_BANK_OWNED_INTERIOR_SITE"
  | "PROPOSE_TRADE"
  | "ACCEPT_TRADE"
  | "REJECT_TRADE"
  | "CANCEL_TRADE";

type BankActionRequest = {
  action: BankAction;
  tileIndex?: number;
  amount?: number;
  financing?: "MORTGAGE";
  downPaymentPercent?: PurchaseDownPaymentPercent;
  loanId?: string;
  mortgageId?: string;
  tradeId?: string;
  counterpartyPlayerId?: string;
  offerCash?: number;
  offerFreeBuildTokens?: number;
  offerFreeUpgradeTokens?: number;
  offerTiles?: number[];
  requestCash?: number;
  requestFreeBuildTokens?: number;
  requestFreeUpgradeTokens?: number;
  requestTiles?: number[];
  kind?: BettingMarketBetKind;
  selection?: BettingMarketBetSelection;
  stake?: number;
  betId?: string;
  interiorCell?: InlandCell;
  useConstructionVoucher?: "BUILD" | "UPGRADE";
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

type BuildUpgradeConfirmationState = {
  tileIndex: number;
  tileName: string;
  targetLevel: number;
  targetLabel: string;
  targetNarrative: string;
  targetSpriteSrc: string | null;
  useConstructionVoucher?: "BUILD" | "UPGRADE";
  question: string;
  paymentSummary: string;
};

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
  turns_remaining: number;
  payment_per_turn: number;
  turns_elapsed: number;
  accrued_interest_unpaid: number;
  status: string;
};

type FinalStanding = {
  playerId: string;
  playerName: string;
  rank: number;
  cash: number;
  netWorth: number;
  isWinner: boolean;
  isEliminated: boolean;
  ownedCount: number;
  liabilityCount: number;
};

const SESSION_EXPIRED_MESSAGE = "Session expired — please sign in again";
const MIN_LOADING_SCREEN_MS = 4000;
const lastGameKey = "bank.lastGameId";
const RESUME_REFRESH_DEBOUNCE_MS = 400;
const REALTIME_SLICE_COALESCE_MS = 80;
const sliceNames = [
  "gameMeta",
  "players",
  "gameState",
  "events",
  "ownership",
  "tradeProposals",
  "loans",
  "purchaseMortgages",
] as const;
type SliceName = (typeof sliceNames)[number];
type SliceRequestEpochs = Record<SliceName, number>;

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
  const [playersLoaded, setPlayersLoaded] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [ownershipByTile, setOwnershipByTile] = useState<OwnershipByTile>({});
  const [tradeProposals, setTradeProposals] = useState<TradeProposal[]>([]);
  const [tradeCounterpartyId, setTradeCounterpartyId] = useState<string>("");
  const [tradeOfferCash, setTradeOfferCash] = useState<number>(0);
  const [tradeOfferFreeBuildTokens, setTradeOfferFreeBuildTokens] =
    useState<number>(0);
  const [tradeOfferFreeUpgradeTokens, setTradeOfferFreeUpgradeTokens] =
    useState<number>(0);
  const [tradeOfferTiles, setTradeOfferTiles] = useState<number[]>([]);
  const [tradeRequestCash, setTradeRequestCash] = useState<number>(0);
  const [tradeRequestFreeBuildTokens, setTradeRequestFreeBuildTokens] =
    useState<number>(0);
  const [tradeRequestFreeUpgradeTokens, setTradeRequestFreeUpgradeTokens] =
    useState<number>(0);
  const [tradeRequestTiles, setTradeRequestTiles] = useState<number[]>([]);
  const [playerLoans, setPlayerLoans] = useState<PlayerLoan[]>([]);
  const [purchaseMortgages, setPurchaseMortgages] = useState<
    PurchaseMortgage[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedMortgageDownPaymentPercent, setSelectedMortgageDownPaymentPercent] =
    useState<PurchaseDownPaymentPercent>(50);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [gameMetaError, setGameMetaError] = useState<string | null>(null);
  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(
    null,
  );
  const [selectedInteriorCell, setSelectedInteriorCell] = useState<InlandCell | null>(null);
  const [openInlandDecisionCellKey, setOpenInlandDecisionCellKey] = useState<string | null>(null);
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState(false);
  const [leftDrawerMode, setLeftDrawerMode] = useState<
    "info" | "wallet" | "market"
  >("info");
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState(false);
  const [rightDrawerMode, setRightDrawerMode] = useState<
    "decision" | "trade" | "macro"
  >("decision");
  const [sellToMarketTileIndex, setSellToMarketTileIndex] = useState<
    number | null
  >(null);
  const [payoffLoanId, setPayoffLoanId] = useState<string | null>(null);
  const [defaultLoanTileIndex, setDefaultLoanTileIndex] = useState<
    number | null
  >(null);
  const [payoffMortgageId, setPayoffMortgageId] = useState<string | null>(null);
  const [auctionNow, setAuctionNow] = useState<Date>(() => new Date());
  const [loadingStartedAt, setLoadingStartedAt] = useState<number | null>(null);
  const [loadingElapsedMs, setLoadingElapsedMs] = useState(0);
  const [loadingMinElapsed, setLoadingMinElapsed] = useState(false);
  const [gameOverOverlayDismissed, setGameOverOverlayDismissed] =
    useState(false);
  const [ownedActionReason, setOwnedActionReason] = useState<{
    tileIndex: number;
    actionKey:
      | "BUILD_HOUSE"
      | "SELL_HOUSE"
      | "SELL_TO_MARKET"
      | "TAKE_COLLATERAL_LOAN";
    reason: string;
  } | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);
  const [buildUpgradeConfirmation, setBuildUpgradeConfirmation] =
    useState<BuildUpgradeConfirmationState | null>(null);
  const [showMenuOverlay, setShowMenuOverlay] = useState(false);
  const [showTileTitleCardModal, setShowTileTitleCardModal] = useState(false);
  const [showActivityPopup, setShowActivityPopup] = useState(false);
  const [bettingInlineError, setBettingInlineError] = useState<string | null>(
    null,
  );
  const [bettingSuccessMessage, setBettingSuccessMessage] = useState<
    string | null
  >(null);
  const [cancelingBetId, setCancelingBetId] = useState<string | null>(null);

  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const resumeRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const resumeRefreshInFlightRef = useRef(false);
  const resumeRefreshQueuedRef = useRef(false);
  const isRunningQueuedResumeRefreshRef = useRef(false);
  const isMountedRef = useRef(true);
  const latestRouteGameIdRef = useRef<string | null>(routeGameId ?? null);
  const latestAccessTokenRef = useRef<string | null>(session?.access_token ?? null);
  const latestLoadAllSlicesRef = useRef<typeof loadAllSlices | null>(null);
  const latestCurrentUserPlayerIdRef = useRef<string | null>(null);
  const sliceRequestEpochsRef = useRef<SliceRequestEpochs>({
    gameMeta: 0,
    players: 0,
    gameState: 0,
    events: 0,
    ownership: 0,
    tradeProposals: 0,
    loans: 0,
    purchaseMortgages: 0,
  });
  const realtimeDirtySlicesRef = useRef<Set<SliceName>>(new Set());
  const realtimeSliceFlushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const ownedReasonTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const recenterBoardRef = useRef<(() => void) | null>(null);
  const latestGameStateVersionRef = useRef<number | null>(null);
  const auctionAutoPassSubmittedForKeyRef = useRef<string | null>(null);

  const clearLastOpenedIfMatches = useCallback(
    (targetGameId: string | null) => {
      if (!targetGameId || typeof window === "undefined") {
        return;
      }

      if (window.localStorage.getItem(lastGameKey) === targetGameId) {
        window.localStorage.removeItem(lastGameKey);
      }
    },
    [],
  );

  const clearPlayV2State = useCallback(
    (targetGameId: string | null) => {
      clearLastOpenedIfMatches(targetGameId);
      setGameMeta(null);
      setGameMetaError(null);
      setPlayers([]);
      setPlayersLoaded(false);
      setGameState(null);
      setEvents([]);
      setOwnershipByTile({});
      setTradeProposals([]);
      setTradeCounterpartyId("");
      setTradeOfferCash(0);
      setTradeOfferTiles([]);
      setTradeRequestCash(0);
      setTradeRequestTiles([]);
      setPlayerLoans([]);
      setPurchaseMortgages([]);
      setNotice(null);
      setSelectedTileIndex(null);
      setSelectedInteriorCell(null);
      setOpenInlandDecisionCellKey(null);
      setSellToMarketTileIndex(null);
      setPayoffLoanId(null);
      setDefaultLoanTileIndex(null);
      setPayoffMortgageId(null);
      setShowLeaveConfirm(false);
      setShowEndSessionConfirm(false);
      for (const sliceName of sliceNames) {
        sliceRequestEpochsRef.current[sliceName] += 1;
      }
      latestGameStateVersionRef.current = null;
      auctionAutoPassSubmittedForKeyRef.current = null;
    },
    [clearLastOpenedIfMatches],
  );

  const applyIncomingGameState = useCallback(
    (incomingState: GameState | null, options?: { allowEqualVersion?: boolean }) => {
      if (!incomingState) {
        latestGameStateVersionRef.current = null;
        setGameState(null);
        return;
      }

      setGameState((previousState) => {
        if (!previousState) {
          latestGameStateVersionRef.current = incomingState.version;
          return incomingState;
        }

        if (incomingState.version > previousState.version) {
          latestGameStateVersionRef.current = incomingState.version;
          return incomingState;
        }

        if (
          incomingState.version === previousState.version &&
          options?.allowEqualVersion
        ) {
          latestGameStateVersionRef.current = incomingState.version;
          return incomingState;
        }

        latestGameStateVersionRef.current = Math.max(
          latestGameStateVersionRef.current ?? previousState.version,
          previousState.version,
        );
        return previousState;
      });
    },
    [],
  );

  const startSliceRequest = useCallback((sliceName: SliceName) => {
    const nextEpoch = sliceRequestEpochsRef.current[sliceName] + 1;
    sliceRequestEpochsRef.current[sliceName] = nextEpoch;
    return nextEpoch;
  }, []);

  const isLatestSliceRequest = useCallback(
    (sliceName: SliceName, epoch: number) =>
      sliceRequestEpochsRef.current[sliceName] === epoch,
    [],
  );

  const loadGameMeta = useCallback(
    async (
      gameId: string,
      accessToken?: string,
    ): Promise<LoadGameMetaResult> => {
      const requestEpoch = startSliceRequest("gameMeta");
      const [game] = await supabaseClient.fetchFromSupabase<GameMeta[]>(
        `games?select=id,board_pack_id,game_mode,round_limit,status,created_by&id=eq.${gameId}&limit=1`,
        { method: "GET" },
        accessToken,
      );
      if (!isLatestSliceRequest("gameMeta", requestEpoch)) {
        return { status: "stale" } as const;
      }
      const resolvedGameMeta = game ?? null;
      setGameMeta(resolvedGameMeta);
      if (!resolvedGameMeta) {
        return { status: "missing" } as const;
      }
      return { status: "success", gameMeta: resolvedGameMeta } as const;
    },
    [isLatestSliceRequest, startSliceRequest],
  );

  const loadPlayers = useCallback(
    async (gameId: string, accessToken?: string) => {
      const requestEpoch = startSliceRequest("players");
      const rows = await supabaseClient.fetchFromSupabase<Player[]>(
        `players?select=id,user_id,display_name,created_at,position,is_in_jail,jail_turns_remaining,get_out_of_jail_free_count,tax_exemption_pass_count,free_build_tokens,free_upgrade_tokens,is_eliminated,eliminated_at&game_id=eq.${gameId}&order=created_at.asc`,
        { method: "GET" },
        accessToken,
      );
      if (!isLatestSliceRequest("players", requestEpoch)) {
        return rows;
      }
      setPlayers(rows);
      setPlayersLoaded(true);
      return rows;
    },
    [isLatestSliceRequest, startSliceRequest],
  );

  const loadGameState = useCallback(
    async (gameId: string, accessToken?: string) => {
      const requestEpoch = startSliceRequest("gameState");
      const [stateRow] = await supabaseClient.fetchFromSupabase<GameState[]>(
        `game_state?select=game_id,version,current_player_id,balances,last_roll,doubles_count,rounds_elapsed,turn_phase,pending_action,pending_card_active,pending_card_deck,pending_card_id,pending_card_title,pending_card_kind,pending_card_payload,pending_card_drawn_by_player_id,pending_card_drawn_at,pending_card_source_tile_index,active_macro_effects_v1,skip_next_roll_by_player,betting_market_state,inland_explored_cells,income_tax_baseline_cash_by_player,chance_index,community_index,free_parking_pot,rules,auction_active,auction_tile_index,auction_initiator_player_id,auction_current_bid,auction_current_winner_player_id,auction_turn_player_id,auction_turn_ends_at,auction_eligible_player_ids,auction_passed_player_ids,auction_min_increment&game_id=eq.${gameId}&limit=1`,
        { method: "GET" },
        accessToken,
      );
      if (!isLatestSliceRequest("gameState", requestEpoch)) {
        return;
      }
      applyIncomingGameState(stateRow ?? null);
    },
    [applyIncomingGameState, isLatestSliceRequest, startSliceRequest],
  );

  const loadEvents = useCallback(
    async (gameId: string, accessToken?: string) => {
      const requestEpoch = startSliceRequest("events");
      const rows = await supabaseClient.fetchFromSupabase<GameEvent[]>(
        `game_events?select=id,event_type,payload,created_at,version&game_id=eq.${gameId}&order=version.desc&limit=100`,
        { method: "GET" },
        accessToken,
      );
      if (!isLatestSliceRequest("events", requestEpoch)) {
        return;
      }
      setEvents(rows);
    },
    [isLatestSliceRequest, startSliceRequest],
  );

  const loadOwnership = useCallback(
    async (gameId: string, accessToken?: string) => {
      const requestEpoch = startSliceRequest("ownership");
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
      if (!isLatestSliceRequest("ownership", requestEpoch)) {
        return;
      }
      setOwnershipByTile(mapped);
    },
    [isLatestSliceRequest, startSliceRequest],
  );

  const loadTradeProposals = useCallback(
    async (gameId: string, accessToken?: string) => {
      const requestEpoch = startSliceRequest("tradeProposals");
      const rows = await supabaseClient.fetchFromSupabase<TradeProposal[]>(
        `trade_proposals?select=id,game_id,proposer_player_id,counterparty_player_id,offer_cash,offer_free_build_tokens,offer_free_upgrade_tokens,offer_tile_indices,request_cash,request_free_build_tokens,request_free_upgrade_tokens,request_tile_indices,snapshot,status,created_at&game_id=eq.${gameId}&order=created_at.desc`,
        { method: "GET" },
        accessToken,
      );
      if (!isLatestSliceRequest("tradeProposals", requestEpoch)) {
        return;
      }
      setTradeProposals(rows);
    },
    [isLatestSliceRequest, startSliceRequest],
  );

  const loadLoans = useCallback(
    async (gameId: string, accessToken?: string, playerId?: string | null) => {
      const requestEpoch = startSliceRequest("loans");
      if (!playerId) {
        if (!isLatestSliceRequest("loans", requestEpoch)) {
          return;
        }
        setPlayerLoans([]);
        return;
      }
      const rows = await supabaseClient.fetchFromSupabase<PlayerLoan[]>(
        `player_loans?select=id,player_id,collateral_tile_index,principal,remaining_principal,rate_per_turn,term_turns,turns_remaining,payment_per_turn,status&game_id=eq.${gameId}&player_id=eq.${playerId}`,
        { method: "GET" },
        accessToken,
      );
      if (!isLatestSliceRequest("loans", requestEpoch)) {
        return;
      }
      setPlayerLoans(rows);
    },
    [isLatestSliceRequest, startSliceRequest],
  );

  const loadPurchaseMortgages = useCallback(
    async (gameId: string, accessToken?: string, playerId?: string | null) => {
      const requestEpoch = startSliceRequest("purchaseMortgages");
      if (!playerId) {
        if (!isLatestSliceRequest("purchaseMortgages", requestEpoch)) {
          return;
        }
        setPurchaseMortgages([]);
        return;
      }
      const rows = await supabaseClient.fetchFromSupabase<PurchaseMortgage[]>(
        `purchase_mortgages?select=id,player_id,tile_index,principal_original,principal_remaining,rate_per_turn,term_turns,turns_remaining,payment_per_turn,turns_elapsed,accrued_interest_unpaid,status&game_id=eq.${gameId}&player_id=eq.${playerId}`,
        { method: "GET" },
        accessToken,
      );
      if (!isLatestSliceRequest("purchaseMortgages", requestEpoch)) {
        return;
      }
      setPurchaseMortgages(rows);
    },
    [isLatestSliceRequest, startSliceRequest],
  );

  const currentUserPlayerId = useMemo(
    () =>
      players.find((player) => player.user_id === session?.user.id)?.id ?? null,
    [players, session?.user.id],
  );

  const loadAllSlices = useCallback(
    async (gameId: string, accessToken?: string) => {
      const playerRows = await loadPlayers(gameId, accessToken);
      const currentPlayerId =
        playerRows.find((player) => player.user_id === session?.user.id)?.id ??
        null;
      const [loadedGameMeta] = await Promise.all([
        loadGameMeta(gameId, accessToken),
        loadGameState(gameId, accessToken),
        loadEvents(gameId, accessToken),
        loadOwnership(gameId, accessToken),
        loadTradeProposals(gameId, accessToken),
        loadLoans(gameId, accessToken, currentPlayerId),
        loadPurchaseMortgages(gameId, accessToken, currentPlayerId),
      ]);
      return loadedGameMeta;
    },
    [
      loadEvents,
      loadGameMeta,
      loadGameState,
      loadLoans,
      loadOwnership,
      loadPlayers,
      loadPurchaseMortgages,
      loadTradeProposals,
      session?.user.id,
    ],
  );

  const refetchActionSlices = useCallback(
    async (gameId: string, accessToken?: string) => {
      await Promise.all([
        loadGameState(gameId, accessToken),
        loadPlayers(gameId, accessToken),
        loadOwnership(gameId, accessToken),
        loadLoans(gameId, accessToken, currentUserPlayerId),
        loadPurchaseMortgages(gameId, accessToken, currentUserPlayerId),
        loadTradeProposals(gameId, accessToken),
        loadEvents(gameId, accessToken),
      ]);
    },
    [
      currentUserPlayerId,
      loadEvents,
      loadGameState,
      loadLoans,
      loadOwnership,
      loadPlayers,
      loadPurchaseMortgages,
      loadTradeProposals,
    ],
  );

  useEffect(() => {
    latestRouteGameIdRef.current = routeGameId ?? null;
  }, [routeGameId]);

  useEffect(() => {
    latestAccessTokenRef.current = session?.access_token ?? null;
  }, [session?.access_token]);

  useEffect(() => {
    latestCurrentUserPlayerIdRef.current = currentUserPlayerId;
  }, [currentUserPlayerId]);

  useEffect(() => {
    latestLoadAllSlicesRef.current = loadAllSlices;
  }, [loadAllSlices]);

  useEffect(() => {
    const realtimeDirtySlices = realtimeDirtySlicesRef.current;
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (realtimeSliceFlushTimeoutRef.current) {
        clearTimeout(realtimeSliceFlushTimeoutRef.current);
      }
      realtimeSliceFlushTimeoutRef.current = null;
      realtimeDirtySlices.clear();
      resumeRefreshQueuedRef.current = false;
      isRunningQueuedResumeRefreshRef.current = false;
    };
  }, []);

  const requestResumeRefresh = useCallback(() => {
    if (resumeRefreshTimeoutRef.current) {
      clearTimeout(resumeRefreshTimeoutRef.current);
    }

    resumeRefreshTimeoutRef.current = setTimeout(() => {
      const runResumeRefreshPass = async () => {
        const gameId = latestRouteGameIdRef.current;
        const accessToken = latestAccessTokenRef.current;
        if (!gameId || !accessToken || !isMountedRef.current) {
          return;
        }

        if (resumeRefreshInFlightRef.current) {
          resumeRefreshQueuedRef.current = true;
          return;
        }

        resumeRefreshInFlightRef.current = true;
        resumeRefreshQueuedRef.current = false;

        try {
          await latestLoadAllSlicesRef.current?.(gameId, accessToken);
        } finally {
          resumeRefreshInFlightRef.current = false;
          if (
            resumeRefreshQueuedRef.current &&
            !isRunningQueuedResumeRefreshRef.current &&
            isMountedRef.current
          ) {
            resumeRefreshQueuedRef.current = false;
            isRunningQueuedResumeRefreshRef.current = true;
            try {
              await runResumeRefreshPass();
            } finally {
              isRunningQueuedResumeRefreshRef.current = false;
            }
          }
        }
      };

      if (!isMountedRef.current) {
        return;
      }
      void runResumeRefreshPass();
    }, RESUME_REFRESH_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const hydrate = async () => {
      const currentSession = await supabaseClient.getSession();
      if (!isMounted) return;
      setSession(currentSession);
      setGameMetaError(null);
      setPlayersLoaded(false);

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
        const loadedGameMeta = await loadAllSlices(routeGameId, accessToken);
        // stale game-meta requests are intentionally ignored; they are not a
        // confirmed missing game and should not trigger the terminal state.
        if (loadedGameMeta?.status === "missing") {
          setGameMetaError("No active game.");
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to load game";
        if (message === SESSION_EXPIRED_MESSAGE) {
          setNeedsAuth(true);
        } else {
          setGameMetaError(message);
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
    if (
      !loading &&
      !needsAuth &&
      gameMeta &&
      !getBoardPackById(gameMeta.board_pack_id ?? null)
    ) {
      setGameMetaError("Unable to resolve board pack for this game.");
    }
  }, [gameMeta, loading, needsAuth]);

  useEffect(() => {
    if (!routeGameId || !session?.access_token) {
      return;
    }

    const realtimeClient = supabaseClient.getRealtimeClient();
    if (!realtimeClient) {
      return;
    }
    const realtimeDirtySlices = realtimeDirtySlicesRef.current;

    const flushRealtimeDirtySlices = () => {
      realtimeSliceFlushTimeoutRef.current = null;
      if (!isMountedRef.current || realtimeDirtySlices.size === 0) {
        realtimeDirtySlices.clear();
        return;
      }
      const dirtySlices = Array.from(realtimeDirtySlices);
      realtimeDirtySlices.clear();
      for (const sliceName of dirtySlices) {
        switch (sliceName) {
          case "players":
            void loadPlayers(routeGameId, session.access_token);
            break;
          case "gameState":
            void loadGameState(routeGameId, session.access_token);
            break;
          case "events":
            void loadEvents(routeGameId, session.access_token);
            break;
          case "ownership":
            void loadOwnership(routeGameId, session.access_token);
            break;
          case "tradeProposals":
            void loadTradeProposals(routeGameId, session.access_token);
            break;
          case "loans":
            void loadLoans(
              routeGameId,
              session.access_token,
              latestCurrentUserPlayerIdRef.current,
            );
            break;
          case "purchaseMortgages":
            void loadPurchaseMortgages(
              routeGameId,
              session.access_token,
              latestCurrentUserPlayerIdRef.current,
            );
            break;
          case "gameMeta":
            void loadGameMeta(routeGameId, session.access_token);
            break;
        }
      }
    };

    const markRealtimeSliceDirty = (sliceName: SliceName) => {
      realtimeDirtySlices.add(sliceName);
      if (realtimeSliceFlushTimeoutRef.current) {
        return;
      }
      realtimeSliceFlushTimeoutRef.current = setTimeout(
        flushRealtimeDirtySlices,
        REALTIME_SLICE_COALESCE_MS,
      );
    };

    const channel = realtimeClient
      .channel(`play-v2:${routeGameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `game_id=eq.${routeGameId}`,
        },
        () => markRealtimeSliceDirty("players"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_state",
          filter: `game_id=eq.${routeGameId}`,
        },
        () => markRealtimeSliceDirty("gameState"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_events",
          filter: `game_id=eq.${routeGameId}`,
        },
        () => markRealtimeSliceDirty("events"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "property_ownership",
          filter: `game_id=eq.${routeGameId}`,
        },
        () => markRealtimeSliceDirty("ownership"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trade_proposals",
          filter: `game_id=eq.${routeGameId}`,
        },
        () => markRealtimeSliceDirty("tradeProposals"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_loans",
          filter: `game_id=eq.${routeGameId}`,
        },
        () => markRealtimeSliceDirty("loans"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "purchase_mortgages",
          filter: `game_id=eq.${routeGameId}`,
        },
        () => markRealtimeSliceDirty("purchaseMortgages"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
          filter: `id=eq.${routeGameId}`,
        },
        () => markRealtimeSliceDirty("gameMeta"),
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      if (realtimeSliceFlushTimeoutRef.current) {
        clearTimeout(realtimeSliceFlushTimeoutRef.current);
      }
      realtimeSliceFlushTimeoutRef.current = null;
      realtimeDirtySlices.clear();
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

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        requestResumeRefresh();
      }
    };

    const handleFocus = () => {
      requestResumeRefresh();
    };

    const handleOnline = () => {
      requestResumeRefresh();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      if (resumeRefreshTimeoutRef.current) {
        clearTimeout(resumeRefreshTimeoutRef.current);
      }
      resumeRefreshTimeoutRef.current = null;
      resumeRefreshQueuedRef.current = false;
    };
  }, [requestResumeRefresh]);

  const isGameEnded = (gameMeta?.status ?? "").toLowerCase() === "ended";

  const activeMacroEffectsV1 = useMemo(() => {
    return (gameState?.active_macro_effects_v1 ?? []).filter(
      (entry): entry is ActiveMacroEffectV1 => Boolean(entry),
    );
  }, [gameState?.active_macro_effects_v1]);

  const houseBuildBlockedByMacro = useMemo(
    () =>
      activeMacroEffectsV1.find(
        (entry) => entry?.effects?.house_build_blocked === true,
      ) ?? null,
    [activeMacroEffectsV1],
  );

  const loanBlockedByMacro = useMemo(
    () =>
      activeMacroEffectsV1.find(
        (entry) => entry?.effects?.loan_mortgage_new_blocked === true,
      ) ?? null,
    [activeMacroEffectsV1],
  );

  const activeLoans = useMemo(
    () => playerLoans.filter((loan) => loan.status === "active"),
    [playerLoans],
  );

  const activePurchaseMortgages = useMemo(
    () => purchaseMortgages.filter((mortgage) => mortgage.status === "active"),
    [purchaseMortgages],
  );

  const boardTilesByIndex = useMemo(() => {
    const tiles = resolveBoardTilesForRules({
      boardPack: getBoardPackById(gameMeta?.board_pack_id ?? null),
      rules: gameState?.rules,
    });
    return new Map(tiles.map((tile) => [tile.index, tile]));
  }, [gameMeta?.board_pack_id, gameState?.rules]);

  void houseBuildBlockedByMacro;
  void loanBlockedByMacro;
  const turnPlayerId = gameState?.current_player_id ?? null;

  const currentTurnPlayer = useMemo(
    () => players.find((player) => player.id === turnPlayerId) ?? null,
    [players, turnPlayerId],
  );

  const currentUserPlayer = useMemo(
    () => players.find((player) => player.id === currentUserPlayerId) ?? null,
    [currentUserPlayerId, players],
  );

  const currentUserCash = useMemo(() => {
    if (!currentUserPlayer) return null;
    return gameState?.balances?.[currentUserPlayer.id] ?? null;
  }, [currentUserPlayer, gameState?.balances]);

  const latestGameOverEvent = useMemo(
    () => events.find((event) => event.event_type === "GAME_OVER") ?? null,
    [events],
  );

  const gameOverState = useMemo(() => {
    if (!isGameEnded) {
      return null;
    }

    const payload = latestGameOverEvent?.payload;
    const winnerPlayerId =
      typeof payload?.winner_player_id === "string"
        ? payload.winner_player_id
        : (gameState?.current_player_id ?? null);
    const winnerPlayer = winnerPlayerId
      ? (players.find((player) => player.id === winnerPlayerId) ?? null)
      : null;
    const winnerNameFromEvent =
      typeof payload?.winner_player_name === "string" &&
      payload.winner_player_name.trim().length > 0
        ? payload.winner_player_name
        : null;
    const winnerName =
      winnerNameFromEvent ?? winnerPlayer?.display_name ?? "Unknown player";
    const rawReason =
      typeof payload?.reason === "string" ? payload.reason : null;
    const reasonLabel = rawReason
      ? rawReason.replaceAll("_", " ").toLowerCase()
      : null;

    const payloadStandings = Array.isArray(payload?.standings) ? payload.standings : [];
    const parsedPayloadStandings: FinalStanding[] = payloadStandings
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const candidate = entry as Record<string, unknown>;
        if (
          typeof candidate.playerId !== "string" ||
          typeof candidate.playerName !== "string" ||
          typeof candidate.rank !== "number" ||
          typeof candidate.cash !== "number" ||
          typeof candidate.netWorth !== "number"
        ) {
          return null;
        }
        return {
          playerId: candidate.playerId,
          playerName: candidate.playerName,
          rank: candidate.rank,
          cash: candidate.cash,
          netWorth: candidate.netWorth,
          isWinner:
            typeof winnerPlayerId === "string"
              ? candidate.playerId === winnerPlayerId
              : candidate.isWinner === true,
          isEliminated: candidate.isEliminated === true,
          ownedCount: typeof candidate.ownedCount === "number" ? candidate.ownedCount : 0,
          liabilityCount:
            typeof candidate.liabilityCount === "number" ? candidate.liabilityCount : 0,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((a, b) => a.rank - b.rank);
    const payloadStandingsValid =
      payloadStandings.length > 0 &&
      parsedPayloadStandings.length === payloadStandings.length;

    const fallbackStandings: FinalStanding[] = players
      .map((player) => {
        const cash = gameState?.balances?.[player.id] ?? 0;
        const ownedTiles = Array.from(boardTilesByIndex.values()).filter(
          (tile) => ownershipByTile[tile.index]?.owner_player_id === player.id,
        );
        const playerLoans = activeLoans.filter((loan) => loan.player_id === player.id);
        const playerMortgages = activePurchaseMortgages.filter(
          (mortgage) => mortgage.player_id === player.id,
        );
        const netWorthBreakdown = computeAuthoritativeNetWorthBreakdown({
          currentCash: cash,
          playerId: player.id,
          boardTiles: Array.from(boardTilesByIndex.values()),
          ownershipByTile,
          activeCollateralLoans: playerLoans.map((loan) => ({
            principal: loan.principal ?? 0,
            remaining_principal: loan.remaining_principal ?? null,
          })),
          activePurchaseMortgages: playerMortgages.map((mortgage) => ({
            principal_remaining: mortgage.principal_remaining ?? 0,
            accrued_interest_unpaid: mortgage.accrued_interest_unpaid ?? 0,
          })),
          inlandExploredCells: gameState?.inland_explored_cells,
          boardPackEconomy:
            getBoardPackById(gameMeta?.board_pack_id ?? null)?.economy ??
            DEFAULT_BOARD_PACK_ECONOMY,
        });
        return {
          playerId: player.id,
          playerName: player.display_name ?? "Unknown player",
          cash,
          netWorth: netWorthBreakdown.netWorth,
          isEliminated: player.is_eliminated,
          ownedCount: ownedTiles.length,
          liabilityCount: playerLoans.length + playerMortgages.length,
          eliminatedAtMs: player.eliminated_at
            ? Date.parse(player.eliminated_at)
            : Number.POSITIVE_INFINITY,
        };
      })
      .sort((a, b) => {
        const bankruptcyEndsBySurvival = rawReason === "BANKRUPTCY";
        if (bankruptcyEndsBySurvival && a.isEliminated !== b.isEliminated) {
          return a.isEliminated ? 1 : -1;
        }
        if (a.eliminatedAtMs !== b.eliminatedAtMs) {
          return a.eliminatedAtMs - b.eliminatedAtMs;
        }
        if (b.netWorth !== a.netWorth) {
          return b.netWorth - a.netWorth;
        }
        if (!bankruptcyEndsBySurvival && a.isEliminated !== b.isEliminated) {
          return a.isEliminated ? 1 : -1;
        }
        return a.playerName.localeCompare(b.playerName);
      })
      .map((entry, index) => ({
        playerId: entry.playerId,
        playerName: entry.playerName,
        rank: index + 1,
        cash: entry.cash,
        netWorth: entry.netWorth,
        isWinner: winnerPlayerId ? entry.playerId === winnerPlayerId : index === 0,
        isEliminated: entry.isEliminated,
        ownedCount: entry.ownedCount,
        liabilityCount: entry.liabilityCount,
      }));

    const standings = payloadStandingsValid
      ? parsedPayloadStandings
      : fallbackStandings;
    const standingsSource: "event" | "fallback" | "missing" = payloadStandingsValid
      ? "event"
      : fallbackStandings.length > 0
        ? "fallback"
        : "missing";

    return {
      winnerPlayerId,
      winnerName,
      rawReason,
      reasonLabel,
      standings,
      standingsSource,
      isCurrentUserWinner: Boolean(
        currentUserPlayerId &&
        winnerPlayerId &&
        currentUserPlayerId === winnerPlayerId,
      ),
    };
  }, [
    currentUserPlayerId,
    gameState?.current_player_id,
    gameState?.balances,
    isGameEnded,
    latestGameOverEvent,
    boardTilesByIndex,
    ownershipByTile,
    activeLoans,
    activePurchaseMortgages,
    gameState?.inland_explored_cells,
    players,
    gameMeta?.board_pack_id,
  ]);

  useEffect(() => {
    if (gameOverState) {
      setGameOverOverlayDismissed(false);
    }
  }, [gameOverState?.winnerPlayerId, gameOverState?.rawReason]);

  const isInProgress = (gameMeta?.status ?? "").toLowerCase() === "in_progress";
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
      base_price?: unknown;
      property_purchase_discount_pct?: unknown;
      property_purchase_discount_macro_name?: unknown;
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
      ...(typeof candidate.base_price === "number"
        ? { base_price: candidate.base_price }
        : {}),
      ...(typeof candidate.property_purchase_discount_pct === "number"
        ? {
            property_purchase_discount_pct:
              candidate.property_purchase_discount_pct,
          }
        : {}),
      ...(typeof candidate.property_purchase_discount_macro_name === "string"
        ? {
            property_purchase_discount_macro_name:
              candidate.property_purchase_discount_macro_name,
          }
        : {}),
    };
  }, [gameState?.current_player_id, gameState?.pending_action]);
  const pendingSuperTax = useMemo<SuperTaxPendingAction | null>(() => {
    const pendingAction = gameState?.pending_action;
    if (!pendingAction || typeof pendingAction !== "object") {
      return null;
    }

    const candidate = pendingAction as Record<string, unknown>;
    if (candidate.type !== "SUPER_TAX_CONFIRM") {
      return null;
    }

    if (
      typeof candidate.tile_id !== "string" ||
      typeof candidate.tile_index !== "number" ||
      typeof candidate.tile_name !== "string" ||
      typeof candidate.current_cash !== "number" ||
      typeof candidate.asset_value !== "number" ||
      typeof candidate.total_liabilities !== "number" ||
      typeof candidate.net_worth_for_tax !== "number" ||
      typeof candidate.tax_rate !== "number" ||
      typeof candidate.tax_amount !== "number" ||
      typeof candidate.uses_custom_formula !== "boolean" ||
      typeof candidate.currency_code !== "string" ||
      typeof candidate.currency_symbol !== "string" ||
      typeof candidate.tax_exemption_pass_count !== "number"
    ) {
      return null;
    }

    return {
      type: "SUPER_TAX_CONFIRM",
      player_id:
        typeof candidate.player_id === "string" ? candidate.player_id : null,
      tile_id: candidate.tile_id,
      tile_index: candidate.tile_index,
      tile_name: candidate.tile_name,
      boardpack_id:
        typeof candidate.boardpack_id === "string"
          ? candidate.boardpack_id
          : null,
      current_cash: candidate.current_cash,
      asset_value: candidate.asset_value,
      total_liabilities: candidate.total_liabilities,
      net_worth_for_tax: candidate.net_worth_for_tax,
      tax_rate: candidate.tax_rate,
      tax_amount: candidate.tax_amount,
      uses_custom_formula: candidate.uses_custom_formula,
      currency_code: candidate.currency_code,
      currency_symbol: candidate.currency_symbol,
      tax_exemption_pass_count: candidate.tax_exemption_pass_count,
    };
  }, [gameState?.pending_action]);
  const pendingIncomeTax = useMemo<IncomeTaxPendingAction | null>(() => {
    const pendingAction = gameState?.pending_action;
    if (!pendingAction || typeof pendingAction !== "object") return null;
    const candidate = pendingAction as Record<string, unknown>;
    if (candidate.type !== "INCOME_TAX_CONFIRM") return null;
    if (
      typeof candidate.tile_id !== "string" ||
      typeof candidate.tile_index !== "number" ||
      typeof candidate.tile_name !== "string" ||
      typeof candidate.current_cash !== "number" ||
      typeof candidate.baseline_cash !== "number" ||
      typeof candidate.taxable_gain !== "number" ||
      typeof candidate.tax_rate !== "number" ||
      typeof candidate.tax_amount !== "number" ||
      typeof candidate.currency_code !== "string" ||
      typeof candidate.currency_symbol !== "string" ||
      typeof candidate.tax_exemption_pass_count !== "number"
    ) {
      return null;
    }
    return {
      type: "INCOME_TAX_CONFIRM",
      player_id:
        typeof candidate.player_id === "string" ? candidate.player_id : null,
      tile_id: candidate.tile_id,
      tile_index: candidate.tile_index,
      tile_name: candidate.tile_name,
      boardpack_id:
        typeof candidate.boardpack_id === "string"
          ? candidate.boardpack_id
          : null,
      current_cash: candidate.current_cash,
      baseline_cash: candidate.baseline_cash,
      taxable_gain: candidate.taxable_gain,
      tax_rate: candidate.tax_rate,
      tax_amount: candidate.tax_amount,
      currency_code: candidate.currency_code,
      currency_symbol: candidate.currency_symbol,
      tax_exemption_pass_count: candidate.tax_exemption_pass_count,
    };
  }, [gameState?.pending_action]);

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
  const pendingInsolvencyRecovery =
    useMemo<InsolvencyRecoveryAction | null>(() => {
      const pendingAction = gameState?.pending_action;
      if (!pendingAction || typeof pendingAction !== "object") {
        return null;
      }

      const candidate = pendingAction as Record<string, unknown>;
      if (candidate.type !== "INSOLVENCY_RECOVERY") {
        return null;
      }

      if (
        typeof candidate.amount_due !== "number" ||
        typeof candidate.cash_available !== "number" ||
        typeof candidate.shortfall !== "number"
      ) {
        return null;
      }

      return {
        type: "INSOLVENCY_RECOVERY",
        player_id:
          typeof candidate.player_id === "string" ? candidate.player_id : null,
        reason: typeof candidate.reason === "string" ? candidate.reason : null,
        amount_due: candidate.amount_due,
        cash_available: candidate.cash_available,
        shortfall: candidate.shortfall,
        owed_to_player_id:
          typeof candidate.owed_to_player_id === "string"
            ? candidate.owed_to_player_id
            : null,
        tile_index:
          typeof candidate.tile_index === "number"
            ? candidate.tile_index
            : null,
        tile_id:
          typeof candidate.tile_id === "string" ? candidate.tile_id : null,
        label: typeof candidate.label === "string" ? candidate.label : null,
      };
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
    if (!gameState?.pending_action || typeof gameState.pending_action !== "object") {
      return null;
    }
    const candidate = gameState.pending_action as Record<string, unknown>;
    if (candidate.type !== "GO_TO_JAIL_CONFIRM") {
      return null;
    }
    return {
      playerId: typeof candidate.player_id === "string" ? candidate.player_id : null,
    };
  }, [gameState?.pending_action]);
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
      ? (payload as { dice?: unknown })
      : null;
  }, [latestRollEvent]);
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
  const latestRolledDoubleConfirmed = useMemo(() => {
    if (!latestRollEvent || !latestRolledDoubleEvent) {
      return false;
    }
    return latestRolledDoubleEvent.version === latestRollEvent.version + 1;
  }, [latestRollEvent, latestRolledDoubleEvent]);
  const latestIsDouble = useMemo(() => {
    if (!latestDiceValues) {
      return false;
    }
    return (
      latestRolledDoubleConfirmed || latestDiceValues[0] === latestDiceValues[1]
    );
  }, [latestDiceValues, latestRolledDoubleConfirmed]);
  const shouldShowGoToJailConfirm = Boolean(
    gameState?.turn_phase === "AWAITING_GO_TO_JAIL_CONFIRM" && pendingGoToJail,
  );
  const isGoToJailActor = Boolean(
    shouldShowGoToJailConfirm &&
      currentUserPlayer?.id &&
      pendingGoToJail?.playerId === currentUserPlayer.id,
  );
  const isAwaitingJailDecision =
    gameState?.turn_phase === "AWAITING_JAIL_DECISION";
  const isJailDecisionActor = Boolean(isMyTurn && isAwaitingJailDecision);
  const canRollForDoubles = Boolean(
    isJailDecisionActor && currentUserPlayer?.is_in_jail,
  );
  const hasGetOutOfJailFree =
    (currentUserPlayer?.get_out_of_jail_free_count ?? 0) > 0;
  const jailFineAmount =
    getBoardPackById(gameMeta?.board_pack_id ?? null)?.economy
      ?.jailFineAmount ?? 50;

  const activeDecisionType: ActiveDecisionType | null = useMemo(() => {
    if (shouldShowGoToJailConfirm) return "GO_TO_JAIL";
    if (isAwaitingJailDecision) return "JAIL_DECISION";
    if (pendingCard) return "PENDING_CARD";
    if (pendingMacroEvent) return "MACRO_EVENT";
    if (pendingIncomeTax) return "INCOME_TAX_CONFIRM";
    if (pendingSuperTax) return "SUPER_TAX_CONFIRM";
    if (pendingInsolvencyRecovery) return "INSOLVENCY_RECOVERY";
    if (pendingPurchase) return "BUY_PROPERTY";
    return null;
  }, [
    isAwaitingJailDecision,
    pendingCard,
    pendingMacroEvent,
    pendingIncomeTax,
    pendingSuperTax,
    pendingInsolvencyRecovery,
    pendingPurchase,
    shouldShowGoToJailConfirm,
  ]);

  const isDrawerDecision = useCallback((type: ActiveDecisionType | null) => {
    if (!type) return false;
    return (
      type === "BUY_PROPERTY" ||
      type === "JAIL_DECISION" ||
      type === "INCOME_TAX_CONFIRM" ||
      type === "SUPER_TAX_CONFIRM" ||
      type === "INSOLVENCY_RECOVERY"
    );
  }, []);

  const isFullscreenEvent = useCallback((type: ActiveDecisionType | null) => {
    if (!type) return false;
    return (
      type === "PENDING_CARD" ||
      type === "MACRO_EVENT" ||
      type === "GO_TO_JAIL"
    );
  }, []);

  const isInsolvencyRecoveryMode = Boolean(
    pendingInsolvencyRecovery &&
    isMyTurn &&
    currentUserPlayer?.id &&
    pendingInsolvencyRecovery.player_id === currentUserPlayer.id,
  );
  const insolvencyAmountDue = pendingInsolvencyRecovery?.amount_due ?? 0;
  const insolvencyCurrentCash = isInsolvencyRecoveryMode
    ? (currentUserCash ?? 0)
    : (pendingInsolvencyRecovery?.cash_available ?? 0);
  const insolvencyShortfall = Math.max(
    insolvencyAmountDue - insolvencyCurrentCash,
    0,
  );
  const isInsolvencyReadyToPay = Boolean(
    isInsolvencyRecoveryMode &&
    pendingInsolvencyRecovery &&
    insolvencyCurrentCash >= insolvencyAmountDue,
  );
  const hasBlockingPendingAction = activeDecisionType !== null;
  const rules = getRules(gameState?.rules ?? null);
  const mortgageLtv =
    typeof rules.mortgageLtv === "number" && Number.isFinite(rules.mortgageLtv)
      ? rules.mortgageLtv
      : 0.5;
  const defaultMortgageDownPaymentPercent =
    defaultPurchaseDownPaymentPercentFromMortgageLtv(mortgageLtv);
  const pendingMortgageDownPayment = pendingPurchase
    ? calculateDownPaymentAmount(
        pendingPurchase.price,
        selectedMortgageDownPaymentPercent,
      )
    : 0;
  const pendingMortgagePrincipal = pendingPurchase
    ? calculateMortgagePrincipalFromDownPayment(
        pendingPurchase.price,
        selectedMortgageDownPaymentPercent,
      )
    : 0;
  const pendingMortgagePerTurnPayment = pendingPurchase
    ? calculateAmortizedPaymentPerTurn(
        pendingMortgagePrincipal,
        rules.mortgageRatePerTurn,
        rules.mortgageTermTurns,
      )
    : 0;
  const canAffordPendingPurchase = pendingPurchase
    ? (currentUserCash ?? 0) >= pendingPurchase.price
    : false;
  const canAffordPendingMortgage = pendingPurchase
    ? (currentUserCash ?? 0) >= pendingMortgageDownPayment
    : false;
  useEffect(() => {
    if (!pendingPurchase) {
      return;
    }
    setSelectedMortgageDownPaymentPercent(defaultMortgageDownPaymentPercent);
  }, [defaultMortgageDownPaymentPercent, pendingPurchase]);

  const canAct =
    isMyTurn && !isEliminated && !auctionActive && !hasBlockingPendingAction;
  const canUseRecoveryActions =
    isMyTurn && !isEliminated && !auctionActive && isInsolvencyRecoveryMode;
  const canRoll =
    canAct &&
    !isJailDecisionActor &&
    (gameState?.last_roll == null || (gameState?.doubles_count ?? 0) > 0);
  const canEndTurn = canAct && gameState?.last_roll != null;
  const isHost = Boolean(
    session?.user.id && gameMeta?.created_by === session.user.id,
  );
  const isActionInFlight = actionLoading !== null;

  const closeMenuOverlay = useCallback(() => {
    setShowMenuOverlay(false);
  }, []);

  const handleLeaveIntent = useCallback(() => {
    closeMenuOverlay();
    setShowLeaveConfirm(true);
  }, [closeMenuOverlay]);

  const handleBackToHomeIntent = useCallback(() => {
    closeMenuOverlay();
    router.push("/");
  }, [closeMenuOverlay, router]);

  const handleReturnHomeFromGameOver = useCallback(() => {
    clearPlayV2State(routeGameId ?? null);
    router.push("/");
  }, [clearPlayV2State, routeGameId, router]);

  useEffect(() => {
    if (!showMenuOverlay) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenuOverlay();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenuOverlay, showMenuOverlay]);

  useEffect(() => {
    if (showLeaveConfirm || showEndSessionConfirm) {
      setShowMenuOverlay(false);
    }
  }, [showEndSessionConfirm, showLeaveConfirm]);

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
    if (isJailDecisionActor) {
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
    isJailDecisionActor,
    isMyTurn,
  ]);

  const auctionTileIndex = gameState?.auction_tile_index ?? null;
  const auctionTile = useMemo(() => {
    if (auctionTileIndex === null) {
      return null;
    }
    const boardTiles =
      getBoardPackById(gameMeta?.board_pack_id ?? null)?.tiles ?? [];
    return boardTiles.find((tile) => tile.index === auctionTileIndex) ?? null;
  }, [auctionTileIndex, gameMeta?.board_pack_id]);
  const auctionHighestBid = gameState?.auction_current_bid ?? 0;
  const auctionHighestBidderId =
    gameState?.auction_current_winner_player_id ?? null;
  const auctionHighestBidderName =
    players.find((player) => player.id === auctionHighestBidderId)
      ?.display_name ?? (auctionHighestBidderId ? "Player" : null);
  const auctionTurnPlayerId = gameState?.auction_turn_player_id ?? null;
  const auctionTurnPlayerName =
    players.find((player) => player.id === auctionTurnPlayerId)?.display_name ??
    (auctionTurnPlayerId ? "Player" : null);
  const auctionEligibleBidderIds = gameState?.auction_eligible_player_ids ?? [];
  const auctionPassedBidderIds = gameState?.auction_passed_player_ids ?? [];
  const auctionTurnEndsAt = gameState?.auction_turn_ends_at ?? null;
  const auctionMinIncrement =
    gameState?.auction_min_increment ??
    DEFAULT_BOARD_PACK_ECONOMY.auctionMinIncrement ??
    10;
  const currentBidderCash =
    currentUserPlayer && gameState?.balances
      ? (gameState.balances[currentUserPlayer.id] ?? 0)
      : 0;
  const isEligibleAuctionBidder = Boolean(
    currentUserPlayer?.id &&
    auctionEligibleBidderIds.includes(currentUserPlayer.id) &&
    !auctionPassedBidderIds.includes(currentUserPlayer.id),
  );
  const isCurrentAuctionBidder = Boolean(
    currentUserPlayer?.id && currentUserPlayer.id === auctionTurnPlayerId,
  );
  const canActInAuction =
    auctionActive && isEligibleAuctionBidder && isCurrentAuctionBidder;

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
      ? `Time left ${Math.floor(auctionRemainingSeconds / 60)}:${String(
          auctionRemainingSeconds % 60,
        ).padStart(2, "0")}`
      : null;
  const auctionAutoPassGuardKey = useMemo(
    () =>
      [
        gameState?.version ?? "no-version",
        auctionTurnPlayerId ?? "no-turn-player",
        auctionTurnEndsAt ?? "no-turn-end",
      ].join(":"),
    [auctionTurnEndsAt, auctionTurnPlayerId, gameState?.version],
  );

  useEffect(() => {
    if (!auctionActive) {
      return;
    }
    const tick = window.setInterval(() => {
      setAuctionNow(new Date());
    }, 1000);
    return () => window.clearInterval(tick);
  }, [auctionActive]);

  useEffect(
    () => () => {
      if (ownedReasonTimeoutRef.current) {
        clearTimeout(ownedReasonTimeoutRef.current);
      }
    },
    [],
  );

  const handleBankAction = useCallback(
    async (
      actionOrRequest: BankAction | BankActionRequest,
      options?: Omit<BankActionRequest, "action">,
      uiOptions?: { suppressNotice?: boolean },
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!routeGameId || !session?.access_token) {
        return { ok: false, error: "Missing game session." };
      }

      const request =
        typeof actionOrRequest === "string"
          ? { action: actionOrRequest, ...options }
          : actionOrRequest;

      setActionLoading(request.action);
      setNotice(null);
      try {
        const requestBody = {
          action: request.action,
          gameId: routeGameId,
          expectedVersion: gameState?.version ?? 0,
          ...(request.tileIndex !== undefined
            ? { tileIndex: request.tileIndex }
            : {}),
          ...(request.amount !== undefined ? { amount: request.amount } : {}),
          ...(request.financing ? { financing: request.financing } : {}),
          ...(request.downPaymentPercent !== undefined
            ? { downPaymentPercent: request.downPaymentPercent }
            : {}),
          ...(request.loanId ? { loanId: request.loanId } : {}),
          ...(request.mortgageId ? { mortgageId: request.mortgageId } : {}),
          ...(request.tradeId ? { tradeId: request.tradeId } : {}),
          ...(request.counterpartyPlayerId
            ? { counterpartyPlayerId: request.counterpartyPlayerId }
            : {}),
          ...(request.offerCash !== undefined
            ? { offerCash: request.offerCash }
            : {}),
          ...(request.offerFreeBuildTokens !== undefined
            ? { offerFreeBuildTokens: request.offerFreeBuildTokens }
            : {}),
          ...(request.offerFreeUpgradeTokens !== undefined
            ? { offerFreeUpgradeTokens: request.offerFreeUpgradeTokens }
            : {}),
          ...(request.offerTiles ? { offerTiles: request.offerTiles } : {}),
          ...(request.requestCash !== undefined
            ? { requestCash: request.requestCash }
            : {}),
          ...(request.requestFreeBuildTokens !== undefined
            ? { requestFreeBuildTokens: request.requestFreeBuildTokens }
            : {}),
          ...(request.requestFreeUpgradeTokens !== undefined
            ? { requestFreeUpgradeTokens: request.requestFreeUpgradeTokens }
            : {}),
          ...(request.requestTiles
            ? { requestTiles: request.requestTiles }
            : {}),
          ...(request.kind ? { kind: request.kind } : {}),
          ...(request.selection ? { selection: request.selection } : {}),
          ...(request.stake !== undefined ? { stake: request.stake } : {}),
          ...(request.betId ? { betId: request.betId } : {}),
          ...(request.interiorCell ? { interiorCell: request.interiorCell } : {}),
          ...(request.useConstructionVoucher
            ? { useConstructionVoucher: request.useConstructionVoucher }
            : {}),
        };

        const runActionRequest = async (accessToken: string) => {
          const response = await postGameActionRequest({
            payload: requestBody,
            accessToken,
          });
          const payload = (response.body as {
            error?: string;
            message?: string;
          } | null) ?? null;
          const refreshedSession = response.refreshedSession
            ? await supabaseClient.getSession()
            : null;

          return {
            payload,
            response: {
              status: response.status,
              ok: response.ok,
            },
            refreshedSession,
          };
        };

        const getErrorMessage = (
          status: number,
          payload: { error?: string; message?: string } | null,
        ) => {
          if (status === 401) {
            return SESSION_EXPIRED_MESSAGE;
          }
          if (status === 409) {
            return "Game state updated. Please try again.";
          }
          if (
            typeof payload?.error === "string" &&
            payload.error.trim().length > 0
          ) {
            return payload.error;
          }
          if (
            typeof payload?.message === "string" &&
            payload.message.trim().length > 0
          ) {
            return payload.message;
          }
          return "Action failed. Please try again.";
        };

        let accessToken = session.access_token;
        const result = await runActionRequest(accessToken);

        if (result.refreshedSession?.access_token) {
          setSession(result.refreshedSession);
          accessToken = result.refreshedSession.access_token;
        }

        if (result.response.status === 401) {
          if (!result.refreshedSession?.access_token) {
            setNeedsAuth(true);
            if (!uiOptions?.suppressNotice) {
              setNotice(SESSION_EXPIRED_MESSAGE);
            }
            return { ok: false, error: SESSION_EXPIRED_MESSAGE };
          }
        }

        if (result.response.status === 409) {
          const isAuctionConflict =
            request.action === "AUCTION_BID" || request.action === "AUCTION_PASS";
          await refetchActionSlices(routeGameId, accessToken);
          const message = isAuctionConflict
            ? "Auction updated. Synced latest state."
            : "Game state updated. Please try again.";
          if (!uiOptions?.suppressNotice) {
            setNotice(message);
          }
          return { ok: false, error: message };
        }

        if (!result.response.ok) {
          if (result.response.status === 401) {
            setNeedsAuth(true);
          }
          const message = getErrorMessage(result.response.status, result.payload);
          if (!uiOptions?.suppressNotice) {
            setNotice(message);
          }
          return { ok: false, error: message };
        }

        await refetchActionSlices(routeGameId, accessToken);
        return { ok: true };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Action failed. Please try again.";
        if (!uiOptions?.suppressNotice) {
          setNotice(message);
        }
        return { ok: false, error: message };
      } finally {
        setActionLoading(null);
      }
    },
    [
      gameState?.version,
      refetchActionSlices,
      routeGameId,
      session,
    ],
  );

  const handleConfirmPendingCard = useCallback(() => {
    void handleBankAction("CONFIRM_PENDING_CARD");
  }, [handleBankAction]);

  const handleConfirmMacroEvent = useCallback(() => {
    void handleBankAction("CONFIRM_MACRO_EVENT");
  }, [handleBankAction]);

  const handleConfirmIncomeTax = useCallback(() => {
    void handleBankAction("CONFIRM_INCOME_TAX");
  }, [handleBankAction]);

  const handleConfirmSuperTax = useCallback(() => {
    void handleBankAction("CONFIRM_SUPER_TAX");
  }, [handleBankAction]);

  const handleUseTaxExemptionPass = useCallback(() => {
    void handleBankAction("USE_TAX_EXEMPTION_PASS");
  }, [handleBankAction]);

  const handleConfirmInsolvencyPayment = useCallback(() => {
    if (!isInsolvencyReadyToPay) {
      return;
    }
    void handleBankAction("CONFIRM_INSOLVENCY_PAYMENT");
  }, [handleBankAction, isInsolvencyReadyToPay]);

  const handleDeclareBankruptcy = useCallback(() => {
    if (!isInsolvencyRecoveryMode) {
      return;
    }
    void handleBankAction("DECLARE_BANKRUPTCY");
  }, [handleBankAction, isInsolvencyRecoveryMode]);

  const handleBuyProperty = useCallback(() => {
    if (!pendingPurchase) {
      return;
    }
    void handleBankAction("BUY_PROPERTY", {
      tileIndex: pendingPurchase.tile_index,
    });
  }, [handleBankAction, pendingPurchase]);

  const handleBuyPropertyWithMortgage = useCallback(() => {
    if (!pendingPurchase) {
      return;
    }
    void handleBankAction("BUY_PROPERTY", {
      tileIndex: pendingPurchase.tile_index,
      financing: "MORTGAGE",
      downPaymentPercent: selectedMortgageDownPaymentPercent,
    });
  }, [handleBankAction, pendingPurchase, selectedMortgageDownPaymentPercent]);

  const handleDeclineProperty = useCallback(() => {
    if (!pendingPurchase) {
      return;
    }
    void handleBankAction("DECLINE_PROPERTY", {
      tileIndex: pendingPurchase.tile_index,
    });
  }, [handleBankAction, pendingPurchase]);

  const handleDecreaseMortgageDownPaymentPercent = useCallback(() => {
    setSelectedMortgageDownPaymentPercent((current) => {
      const index = PURCHASE_DOWN_PAYMENT_PERCENTS.indexOf(current);
      if (index <= 0) {
        return current;
      }
      return PURCHASE_DOWN_PAYMENT_PERCENTS[index - 1];
    });
  }, []);

  const handleIncreaseMortgageDownPaymentPercent = useCallback(() => {
    setSelectedMortgageDownPaymentPercent((current) => {
      const index = PURCHASE_DOWN_PAYMENT_PERCENTS.indexOf(current);
      if (index < 0 || index >= PURCHASE_DOWN_PAYMENT_PERCENTS.length - 1) {
        return current;
      }
      return PURCHASE_DOWN_PAYMENT_PERCENTS[index + 1];
    });
  }, []);

  const handleConfirmGoToJail = useCallback(() => {
    if (!isGoToJailActor) {
      return;
    }
    void handleBankAction("CONFIRM_GO_TO_JAIL");
  }, [handleBankAction, isGoToJailActor]);

  const handleAuctionBid = useCallback(
    (amount: number) => {
      if (!canActInAuction) {
        return;
      }
      void handleBankAction("AUCTION_BID", { amount });
    },
    [canActInAuction, handleBankAction],
  );

  const handleAuctionPass = useCallback(() => {
    if (!canActInAuction) {
      return;
    }
    void handleBankAction("AUCTION_PASS");
  }, [canActInAuction, handleBankAction]);

  useEffect(() => {
    if (!auctionActive) {
      auctionAutoPassSubmittedForKeyRef.current = null;
      return;
    }

    if (auctionAutoPassSubmittedForKeyRef.current !== auctionAutoPassGuardKey) {
      auctionAutoPassSubmittedForKeyRef.current = null;
    }

    if (!canActInAuction || auctionRemainingSeconds !== 0) {
      return;
    }

    if (auctionAutoPassSubmittedForKeyRef.current === auctionAutoPassGuardKey) {
      return;
    }

    auctionAutoPassSubmittedForKeyRef.current = auctionAutoPassGuardKey;
    void handleBankAction("AUCTION_PASS", undefined, { suppressNotice: true });
  }, [
    auctionActive,
    auctionAutoPassGuardKey,
    auctionRemainingSeconds,
    canActInAuction,
    handleBankAction,
  ]);

  const handlePayJailFine = useCallback(() => {
    if (!isJailDecisionActor) {
      return;
    }
    void handleBankAction("JAIL_PAY_FINE");
  }, [handleBankAction, isJailDecisionActor]);

  const handleUseGetOutOfJailFree = useCallback(() => {
    if (!isJailDecisionActor || !hasGetOutOfJailFree) {
      return;
    }
    void handleBankAction("USE_GET_OUT_OF_JAIL_FREE");
  }, [handleBankAction, hasGetOutOfJailFree, isJailDecisionActor]);

  const handleRollForDoubles = useCallback(() => {
    if (!canRollForDoubles) {
      return;
    }
    void handleBankAction("JAIL_ROLL_FOR_DOUBLES");
  }, [canRollForDoubles, handleBankAction]);

  const handleLeaveTableV2 = useCallback(async () => {
    if (actionLoading !== null) {
      return;
    }

    if (!session || !routeGameId) {
      clearPlayV2State(routeGameId ?? null);
      router.push("/");
      return;
    }

    setActionLoading("SURRENDER_GAME");
    setNotice(null);

    const requestBody = {
      gameId: routeGameId,
      action: "SURRENDER_GAME",
    };

    try {
      const performLeave = (accessToken: string) =>
        fetch("/api/bank/action", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(requestBody),
        });

      let response = await performLeave(session.access_token);
      if (response.status === 401) {
        const refreshedSession = await supabaseClient.refreshSession();
        setSession(refreshedSession);
        if (!refreshedSession?.access_token) {
          setNeedsAuth(true);
          setNotice(SESSION_EXPIRED_MESSAGE);
          return;
        }
        response = await performLeave(refreshedSession.access_token);
      }

      if (response.status === 401) {
        setNeedsAuth(true);
        setNotice(SESSION_EXPIRED_MESSAGE);
        return;
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Unable to surrender this match.");
      }

      router.push("/");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to surrender this match.",
      );
    } finally {
      setActionLoading(null);
    }
  }, [actionLoading, clearPlayV2State, routeGameId, router, session]);

  const handleEndSessionV2 = useCallback(async () => {
    if (actionLoading !== null) {
      return;
    }

    if (!session || !routeGameId) {
      clearPlayV2State(routeGameId ?? null);
      router.push("/");
      return;
    }

    setActionLoading("END_GAME");
    setNotice(null);

    const requestBody = {
      gameId: routeGameId,
      action: "END_GAME",
      expectedVersion: gameState?.version ?? 0,
    };

    try {
      const performEnd = (accessToken: string) =>
        fetch("/api/bank/action", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(requestBody),
        });

      let response = await performEnd(session.access_token);
      let activeAccessToken = session.access_token;
      if (response.status === 401) {
        const refreshedSession = await supabaseClient.refreshSession();
        setSession(refreshedSession);
        if (!refreshedSession?.access_token) {
          setNeedsAuth(true);
          setNotice(SESSION_EXPIRED_MESSAGE);
          return;
        }
        activeAccessToken = refreshedSession.access_token;
        response = await performEnd(activeAccessToken);
      }

      if (response.status === 401) {
        setNeedsAuth(true);
        setNotice(SESSION_EXPIRED_MESSAGE);
        return;
      }

      if (response.status === 409) {
        await loadAllSlices(routeGameId, activeAccessToken);
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Unable to end the session.");
      }

      clearPlayV2State(routeGameId);
      router.push("/");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to end the session.",
      );
    } finally {
      setActionLoading(null);
    }
  }, [
    actionLoading,
    clearPlayV2State,
    gameState?.version,
    loadAllSlices,
    routeGameId,
    router,
    session,
  ]);

  const turnPlayerMissingFromPlayers =
    Boolean(turnPlayerId) && !currentTurnPlayer;

  const lastFiveEvents = useMemo(() => events.slice(0, 5), [events]);

  const selectedBoardPack = useMemo(
    () => getBoardPackById(gameMeta?.board_pack_id ?? null),
    [gameMeta?.board_pack_id],
  );
  const resolvedBoardTiles = useMemo(
    () => resolveBoardTilesForRules({ boardPack: selectedBoardPack, rules: gameState?.rules }),
    [gameState?.rules, selectedBoardPack],
  );
  const currency = getCurrencyMetaFromBoardPack(selectedBoardPack);
  const currencySymbol = currency.symbol ?? "$";
  const inlandGoSalary =
    selectedBoardPack?.economy.passGoAmount ??
    DEFAULT_BOARD_PACK_ECONOMY.passGoAmount ??
    0;
  const inlandExplorationCost = getInlandExplorationCost(inlandGoSalary);
  const currentPlayerFreeBuildTokens = currentUserPlayer?.free_build_tokens ?? 0;
  const currentPlayerFreeUpgradeTokens = currentUserPlayer?.free_upgrade_tokens ?? 0;
  const formatMoney = useCallback(
    (value: number | null) => {
      if (value === null) return "—";
      return formatCurrency(value, currency);
    },
    [currency],
  );
  const bettingConfig = selectedBoardPack?.economy.bettingMarket ?? null;
  const bettingMarketState = useMemo(
    () => normalizeBettingMarketState(gameState?.betting_market_state),
    [gameState?.betting_market_state],
  );
  const bettingDisabledReason = useMemo(() => {
    if (!bettingConfig) {
      return "Betting is unavailable for this board pack.";
    }
    if (!isInProgress) {
      return "Betting is unavailable right now.";
    }
    if (!currentUserPlayer) {
      return "Betting is unavailable for spectators.";
    }
    if (isEliminated) {
      return "Eliminated players cannot place bets.";
    }
    if (!isMyTurn) {
      return "Betting is only available during your turn.";
    }
    if (hasBlockingPendingAction) {
      return "Resolve the current pending decision before placing a bet.";
    }
    if (auctionActive) {
      return "Betting is unavailable during an auction.";
    }
    return null;
  }, [
    auctionActive,
    bettingConfig,
    currentUserPlayer,
    hasBlockingPendingAction,
    isEliminated,
    isInProgress,
    isMyTurn,
  ]);
  const canInteractWithBetting = bettingDisabledReason === null;

  const handlePlaceBet = useCallback(
    async (payload: {
      kind: BettingMarketBetKind;
      selection: BettingMarketBetSelection;
      stake: number;
    }) => {
      setBettingInlineError(null);
      setBettingSuccessMessage(null);
      const result = await handleBankAction(
        {
          action: "PLACE_BETTING_MARKET_BET",
          kind: payload.kind,
          selection: payload.selection,
          stake: payload.stake,
        },
        undefined,
        { suppressNotice: true },
      );
      if (!result.ok) {
        setBettingInlineError(result.error ?? "Unable to place bet.");
        return;
      }
      setBettingSuccessMessage("Bet placed for the next roll.");
    },
    [handleBankAction],
  );

  const handleCancelBet = useCallback(
    async (betId: string) => {
      setCancelingBetId(betId);
      setBettingInlineError(null);
      setBettingSuccessMessage(null);
      const result = await handleBankAction(
        {
          action: "CANCEL_BETTING_MARKET_BET",
          betId,
        },
        undefined,
        { suppressNotice: true },
      );
      setCancelingBetId(null);
      if (!result.ok) {
        setBettingInlineError(result.error ?? "Unable to cancel bet.");
        return;
      }
      setBettingSuccessMessage("Bet canceled.");
    },
    [handleBankAction],
  );

  const handleExploreInterior = useCallback(async () => {
    if (!selectedInteriorCell) {
      return;
    }
    const result = await handleBankAction(
      {
        action: "EXPLORE_INTERIOR",
        interiorCell: selectedInteriorCell,
      },
      undefined,
      { suppressNotice: false },
    );
    if (!result.ok) {
      return;
    }
    setOpenInlandDecisionCellKey(toInlandCellKey(selectedInteriorCell));
  }, [handleBankAction, selectedInteriorCell]);

  const handleInlandResourceDecision = useCallback(
    async (
      action:
        | "SELL_INTERIOR_RESOURCE"
        | "DEVELOP_INTERIOR_SITE"
        | "DEFER_INTERIOR_RESOURCE_DECISION",
      cell: InlandCell,
    ) => {
      const result = await handleBankAction(
        {
          action,
          interiorCell: cell,
        },
        undefined,
        { suppressNotice: false },
      );
      if (!result.ok) {
        return;
      }
      setOpenInlandDecisionCellKey(null);
    },
    [handleBankAction],
  );

  const handleBuyBankOwnedInlandSite = useCallback(
    async (cell: InlandCell) => {
      const result = await handleBankAction(
        {
          action: "BUY_BANK_OWNED_INTERIOR_SITE",
          interiorCell: cell,
        },
        undefined,
        { suppressNotice: false },
      );
      if (!result.ok) {
        return;
      }
      setOpenInlandDecisionCellKey(null);
      setLeftDrawerMode("info");
      setIsLeftDrawerOpen(true);
    },
    [handleBankAction],
  );

  const sellToMarketSelection = useMemo(() => {
    if (sellToMarketTileIndex === null || !resolvedBoardTiles) {
      return null;
    }
    const tile = resolvedBoardTiles.find(
      (boardTile) => boardTile.index === sellToMarketTileIndex,
    );
    if (!tile) {
      return null;
    }
    const marketValue = tile.price ?? 0;
    return {
      name: tile.name,
      marketValue,
      payout: Math.floor(marketValue * 0.7),
    };
  }, [sellToMarketTileIndex, resolvedBoardTiles]);

  const macroTooltipById = useMemo(() => {
    const lookup = new Map<string, string>();
    const cards = selectedBoardPack?.macroDeck?.cards ?? [];
    cards.forEach((card) => {
      if (card.tooltip) {
        lookup.set(card.id, card.tooltip);
      }
    });
    return lookup;
  }, [selectedBoardPack?.macroDeck?.cards]);

  const macroCardById = useMemo(() => {
    const cards = selectedBoardPack?.macroDeck?.cards ?? [];
    return new Map(cards.map((card) => [card.id, card]));
  }, [selectedBoardPack?.macroDeck?.cards]);

  const activeMacroDisplayItems = useMemo(() => {
    return activeMacroEffectsV1.map((effect) => {
      const macroId = typeof effect.id === "string" ? effect.id : "";
      const card = macroId ? macroCardById.get(macroId) : undefined;
      const title =
        (typeof effect.name === "string" && effect.name.trim().length > 0
          ? effect.name
          : null) ??
        card?.name ??
        "Macro effect";
      const rarity =
        (typeof effect.rarity === "string" && effect.rarity.trim().length > 0
          ? effect.rarity
          : null) ??
        card?.rarity ??
        null;
      const rulesText = card?.rulesText ?? null;
      const tooltip =
        (typeof effect.tooltip === "string" && effect.tooltip.trim().length > 0
          ? effect.tooltip
          : null) ?? (macroId ? (macroTooltipById.get(macroId) ?? null) : null);
      const turnsRemaining =
        typeof effect.roundsRemaining === "number" &&
        Number.isFinite(effect.roundsRemaining)
          ? Math.max(0, Math.floor(effect.roundsRemaining))
          : null;
      const roundsApplied =
        typeof effect.roundsApplied === "number" &&
        Number.isFinite(effect.roundsApplied)
          ? Math.max(0, Math.floor(effect.roundsApplied))
          : null;
      const summary = tooltip ?? rulesText;

      return {
        id: macroId || title,
        title,
        rarityLabel: rarity ? rarity.replaceAll("_", " ") : null,
        rulesText,
        summary,
        turnsRemaining,
        roundsApplied,
      };
    });
  }, [activeMacroEffectsV1, macroCardById, macroTooltipById]);

  const currentUserOwnedTiles = useMemo(() => {
    if (!resolvedBoardTiles || !currentUserPlayer) {
      return [];
    }

    return resolvedBoardTiles.filter(
      (tile) =>
        ["PROPERTY", "RAIL", "UTILITY"].includes(tile.type) &&
        ownershipByTile[tile.index]?.owner_player_id === currentUserPlayer.id,
    );
  }, [currentUserPlayer, ownershipByTile, resolvedBoardTiles]);

  const collateralLoanLiability = useMemo(
    () =>
      activeLoans.reduce((total, loan) => {
        if (typeof loan.remaining_principal === "number") {
          return total + loan.remaining_principal;
        }
        return total + loan.principal;
      }, 0),
    [activeLoans],
  );

  const purchaseMortgageLiability = useMemo(
    () =>
      activePurchaseMortgages.reduce((total, mortgage) => {
        const principal = mortgage.principal_remaining ?? 0;
        const interest = mortgage.accrued_interest_unpaid ?? 0;
        return total + principal + interest;
      }, 0),
    [activePurchaseMortgages],
  );

  const totalLiabilities = useMemo(
    () => collateralLoanLiability + purchaseMortgageLiability,
    [collateralLoanLiability, purchaseMortgageLiability],
  );

  const netWorthBreakdown = useMemo(() => {
    if (!currentUserPlayer || !resolvedBoardTiles) {
      return null;
    }
    return computeAuthoritativeNetWorthBreakdown({
      currentCash: currentUserCash ?? 0,
      playerId: currentUserPlayer.id,
      boardTiles: resolvedBoardTiles,
      ownershipByTile,
      activeCollateralLoans: activeLoans,
      activePurchaseMortgages: activePurchaseMortgages.map((mortgage) => ({
        principal_remaining: mortgage.principal_remaining ?? 0,
        accrued_interest_unpaid: mortgage.accrued_interest_unpaid ?? 0,
      })),
      inlandExploredCells: gameState?.inland_explored_cells,
      boardPackEconomy: selectedBoardPack?.economy ?? DEFAULT_BOARD_PACK_ECONOMY,
    });
  }, [
    activeLoans,
    activePurchaseMortgages,
    currentUserCash,
    currentUserPlayer,
    gameState?.inland_explored_cells,
    ownershipByTile,
    resolvedBoardTiles,
    selectedBoardPack?.economy,
  ]);

  const totalAssets = useMemo(() => netWorthBreakdown?.assetValue ?? 0, [netWorthBreakdown]);

  const netWorth = useMemo(() => {
    if (netWorthBreakdown) {
      return netWorthBreakdown.netWorth;
    }
    return (currentUserCash ?? 0) - totalLiabilities;
  }, [currentUserCash, netWorthBreakdown, totalLiabilities]);

  const finalStandings = useMemo(
    () => gameOverState?.standings ?? [],
    [gameOverState?.standings],
  );

  const roundModeProgressLabel = useMemo(() => {
    if (gameMeta?.game_mode !== "round_mode") {
      return null;
    }
    const limit = gameMeta.round_limit ?? 0;
    const rounds = gameState?.rounds_elapsed ?? 0;
    return `Round Mode · ${rounds} / ${limit}`;
  }, [gameMeta?.game_mode, gameMeta?.round_limit, gameState?.rounds_elapsed]);

  const collateralizedTileIndexes = useMemo(
    () =>
      activeLoans
        .map((loan) => {
          if (typeof loan.collateral_tile_index === "number") {
            return loan.collateral_tile_index;
          }
          const loanWithTileIndex = loan as PlayerLoan & {
            tile_index?: number;
          };
          return typeof loanWithTileIndex.tile_index === "number"
            ? loanWithTileIndex.tile_index
            : null;
        })
        .filter((tileIndex): tileIndex is number => tileIndex !== null),
    [activeLoans],
  );

  const taxableAssetValueForLuxuryTax = useMemo(
    () =>
      computeTaxableAssetValueForLuxuryTax(
        currentUserOwnedTiles,
        collateralizedTileIndexes,
      ),
    [collateralizedTileIndexes, currentUserOwnedTiles],
  );

  // Reserved for upcoming Luxury Tax rule wiring on tax tiles.
  void taxableAssetValueForLuxuryTax;

  const isGameReady =
    !loading &&
    !needsAuth &&
    !gameMetaError &&
    Boolean(session?.access_token) &&
    Boolean(routeGameId) &&
    Boolean(gameMeta) &&
    Boolean(resolvedBoardTiles?.length) &&
    Boolean(gameState) &&
    playersLoaded;
  const isConfigured = Boolean(session?.access_token);
  const canShowIntro =
    isConfigured && Boolean(routeGameId) && !needsAuth && !gameMetaError;
  const shouldShowIntro = canShowIntro && (!loadingMinElapsed || !isGameReady);
  const loadingProgress = Math.min(
    (loadingElapsedMs / MIN_LOADING_SCREEN_MS) * 100,
    100,
  );

  const selectedTile = useMemo(() => {
    if (selectedTileIndex === null) {
      return null;
    }
    const boardTiles = resolvedBoardTiles ?? [];
    return boardTiles.find((tile) => tile.index === selectedTileIndex) ?? null;
  }, [selectedBoardPack, selectedTileIndex]);

  const inlandCellsByKey = useMemo(
    () => normalizeInlandCellRecords(gameState?.inland_explored_cells),
    [gameState?.inland_explored_cells],
  );

  const exploredInteriorCellKeys = useMemo(
    () => new Set(Array.from(inlandCellsByKey.keys())),
    [inlandCellsByKey],
  );

  const currentUserExploredInteriorCellKeys = useMemo(() => {
    if (!currentUserPlayerId) {
      return new Set<string>();
    }
    return new Set(
      Array.from(inlandCellsByKey.values())
        .filter((record) => record.ownerPlayerId === currentUserPlayerId)
        .map((record) => record.key),
    );
  }, [currentUserPlayerId, inlandCellsByKey]);

  const selectedInteriorCellKey = useMemo(
    () => (selectedInteriorCell ? toInlandCellKey(selectedInteriorCell) : null),
    [selectedInteriorCell],
  );

  const selectedInlandCellRecord = useMemo(() => {
    if (!selectedInteriorCellKey) {
      return null;
    }
    return inlandCellsByKey.get(selectedInteriorCellKey) ?? null;
  }, [inlandCellsByKey, selectedInteriorCellKey]);

  const selectedInlandSiteInfo = useMemo(() => {
    if (!selectedInlandCellRecord || !selectedInteriorCell) {
      return null;
    }
    const ownerName = selectedInlandCellRecord.ownerPlayerId
      ? (players.find((player) => player.id === selectedInlandCellRecord.ownerPlayerId)?.display_name ??
        "Player")
      : "Unowned";
    const salePrice = getInlandBankSalePrice(selectedInlandCellRecord, inlandGoSalary);
    const isBankSellable = isBankSellableInlandCell(selectedInlandCellRecord) && salePrice !== null;
    const canAffordPurchase = isBankSellable && (currentUserCash ?? 0) >= (salePrice ?? 0);

    if (selectedInlandCellRecord.status === "DISCOVERED_RESOURCE") {
      if (!selectedInlandCellRecord.discoveredResourceType) {
        return null;
      }
      const resourceConfig = getInlandResourceConfig(selectedInlandCellRecord.discoveredResourceType);
      return {
        name: `${resourceConfig.icon} ${resourceConfig.label}`,
        stageLabel: "Discovered inland resource",
        ownerLabel: ownerName,
        locationLabel: `${selectedInteriorCell.row}:${selectedInteriorCell.col}`,
        passiveIncomeLabel: null,
        perks: ["Can be developed later for recurring passive income."],
        salePriceLabel: isBankSellable && salePrice !== null ? formatMoney(salePrice) : null,
        saleStatusLabel: isBankSellable ? "Bank sale available" : "Informational only",
        canBuy: canAffordPurchase,
        showBuyAction: isBankSellable,
        buyButtonLabel: "Buy resource claim",
      };
    }

    if (selectedInlandCellRecord.status === "EXPLORED_EMPTY") {
      return {
        name: "🟫 Explored inland tile",
        stageLabel: "Explored empty",
        ownerLabel: ownerName,
        locationLabel: `${selectedInteriorCell.row}:${selectedInteriorCell.col}`,
        passiveIncomeLabel: null,
        perks: ["Explored and mapped. No extractable resource on this tile."],
        salePriceLabel: null,
        saleStatusLabel: "Not for sale",
        canBuy: false,
        showBuyAction: false,
        buyButtonLabel: "Buy",
      };
    }

    if (selectedInlandCellRecord.status !== "DEVELOPED_SITE" || !selectedInlandCellRecord.developedSiteType) {
      return null;
    }
    const siteConfig = getInlandResourceConfig(selectedInlandCellRecord.developedSiteType);
    const sitePerkLines: string[] = [];
    if (siteConfig.passiveIncomeMultiplierPerTurn) {
      sitePerkLines.push("Generates recurring passive income each full round.");
    }
    if (selectedInlandCellRecord.developedSiteType === "OIL") {
      sitePerkLines.push("Oil/Rail synergy: railroad rent contributes an oil refinery bonus pool.");
      sitePerkLines.push("Vertical integration: rail owners with oil refineries receive an additional rail bonus.");
    }
    if (selectedInlandCellRecord.developedSiteType === "COAL") {
      sitePerkLines.push("Coal/Utility synergy: electric utility rent contributes a coal-site bonus pool.");
      sitePerkLines.push("Vertical integration: electric utility owners with coal sites receive an additional utility bonus.");
    }
    return {
      name: `${siteConfig.icon} ${siteConfig.label}`,
      stageLabel: "Developed inland site",
      ownerLabel: ownerName,
      passiveIncomeLabel: formatMoney(
        getInlandPassiveIncomePerTurn(selectedInlandCellRecord.developedSiteType, inlandGoSalary),
      ),
      perks: sitePerkLines,
      locationLabel: `${selectedInteriorCell.row}:${selectedInteriorCell.col}`,
      salePriceLabel: isBankSellable && salePrice !== null ? formatMoney(salePrice) : null,
      saleStatusLabel: isBankSellable ? "Bank sale available" : "Not for sale",
      canBuy: canAffordPurchase,
      showBuyAction: isBankSellable,
      buyButtonLabel: "Buy developed site",
    };
  }, [
    currentUserCash,
    formatMoney,
    inlandGoSalary,
    players,
    selectedInlandCellRecord,
    selectedInteriorCell,
  ]);

  const isOwnedDiscoveredDecisionCell = useMemo(() => {
    if (!selectedInlandCellRecord || !currentUserPlayerId) {
      return false;
    }
    return (
      selectedInlandCellRecord.status === "DISCOVERED_RESOURCE" &&
      selectedInlandCellRecord.ownerPlayerId === currentUserPlayerId
    );
  }, [currentUserPlayerId, selectedInlandCellRecord]);

  const selectedDiscoveredDecisionResourceType = useMemo(() => {
    if (!isOwnedDiscoveredDecisionCell) {
      return null;
    }
    return selectedInlandCellRecord?.discoveredResourceType ?? null;
  }, [isOwnedDiscoveredDecisionCell, selectedInlandCellRecord]);

  const isBuyBankOwnedInlandLoading = actionLoading === "BUY_BANK_OWNED_INTERIOR_SITE";

  const selectedInlandBuyDisabledReason = useMemo(() => {
    if (!selectedInlandSiteInfo?.showBuyAction) {
      return null;
    }
    if (!isMyTurn) {
      return "Only available during your turn.";
    }
    if (hasBlockingPendingAction || auctionActive) {
      return "Resolve pending decisions before buying.";
    }
    if (!selectedInlandSiteInfo.canBuy) {
      return "Insufficient cash.";
    }
    return null;
  }, [auctionActive, hasBlockingPendingAction, isMyTurn, selectedInlandSiteInfo]);

  const canSubmitSelectedInlandBuy = useMemo(
    () =>
      Boolean(
        selectedInlandSiteInfo?.showBuyAction &&
          !selectedInlandBuyDisabledReason &&
          selectedInteriorCell,
      ),
    [selectedInlandBuyDisabledReason, selectedInlandSiteInfo, selectedInteriorCell],
  );

  const selectedInlandSitePanelBuyHandler = useCallback(() => {
    if (!selectedInteriorCell || !canSubmitSelectedInlandBuy) {
      return;
    }
    void handleBuyBankOwnedInlandSite(selectedInteriorCell);
  }, [canSubmitSelectedInlandBuy, handleBuyBankOwnedInlandSite, selectedInteriorCell]);

  const selectedInlandSitePanelProps = useMemo(() => {
    if (!selectedInlandSiteInfo) {
      return null;
    }
    return {
      ...selectedInlandSiteInfo,
      canBuy: canSubmitSelectedInlandBuy,
      onBuy: selectedInlandSitePanelBuyHandler,
      isBuying: isBuyBankOwnedInlandLoading,
      buyDisabledReason: selectedInlandBuyDisabledReason,
    };
  }, [
    canSubmitSelectedInlandBuy,
    isBuyBankOwnedInlandLoading,
    selectedInlandBuyDisabledReason,
    selectedInlandSiteInfo,
    selectedInlandSitePanelBuyHandler,
  ]);

  const selectedDevelopedInlandSiteInfo = useMemo(
    () => selectedInlandSitePanelProps,
    [selectedInlandSitePanelProps],
  );

  const currentUserOwnedTileIndices = useMemo(() => {
    if (!currentUserPlayerId) {
      return [] as number[];
    }
    return Object.entries(ownershipByTile)
      .filter(([, ownership]) => ownership.owner_player_id === currentUserPlayerId)
      .map(([tileIndex]) => Number(tileIndex))
      .filter((tileIndex) => Number.isInteger(tileIndex));
  }, [currentUserPlayerId, ownershipByTile]);

  const canExploreSelectedInteriorCell = useMemo(() => {
    if (!selectedInteriorCell) {
      return false;
    }
    if (
      !currentUserPlayerId ||
      currentUserPlayerId !== turnPlayerId ||
      gameState?.pending_action ||
      gameState?.pending_card_active ||
      gameState?.auction_active
    ) {
      return false;
    }
    return canExploreInlandCell({
      cell: selectedInteriorCell,
      exploredKeys: exploredInteriorCellKeys,
      playerExploredKeys: currentUserExploredInteriorCellKeys,
      ownedTileIndices: currentUserOwnedTileIndices,
    });
  }, [
    currentUserExploredInteriorCellKeys,
    currentUserOwnedTileIndices,
    currentUserPlayerId,
    exploredInteriorCellKeys,
    gameState?.auction_active,
    gameState?.pending_action,
    gameState?.pending_card_active,
    selectedInteriorCell,
    turnPlayerId,
  ]);

  const selectedOwnerId =
    selectedTileIndex === null
      ? null
      : (ownershipByTile[selectedTileIndex]?.owner_player_id ?? null);

  const selectedOwnerLabel = useMemo(() => {
    if (!selectedOwnerId) {
      return "Unowned";
    }
    return (
      players.find((player) => player.id === selectedOwnerId)?.display_name ??
      selectedOwnerId
    );
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

  const selectedTileStatusLabel = useMemo(() => {
    if (!selectedOwnerId) {
      return "Available";
    }
    if (selectedTileStatus === "None") {
      return "Owned";
    }
    return selectedTileStatus;
  }, [selectedOwnerId, selectedTileStatus]);

  const selectedTileCurrentRent = useMemo(() => {
    if (!selectedTile || !selectedBoardPack) {
      return null;
    }
    return getCurrentTileRent({
      tile: selectedTile,
      ownershipByTile,
      boardTiles: resolvedBoardTiles,
      economy: selectedBoardPack.economy,
    });
  }, [ownershipByTile, selectedBoardPack, selectedTile]);

  const selectedTileDevelopmentCount = useMemo(() => {
    if (selectedTileIndex === null) {
      return 0;
    }
    return ownershipByTile[selectedTileIndex]?.houses ?? 0;
  }, [ownershipByTile, selectedTileIndex]);

  const selectedTileIsUpgradeable = useMemo(() => {
    if (!selectedTile || selectedTile.type !== "PROPERTY") {
      return false;
    }
    return typeof selectedTile.houseCost === "number";
  }, [selectedTile]);

  const selectedTileMaxUpgradeLevel = useMemo(() => {
    if (!selectedTileIsUpgradeable || !selectedTile?.rentByHouses?.length) {
      return 0;
    }
    return Math.max(selectedTile.rentByHouses.length - 1, 0);
  }, [selectedTile, selectedTileIsUpgradeable]);

  const selectedTileIsFullyUpgraded =
    selectedTileIsUpgradeable &&
    selectedTileDevelopmentCount >= selectedTileMaxUpgradeLevel;

  const selectedTileNextRent = useMemo(() => {
    if (
      !selectedTile ||
      !selectedTileIsUpgradeable ||
      selectedTileIsFullyUpgraded
    ) {
      return null;
    }
    return getPropertyRentWithDevelopment(
      selectedTile,
      selectedTileDevelopmentCount + 1,
    );
  }, [
    selectedTile,
    selectedTileDevelopmentCount,
    selectedTileIsFullyUpgraded,
    selectedTileIsUpgradeable,
  ]);

  const selectedOwnerRailCount = useMemo(() => {
    if (!selectedOwnerId) {
      return 0;
    }
    const boardTiles = resolvedBoardTiles ?? [];
    return boardTiles.filter(
      (tile) =>
        tile.type === "RAIL" &&
        ownershipByTile[tile.index]?.owner_player_id === selectedOwnerId,
    ).length;
  }, [ownershipByTile, selectedBoardPack, selectedOwnerId]);

  const selectedOwnerUtilityCount = useMemo(() => {
    if (!selectedOwnerId) {
      return 0;
    }
    const boardTiles = resolvedBoardTiles ?? [];
    return boardTiles.filter(
      (tile) =>
        tile.type === "UTILITY" &&
        ownershipByTile[tile.index]?.owner_player_id === selectedOwnerId,
    ).length;
  }, [ownershipByTile, selectedBoardPack, selectedOwnerId]);

  const ownedProperties = useMemo(() => {
    if (!resolvedBoardTiles || !currentUserPlayer) {
      return [];
    }

    return resolvedBoardTiles
      .filter(
        (tile) =>
          ["PROPERTY", "RAIL", "UTILITY"].includes(tile.type) &&
          ownershipByTile[tile.index]?.owner_player_id === currentUserPlayer.id,
      )
      .map((tile) => {
        const ownership = ownershipByTile[tile.index];
        const isMyTurn = canAct;
        const isRecoveryTurn = canUseRecoveryActions;
        const canUseWalletPropertyActions = isMyTurn || isRecoveryTurn;
        const isCollateralized = Boolean(ownership?.collateral_loan_id);
        const isPurchaseMortgaged = Boolean(ownership?.purchase_mortgage_id);
        const housesCount = ownership?.houses ?? 0;
        const developmentLabel = getDevelopmentLevelLabel(
          housesCount,
          tile.rentByHouses,
        );
        const hasFullSet = ownsFullColorSet(
          tile,
          resolvedBoardTiles,
          ownershipByTile,
          currentUserPlayer.id,
        );
        const tilePrice = tile.price ?? 0;
        const currentRent = getCurrentTileRent({
          tile,
          ownershipByTile,
          boardTiles: resolvedBoardTiles,
          economy: selectedBoardPack.economy,
        });

        const buildHouseDisabledReason = !isMyTurn
          ? "Not your turn"
          : !hasFullSet
            ? "Need full set"
            : isCollateralized
              ? "Already collateralized"
              : null;
        const sellHouseDisabledReason = !isMyTurn
          ? "Not your turn"
          : housesCount === 0
            ? "No upgrades to downgrade"
            : null;
        const sellHotelDisabledReason = !isMyTurn
          ? "Not your turn"
          : housesCount < 5
            ? "Need top level first"
            : null;
        const collateralDisabledReason = !canUseWalletPropertyActions
          ? "Not your turn"
          : isCollateralized
            ? "Already collateralized"
            : isPurchaseMortgaged
              ? "Mortgaged at purchase"
              : housesCount > 0
                ? "Remove upgrades first"
                : !rules.loanCollateralEnabled
                  ? "Collateral loans disabled"
                  : null;
        const sellToMarketDisabledReason = !canUseWalletPropertyActions
          ? "Not your turn"
          : housesCount > 0
            ? "Remove upgrades first"
            : isCollateralized
              ? "Already collateralized"
              : isPurchaseMortgaged
                ? "Mortgaged at purchase"
                : null;

        return {
          tile,
          isMyTurn,
          isRecoveryTurn,
          isCollateralized,
          isPurchaseMortgaged,
          housesCount,
          developmentLabel,
          hasFullSet,
          tilePrice,
          currentRent,
          canBuildHouse:
            tile.type === "PROPERTY" && buildHouseDisabledReason === null,
          canSellHouse:
            tile.type === "PROPERTY" && sellHouseDisabledReason === null,
          canSellHotel:
            tile.type === "PROPERTY" && sellHotelDisabledReason === null,
          canSellToMarket: sellToMarketDisabledReason === null,
          buildHouseDisabledReason,
          sellHouseDisabledReason,
          sellHotelDisabledReason,
          sellToMarketDisabledReason,
          collateralDisabledReason,
        };
      });
  }, [
    canAct,
    canUseRecoveryActions,
    currentUserPlayer,
    ownershipByTile,
    rules.loanCollateralEnabled,
    selectedBoardPack?.economy,
    resolvedBoardTiles,
  ]);

  const availableTradeCounterparties = useMemo(() => {
    if (!currentUserPlayer) {
      return [];
    }
    return players
      .filter(
        (player) => player.id !== currentUserPlayer.id && !player.is_eliminated,
      )
      .map((player) => ({ id: player.id, displayName: player.display_name }));
  }, [currentUserPlayer, players]);

  const counterpartyOwnedProperties = useMemo(() => {
    if (!tradeCounterpartyId || !resolvedBoardTiles) {
      return [];
    }

    return resolvedBoardTiles
      .filter(
        (tile) =>
          ["PROPERTY", "RAIL", "UTILITY"].includes(tile.type) &&
          ownershipByTile[tile.index]?.owner_player_id === tradeCounterpartyId,
      )
      .map((tile) => ({
        tileIndex: tile.index,
        tileName: tile.name,
        houses: ownershipByTile[tile.index]?.houses ?? 0,
      }));
  }, [ownershipByTile, resolvedBoardTiles, tradeCounterpartyId]);

  const canSubmitTradeProposal = useMemo(() => {
    return (
      Boolean(tradeCounterpartyId) &&
      hasTradeValue({
        offerCash: tradeOfferCash,
        offerFreeBuildTokens: tradeOfferFreeBuildTokens,
        offerFreeUpgradeTokens: tradeOfferFreeUpgradeTokens,
        offerTiles: tradeOfferTiles,
        requestCash: tradeRequestCash,
        requestFreeBuildTokens: tradeRequestFreeBuildTokens,
        requestFreeUpgradeTokens: tradeRequestFreeUpgradeTokens,
        requestTiles: tradeRequestTiles,
      })
    );
  }, [
    tradeCounterpartyId,
    tradeOfferCash,
    tradeOfferFreeBuildTokens,
    tradeOfferFreeUpgradeTokens,
    tradeOfferTiles,
    tradeRequestCash,
    tradeRequestFreeBuildTokens,
    tradeRequestFreeUpgradeTokens,
    tradeRequestTiles,
  ]);

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

  const incomingTradeSnapshotTiles = useMemo(
    () => normalizeTradeSnapshot(incomingTradeProposal?.snapshot ?? null),
    [incomingTradeProposal?.snapshot],
  );

  const getPlayerNameById = useCallback(
    (playerId: string | null | undefined) => {
      if (!playerId) {
        return "Player";
      }
      return (
        players.find((player) => player.id === playerId)?.display_name ??
        "Player"
      );
    },
    [players],
  );

  const getTileNameByIndex = useCallback(
    (tileIndex: number) => {
      return boardTilesByIndex.get(tileIndex)?.name ?? `Tile ${tileIndex}`;
    },
    [boardTilesByIndex],
  );

  const incomingTradeCounterpartyName = incomingTradeProposal
    ? getPlayerNameById(incomingTradeProposal.proposer_player_id)
    : "";
  const incomingTradeOfferFreeBuildTokens =
    incomingTradeProposal?.offer_free_build_tokens ?? 0;
  const incomingTradeOfferFreeUpgradeTokens =
    incomingTradeProposal?.offer_free_upgrade_tokens ?? 0;
  const incomingTradeRequestFreeBuildTokens =
    incomingTradeProposal?.request_free_build_tokens ?? 0;
  const incomingTradeRequestFreeUpgradeTokens =
    incomingTradeProposal?.request_free_upgrade_tokens ?? 0;
  const formatTradeMoney = useCallback(
    (amount: number) => {
      return formatMoney(amount);
    },
    [formatMoney],
  );
  useEffect(() => {
    if (
      tradeCounterpartyId &&
      availableTradeCounterparties.some(
        (option) => option.id === tradeCounterpartyId,
      )
    ) {
      return;
    }

    setTradeCounterpartyId(availableTradeCounterparties[0]?.id ?? "");
    setTradeRequestTiles([]);
  }, [availableTradeCounterparties, tradeCounterpartyId]);

  const handleSubmitTradeProposal = useCallback(async () => {
    if (!tradeCounterpartyId) {
      setNotice("Select a player to trade with.");
      return;
    }

    if (
      !hasTradeValue({
        offerCash: tradeOfferCash,
        offerFreeBuildTokens: tradeOfferFreeBuildTokens,
        offerFreeUpgradeTokens: tradeOfferFreeUpgradeTokens,
        offerTiles: tradeOfferTiles,
        requestCash: tradeRequestCash,
        requestFreeBuildTokens: tradeRequestFreeBuildTokens,
        requestFreeUpgradeTokens: tradeRequestFreeUpgradeTokens,
        requestTiles: tradeRequestTiles,
      })
    ) {
      setNotice("Add cash, properties, or vouchers to the trade.");
      return;
    }

    await handleBankAction({
      action: "PROPOSE_TRADE",
      counterpartyPlayerId: tradeCounterpartyId,
      offerCash: toOptionalPositiveCash(tradeOfferCash),
      offerFreeBuildTokens: toOptionalPositiveCash(tradeOfferFreeBuildTokens),
      offerFreeUpgradeTokens: toOptionalPositiveCash(tradeOfferFreeUpgradeTokens),
      offerTiles: toOptionalTileIndices(tradeOfferTiles),
      requestCash: toOptionalPositiveCash(tradeRequestCash),
      requestFreeBuildTokens: toOptionalPositiveCash(
        tradeRequestFreeBuildTokens,
      ),
      requestFreeUpgradeTokens: toOptionalPositiveCash(
        tradeRequestFreeUpgradeTokens,
      ),
      requestTiles: toOptionalTileIndices(tradeRequestTiles),
    });
  }, [
    handleBankAction,
    tradeCounterpartyId,
    tradeOfferCash,
    tradeOfferFreeBuildTokens,
    tradeOfferFreeUpgradeTokens,
    tradeOfferTiles,
    tradeRequestCash,
    tradeRequestFreeBuildTokens,
    tradeRequestFreeUpgradeTokens,
    tradeRequestTiles,
  ]);

  const toggleOfferTile = useCallback((tileIndex: number, checked: boolean) => {
    setTradeOfferTiles((current) =>
      checked
        ? Array.from(new Set([...current, tileIndex]))
        : current.filter((entry) => entry !== tileIndex),
    );
  }, []);

  const toggleRequestTile = useCallback(
    (tileIndex: number, checked: boolean) => {
      setTradeRequestTiles((current) =>
        checked
          ? Array.from(new Set([...current, tileIndex]))
          : current.filter((entry) => entry !== tileIndex),
      );
    },
    [],
  );

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

  const handleCancelOutgoingTrade = useCallback(
    (tradeId: string) => {
      void handleBankAction({ action: "CANCEL_TRADE", tradeId });
    },
    [handleBankAction],
  );

  const outgoingPendingTrade = useMemo(() => {
    if (!currentUserPlayer) {
      return null;
    }
    return (
      tradeProposals.find(
        (proposal) =>
          proposal.status === "PENDING" &&
          proposal.proposer_player_id === currentUserPlayer.id,
      ) ?? null
    );
  }, [currentUserPlayer, tradeProposals]);

  const ownTradePropertyOptions = useMemo(
    () =>
      ownedProperties.map((entry) => ({
        tileIndex: entry.tile.index,
        tileName: entry.tile.name,
        houses: entry.housesCount,
      })),
    [ownedProperties],
  );

  const handleOwnedActionClick = useCallback(
    (args: {
      tileIndex: number;
      actionKey:
        | "BUILD_HOUSE"
        | "SELL_HOUSE"
        | "SELL_TO_MARKET"
        | "TAKE_COLLATERAL_LOAN";
      allowed: boolean;
      reason: string | null;
      run: () => void;
    }) => {
      const { tileIndex, actionKey, allowed, reason, run } = args;

      if (allowed) {
        setOwnedActionReason(null);
        if (ownedReasonTimeoutRef.current) {
          clearTimeout(ownedReasonTimeoutRef.current);
          ownedReasonTimeoutRef.current = null;
        }
        run();
        return;
      }

      const isSameReason =
        ownedActionReason?.tileIndex === tileIndex &&
        ownedActionReason?.actionKey === actionKey;

      if (isSameReason) {
        setOwnedActionReason(null);
        if (ownedReasonTimeoutRef.current) {
          clearTimeout(ownedReasonTimeoutRef.current);
          ownedReasonTimeoutRef.current = null;
        }
        return;
      }

      if (reason) {
        setOwnedActionReason({ tileIndex, actionKey, reason });
        if (ownedReasonTimeoutRef.current) {
          clearTimeout(ownedReasonTimeoutRef.current);
        }
        ownedReasonTimeoutRef.current = setTimeout(() => {
          setOwnedActionReason((prev) =>
            prev?.tileIndex === tileIndex && prev.actionKey === actionKey
              ? null
              : prev,
          );
        }, 4000);
      }
    },
    [ownedActionReason],
  );

  const openBuildUpgradeConfirmation = useCallback(
    (args: {
      tileIndex: number;
      tileName: string;
      currentLevel: number;
      rentByHouses?: number[] | null;
      houseCost?: number;
      useConstructionVoucher?: "BUILD" | "UPGRADE";
    }) => {
      const {
        tileIndex,
        tileName,
        currentLevel,
        rentByHouses,
        houseCost,
        useConstructionVoucher,
      } = args;
      const targetLevel = currentLevel + 1;
      const targetPresentation = getDevelopmentUpgradePresentation(
        targetLevel,
        rentByHouses,
      );
      const formattedCost = formatMoney(houseCost ?? null);
      const hasCashCost = houseCost !== undefined && houseCost !== null;
      const { question, paymentSummary } = getBuildUpgradeConfirmationCopy({
        currentLevel,
        targetLabel: targetPresentation.label,
        useConstructionVoucher,
        formattedCost,
        hasCashCost,
      });

      setBuildUpgradeConfirmation({
        tileIndex,
        tileName,
        targetLevel: targetPresentation.level,
        targetLabel: targetPresentation.label,
        targetNarrative: targetPresentation.narrative,
        targetSpriteSrc: targetPresentation.spriteSrc,
        useConstructionVoucher,
        question,
        paymentSummary,
      });
    },
    [formatMoney],
  );

  const walletOwnedContent = useMemo(() => {
    if (!selectedBoardPack) {
      return null;
    }

    if (ownedProperties.length === 0) {
      return (
        <p className="text-sm text-white/70">No owned properties available.</p>
      );
    }

    return (
      <div className="space-y-2">
        <div className="rounded-lg border border-indigo-200/20 bg-indigo-500/10 px-2.5 py-2 text-[11px] text-indigo-100/90">
          Vouchers · Build {currentPlayerFreeBuildTokens} · Upgrade {currentPlayerFreeUpgradeTokens}
        </div>
        {ownedProperties.map((entry) => {
          const {
            tile,
            housesCount,
            developmentLabel,
            isCollateralized,
            isPurchaseMortgaged,
            currentRent,
            canBuildHouse,
            canSellHouse,
            canSellToMarket,
            buildHouseDisabledReason,
            sellHouseDisabledReason,
            sellToMarketDisabledReason,
            collateralDisabledReason,
          } = entry;
          const activeReasonForTile =
            ownedActionReason?.tileIndex === tile.index
              ? ownedActionReason
              : null;
          const canUseBuildVoucher =
            canBuildHouse &&
            housesCount === 0 &&
            currentPlayerFreeBuildTokens > 0;
          const canUseUpgradeVoucher =
            canBuildHouse &&
            housesCount > 0 &&
            currentPlayerFreeUpgradeTokens > 0;

          return (
            <div
              key={tile.index}
              className="space-y-2 rounded-lg border border-white/15 bg-white/5 p-2.5"
            >
              <div className="flex items-start justify-between gap-2 text-xs">
                <p className="font-semibold text-white">{tile.name}</p>
                <p className="text-white/80">Rent {formatMoney(currentRent)}</p>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="space-y-1">
                  <button
                    type="button"
                    className={`w-full rounded-md px-2 py-1 text-[11px] font-semibold text-white ${
                      canBuildHouse
                        ? "bg-emerald-600"
                        : "cursor-pointer bg-emerald-900/40 text-white/60"
                    }`}
                    title={buildHouseDisabledReason ?? undefined}
                    onClick={() =>
                      handleOwnedActionClick({
                        tileIndex: tile.index,
                        actionKey: "BUILD_HOUSE",
                        allowed:
                          canBuildHouse && actionLoading !== "BUILD_HOUSE",
                        reason:
                          actionLoading === "BUILD_HOUSE"
                            ? null
                            : buildHouseDisabledReason,
                        run: () =>
                          openBuildUpgradeConfirmation({
                            tileIndex: tile.index,
                            tileName: tile.name,
                            currentLevel: housesCount,
                            rentByHouses: tile.rentByHouses,
                            houseCost: tile.houseCost,
                          }),
                      })
                    }
                  >
                    {actionLoading === "BUILD_HOUSE" ? "Upgrading…" : "Upgrade"}
                  </button>
                  {activeReasonForTile?.actionKey === "BUILD_HOUSE" ? (
                    <p className="text-[10px] text-red-300">
                      {activeReasonForTile.reason}
                    </p>
                  ) : null}
                  {(canUseBuildVoucher || canUseUpgradeVoucher) ? (
                    <button
                      type="button"
                      className="w-full rounded-md border border-indigo-300/40 bg-indigo-500/25 px-2 py-1 text-[11px] font-semibold text-indigo-100"
                      disabled={actionLoading === "BUILD_HOUSE"}
                      onClick={() =>
                        openBuildUpgradeConfirmation({
                          tileIndex: tile.index,
                          tileName: tile.name,
                          currentLevel: housesCount,
                          rentByHouses: tile.rentByHouses,
                          houseCost: tile.houseCost,
                          useConstructionVoucher: canUseBuildVoucher
                            ? "BUILD"
                            : "UPGRADE",
                        })
                      }
                    >
                      {canUseBuildVoucher ? "Use Build Voucher" : "Use Upgrade Voucher"}
                    </button>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <button
                    type="button"
                    className={`w-full rounded-md border px-2 py-1 text-[11px] font-semibold ${
                      canSellHouse
                        ? "border-white/30 text-white"
                        : "cursor-pointer border-white/10 text-white/40"
                    }`}
                    title={sellHouseDisabledReason ?? undefined}
                    onClick={() =>
                      handleOwnedActionClick({
                        tileIndex: tile.index,
                        actionKey: "SELL_HOUSE",
                        allowed: canSellHouse && actionLoading !== "SELL_HOUSE",
                        reason:
                          actionLoading === "SELL_HOUSE"
                            ? null
                            : sellHouseDisabledReason,
                        run: () =>
                          void handleBankAction({
                            action: "SELL_HOUSE",
                            tileIndex: tile.index,
                          }),
                      })
                    }
                  >
                    {actionLoading === "SELL_HOUSE"
                      ? "Downgrading…"
                      : "Downgrade"}
                  </button>
                  {activeReasonForTile?.actionKey === "SELL_HOUSE" ? (
                    <p className="text-[10px] text-red-300">
                      {activeReasonForTile.reason}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <button
                    type="button"
                    className={`w-full rounded-md border px-2 py-1 text-[11px] font-semibold ${
                      canSellToMarket
                        ? "border-white/30 text-white"
                        : "cursor-pointer border-white/10 text-white/40"
                    }`}
                    title={sellToMarketDisabledReason ?? undefined}
                    onClick={() =>
                      handleOwnedActionClick({
                        tileIndex: tile.index,
                        actionKey: "SELL_TO_MARKET",
                        allowed:
                          canSellToMarket && actionLoading !== "SELL_TO_MARKET",
                        reason:
                          actionLoading === "SELL_TO_MARKET"
                            ? null
                            : sellToMarketDisabledReason,
                        run: () => setSellToMarketTileIndex(tile.index),
                      })
                    }
                  >
                    {actionLoading === "SELL_TO_MARKET"
                      ? "Selling…"
                      : "Sell to Market"}
                  </button>
                  {activeReasonForTile?.actionKey === "SELL_TO_MARKET" ? (
                    <p className="text-[10px] text-red-300">
                      {activeReasonForTile.reason}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <button
                    type="button"
                    className={`w-full rounded-md px-2 py-1 text-[11px] font-semibold ${
                      collateralDisabledReason === null
                        ? "bg-white/90 text-neutral-900"
                        : "cursor-pointer bg-white/20 text-white/50"
                    }`}
                    title={collateralDisabledReason ?? undefined}
                    onClick={() =>
                      handleOwnedActionClick({
                        tileIndex: tile.index,
                        actionKey: "TAKE_COLLATERAL_LOAN",
                        allowed:
                          collateralDisabledReason === null &&
                          actionLoading !== "TAKE_COLLATERAL_LOAN",
                        reason:
                          actionLoading === "TAKE_COLLATERAL_LOAN"
                            ? null
                            : collateralDisabledReason,
                        run: () =>
                          void handleBankAction({
                            action: "TAKE_COLLATERAL_LOAN",
                            tileIndex: tile.index,
                          }),
                      })
                    }
                  >
                    {actionLoading === "TAKE_COLLATERAL_LOAN"
                      ? "Collateralizing…"
                      : "Collateralize"}
                  </button>
                  {activeReasonForTile?.actionKey === "TAKE_COLLATERAL_LOAN" ? (
                    <p className="text-[10px] text-red-300">
                      {activeReasonForTile.reason}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-white/65">
                <span>
                  Upgrade: Lv {housesCount} • {developmentLabel}
                </span>
                {isPurchaseMortgaged ? (
                  <span className="rounded-full border border-amber-400/50 px-1.5 py-0.5 text-amber-200">
                    Mortgaged
                  </span>
                ) : null}
                {isCollateralized ? (
                  <span className="rounded-full border border-orange-400/50 px-1.5 py-0.5 text-orange-200">
                    Collateralized
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [
    actionLoading,
    handleBankAction,
    handleOwnedActionClick,
    openBuildUpgradeConfirmation,
    ownedActionReason,
    ownedProperties,
    selectedBoardPack,
    currentPlayerFreeBuildTokens,
    currentPlayerFreeUpgradeTokens,
    formatMoney,
  ]);

  const handleConfirmSellToMarket = useCallback(() => {
    if (sellToMarketTileIndex === null) {
      return;
    }

    void handleBankAction({
      action: "SELL_TO_MARKET",
      tileIndex: sellToMarketTileIndex,
    });
    setSellToMarketTileIndex(null);
  }, [handleBankAction, sellToMarketTileIndex]);

  const walletLoansContent = useMemo(() => {
    if (activeLoans.length === 0) {
      return <p className="text-sm text-white/70">No active loans.</p>;
    }

    return (
      <div className="space-y-3">
        {activeLoans.map((loan) => {
          const tile =
            boardTilesByIndex.get(loan.collateral_tile_index) ?? null;
          const houses =
            ownershipByTile[loan.collateral_tile_index]?.houses ?? 0;
          const canDefault = canAct && houses === 0;
          const defaultDisabledReason =
            houses > 0 ? "Downgrade first" : !canAct ? "Not your turn" : null;
          const isPayoffLoading = actionLoading === "PAYOFF_COLLATERAL_LOAN";
          const isDefaultLoading = actionLoading === "DEFAULT_PROPERTY";

          return (
            <div
              key={loan.id}
              className="space-y-2 rounded-xl border border-white/15 bg-white/5 p-2"
            >
              {tile ? (
                <TitleDeedPreview
                  tile={tile}
                  bandColor={getTileBandColor(tile)}
                  boardPackEconomy={
                    selectedBoardPack?.economy ?? DEFAULT_BOARD_PACK_ECONOMY
                  }
                  mode="readonly"
                  size="compact"
                  showDevelopment={tile.type === "PROPERTY"}
                  developmentCount={houses}
                  ownerPlayerId={currentUserPlayer?.id ?? null}
                  ownershipByTile={ownershipByTile}
                  boardTiles={resolvedBoardTiles ?? []}
                  ownedRailCount={
                    resolvedBoardTiles.filter(
                      (boardTile) =>
                        boardTile.type === "RAIL" &&
                        ownershipByTile[boardTile.index]?.owner_player_id ===
                          currentUserPlayer?.id,
                    ).length ?? 0
                  }
                  ownedUtilityCount={
                    resolvedBoardTiles.filter(
                      (boardTile) =>
                        boardTile.type === "UTILITY" &&
                        ownershipByTile[boardTile.index]?.owner_player_id ===
                          currentUserPlayer?.id,
                    ).length ?? 0
                  }
                />
              ) : null}
              <div className="space-y-1 px-1 text-xs text-white/80">
                <p className="text-sm font-semibold text-white">
                  {tile?.name ?? `Tile ${loan.collateral_tile_index}`}
                </p>
                <p>
                  Remaining principal:{" "}
                  {formatMoney(loan.remaining_principal ?? loan.principal)}
                </p>
                <p>Payment / turn: {formatMoney(loan.payment_per_turn)}</p>
                <p>Turns remaining: {loan.turns_remaining}</p>
                <p>
                  Rate / turn: {((loan.rate_per_turn ?? 0) * 100).toFixed(2)}%
                </p>
              </div>
              <div className="flex flex-wrap gap-2 px-1 pb-1">
                <button
                  type="button"
                  className="rounded-md border border-white/30 px-2 py-1 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
                  disabled={!canAct || isPayoffLoading}
                  title={!canAct ? "Not your turn" : undefined}
                  onClick={() => setPayoffLoanId(loan.id)}
                >
                  {isPayoffLoading ? "Paying…" : "Pay off"}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-rose-400/60 px-2 py-1 text-[11px] font-semibold text-rose-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
                  disabled={!canDefault || isDefaultLoading}
                  title={defaultDisabledReason ?? undefined}
                  onClick={() =>
                    setDefaultLoanTileIndex(loan.collateral_tile_index)
                  }
                >
                  {isDefaultLoading ? "Defaulting…" : "Default"}
                </button>
              </div>
              {defaultDisabledReason ? (
                <p className="px-1 pb-1 text-[11px] text-white/50">
                  {defaultDisabledReason}
                </p>
              ) : null}
              {payoffLoanId === loan.id ? (
                <div className="mx-1 rounded-lg border border-amber-300/50 bg-amber-100/10 p-2 text-xs text-white">
                  <p className="font-semibold">Pay off collateral loan?</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white"
                      disabled={isPayoffLoading}
                      onClick={() => {
                        void handleBankAction("PAYOFF_COLLATERAL_LOAN", {
                          loanId: loan.id,
                        });
                        setPayoffLoanId(null);
                      }}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      className="rounded border border-white/30 px-2 py-1"
                      onClick={() => setPayoffLoanId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              {defaultLoanTileIndex === loan.collateral_tile_index ? (
                <div className="mx-1 rounded-lg border border-rose-300/50 bg-rose-100/10 p-2 text-xs text-white">
                  <p className="font-semibold">Default this property?</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="rounded bg-rose-500 px-2 py-1 font-semibold text-white"
                      disabled={isDefaultLoading}
                      onClick={() => {
                        void handleBankAction("DEFAULT_PROPERTY", {
                          tileIndex: loan.collateral_tile_index,
                        });
                        setDefaultLoanTileIndex(null);
                      }}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      className="rounded border border-white/30 px-2 py-1"
                      onClick={() => setDefaultLoanTileIndex(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }, [
    actionLoading,
    activeLoans,
    boardTilesByIndex,
    canAct,
    currentUserPlayer?.id,
    handleBankAction,
    ownershipByTile,
    payoffLoanId,
    defaultLoanTileIndex,
    selectedBoardPack,
    formatMoney,
  ]);

  const walletMortgagesContent = useMemo(() => {
    if (activePurchaseMortgages.length === 0) {
      return <p className="text-sm text-white/70">No active mortgages.</p>;
    }

    return (
      <div className="space-y-3">
        {activePurchaseMortgages.map((mortgage) => {
          const tile = boardTilesByIndex.get(mortgage.tile_index) ?? null;
          const payoffAmount =
            (mortgage.principal_remaining ?? 0) +
            (mortgage.accrued_interest_unpaid ?? 0);
          const canPayoff =
            canAct &&
            payoffAmount > 0 &&
            (currentUserCash ?? 0) >= payoffAmount;
          const payoffDisabledReason = !canAct
            ? "Not your turn"
            : payoffAmount <= 0
              ? "Already paid"
              : (currentUserCash ?? 0) < payoffAmount
                ? "Not enough cash"
                : null;
          const isPayoffLoading = actionLoading === "PAYOFF_PURCHASE_MORTGAGE";

          return (
            <div
              key={mortgage.id}
              className="space-y-2 rounded-xl border border-white/15 bg-white/5 p-2"
            >
              <div className="space-y-1 px-1 text-xs text-white/80">
                <p className="text-sm font-semibold text-white">
                  {tile?.name ?? `Tile ${mortgage.tile_index}`}
                </p>
                <p>
                  Principal remaining:{" "}
                  {formatMoney(mortgage.principal_remaining)}
                </p>
                <p>
                  Accrued interest:{" "}
                  {formatMoney(mortgage.accrued_interest_unpaid)}
                </p>
                <p>Payment / turn: {formatMoney(mortgage.payment_per_turn)}</p>
                <p>Turns remaining: {mortgage.turns_remaining}</p>
                <p>Payoff amount: {formatMoney(payoffAmount)}</p>
              </div>
              <div className="flex flex-wrap gap-2 px-1 pb-1">
                <button
                  type="button"
                  className="rounded-md border border-white/30 px-2 py-1 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
                  disabled={!canPayoff || isPayoffLoading}
                  title={payoffDisabledReason ?? undefined}
                  onClick={() => setPayoffMortgageId(mortgage.id)}
                >
                  {isPayoffLoading ? "Paying…" : "Pay off"}
                </button>
              </div>
              {payoffDisabledReason ? (
                <p className="px-1 pb-1 text-[11px] text-white/50">
                  {payoffDisabledReason}
                </p>
              ) : null}
              {payoffMortgageId === mortgage.id ? (
                <div className="mx-1 rounded-lg border border-amber-300/50 bg-amber-100/10 p-2 text-xs text-white">
                  <p className="font-semibold">Pay off purchase mortgage?</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white"
                      disabled={isPayoffLoading}
                      onClick={() => {
                        void handleBankAction("PAYOFF_PURCHASE_MORTGAGE", {
                          mortgageId: mortgage.id,
                        });
                        setPayoffMortgageId(null);
                      }}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      className="rounded border border-white/30 px-2 py-1"
                      onClick={() => setPayoffMortgageId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }, [
    actionLoading,
    activePurchaseMortgages,
    boardTilesByIndex,
    canAct,
    currentUserCash,
    handleBankAction,
    payoffMortgageId,
    formatMoney,
  ]);

  const onRefetch = useCallback(async () => {
    if (!routeGameId || !session?.access_token) return;
    await loadAllSlices(routeGameId, session.access_token);
  }, [loadAllSlices, routeGameId, session]);

  const drawerDecisionNode = useMemo(() => {
    if (
      auctionActive ||
      !activeDecisionType ||
      !isDrawerDecision(activeDecisionType)
    ) {
      return null;
    }

    switch (activeDecisionType) {
      case "JAIL_DECISION":
        return (
          <JailDecisionModalV2
            open={isAwaitingJailDecision}
            isActor={isJailDecisionActor}
            actorName={currentTurnPlayer?.display_name ?? null}
            jailTurnsRemaining={currentUserPlayer?.jail_turns_remaining ?? 0}
            jailFineAmount={jailFineAmount}
            hasGetOutOfJailFree={hasGetOutOfJailFree}
            canRollForDoubles={canRollForDoubles}
            actionLoading={actionLoading}
            onPayFine={handlePayJailFine}
            onUseGetOutOfJailFree={handleUseGetOutOfJailFree}
            onRollForDoubles={handleRollForDoubles}
          />
        );
      case "BUY_PROPERTY":
        return (
          <PendingPurchaseModalV2
            pendingPurchase={pendingPurchase}
            pendingTile={
              resolvedBoardTiles.find(
                (tile) => tile.index === pendingPurchase?.tile_index,
              ) ?? null
            }
            actorName={currentTurnPlayer?.display_name ?? null}
            isActor={Boolean(
              currentUserPlayer &&
              currentTurnPlayer &&
              currentUserPlayer.id === currentTurnPlayer.id,
            )}
            actionLoading={actionLoading}
            canAffordPurchase={canAffordPendingPurchase}
            canAffordMortgage={canAffordPendingMortgage}
            selectedDownPaymentPercent={selectedMortgageDownPaymentPercent}
            minDownPaymentPercent={PURCHASE_DOWN_PAYMENT_PERCENTS[0]}
            maxDownPaymentPercent={
              PURCHASE_DOWN_PAYMENT_PERCENTS[
                PURCHASE_DOWN_PAYMENT_PERCENTS.length - 1
              ]
            }
            mortgageDownPaymentPercent={100 - selectedMortgageDownPaymentPercent}
            downPaymentAmountLabel={formatMoney(pendingMortgageDownPayment)}
            mortgageAmountLabel={formatMoney(pendingMortgagePrincipal)}
            perTurnPaymentLabel={formatMoney(pendingMortgagePerTurnPayment)}
            priceLabel={formatMoney(pendingPurchase?.price ?? 0)}
            discountSummary={
              typeof pendingPurchase?.property_purchase_discount_pct === "number" &&
              pendingPurchase.property_purchase_discount_pct > 0 &&
              typeof pendingPurchase?.base_price === "number"
                ? `${pendingPurchase.property_purchase_discount_macro_name ?? "Macro event"} active: Bank price reduced from ${formatMoney(pendingPurchase.base_price)} to ${formatMoney(pendingPurchase.price)}.`
                : null
            }
            onDecreaseDownPayment={handleDecreaseMortgageDownPaymentPercent}
            onIncreaseDownPayment={handleIncreaseMortgageDownPaymentPercent}
            onBuy={handleBuyProperty}
            onBuyWithMortgage={handleBuyPropertyWithMortgage}
            onAuction={handleDeclineProperty}
          />
        );
      case "INSOLVENCY_RECOVERY": {
        const payeeName = pendingInsolvencyRecovery?.owed_to_player_id
          ? getPlayerNameById(pendingInsolvencyRecovery.owed_to_player_id)
          : null;
        return (
          <div className="space-y-3 rounded-3xl border border-amber-400/30 bg-amber-500/10 p-5 text-sm text-amber-50">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/80">
                Forced recovery
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">
                {isInsolvencyReadyToPay
                  ? "Recovery successful"
                  : "Insufficient cash"}
              </h2>
              <p className="mt-2 text-amber-50/90">
                {isInsolvencyReadyToPay
                  ? "You now have enough cash to complete the payment."
                  : "Raise funds to complete this payment."}
              </p>
              <p className="mt-2 text-xs leading-5 text-amber-100/80">
                {isInsolvencyReadyToPay
                  ? "Confirm the held payment to clear insolvency and resume normal play."
                  : "Available recovery actions: sell property to bank, take collateralized loan, or trade with other players."}
              </p>
            </div>

            <dl className="grid grid-cols-1 gap-2 text-xs text-amber-100/85">
              <div className="rounded-2xl border border-amber-200/10 bg-black/10 px-3 py-2">
                <dt className="uppercase tracking-wide text-amber-200/70">
                  Amount due
                </dt>
                <dd className="mt-1 text-sm font-semibold text-white">
                  {formatMoney(insolvencyAmountDue)}
                </dd>
              </div>
              <div className="rounded-2xl border border-amber-200/10 bg-black/10 px-3 py-2">
                <dt className="uppercase tracking-wide text-amber-200/70">
                  Current cash
                </dt>
                <dd className="mt-1 text-sm font-semibold text-white">
                  {formatMoney(insolvencyCurrentCash)}
                </dd>
              </div>
              <div className="rounded-2xl border border-amber-200/10 bg-black/10 px-3 py-2">
                <dt className="uppercase tracking-wide text-amber-200/70">
                  Shortfall
                </dt>
                <dd className="mt-1 text-sm font-semibold text-white">
                  {formatMoney(insolvencyShortfall)}
                </dd>
              </div>
              <div className="rounded-2xl border border-amber-200/10 bg-black/10 px-3 py-2">
                <dt className="uppercase tracking-wide text-amber-200/70">
                  Payment reason
                </dt>
                <dd className="mt-1 text-sm font-semibold text-white">
                  {pendingInsolvencyRecovery?.label ??
                    pendingInsolvencyRecovery?.reason ??
                    "Payment due"}
                </dd>
              </div>
              <div className="rounded-2xl border border-amber-200/10 bg-black/10 px-3 py-2">
                <dt className="uppercase tracking-wide text-amber-200/70">
                  Recipient / payee
                </dt>
                <dd className="mt-1 text-sm font-semibold text-white">
                  {payeeName ?? "Bank"}
                </dd>
              </div>
            </dl>

            {isInsolvencyRecoveryMode ? (
              <div className="space-y-3">
                {isInsolvencyReadyToPay ? (
                  <>
                    <div className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                      Your payment is still on hold. Confirm it to clear
                      insolvency and unlock normal turn flow.
                    </div>
                    <button
                      type="button"
                      onClick={handleConfirmInsolvencyPayment}
                      disabled={actionLoading === "CONFIRM_INSOLVENCY_PAYMENT"}
                      className="w-full rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoading === "CONFIRM_INSOLVENCY_PAYMENT"
                        ? "Confirming…"
                        : "Confirm payment"}
                    </button>
                  </>
                ) : (
                  <div className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                    Normal turn flow stays locked until you raise enough funds,
                    but trade remains available from the trade drawer.
                  </div>
                )}
                <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-3 py-3 text-xs text-rose-100">
                  <p className="font-semibold uppercase tracking-wide text-rose-200/90">
                    Final option
                  </p>
                  <p className="mt-1 text-rose-100/85">
                    If you cannot or do not want to keep raising funds, you can
                    eliminate yourself and return any remaining properties to
                    the bank.
                  </p>
                  <button
                    type="button"
                    onClick={handleDeclareBankruptcy}
                    disabled={actionLoading === "DECLARE_BANKRUPTCY"}
                    className="mt-3 w-full rounded-2xl border border-rose-300/35 bg-rose-400 px-4 py-3 text-sm font-semibold text-rose-950 transition hover:bg-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionLoading === "DECLARE_BANKRUPTCY"
                      ? "Declaring…"
                      : "Declare bankruptcy"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
                {currentTurnPlayer?.display_name ?? "Current player"} is
                resolving insolvency before play can continue.
              </div>
            )}
          </div>
        );
      }
      case "INCOME_TAX_CONFIRM":
        return (
          <IncomeTaxModalV2
            pendingIncomeTax={pendingIncomeTax}
            actorName={currentTurnPlayer?.display_name ?? null}
            isActor={Boolean(
              currentUserPlayer &&
              currentTurnPlayer &&
              currentUserPlayer.id === currentTurnPlayer.id,
            )}
            actionLoading={actionLoading}
            onConfirm={handleConfirmIncomeTax}
            onUseTaxExemptionPass={handleUseTaxExemptionPass}
          />
        );
      case "SUPER_TAX_CONFIRM":
        return (
          <SuperTaxModalV2
            pendingSuperTax={pendingSuperTax}
            actorName={currentTurnPlayer?.display_name ?? null}
            isActor={Boolean(
              currentUserPlayer &&
              currentTurnPlayer &&
              currentUserPlayer.id === currentTurnPlayer.id,
            )}
            actionLoading={actionLoading}
            onConfirm={handleConfirmSuperTax}
            onUseTaxExemptionPass={handleUseTaxExemptionPass}
          />
        );
      default:
        return null;
    }
  }, [
    actionLoading,
    activeDecisionType,
    auctionActive,
    canAffordPendingMortgage,
    canAffordPendingPurchase,
    canRollForDoubles,
    currentTurnPlayer,
    currentUserPlayer,
    handleBuyProperty,
    handleBuyPropertyWithMortgage,
    handleConfirmInsolvencyPayment,
    handleConfirmIncomeTax,
    handleConfirmSuperTax,
    handleDecreaseMortgageDownPaymentPercent,
    handleDeclareBankruptcy,
    handleDeclineProperty,
    handleIncreaseMortgageDownPaymentPercent,
    handlePayJailFine,
    handleRollForDoubles,
    handleUseTaxExemptionPass,
    handleUseGetOutOfJailFree,
    hasGetOutOfJailFree,
    insolvencyAmountDue,
    insolvencyCurrentCash,
    insolvencyShortfall,
    isAwaitingJailDecision,
    isDrawerDecision,
    isJailDecisionActor,
    jailFineAmount,
    pendingMortgageDownPayment,
    pendingMortgagePerTurnPayment,
    pendingMortgagePrincipal,
    pendingInsolvencyRecovery,
    pendingIncomeTax,
    pendingPurchase,
    pendingSuperTax,
    selectedMortgageDownPaymentPercent,
    resolvedBoardTiles,
    formatMoney,
    getPlayerNameById,
    isInsolvencyReadyToPay,
    isInsolvencyRecoveryMode,
  ]);

  const fullscreenEventNode = useMemo(() => {
    if (
      auctionActive ||
      !activeDecisionType ||
      !isFullscreenEvent(activeDecisionType)
    ) {
      return null;
    }

    switch (activeDecisionType) {
      case "GO_TO_JAIL":
        return (
          <GoToJailModalV2
            isOpen={shouldShowGoToJailConfirm}
            isActor={isGoToJailActor}
            actionLoading={actionLoading === "CONFIRM_GO_TO_JAIL"}
            onConfirm={handleConfirmGoToJail}
          />
        );
      case "PENDING_CARD":
        return (
          <PendingCardModalV2
            pendingCard={pendingCard}
            actorName={
              players.find((player) => player.id === pendingCard?.drawnBy)
                ?.display_name ?? null
            }
            isActor={Boolean(
              currentUserPlayer &&
              pendingCard?.drawnBy === currentUserPlayer.id,
            )}
            actionLoading={actionLoading}
            boardPack={selectedBoardPack}
            currencySymbol={currencySymbol}
            onConfirm={handleConfirmPendingCard}
          />
        );
      case "MACRO_EVENT":
        return (
          <PendingMacroModalV2
            pendingMacroEvent={pendingMacroEvent}
            macroTooltipById={macroTooltipById}
            actorName={currentTurnPlayer?.display_name ?? null}
            isActor={Boolean(
              currentUserPlayer &&
              currentTurnPlayer &&
              currentUserPlayer.id === currentTurnPlayer.id,
            )}
            actionLoading={actionLoading}
            onConfirm={handleConfirmMacroEvent}
          />
        );
      default:
        return null;
    }
  }, [
    actionLoading,
    activeDecisionType,
    auctionActive,
    currentTurnPlayer,
    currentUserPlayer,
    handleConfirmGoToJail,
    handleConfirmMacroEvent,
    handleConfirmPendingCard,
    isFullscreenEvent,
    pendingCard,
    shouldShowGoToJailConfirm,
    isGoToJailActor,
    pendingMacroEvent,
    players,
    selectedBoardPack,
    currencySymbol,
    macroTooltipById,
  ]);

  useEffect(() => {
    // Keep loadingMinElapsed sticky: resetting it during ready transition can deadlock shouldShowLoadingScreen.
    if (!canShowIntro || loadingStartedAt !== null || loadingMinElapsed) {
      return;
    }

    setLoadingStartedAt(Date.now());
    setLoadingElapsedMs(0);
  }, [canShowIntro, loadingMinElapsed, loadingStartedAt]);

  useEffect(() => {
    if (loadingStartedAt === null || loadingMinElapsed) {
      return;
    }

    let animationFrameId = 0;
    const updateElapsed = () => {
      const elapsed = Date.now() - loadingStartedAt;
      setLoadingElapsedMs(elapsed);
      if (elapsed >= MIN_LOADING_SCREEN_MS) {
        setLoadingMinElapsed(true);
      } else {
        animationFrameId = window.requestAnimationFrame(updateElapsed);
      }
    };

    animationFrameId = window.requestAnimationFrame(updateElapsed);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [loadingMinElapsed, loadingStartedAt]);

  if (needsAuth) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Play V2 Debug</h1>
        <p className="mt-3 text-sm text-neutral-700">
          Please sign in to view this game.
        </p>
      </main>
    );
  }

  if (gameMetaError) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Play V2 Debug</h1>
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {gameMetaError}
        </div>
        <button
          type="button"
          className="mt-4 rounded border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-800"
          onClick={() => router.push("/")}
        >
          Back to Home
        </button>
      </main>
    );
  }

  if (shouldShowIntro) {
    return (
      <>
        <RotateToLandscapeOverlay />
        <main className="fixed inset-0 z-40 overflow-hidden text-white">
          <div className="absolute inset-0">
            <Image
              src="/icons/loading_screen.svg"
              alt="Game boot background"
              fill
              sizes="100vw"
              className="object-cover object-center transition-[filter,opacity] duration-700 ease-out"
              style={{
                filter: loadingMinElapsed
                  ? "saturate(1.02) contrast(1) brightness(1)"
                  : "saturate(0.7) contrast(0.92) brightness(0.88)",
                opacity: loadingMinElapsed ? 1 : 0.95,
              }}
            />
            <div
              className="absolute inset-0 bg-neutral-900/35 transition-opacity duration-700 ease-out"
              style={{ opacity: loadingMinElapsed ? 0.15 : 0.45 }}
            />
          </div>
          <div className="relative flex h-full flex-col items-center justify-end gap-6 px-6 py-12 text-center">
            <div className="flex w-full max-w-md flex-col items-center gap-4">
              <div
                className={`h-2 w-full overflow-hidden rounded-full bg-white/20 transition-opacity duration-500 ${
                  loadingMinElapsed ? "opacity-60" : "opacity-100"
                }`}
              >
                <div
                  className="h-full rounded-full bg-emerald-300 transition-[width] duration-100 ease-linear"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
              <p className="text-xs text-white/75">
                {isGameReady ? "Finalizing board…" : "Loading game…"}
              </p>
            </div>
          </div>
        </main>
      </>
    );
  }

  const turnPlayerLabel = currentTurnPlayer
    ? `${currentTurnPlayer.display_name}`
    : (turnPlayerId ?? "—");
  const lastRollLabel =
    gameState?.last_roll != null ? String(gameState.last_roll) : "—";

  const inGame = Boolean(routeGameId);
  const leaveMenuDisabled = actionLoading === "SURRENDER_GAME";
  const endMenuDisabled = actionLoading === "END_GAME";
  const backHomeDisabled = leaveMenuDisabled || endMenuDisabled;

  return (
    <>
      <RotateToLandscapeOverlay />
      <PlayV2Shell
        cashLabel={formatMoney(currentUserCash)}
        boardPackEconomy={
          selectedBoardPack?.economy ?? DEFAULT_BOARD_PACK_ECONOMY
        }
        netWorthLabel={formatMoney(netWorth)}
        netWorthBreakdown={{
          cash: currentUserCash ?? 0,
          assets: totalAssets,
          liabilities: totalLiabilities,
          netWorth,
        }}
        turnPlayerLabel={turnPlayerLabel}
        lastRollLabel={lastRollLabel}
        lastDiceLabel={latestDiceDisplay}
        isDoubleRoll={latestIsDouble}
        loading={loading}
        notice={notice}
        leftOpen={isLeftDrawerOpen}
        onLeftOpenChange={setIsLeftDrawerOpen}
        leftDrawerMode={leftDrawerMode}
        onLeftDrawerModeChange={setLeftDrawerMode}
        rightOpen={isRightDrawerOpen}
        onRightOpenChange={setIsRightDrawerOpen}
        rightDrawerMode={rightDrawerMode}
        onRightDrawerModeChange={setRightDrawerMode}
        tradeNeedsAttention={Boolean(incomingTradeProposal)}
        tradeAccessibleDuringDecision={Boolean(pendingInsolvencyRecovery)}
        macroEffectsActive={activeMacroDisplayItems.length > 0}
        canRoll={canRoll}
        canEndTurn={canEndTurn}
        actionLoading={actionLoading}
        rollDiceDisabledReason={rollDiceDisabledReason}
        onRollDice={() => void handleBankAction("ROLL_DICE")}
        onEndTurn={() => void handleBankAction("END_TURN")}
        onRecenterBoard={() => recenterBoardRef.current?.()}
        onMenuToggle={() => setShowMenuOverlay((open) => !open)}
        menuOpen={showMenuOverlay}
        walletOwnedCount={ownedProperties.length}
        walletLoanCount={activeLoans.length}
        walletMortgageCount={activePurchaseMortgages.length}
        walletOwnedContent={walletOwnedContent}
        walletLoansContent={walletLoansContent}
        walletMortgagesContent={walletMortgagesContent}
        decisionActive={drawerDecisionNode !== null}
        rightDrawerLocked={fullscreenEventNode !== null}
        auctionActive={auctionActive}
        headerActions={
          roundModeProgressLabel ? (
            <span className="rounded-full border border-[#C19360]/40 bg-[#6E4521]/45 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/85">
              {roundModeProgressLabel}
            </span>
          ) : null
        }
        marketDrawerContent={
          <BettingMarketPanelV2
            bettingConfig={bettingConfig}
            bettingState={bettingMarketState}
            currentPlayerId={currentUserPlayer?.id ?? null}
            currentCash={currentUserCash ?? 0}
            canInteract={canInteractWithBetting}
            disabledReason={bettingDisabledReason}
            isPlacing={actionLoading === "PLACE_BETTING_MARKET_BET"}
            cancelingBetId={cancelingBetId}
            inlineError={bettingInlineError}
            successMessage={bettingSuccessMessage}
            onPlaceBet={(payload) => {
              void handlePlaceBet(payload);
            }}
            onCancelBet={(betId) => {
              void handleCancelBet(betId);
            }}
            formatMoney={formatMoney}
          />
        }
        leftDrawerContent={
          <div className="h-full space-y-4">
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                Tile Info
              </p>
              {selectedTile ? (
                <TileInfoPanelV2
                  tile={selectedTile}
                  bandColor={getTileBandColor(selectedTile)}
                  ownerLabel={selectedOwnerLabel || "Unowned"}
                  statusLabel={selectedTileStatusLabel}
                  purchasePriceLabel={formatMoney(selectedTile.price ?? null)}
                  currentRentLabel={formatMoney(selectedTileCurrentRent)}
                  upgradeCostLabel={
                    selectedTileIsUpgradeable
                      ? formatMoney(selectedTile.houseCost ?? null)
                      : null
                  }
                  nextRentLabel={
                    selectedTileNextRent !== null
                      ? formatMoney(selectedTileNextRent)
                      : null
                  }
                  isFullyUpgraded={selectedTileIsFullyUpgraded}
                  onViewTitleCard={() => setShowTileTitleCardModal(true)}
                />
              ) : selectedDevelopedInlandSiteInfo ? (
                <TileInfoPanelV2 inlandSiteInfo={selectedDevelopedInlandSiteInfo} />
              ) : (
                <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
                  Select a tile to view details.
                </p>
              )}
            </section>
          </div>
        }
        decisionDrawerContent={
          !auctionActive && drawerDecisionNode !== null ? (
            <div className="space-y-3">{drawerDecisionNode}</div>
          ) : (
            <p className="text-sm text-white/70">No active decision</p>
          )
        }
        tradeDrawerContent={
          <section className="space-y-3 text-sm text-white/85">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                Trade
              </p>
              <p className="mt-1 text-xs text-white/70">
                Send offers or respond to pending incoming trades.
              </p>
              {availableTradeCounterparties.length === 0 ? (
                <p className="mt-3 rounded-md border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white/60">
                  No eligible counterparty is available right now.
                </p>
              ) : null}
            </div>

            <div className="rounded-lg border border-indigo-300/30 bg-indigo-500/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-100">
                Compose proposal
              </p>
              <div className="mt-3 space-y-3">
                <label className="block text-xs text-white/75">
                  Counterparty
                  <select
                    className="mt-1 w-full rounded-md border border-[#C19360]/30 bg-[#5A381A]/80 px-2.5 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
                    value={tradeCounterpartyId}
                    onChange={(event) => {
                      setTradeCounterpartyId(event.target.value);
                      setTradeRequestTiles([]);
                    }}
                    disabled={
                      actionLoading === "PROPOSE_TRADE" ||
                      availableTradeCounterparties.length === 0
                    }
                  >
                    {availableTradeCounterparties.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.displayName}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-1 gap-3">
                  <div className="rounded-md border border-[#B68955]/25 bg-[#6A4520]/45 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                      Offer
                    </p>
                    <label className="mt-2 block text-xs text-white/75">
                      Cash
                      <input
                        className="mt-1 w-full rounded-md border border-[#C19360]/30 bg-[#5A381A]/80 px-2.5 py-2 text-sm text-white"
                        type="number"
                        min={0}
                        max={Math.max(0, currentUserCash ?? 0)}
                        value={tradeOfferCash}
                        onChange={(event) =>
                          setTradeOfferCash(
                            Math.min(
                              Math.max(0, Number(event.target.value)),
                              Math.max(0, currentUserCash ?? 0),
                            ),
                          )
                        }
                      />
                    </label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="block text-xs text-white/75">
                        Build vouchers
                        <input
                          className="mt-1 w-full rounded-md border border-[#C19360]/30 bg-[#5A381A]/80 px-2.5 py-2 text-sm text-white"
                          type="number"
                          min={0}
                          max={Math.max(0, currentPlayerFreeBuildTokens)}
                          value={tradeOfferFreeBuildTokens}
                          onChange={(event) =>
                            setTradeOfferFreeBuildTokens(
                              Math.min(
                                Math.max(0, Number(event.target.value)),
                                Math.max(0, currentPlayerFreeBuildTokens),
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="block text-xs text-white/75">
                        Upgrade vouchers
                        <input
                          className="mt-1 w-full rounded-md border border-[#C19360]/30 bg-[#5A381A]/80 px-2.5 py-2 text-sm text-white"
                          type="number"
                          min={0}
                          max={Math.max(0, currentPlayerFreeUpgradeTokens)}
                          value={tradeOfferFreeUpgradeTokens}
                          onChange={(event) =>
                            setTradeOfferFreeUpgradeTokens(
                              Math.min(
                                Math.max(0, Number(event.target.value)),
                                Math.max(0, currentPlayerFreeUpgradeTokens),
                              ),
                            )
                          }
                        />
                      </label>
                    </div>
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-white/70">Properties</p>
                      {ownTradePropertyOptions.length === 0 ? (
                        <p className="text-xs text-white/50">
                          No owned properties to offer.
                        </p>
                      ) : (
                        <div className="max-h-36 space-y-1 overflow-y-auto pr-1 text-xs">
                          {ownTradePropertyOptions.map((tile) => (
                            <label
                              key={`offer-${tile.tileIndex}`}
                              className="flex items-center gap-2 text-white/90"
                            >
                              <input
                                type="checkbox"
                                checked={tradeOfferTiles.includes(
                                  tile.tileIndex,
                                )}
                                onChange={(event) =>
                                  toggleOfferTile(
                                    tile.tileIndex,
                                    event.target.checked,
                                  )
                                }
                              />
                              <span>
                                {tile.tileName}
                                {tile.houses > 0
                                  ? ` · ${tile.houses} ${tile.houses === 1 ? "house" : "houses"}`
                                  : ""}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-md border border-[#B68955]/25 bg-[#6A4520]/45 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                      Request
                    </p>
                    <label className="mt-2 block text-xs text-white/75">
                      Cash
                      <input
                        className="mt-1 w-full rounded-md border border-[#C19360]/30 bg-[#5A381A]/80 px-2.5 py-2 text-sm text-white"
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
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="block text-xs text-white/75">
                        Build vouchers
                        <input
                          className="mt-1 w-full rounded-md border border-[#C19360]/30 bg-[#5A381A]/80 px-2.5 py-2 text-sm text-white"
                          type="number"
                          min={0}
                          value={tradeRequestFreeBuildTokens}
                          onChange={(event) =>
                            setTradeRequestFreeBuildTokens(
                              Math.max(0, Number(event.target.value)),
                            )
                          }
                        />
                      </label>
                      <label className="block text-xs text-white/75">
                        Upgrade vouchers
                        <input
                          className="mt-1 w-full rounded-md border border-[#C19360]/30 bg-[#5A381A]/80 px-2.5 py-2 text-sm text-white"
                          type="number"
                          min={0}
                          value={tradeRequestFreeUpgradeTokens}
                          onChange={(event) =>
                            setTradeRequestFreeUpgradeTokens(
                              Math.max(0, Number(event.target.value)),
                            )
                          }
                        />
                      </label>
                    </div>
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-white/70">Properties</p>
                      {!tradeCounterpartyId ? (
                        <p className="text-xs text-white/50">
                          Select a counterparty first.
                        </p>
                      ) : counterpartyOwnedProperties.length === 0 ? (
                        <p className="text-xs text-white/50">
                          No properties owned by the selected player.
                        </p>
                      ) : (
                        <div className="max-h-36 space-y-1 overflow-y-auto pr-1 text-xs">
                          {counterpartyOwnedProperties.map((tile) => (
                            <label
                              key={`request-${tile.tileIndex}`}
                              className="flex items-center gap-2 text-white/90"
                            >
                              <input
                                type="checkbox"
                                checked={tradeRequestTiles.includes(
                                  tile.tileIndex,
                                )}
                                onChange={(event) =>
                                  toggleRequestTile(
                                    tile.tileIndex,
                                    event.target.checked,
                                  )
                                }
                              />
                              <span>
                                {tile.tileName}
                                {tile.houses > 0
                                  ? ` · ${tile.houses} ${tile.houses === 1 ? "house" : "houses"}`
                                  : ""}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    className="rounded-md border border-indigo-300/40 bg-indigo-500/20 px-3 py-1.5 text-xs font-semibold text-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={
                      actionLoading === "PROPOSE_TRADE" ||
                      availableTradeCounterparties.length === 0 ||
                      !canSubmitTradeProposal
                    }
                    onClick={() => void handleSubmitTradeProposal()}
                  >
                    {actionLoading === "PROPOSE_TRADE"
                      ? "Sending…"
                      : "Send trade"}
                  </button>
                </div>
              </div>
            </div>

            {incomingTradeProposal ? (
              <div className="rounded-lg border border-emerald-300/30 bg-emerald-500/10 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100">
                  Incoming from {incomingTradeCounterpartyName}
                </p>
                <div className="mt-2 grid gap-2 text-xs text-emerald-50 md:grid-cols-2">
                  <div className="rounded-md border border-emerald-200/30 bg-emerald-950/20 p-2">
                    <p className="font-semibold">You give</p>
                    <ul className="mt-1 space-y-1 text-emerald-100/95">
                      {incomingTradeProposal.request_cash > 0 ? (
                        <li>
                          Cash:{" "}
                          {formatTradeMoney(incomingTradeProposal.request_cash)}
                        </li>
                      ) : null}
                      {incomingTradeRequestFreeBuildTokens > 0 ? (
                        <li>
                          Build vouchers: {incomingTradeRequestFreeBuildTokens}
                        </li>
                      ) : null}
                      {incomingTradeRequestFreeUpgradeTokens > 0 ? (
                        <li>
                          Upgrade vouchers: {incomingTradeRequestFreeUpgradeTokens}
                        </li>
                      ) : null}
                      {incomingTradeProposal.request_tile_indices.length > 0 ? (
                        incomingTradeProposal.request_tile_indices.map(
                          (tileIndex) => {
                            const snapshot = incomingTradeSnapshotTiles.find(
                              (entry) => entry.tile_index === tileIndex,
                            );
                            const houses = snapshot?.houses ?? 0;
                            return (
                              <li key={`incoming-give-${tileIndex}`}>
                                {getTileNameByIndex(tileIndex)}
                                {houses > 0
                                  ? ` · ${houses} ${houses === 1 ? "house" : "houses"}`
                                  : ""}
                              </li>
                            );
                          },
                        )
                      ) : incomingTradeProposal.request_cash === 0 &&
                        incomingTradeRequestFreeBuildTokens === 0 &&
                        incomingTradeRequestFreeUpgradeTokens === 0 ? (
                        <li className="text-emerald-100/70">Nothing</li>
                      ) : null}
                    </ul>
                  </div>
                  <div className="rounded-md border border-emerald-200/30 bg-emerald-950/20 p-2">
                    <p className="font-semibold">You receive</p>
                    <ul className="mt-1 space-y-1 text-emerald-100/95">
                      {incomingTradeProposal.offer_cash > 0 ? (
                        <li>
                          Cash:{" "}
                          {formatTradeMoney(incomingTradeProposal.offer_cash)}
                        </li>
                      ) : null}
                      {incomingTradeOfferFreeBuildTokens > 0 ? (
                        <li>
                          Build vouchers: {incomingTradeOfferFreeBuildTokens}
                        </li>
                      ) : null}
                      {incomingTradeOfferFreeUpgradeTokens > 0 ? (
                        <li>
                          Upgrade vouchers: {incomingTradeOfferFreeUpgradeTokens}
                        </li>
                      ) : null}
                      {incomingTradeProposal.offer_tile_indices.length > 0 ? (
                        incomingTradeProposal.offer_tile_indices.map(
                          (tileIndex) => {
                            const snapshot = incomingTradeSnapshotTiles.find(
                              (entry) => entry.tile_index === tileIndex,
                            );
                            const houses = snapshot?.houses ?? 0;
                            return (
                              <li key={`incoming-receive-${tileIndex}`}>
                                {getTileNameByIndex(tileIndex)}
                                {houses > 0
                                  ? ` · ${houses} ${houses === 1 ? "house" : "houses"}`
                                  : ""}
                              </li>
                            );
                          },
                        )
                      ) : incomingTradeProposal.offer_cash === 0 &&
                        incomingTradeOfferFreeBuildTokens === 0 &&
                        incomingTradeOfferFreeUpgradeTokens === 0 ? (
                        <li className="text-emerald-100/70">Nothing</li>
                      ) : null}
                    </ul>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-emerald-300/40 px-2.5 py-1.5 text-xs font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={actionLoading === "REJECT_TRADE"}
                    onClick={() => handleRejectTrade(incomingTradeProposal.id)}
                  >
                    {actionLoading === "REJECT_TRADE" ? "Rejecting…" : "Reject"}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-emerald-200/30 bg-emerald-100/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={actionLoading === "ACCEPT_TRADE"}
                    onClick={() => handleAcceptTrade(incomingTradeProposal.id)}
                  >
                    {actionLoading === "ACCEPT_TRADE" ? "Accepting…" : "Accept"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/60">
                No incoming trade offer right now.
              </div>
            )}

            {outgoingPendingTrade ? (
              <div className="rounded-lg border border-amber-300/35 bg-amber-500/10 p-3">
                <p className="text-xs text-amber-100">
                  Outgoing proposal pending
                </p>
                <p className="mt-1 text-xs text-white/70">
                  Waiting on{" "}
                  {getPlayerNameById(
                    outgoingPendingTrade.counterparty_player_id,
                  )}
                </p>
                <button
                  type="button"
                  className="mt-2 rounded-md border border-amber-300/45 px-2.5 py-1 text-xs font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={actionLoading === "CANCEL_TRADE"}
                  onClick={() =>
                    handleCancelOutgoingTrade(outgoingPendingTrade.id)
                  }
                >
                  {actionLoading === "CANCEL_TRADE"
                    ? "Cancelling…"
                    : "Cancel proposal"}
                </button>
              </div>
            ) : null}
          </section>
        }
        macroDrawerContent={
          <section className="space-y-3 text-sm text-white/85">
            <div className="rounded-lg border border-sky-300/20 bg-sky-500/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-100">
                Active macro effects
              </p>
              <p className="mt-1 text-xs text-white/70">
                Current macro factors affecting this game.
              </p>
            </div>

            {activeMacroDisplayItems.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/60">
                No active macro effects right now.
              </div>
            ) : (
              activeMacroDisplayItems.map((effect) => (
                <article
                  key={effect.id}
                  className="rounded-lg border border-sky-300/25 bg-white/5 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-white">
                      {effect.title}
                    </p>
                    {effect.rarityLabel ? (
                      <span className="rounded-full bg-sky-100/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-100">
                        {effect.rarityLabel}
                      </span>
                    ) : null}
                  </div>
                  {effect.rulesText ? (
                    <p className="mt-2 text-xs text-white/85">
                      {effect.rulesText}
                    </p>
                  ) : null}
                  {effect.summary && effect.summary !== effect.rulesText ? (
                    <p className="mt-2 text-xs text-white/65">
                      {effect.summary}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/65">
                    {effect.turnsRemaining !== null ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                        {effect.turnsRemaining} turn
                        {effect.turnsRemaining === 1 ? "" : "s"} remaining
                      </span>
                    ) : null}
                    {effect.roundsApplied !== null ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                        Applied for {effect.roundsApplied} round
                        {effect.roundsApplied === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </section>
        }
        boardViewport={
          <BoardViewport
            boardPackId={gameMeta?.board_pack_id ?? null}
            boardTiles={resolvedBoardTiles}
            players={players}
            ownershipByTile={ownershipByTile}
            currentPlayerId={turnPlayerId}
            selectedTileIndex={selectedTileIndex}
            selectedInteriorCell={selectedInteriorCell}
            exploredInteriorCellKeys={exploredInteriorCellKeys}
            inlandCellsByKey={inlandCellsByKey}
            onSelectTileIndex={(tileIndex) => {
              setSelectedInteriorCell(null);
              setOpenInlandDecisionCellKey(null);
              setSelectedTileIndex(tileIndex);
              setLeftDrawerMode("info");
              setIsLeftDrawerOpen(true);
            }}
            onSelectInteriorCell={(cell) => {
              setSelectedTileIndex(null);
              setSelectedInteriorCell(cell);
              const key = toInlandCellKey(cell);
              const inlandCell = inlandCellsByKey.get(key);
              if (
                inlandCell?.status === "DISCOVERED_RESOURCE" &&
                inlandCell.ownerPlayerId &&
                inlandCell.ownerPlayerId === currentUserPlayerId
              ) {
                setOpenInlandDecisionCellKey(key);
                return;
              }
              if (inlandCell) {
                setOpenInlandDecisionCellKey(null);
                setLeftDrawerMode("info");
                setIsLeftDrawerOpen(true);
              } else {
                setOpenInlandDecisionCellKey(null);
              }
            }}
            onRecenterReady={(handler) => {
              recenterBoardRef.current = handler;
            }}
          />
        }
        debugPanel={
          <div className="space-y-4">
            <h1 className="text-xl font-semibold">Play V2 Debug</h1>
            <section className="rounded border p-4 text-sm">
              <p>
                <strong>gameId:</strong> {routeGameId ?? "—"}
              </p>
              <p>
                <strong>current user id:</strong> {session?.user.id ?? "—"}
              </p>
              <p>
                <strong>gameMeta.status:</strong> {gameMeta?.status ?? "—"}
              </p>
              <p>
                <strong>turnPlayerId (game_state.current_player_id):</strong>{" "}
                {turnPlayerId ?? "—"}
              </p>
              <p>
                <strong>current turn player:</strong>{" "}
                {currentTurnPlayer
                  ? `${currentTurnPlayer.id} / ${currentTurnPlayer.display_name}`
                  : "—"}
              </p>
              {turnPlayerMissingFromPlayers ? (
                <p className="text-red-600">
                  <strong>warning:</strong> Turn player id {turnPlayerId} not
                  found in players list
                </p>
              ) : null}
              <p>
                <strong>gameState.version:</strong> {gameState?.version ?? "—"}
              </p>
              <p>
                <strong>ownership rows:</strong>{" "}
                {Object.keys(ownershipByTile).length}
              </p>
              <p>
                <strong>trade proposals:</strong> {tradeProposals.length}
              </p>
              <p>
                <strong>loans:</strong> {playerLoans.length}
              </p>
              <p>
                <strong>mortgages:</strong> {purchaseMortgages.length}
              </p>
            </section>

            <section className="rounded border p-4 text-sm">
              <h2 className="font-semibold">Players</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {players.map((player) => (
                  <li key={player.id}>
                    {player.display_name} — id: {player.id} — cash:{" "}
                    {gameState?.balances?.[player.id] ?? "—"}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded border p-4 text-sm">
              <h2 className="font-semibold">Last 5 game events</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {lastFiveEvents.map((event) => (
                  <li key={event.id}>
                    {event.event_type} — {event.created_at}
                  </li>
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
        }
      />
      {gameOverState && !gameOverOverlayDismissed ? (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-[#2A1709]/65 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-[#D3A369]/30 bg-[#4E3018]/95 p-6 text-center shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/55">
              Game Over
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-white">
              {gameOverState.isCurrentUserWinner ? "You won" : "You lost"}
            </h2>
            <p className="mt-2 text-sm text-white/75">
              Winner:{" "}
              <span className="font-semibold text-white">
                {gameOverState.winnerName}
              </span>
            </p>
            {gameOverState.reasonLabel ? (
              <p className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-50">
                Game ended due to {gameOverState.reasonLabel}.
              </p>
            ) : null}
            <p className="mt-4 text-sm text-white/65">
              All other players have been eliminated. The final board remains
              visible behind this overlay.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => setGameOverOverlayDismissed(true)}
                className="inline-flex min-w-40 items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                View Final Standings
              </button>
              <button
                type="button"
                onClick={handleReturnHomeFromGameOver}
                className="inline-flex min-w-40 items-center justify-center rounded-2xl border border-white/15 bg-white px-4 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-white/90"
              >
                Return Home
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {gameOverState && gameOverOverlayDismissed ? (
        <EndedGameResultsPanel
          standings={finalStandings}
          winnerPlayerId={gameOverState.winnerPlayerId}
          reasonLabel={gameOverState.reasonLabel}
          standingsSource={gameOverState.standingsSource}
          formatMoney={formatMoney}
          onReturnHome={handleReturnHomeFromGameOver}
          onShowSummary={() => setGameOverOverlayDismissed(false)}
        />
      ) : null}
      {fullscreenEventNode ? (
        <div className="fixed inset-0 z-[200]">
          <div className="absolute inset-0 bg-[#2A1709]/60" />
          <div className="relative flex h-full w-full items-center justify-center p-4">
            <div className="w-full max-w-xl rounded-3xl border border-[#D3A369]/30 bg-[#4E3018]/95 p-4 shadow-2xl backdrop-blur">
              {fullscreenEventNode}
            </div>
          </div>
        </div>
      ) : null}
      {selectedInteriorCell && !selectedInlandCellRecord ? (
        <div className="fixed bottom-3 left-1/2 z-[45] w-[min(460px,calc(100vw-1rem))] -translate-x-1/2 rounded-xl border border-emerald-200/35 bg-[#4E3018]/92 p-2 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                void handleExploreInterior();
              }}
              disabled={!canExploreSelectedInteriorCell || actionLoading === "EXPLORE_INTERIOR"}
              className="inline-flex flex-1 items-center justify-center rounded-lg border border-emerald-200/30 bg-emerald-400/20 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionLoading === "EXPLORE_INTERIOR"
                ? "Exploring…"
                : `Explore for ${formatMoney(inlandExplorationCost)}`}
            </button>
            <button
              type="button"
              onClick={() => setSelectedInteriorCell(null)}
              className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setShowActivityPopup((open) => !open)}
        className="fixed bottom-1 left-1 z-[20] inline-flex h-8 items-center justify-center rounded-full border border-[#5E3D1D]/85 bg-[#744820] px-3 text-xs font-semibold leading-none text-white/95 shadow-md shadow-black/25 transition hover:bg-[#6A411D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A5B2C]/55"
        aria-label="Open activity and wallet transactions"
        aria-expanded={showActivityPopup}
      >
        Log
      </button>
      <ActivityPopupV2
        isOpen={showActivityPopup}
        onClose={() => setShowActivityPopup(false)}
        events={events}
        players={players}
        boardPack={selectedBoardPack}
        currencySymbol={currencySymbol}
        currentPlayerId={currentUserPlayerId}
      />
      {showMenuOverlay ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-[#2A1709]/55 p-4"
          onClick={closeMenuOverlay}
        >
          <div
            className="relative z-[41] w-full max-w-sm rounded-2xl border border-[#D3A369]/30 bg-[#4E3018]/95 p-4 shadow-2xl backdrop-blur"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
              Menu
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleBackToHomeIntent}
                disabled={backHomeDisabled}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-left text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {backHomeDisabled
                  ? actionLoading === "END_GAME"
                    ? "Ending…"
                    : "Leaving…"
                  : "Back to Home"}
              </button>
              {inGame ? (
                <button
                  type="button"
                  onClick={handleLeaveIntent}
                  disabled={leaveMenuDisabled}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-left text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {leaveMenuDisabled ? "Surrendering…" : "Surrender"}
                </button>
              ) : null}
              {isHost && inGame ? (
                <button
                  type="button"
                  onClick={() => {
                    closeMenuOverlay();
                    setShowEndSessionConfirm(true);
                  }}
                  disabled={endMenuDisabled}
                  className="w-full rounded-xl border border-red-300/50 bg-red-500/20 px-4 py-2.5 text-left text-sm font-semibold text-red-100 transition hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {endMenuDisabled ? "Ending…" : "End Session"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {showTileTitleCardModal && selectedTile ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-[#2A1709]/65 p-4"
          onClick={() => setShowTileTitleCardModal(false)}
        >
          <div
            className="relative w-full max-w-md rounded-2xl border border-[#D3A369]/30 bg-[#4E3018]/92 p-3 shadow-2xl backdrop-blur"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close title card"
              className="absolute right-3 top-3 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-xs font-semibold text-white transition hover:bg-white/20"
              onClick={() => setShowTileTitleCardModal(false)}
            >
              ✕
            </button>
            <TitleDeedPreview
              tile={selectedTile}
              bandColor={getTileBandColor(selectedTile)}
              boardPackEconomy={
                selectedBoardPack?.economy ?? DEFAULT_BOARD_PACK_ECONOMY
              }
              price={selectedTile.price}
              ownedRailCount={selectedOwnerRailCount}
              ownedUtilityCount={selectedOwnerUtilityCount}
              mode="readonly"
              showDevelopment
              developmentCount={selectedTileDevelopmentCount}
              ownerPlayerId={selectedOwnerId}
              ownershipByTile={ownershipByTile}
              boardTiles={resolvedBoardTiles ?? []}
            />
          </div>
        </div>
      ) : null}
      <ConfirmActionModalV2
        open={buildUpgradeConfirmation !== null}
        title={buildUpgradeConfirmation?.question ?? "Confirm upgrade"}
        description={
          buildUpgradeConfirmation ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Property</p>
                <p className="text-sm font-semibold text-neutral-900">
                  {buildUpgradeConfirmation.tileName}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-white px-3 py-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50">
                    {buildUpgradeConfirmation.targetSpriteSrc ? (
                      <Image
                        src={buildUpgradeConfirmation.targetSpriteSrc}
                        alt={buildUpgradeConfirmation.targetLabel}
                        width={72}
                        height={72}
                        className="h-[72px] w-[72px] object-contain"
                      />
                    ) : (
                      <span className="text-[11px] font-medium text-neutral-500">No image</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-neutral-500">
                      Target level {buildUpgradeConfirmation.targetLevel}
                    </p>
                    <p className="text-sm font-semibold capitalize text-neutral-900">
                      {buildUpgradeConfirmation.targetLabel}
                    </p>
                    <p className="text-xs leading-relaxed text-neutral-600">
                      {buildUpgradeConfirmation.targetNarrative}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
                <p>{buildUpgradeConfirmation.paymentSummary}</p>
              </div>
            </div>
          ) : null
        }
        confirmLabel={actionLoading === "BUILD_HOUSE" ? "Upgrading…" : "Confirm"}
        cancelLabel="Cancel"
        isConfirming={actionLoading === "BUILD_HOUSE"}
        onConfirm={() => {
          if (!buildUpgradeConfirmation || actionLoading === "BUILD_HOUSE") {
            return;
          }
          const request: BankActionRequest = {
            action: "BUILD_HOUSE",
            tileIndex: buildUpgradeConfirmation.tileIndex,
            ...(buildUpgradeConfirmation.useConstructionVoucher
              ? { useConstructionVoucher: buildUpgradeConfirmation.useConstructionVoucher }
              : {}),
          };
          setBuildUpgradeConfirmation(null);
          void handleBankAction(request);
        }}
        onCancel={() => {
          if (actionLoading === "BUILD_HOUSE") {
            return;
          }
          setBuildUpgradeConfirmation(null);
        }}
      />
      <ConfirmActionModalV2
        open={showEndSessionConfirm}
        title="End session for everyone?"
        description="This will end the game and send all players back to Home."
        confirmLabel={actionLoading === "END_GAME" ? "Ending…" : "End Session"}
        cancelLabel="Cancel"
        isConfirming={isActionInFlight}
        onConfirm={() => {
          if (isActionInFlight) {
            return;
          }
          setShowEndSessionConfirm(false);
          void handleEndSessionV2();
        }}
        onCancel={() => {
          if (isActionInFlight) {
            return;
          }
          setShowEndSessionConfirm(false);
        }}
      />
      <ConfirmActionModalV2
        open={showLeaveConfirm}
        title="Surrender?"
        description={
          <div className="space-y-1">
            <p>You will forfeit this game and be removed from play.</p>
            <p>Your assets will be liquidated according to game rules.</p>
            <p>This cannot be undone.</p>
          </div>
        }
        confirmLabel={actionLoading === "SURRENDER_GAME" ? "Surrendering…" : "Surrender"}
        cancelLabel="Cancel"
        isConfirming={isActionInFlight}
        onConfirm={() => {
          if (isActionInFlight) {
            return;
          }
          setShowLeaveConfirm(false);
          void handleLeaveTableV2();
        }}
        onCancel={() => {
          if (isActionInFlight) {
            return;
          }
          setShowLeaveConfirm(false);
        }}
      />
      <ConfirmActionModalV2
        open={sellToMarketSelection !== null}
        title={
          sellToMarketSelection
            ? `Sell ${sellToMarketSelection.name} to the Bank?`
            : "Sell property to the Bank?"
        }
        description={
          sellToMarketSelection ? (
            <div className="space-y-1">
              <p>Market value: {formatMoney(sellToMarketSelection.marketValue)}</p>
              <p>Bank payout: {formatMoney(sellToMarketSelection.payout)}</p>
            </div>
          ) : (
            "Review sale details before confirming."
          )
        }
        confirmLabel="Sell Property"
        cancelLabel="Cancel"
        isConfirming={actionLoading === "SELL_TO_MARKET"}
        onConfirm={handleConfirmSellToMarket}
        onCancel={() => setSellToMarketTileIndex(null)}
      />
      <AuctionOverlayV2
        auctionActive={auctionActive}
        auctionTile={auctionTile}
        highestBid={auctionHighestBid}
        highestBidderName={auctionHighestBidderName}
        turnPlayerId={auctionTurnPlayerId}
        turnPlayerName={auctionTurnPlayerName}
        auctionCountdownLabel={auctionCountdownLabel}
        auctionRemainingSeconds={auctionRemainingSeconds}
        canAct={canActInAuction}
        minIncrement={auctionMinIncrement}
        bidderCash={currentBidderCash}
        actionLoading={actionLoading}
        boardPackEconomy={
          selectedBoardPack?.economy ?? DEFAULT_BOARD_PACK_ECONOMY
        }
        onBid={handleAuctionBid}
        onPass={handleAuctionPass}
      />
      {openInlandDecisionCellKey &&
      selectedInteriorCell &&
      isOwnedDiscoveredDecisionCell &&
      selectedDiscoveredDecisionResourceType ? (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-[#2A1709]/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-emerald-200/35 bg-[#4E3018]/95 p-5 text-white shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/80">
              Exploration
            </p>
            <p className="mt-2 flex items-center gap-2 text-lg font-semibold">
              {getInlandResourceIconSrc(selectedDiscoveredDecisionResourceType) ? (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#f3f0e6]/85 p-1">
                  <Image
                    src={getInlandResourceIconSrc(selectedDiscoveredDecisionResourceType) ?? ""}
                    alt=""
                    width={24}
                    height={24}
                    aria-hidden
                    className="h-full w-full object-contain"
                  />
                </span>
              ) : (
                <span>{getInlandResourceConfig(selectedDiscoveredDecisionResourceType).icon}</span>
              )}
              {getInlandResourceConfig(selectedDiscoveredDecisionResourceType).label}
            </p>
            {isInstantSellResource(selectedDiscoveredDecisionResourceType) ? (
              <p className="mt-2 text-sm text-white/75">
                Sell now for{" "}
                {formatMoney(
                  getInlandSellValue(
                    selectedDiscoveredDecisionResourceType,
                    inlandGoSalary,
                  ) ?? 0,
                )}
                .
              </p>
            ) : isDevelopableResource(selectedDiscoveredDecisionResourceType) ? (
              <p className="mt-2 text-sm text-white/75">
                Develop this site for{" "}
                {formatMoney(
                  getInlandDevelopmentCost(
                    selectedDiscoveredDecisionResourceType,
                    inlandGoSalary,
                  ) ?? 0,
                )}
                .
              </p>
            ) : isNoneResource(selectedDiscoveredDecisionResourceType) ? (
              <p className="mt-2 text-sm text-white/75">
                This tile is empty land. Resolve it to continue.
              </p>
            ) : (
              <p className="mt-2 text-sm text-white/75">
                Claim voucher reward:
                {" "}
                {selectedDiscoveredDecisionResourceType === "TIMBER"
                  ? "+1 free build token"
                  : "+1 free upgrade token"}
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                    void handleInlandResourceDecision(
                    isDevelopableResource(selectedDiscoveredDecisionResourceType)
                      ? "DEVELOP_INTERIOR_SITE"
                      : "SELL_INTERIOR_RESOURCE",
                    selectedInteriorCell,
                  )
                }
                className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-200/25 bg-emerald-500/20 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/30"
              >
                {isDevelopableResource(selectedDiscoveredDecisionResourceType)
                  ? "Develop"
                  : isInstantSellResource(selectedDiscoveredDecisionResourceType)
                    ? "Sell"
                    : isNoneResource(selectedDiscoveredDecisionResourceType)
                      ? "Acknowledge"
                      : "Claim"}
              </button>
              <button
                type="button"
                onClick={() =>
                  void handleInlandResourceDecision(
                    "DEFER_INTERIOR_RESOURCE_DECISION",
                    selectedInteriorCell,
                  )
                }
                className="inline-flex w-full items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {/*
        Verification checklist:
        - Landing on property shows decision modal.
        - Card reveal blocks until confirmed.
        - Macro reveal blocks until confirmed.
        - Go To Jail blocks until acknowledged.
        - Property decline triggers auction.
        - Bidding works.
        - Auction resolves.
        - Turn proceeds correctly.
        - No stuck state.
      */}
    </>
  );
}
