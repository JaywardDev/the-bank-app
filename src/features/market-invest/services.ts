import { supabaseClient } from "@/lib/supabase/client";
import type {
  FxRateRow,
  InvestHolding,
  InvestPrice,
  InvestSymbol,
  MarketPriceRow,
  PlayerHoldingRow,
} from "./types";

export const MARKET_INVEST_SYMBOLS: InvestSymbol[] = [
  "SPY",
  "BTC",
  "AAPL",
  "MSFT",
  "AMZN",
  "NVDA",
  "GOOGL",
  "META",
  "TSLA",
];

export const createEmptyMarketPrices = (): Record<InvestSymbol, InvestPrice> => ({
  SPY: { price: null, asOfDate: null },
  BTC: { price: null, asOfDate: null },
  AAPL: { price: null, asOfDate: null },
  MSFT: { price: null, asOfDate: null },
  AMZN: { price: null, asOfDate: null },
  NVDA: { price: null, asOfDate: null },
  GOOGL: { price: null, asOfDate: null },
  META: { price: null, asOfDate: null },
  TSLA: { price: null, asOfDate: null },
});

export const createEmptyPlayerHoldings = (): Record<InvestSymbol, InvestHolding> => ({
  SPY: { qty: 0, avgCostLocal: 0 },
  BTC: { qty: 0, avgCostLocal: 0 },
  AAPL: { qty: 0, avgCostLocal: 0 },
  MSFT: { qty: 0, avgCostLocal: 0 },
  AMZN: { qty: 0, avgCostLocal: 0 },
  NVDA: { qty: 0, avgCostLocal: 0 },
  GOOGL: { qty: 0, avgCostLocal: 0 },
  META: { qty: 0, avgCostLocal: 0 },
  TSLA: { qty: 0, avgCostLocal: 0 },
});

export const parseDecimal = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const fetchMarketPrices = async (accessToken?: string) => {
  const priceRows = await supabaseClient.fetchFromSupabase<MarketPriceRow[]>(
    "market_prices?select=symbol,price,as_of_date&symbol=in.(SPY,BTC,AAPL,MSFT,AMZN,NVDA,GOOGL,META,TSLA)",
    { method: "GET" },
    accessToken,
  );

  const nextPrices = createEmptyMarketPrices();
  for (const row of priceRows) {
    if (!(row.symbol in nextPrices)) {
      continue;
    }
    nextPrices[row.symbol] = {
      price: parseDecimal(row.price),
      asOfDate: row.as_of_date,
    };
  }
  return nextPrices;
};

export const fetchPlayerHoldings = async (
  playerId?: string | null,
  accessToken?: string,
) => {
  if (!playerId) {
    return createEmptyPlayerHoldings();
  }

  const holdingRows = await supabaseClient.fetchFromSupabase<PlayerHoldingRow[]>(
    `player_holdings?select=symbol,qty,avg_cost_local&player_id=eq.${playerId}&symbol=in.(SPY,BTC,AAPL,MSFT,AMZN,NVDA,GOOGL,META,TSLA)`,
    { method: "GET" },
    accessToken,
  );

  const nextHoldings = createEmptyPlayerHoldings();
  for (const row of holdingRows) {
    if (!(row.symbol in nextHoldings)) {
      continue;
    }
    nextHoldings[row.symbol] = {
      qty: parseDecimal(row.qty) ?? 0,
      avgCostLocal: parseDecimal(row.avg_cost_local) ?? 0,
    };
  }

  return nextHoldings;
};

export const fetchInvestFxRate = async (
  boardPackId: string | null | undefined,
  accessToken?: string,
) => {
  if (boardPackId === "new-zealand") {
    const [fxRow] = await supabaseClient.fetchFromSupabase<FxRateRow[]>(
      "fx_rates?select=pair,rate&pair=eq.NZDUSD&limit=1",
      { method: "GET" },
      accessToken,
    );
    return parseDecimal(fxRow?.rate) ?? 1;
  }

  if (boardPackId === "classic-ph" || boardPackId === "philippines-hard") {
    const [fxRow] = await supabaseClient.fetchFromSupabase<FxRateRow[]>(
      "fx_rates?select=pair,rate&pair=eq.USDPHP&limit=1",
      { method: "GET" },
      accessToken,
    );
    return parseDecimal(fxRow?.rate) ?? 1;
  }

  return 1;
};
