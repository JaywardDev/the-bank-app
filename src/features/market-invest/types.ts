export type InvestSymbol =
  | "SPY"
  | "BTC"
  | "AAPL"
  | "MSFT"
  | "AMZN"
  | "NVDA"
  | "GOOGL"
  | "META"
  | "TSLA";

export type TradeSide = "BUY" | "SELL";

export type InvestPrice = {
  price: number | null;
  asOfDate: string | null;
};

export type InvestHolding = {
  qty: number;
  avgCostLocal: number;
};

export type MarketPriceRow = {
  symbol: InvestSymbol;
  price: number | string | null;
  as_of_date: string | null;
};

export type PlayerHoldingRow = {
  symbol: InvestSymbol;
  qty: number | string | null;
  avg_cost_local: number | string | null;
};

export type FxRateRow = {
  pair: string;
  rate: number | string;
};

export type MarketTradeErrorResponse = {
  error?: string;
};

export type ManualMarketRefreshResponse = {
  error?: string;
  minutesRemaining?: number;
};

export type ManualMarketRefreshResult = {
  message: string | null;
  minutesRemaining?: number;
};
