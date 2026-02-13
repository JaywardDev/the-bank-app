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
  isRefreshingMarket: boolean;
  onRefreshMarket: () => Promise<string | null>;
  onTrade: (symbol: InvestSymbol, side: TradeSide, qty: number) => Promise<void>;
};

type InvestAssetRowProps = {
  symbol: InvestSymbol;
  name?: string;
  qty: number;
  hasPrice: boolean;
  marketValueLocal: number | null;
  pnlLocal: number | null;
  pnlPercent: number | null;
  priceLabel: string;
  asOfDate: string | null;
  localPriceLabel: string;
  avgCostUsd: number;
  maxQty: number;
  qtyInput: string;
  inputQty: number | null;
  tradeDisabled: boolean;
  isTrading: boolean;
  estFeeUsd: number | null;
  estGain: number | null;
  estTaxUsd: number | null;
  currencyDecimals: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  onQtyChange: (next: string) => void;
  onSetMaxQty: () => void;
  onTrade: (side: TradeSide, qty: number) => void;
  formatUsd: (amount: number, decimals?: number) => string;
  formatQty: (qty: number) => string;
  formatLocal: (amount: number, localCurrencyCode: string, decimals?: number) => string;
  currencyCode: string;
  showDivider: boolean;
};

const allSymbols: InvestSymbol[] = ["SPY", "BTC", "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "TSLA"];

const symbolNames: Partial<Record<InvestSymbol, string>> = {
  SPY: "S&P 500 ETF",
  BTC: "Bitcoin",
  AAPL: "Apple",
  MSFT: "Microsoft",
  AMZN: "Amazon",
  NVDA: "NVIDIA",
  GOOGL: "Alphabet",
  META: "Meta",
  TSLA: "Tesla",
};

const formatNumber = (value: number, decimals = 2) => {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

function InvestAssetRow({
  symbol,
  name,
  qty,
  hasPrice,
  marketValueLocal,
  pnlLocal,
  pnlPercent,
  priceLabel,
  asOfDate,
  localPriceLabel,
  avgCostUsd,
  maxQty,
  qtyInput,
  inputQty,
  tradeDisabled,
  isTrading,
  estFeeUsd,
  estGain,
  estTaxUsd,
  currencyDecimals,
  expanded,
  onToggleExpanded,
  onQtyChange,
  onSetMaxQty,
  onTrade,
  formatUsd,
  formatQty,
  formatLocal,
  currencyCode,
  showDivider,
}: InvestAssetRowProps) {
  const pnlToneClass = pnlLocal !== null && pnlLocal < 0 ? "text-rose-700" : "text-emerald-700";

  return (
    <div className={showDivider ? "border-b border-neutral-200" : ""}>
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 px-1 py-3 text-left"
        onClick={onToggleExpanded}
      >
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-neutral-900">{symbol}</p>
            {name ? <p className="text-[11px] text-neutral-500">{name}</p> : null}
          </div>
          <p className="text-xs text-neutral-600">{formatQty(qty)} shares</p>
        </div>
        <div className="text-right">
          {hasPrice ? (
            <>
              <p className="text-sm font-semibold text-neutral-900">
                {marketValueLocal !== null ? formatLocal(marketValueLocal, currencyCode, currencyDecimals) : "—"}
              </p>
              <p className={`text-xs ${pnlToneClass}`}>
                {pnlLocal !== null ? formatLocal(pnlLocal, currencyCode, currencyDecimals) : "—"}
                {pnlPercent !== null ? ` (${pnlPercent >= 0 ? "+" : ""}${formatNumber(pnlPercent, 2)}%)` : ""}
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-neutral-500">Market not updated</p>
              <p className="text-xs text-neutral-500">Value: — · P/L: —</p>
            </>
          )}
          <p className="text-xs text-neutral-400">{expanded ? "▾" : "▸"}</p>
        </div>
      </button>

      {expanded ? (
        <div className="rounded-lg bg-neutral-50 px-3 pb-3 pt-2">
          <p className="text-xs text-neutral-500">
            {hasPrice ? `${priceLabel}${asOfDate ? ` · ${asOfDate}` : ""}` : "Market not updated"}
          </p>
          <p className="mt-1 text-xs text-neutral-500">{hasPrice ? `≈ ${localPriceLabel}` : ""}</p>
          <p className="mt-1 text-xs text-neutral-600">
            Qty: {formatQty(qty)} · Avg: {formatUsd(avgCostUsd)}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              className="w-24 rounded-xl border border-neutral-300 px-2 py-1 text-sm text-neutral-700"
              type="number"
              min="0"
              step="0.01"
              value={qtyInput}
              onChange={(event) => onQtyChange(event.target.value)}
              placeholder="Qty"
            />
            <button
              className="rounded-xl border border-neutral-300 px-2 py-1 text-[11px] font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:border-neutral-100 disabled:text-neutral-300"
              type="button"
              disabled={!hasPrice || maxQty <= 0 || isTrading}
              onClick={onSetMaxQty}
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
                onTrade("BUY", inputQty);
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
                onTrade("SELL", inputQty);
              }}
            >
              Sell
            </button>
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">
            Est. fee: {estFeeUsd !== null ? formatUsd(estFeeUsd, currencyDecimals) : "—"}
          </p>
          <p className="text-[11px] text-neutral-500">Tax is charged only on profit when you sell.</p>
          {inputQty !== null && inputQty > 0 && qty > 0 && estGain !== null && estTaxUsd !== null ? (
            <p className="text-[11px] text-neutral-500">
              Est. gain: {formatUsd(estGain, currencyDecimals)} · Est. tax: {formatUsd(estTaxUsd, currencyDecimals)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

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
  isRefreshingMarket,
  onRefreshMarket,
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
  const [expandedSymbol, setExpandedSymbol] = useState<InvestSymbol | null>(null);
  const [refreshErrorToast, setRefreshErrorToast] = useState<string | null>(null);

  useEffect(() => {
    if (!refreshErrorToast) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setRefreshErrorToast(null);
    }, 4000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [refreshErrorToast]);

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

  const renderAssetRow = (symbol: InvestSymbol, index: number) => {
    const priceRow = prices[symbol];
    const holding = holdings[symbol];
    const qty = holding?.qty ?? 0;
    const avgCostUsd = holding?.avgCostLocal ?? 0;
    const price = priceRow?.price ?? null;
    const hasPrice = typeof price === "number";
    const priceUsd = hasPrice ? price : null;

    const marketValueUsd = priceUsd !== null ? qty * priceUsd : null;
    const feeAdjustedAvgCostUsd = avgCostUsd * (1 + feeRate);
    const costBasisUsd = qty * feeAdjustedAvgCostUsd;
    const pnlUsd = marketValueUsd !== null ? marketValueUsd - costBasisUsd : null;
    const pnlPercent = costBasisUsd > 0 && pnlUsd !== null ? (pnlUsd / costBasisUsd) * 100 : null;

    const marketValueLocal = marketValueUsd !== null ? marketValueUsd * usdToLocal : null;
    const pnlLocal = pnlUsd !== null ? pnlUsd * usdToLocal : null;
    const localPrice = priceUsd !== null ? priceUsd * usdToLocal : null;

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

    return (
      <InvestAssetRow
        key={symbol}
        symbol={symbol}
        name={symbolNames[symbol]}
        qty={qty}
        hasPrice={hasPrice}
        marketValueLocal={marketValueLocal}
        pnlLocal={pnlLocal}
        pnlPercent={pnlPercent}
        priceLabel={priceUsd !== null ? formatUsd(priceUsd) : ""}
        asOfDate={priceRow?.asOfDate ?? null}
        localPriceLabel={localPrice !== null ? formatLocal(localPrice, currencyCode, currencyDecimals) : ""}
        avgCostUsd={avgCostUsd}
        maxQty={maxQty}
        qtyInput={qtyInputs[symbol]}
        inputQty={inputQty}
        tradeDisabled={tradeDisabled}
        isTrading={isTrading}
        estFeeUsd={estFeeUsd}
        estGain={estGain}
        estTaxUsd={estTaxUsd}
        currencyDecimals={currencyDecimals}
        expanded={expandedSymbol === symbol}
        onToggleExpanded={() => setExpandedSymbol((prev) => (prev === symbol ? null : symbol))}
        onQtyChange={(next) =>
          setQtyInputs((prev) => ({
            ...prev,
            [symbol]: next,
          }))
        }
        onSetMaxQty={() =>
          setQtyInputs((prev) => ({
            ...prev,
            [symbol]: String(maxQty),
          }))
        }
        onTrade={(side, tradeQty) => {
          void onTrade(symbol, side, tradeQty);
        }}
        formatUsd={formatUsd}
        formatQty={formatQty}
        formatLocal={formatLocal}
        currencyCode={currencyCode}
        showDivider={index < allSymbols.length - 1}
      />
    );
  };

  return (
    <section className="rounded-2xl bg-white/95 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] ring-1 ring-black/5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Invest in Markets</p>
          <p className="text-xs text-neutral-500">Grow your money through stocks and crypto.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-sm text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-800 disabled:cursor-not-allowed disabled:border-neutral-100 disabled:text-neutral-300"
            type="button"
            aria-label="Refresh Market Prices"
            title="Refresh Market Prices"
            disabled={isRefreshingMarket}
            onClick={() => {
              void onRefreshMarket()
                .then((message) => {
                  if (message) {
                    setRefreshErrorToast(message);
                  }
                })
                .catch((error) => {
                  const message = error instanceof Error ? error.message : "Failed to refresh market prices.";
                  setRefreshErrorToast(message);
                });
            }}
          >
            {isRefreshingMarket ? "…" : "↻"}
          </button>
          <button
            className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-800"
            type="button"
            onClick={onToggleCollapsed}
          >
            {collapsed ? "Show" : "Hide"}
          </button>
        </div>
      </div>

      {refreshErrorToast ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{refreshErrorToast}</p>
      ) : null}

      {collapsed ? null : (
        <div className="space-y-3">
          {tradeError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{tradeError}</p>
          ) : null}

          <div className="space-y-0">{allSymbols.map(renderAssetRow)}</div>
        </div>
      )}
    </section>
  );
}
