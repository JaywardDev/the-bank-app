import { useCallback, useState } from "react";
import { supabaseClient, type SupabaseSession } from "@/lib/supabase/client";
import {
  createEmptyMarketPrices,
  createEmptyPlayerHoldings,
  fetchInvestFxRate,
  fetchMarketPrices,
  fetchPlayerHoldings,
} from "./services";
import type {
  InvestHolding,
  InvestPrice,
  InvestSymbol,
  ManualMarketRefreshResponse,
  ManualMarketRefreshResult,
  MarketTradeErrorResponse,
  TradeSide,
} from "./types";

type UseMarketInvestControllerArgs = {
  gameId: string | null;
  boardPackId: string | null | undefined;
  playerId: string | null | undefined;
  accessToken: string | null | undefined;
  onSessionUpdated?: (session: SupabaseSession | null) => void;
  onReloadGameData?: (activeGameId: string, accessToken: string) => Promise<void>;
};

type UseMarketInvestControllerResult = {
  marketPrices: Record<InvestSymbol, InvestPrice>;
  investFxRate: number;
  playerHoldings: Record<InvestSymbol, InvestHolding>;
  isTradeSubmitting: boolean;
  tradeError: string | null;
  isMarketRefreshSubmitting: boolean;
  loadMarketPrices: (accessTokenOverride?: string) => Promise<void>;
  loadInvestFxRate: (
    boardPackIdOverride?: string | null | undefined,
    accessTokenOverride?: string,
  ) => Promise<void>;
  loadPlayerHoldings: (
    playerIdOverride?: string | null,
    accessTokenOverride?: string,
  ) => Promise<void>;
  handleMarketTrade: (symbol: InvestSymbol, side: TradeSide, qty: number) => Promise<void>;
  handleManualMarketRefresh: () => Promise<ManualMarketRefreshResult>;
};

export const useMarketInvestController = ({
  gameId,
  boardPackId,
  playerId,
  accessToken,
  onSessionUpdated,
  onReloadGameData,
}: UseMarketInvestControllerArgs): UseMarketInvestControllerResult => {
  const [marketPrices, setMarketPrices] = useState<Record<InvestSymbol, InvestPrice>>(
    createEmptyMarketPrices(),
  );
  const [investFxRate, setInvestFxRate] = useState(1);
  const [playerHoldings, setPlayerHoldings] = useState<
    Record<InvestSymbol, InvestHolding>
  >(createEmptyPlayerHoldings());
  const [isTradeSubmitting, setIsTradeSubmitting] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [isMarketRefreshSubmitting, setIsMarketRefreshSubmitting] = useState(false);

  const loadMarketPrices = useCallback(async (accessTokenOverride?: string) => {
    const nextPrices = await fetchMarketPrices(accessTokenOverride ?? accessToken ?? undefined);
    setMarketPrices(nextPrices);
  }, [accessToken]);

  const loadInvestFxRate = useCallback(
    async (
      boardPackIdOverride?: string | null | undefined,
      accessTokenOverride?: string,
    ) => {
      const nextFxRate = await fetchInvestFxRate(
        boardPackIdOverride ?? boardPackId,
        accessTokenOverride ?? accessToken ?? undefined,
      );
      setInvestFxRate(nextFxRate);
    },
    [accessToken, boardPackId],
  );

  const loadPlayerHoldings = useCallback(
    async (playerIdOverride?: string | null, accessTokenOverride?: string) => {
      const nextHoldings = await fetchPlayerHoldings(
        playerIdOverride ?? playerId,
        accessTokenOverride ?? accessToken ?? undefined,
      );
      setPlayerHoldings(nextHoldings);
    },
    [accessToken, playerId],
  );

  const handleMarketTrade = useCallback(
    async (symbol: InvestSymbol, side: TradeSide, qty: number) => {
      const resolvedAccessToken = accessToken ?? null;
      if (!gameId || !resolvedAccessToken) {
        setTradeError("Missing session. Please refresh and sign in again.");
        return;
      }

      setIsTradeSubmitting(true);
      setTradeError(null);

      try {
        const payload = {
          symbol,
          side: side.toUpperCase() as TradeSide,
          qty: Number(qty),
        };

        if (process.env.NODE_ENV !== "production") {
          console.debug("market trade payload", payload);
        }

        const response = await fetch("/api/market/trade", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resolvedAccessToken}`,
          },
          body: JSON.stringify(payload),
        });

        const responseBody = (await response.json()) as MarketTradeErrorResponse;
        if (!response.ok) {
          throw new Error(responseBody.error ?? "Trade failed.");
        }

        await Promise.all([
          onReloadGameData?.(gameId, resolvedAccessToken),
          loadPlayerHoldings(playerId, resolvedAccessToken),
        ]);
      } catch (error) {
        setTradeError(error instanceof Error ? error.message : "Trade failed.");
      } finally {
        setIsTradeSubmitting(false);
      }
    },
    [accessToken, gameId, loadPlayerHoldings, onReloadGameData, playerId],
  );

  const handleManualMarketRefresh = useCallback(async () => {
    if (isMarketRefreshSubmitting) {
      return { message: null };
    }

    let resolvedAccessToken = accessToken ?? null;
    if (!resolvedAccessToken) {
      const refreshedSession = await supabaseClient.refreshSession();
      onSessionUpdated?.(refreshedSession);

      if (!refreshedSession?.access_token) {
        throw new Error("Missing session. Please refresh and sign in again.");
      }

      resolvedAccessToken = refreshedSession.access_token;
    }

    setIsMarketRefreshSubmitting(true);

    try {
      const response = await fetch("/api/market/refresh-manual", {
        method: "POST",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${resolvedAccessToken}`,
        },
      });

      const responseBody = (await response.json()) as ManualMarketRefreshResponse;

      if (response.status === 429 && responseBody.error === "REFRESH_COOLDOWN") {
        const minutesRemaining = Math.min(
          10,
          Math.max(responseBody.minutesRemaining ?? 1, 1),
        );
        return {
          message: `Market was refreshed recently. Try again in ${minutesRemaining} minutes.`,
          minutesRemaining,
        };
      }

      if (!response.ok) {
        throw new Error(responseBody.error ?? "Failed to refresh market prices.");
      }

      if (gameId && onReloadGameData) {
        await onReloadGameData(gameId, resolvedAccessToken);
      } else {
        await Promise.all([
          loadMarketPrices(resolvedAccessToken),
          loadInvestFxRate(boardPackId, resolvedAccessToken),
        ]);
      }

      return { message: null };
    } finally {
      setIsMarketRefreshSubmitting(false);
    }
  }, [
    accessToken,
    boardPackId,
    gameId,
    isMarketRefreshSubmitting,
    loadInvestFxRate,
    loadMarketPrices,
    onReloadGameData,
    onSessionUpdated,
  ]);

  return {
    marketPrices,
    investFxRate,
    playerHoldings,
    isTradeSubmitting,
    tradeError,
    isMarketRefreshSubmitting,
    loadMarketPrices,
    loadInvestFxRate,
    loadPlayerHoldings,
    handleMarketTrade,
    handleManualMarketRefresh,
  };
};
