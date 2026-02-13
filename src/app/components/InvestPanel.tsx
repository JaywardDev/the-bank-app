"use client";

import { useEffect, useMemo, useState } from "react";
import { MARKET_CONFIG } from "@/lib/marketConfig";

export type InvestSymbol = "SPY" | "BTC" | "AAPL" | "MSFT" | "AMZN" | "NVDA" | "GOOGL" | "META" | "TSLA";
export type TradeSide = "BUY" | "SELL";

export type InvestPrice = {
  price: number | null;
  asOfDate: string | null;
};

export type InvestHolding = {
  qty: number;
  avgCostLocal: number;
};

type InvestPanelProps = {
  currencySymbol: string;
  currencyCode: string;
  cashLocal: number;
  fxRate: number;
  prices: Record<InvestSymbol, InvestPrice>;
  holdings: Record<InvestSymbol, InvestHolding>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  isTrading: boolean;
  tradeError: string | null;
  onTrade: (symbol: InvestSymbol, side: TradeSide, qty: number) => Promise<void>;
};

const coreSymbols: InvestSymbol[] = ["SPY", "BTC"];
const stockSymbols: InvestSymbol[] = ["AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "TSLA"];
const allSymbols: InvestSymbol[] = [...coreSymbols, ...stockSymbols];
const STOCKS_COLLAPSED_STORAGE_KEY = "ui.investStocksCollapsed";

const formatNumber = (value: number, decimals = 2) => {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

export default function InvestPanel({
  currencySymbol,
  currencyCode,
  cashLocal,
  fxRate,
  prices,
  holdings,
  collapsed,
  onToggleCollapsed,
  isTrading,
  tradeError,
  onTrade,
}: InvestPanelProps) {
  const [qtyInputs, setQtyInputs] = useState<Record<InvestSymbol, string>>({
    SPY: "",
    BTC: "",
    AAPL: "",
    MSFT: "",
    AMZN: "",
    NVDA: "",
    GOOGL: "",
    META: "",
    TSLA: "",
  });
  const [stocksCollapsed, setStocksCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return window.localStorage.getItem(STOCKS_COLLAPSED_STORAGE_KEY) !== "0";
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STOCKS_COLLAPSED_STORAGE_KEY, stocksCollapsed ? "1" : "0");
  }, [stocksCollapsed]);

  const feeRate = MARKET_CONFIG.tradingFeeRate;
  const taxRate = MARKET_CONFIG.capitalGainsTaxRate;
  const currencyDecimals = currencyCode === "USD" ? 2 : 0;
  // NZDUSD is quoted as USD per 1 NZD, so USD->NZD must use the inverse rate.
  const usdToLocal = currencyCode === "NZD" ? 1 / fxRate : fxRate;

  const formatUsd = (amount: number, decimals = 2) => {
    const sign = amount < 0 ? "-" : "";
    return `${sign}US$${formatNumber(Math.abs(amount), decimals)}`;
  };

  const formatLocal = (amount: number, localCurrencyCode: string, decimals = 2) => {
    const prefix =
      localCurrencyCode === "NZD"
        ? "NZ$"
        : localCurrencyCode === "USD"
          ? "US$"
          : currencySymbol;
    const sign = amount < 0 ? "-" : "";
    return `${sign}${prefix}${formatNumber(Math.abs(amount), decimals)}`;
  };

  const formatQty = (qty: number) =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(qty);

  const parsedQty = useMemo(() => {
    return allSymbols.reduce<Record<InvestSymbol, number | null>>(
      (acc, symbol) => {
        const input = Number(qtyInputs[symbol]);
        acc[symbol] = Number.isFinite(input) && input > 0 ? input : null;
        return acc;
      },
      { SPY: null, BTC: null, AAPL: null, MSFT: null, AMZN: null, NVDA: null, GOOGL: null, META: null, TSLA: null },
    );
  }, [qtyInputs]);

  const renderSymbolCard = (symbol: InvestSymbol) => {
    const priceRow = prices[symbol];
    const holding = holdings[symbol];
    const qty = holding?.qty ?? 0;
    const avgCost = holding?.avgCostLocal ?? 0;
    const price = priceRow?.price ?? null;
    const hasPrice = typeof price === "number";
    const priceUsd = hasPrice ? price : null;
    const marketValueUsd = priceUsd !== null ? qty * priceUsd : null;
    const feeAdjustedAvgCostUsd = avgCost * (1 + feeRate);
    const costBasisUsd = qty * feeAdjustedAvgCostUsd;
    const unrealizedPlUsd = marketValueUsd !== null ? marketValueUsd - costBasisUsd : null;
    const marketValueLocal = marketValueUsd !== null ? marketValueUsd * usdToLocal : null;
    const inputQty = parsedQty[symbol];
    const tradeDisabled = isTrading || !hasPrice || inputQty === null;
    const estFeeUsd = priceUsd !== null && inputQty ? inputQty * priceUsd * feeRate : null;
    const sellQty = inputQty ? Math.min(inputQty, qty) : 0;
    const estProceedsUsd = priceUsd !== null && sellQty > 0 ? sellQty * priceUsd : null;
    const sellCostBasisUsd = sellQty > 0 ? sellQty * feeAdjustedAvgCostUsd : null;
    const estGain =
      estProceedsUsd !== null && estFeeUsd !== null && sellCostBasisUsd !== null
        ? estProceedsUsd - estFeeUsd - sellCostBasisUsd
        : null;
    const estTaxUsd = estGain !== null ? Math.max(estGain, 0) * taxRate : null;
    const maxQty =
      priceUsd !== null && usdToLocal > 0 && priceUsd > 0
        ? Math.max(Math.floor(cashLocal / (priceUsd * usdToLocal * (1 + feeRate))), 0)
        : 0;
    const localPrice = priceUsd !== null ? priceUsd * usdToLocal : null;

    return (
      <div
        key={symbol}
        className={`rounded-xl border p-3 ${qty > 0 ? "border-neutral-200 bg-white" : "border-neutral-200/80 bg-neutral-50"}`}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-neutral-800">{symbol}</p>
          <p className="text-xs text-neutral-500">
            {hasPrice
              ? `${formatUsd(price)}${priceRow.asOfDate ? ` · ${priceRow.asOfDate}` : ""}`
              : "Market not updated"}
          </p>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          {localPrice !== null ? `≈ ${formatLocal(localPrice, currencyCode, currencyDecimals)}` : ""}
        </p>
        <p className="mt-1 text-xs text-neutral-600">
          Qty: {formatQty(qty)} · Avg: {formatUsd(avgCost)}
        </p>
        <p className="text-xs text-neutral-600">
          Value: {marketValueUsd !== null ? formatUsd(marketValueUsd, currencyDecimals) : "—"} · P/L:{" "}
          <span
            className={
              unrealizedPlUsd !== null && unrealizedPlUsd < 0 ? "text-rose-700" : "text-emerald-700"
            }
          >
            {unrealizedPlUsd !== null ? formatUsd(unrealizedPlUsd, currencyDecimals) : "—"}
          </span>
        </p>
        <p className="text-xs text-neutral-500">
          ≈ Value: {marketValueLocal !== null ? formatLocal(marketValueLocal, currencyCode, currencyDecimals) : "—"}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            className="w-24 rounded-xl border border-neutral-300 px-2 py-1 text-sm text-neutral-700"
            type="number"
            min="0"
            step="0.01"
            value={qtyInputs[symbol]}
            onChange={(event) =>
              setQtyInputs((prev) => ({
                ...prev,
                [symbol]: event.target.value,
              }))
            }
            placeholder="Qty"
          />
          <button
            className="rounded-xl border border-neutral-300 px-2 py-1 text-[11px] font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:border-neutral-100 disabled:text-neutral-300"
            type="button"
            disabled={!hasPrice || maxQty <= 0 || isTrading}
            onClick={() =>
              setQtyInputs((prev) => ({
                ...prev,
                [symbol]: String(maxQty),
              }))
            }
          >
            MAX
          </button>
          <span className="text-[11px] text-neutral-500">Max: {formatQty(maxQty)}</span>
          <button
            className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-indigo-200"
            type="button"
            disabled={tradeDisabled}
            onClick={() => {
              if (!inputQty) {
                return;
              }
              void onTrade(symbol, "BUY", inputQty);
            }}
          >
            Buy
          </button>
          <button
            className="rounded-xl border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:border-neutral-100 disabled:text-neutral-300"
            type="button"
            disabled={tradeDisabled}
            onClick={() => {
              if (!inputQty) {
                return;
              }
              void onTrade(symbol, "SELL", inputQty);
            }}
          >
            Sell
          </button>
        </div>
        <p className="mt-1 text-[11px] text-neutral-500">
          Est. fee: {estFeeUsd !== null ? formatUsd(estFeeUsd, currencyDecimals) : "—"}
        </p>
        <p className="text-[11px] text-neutral-500">
          Tax is charged only on profit when you sell.
        </p>
        {inputQty !== null && inputQty > 0 && qty > 0 && estGain !== null && estTaxUsd !== null ? (
          <p className="text-[11px] text-neutral-500">
            Est. gain: {formatUsd(estGain, currencyDecimals)} · Est. tax: {formatUsd(estTaxUsd, currencyDecimals)}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <section className="rounded-2xl bg-white/95 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] ring-1 ring-black/5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Invest in Markets
          </p>
          <p className="text-xs text-neutral-500">Grow your money through stocks and crypto.</p>
        </div>
        <button
          className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-800"
          type="button"
          onClick={onToggleCollapsed}
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>

      {collapsed ? null : (
        <div className="space-y-3">
          {tradeError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {tradeError}
            </p>
          ) : null}

          {coreSymbols.map(renderSymbolCard)}

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left"
              onClick={() => setStocksCollapsed((prev) => !prev)}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Stocks (Mag 7)</p>
              <span className="text-xs font-semibold text-neutral-600">{stocksCollapsed ? "Show" : "Hide"}</span>
            </button>

            {stocksCollapsed ? null : <div className="mt-3 space-y-3">{stockSymbols.map(renderSymbolCard)}</div>}
          </div>
        </div>
      )}
    </section>
  );
}
