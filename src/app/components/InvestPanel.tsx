"use client";

import { useMemo, useState } from "react";
import { MARKET_CONFIG } from "@/lib/marketConfig";

export type InvestSymbol = "SPY" | "BTC";
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
  formatMoney: (amount: number, currencySymbol?: string) => string;
};

const symbols: InvestSymbol[] = ["SPY", "BTC"];

const formatCompactNumber = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: value >= 1000 ? 0 : 2,
    maximumFractionDigits: 2,
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
  formatMoney,
}: InvestPanelProps) {
  const [qtyInputs, setQtyInputs] = useState<Record<InvestSymbol, string>>({
    SPY: "",
    BTC: "",
  });

  const feeRate = MARKET_CONFIG.tradingFeeRate;
  const taxRate = MARKET_CONFIG.capitalGainsTaxRate;

  const parsedQty = useMemo(() => {
    return symbols.reduce<Record<InvestSymbol, number | null>>(
      (acc, symbol) => {
        const input = Number(qtyInputs[symbol]);
        acc[symbol] = Number.isFinite(input) && input > 0 ? input : null;
        return acc;
      },
      { SPY: null, BTC: null },
    );
  }, [qtyInputs]);

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
          {symbols.map((symbol) => {
            const priceRow = prices[symbol];
            const holding = holdings[symbol];
            const qty = holding?.qty ?? 0;
            const avgCost = holding?.avgCostLocal ?? 0;
            const price = priceRow?.price ?? null;
            const hasPrice = typeof price === "number";
            const localPrice = hasPrice ? price * fxRate : null;
            const marketValue = localPrice !== null ? qty * localPrice : null;
            const costBasis = qty * avgCost;
            const unrealizedPl = marketValue !== null ? marketValue - costBasis : null;
            const inputQty = parsedQty[symbol];
            const tradeDisabled = isTrading || !hasPrice || inputQty === null;
            const estFee = localPrice !== null && inputQty ? inputQty * localPrice * feeRate : null;
            const sellQty = inputQty ? Math.min(inputQty, qty) : 0;
            const estProceeds = localPrice !== null && sellQty > 0 ? sellQty * localPrice : null;
            const sellCostBasis = sellQty > 0 ? sellQty * avgCost : null;
            const estGain =
              estProceeds !== null && estFee !== null && sellCostBasis !== null
                ? estProceeds - estFee - sellCostBasis
                : null;
            const estTax = estGain !== null ? Math.max(estGain, 0) * taxRate : null;
            const maxQty =
              localPrice !== null && localPrice > 0
                ? Math.max(Math.floor(cashLocal / (localPrice * (1 + feeRate))), 0)
                : 0;
            const localPricePrefix =
              currencyCode === "NZD" ? "NZ" : currencyCode === "PHP" ? "PHP" : "USD";

            return (
              <div
                key={symbol}
                className={`rounded-xl border p-3 ${qty > 0 ? "border-neutral-200 bg-white" : "border-neutral-200/80 bg-neutral-50"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-neutral-800">{symbol}</p>
                  <p className="text-xs text-neutral-500">
                    {hasPrice
                      ? `US$${formatCompactNumber(price)}${priceRow.asOfDate ? ` · ${priceRow.asOfDate}` : ""}`
                      : "Market not updated"}
                  </p>
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  {localPrice !== null ? `≈ ${localPricePrefix}${currencySymbol}${formatCompactNumber(localPrice)}` : ""}
                </p>
                <p className="mt-1 text-xs text-neutral-600">
                  Qty: {formatCompactNumber(qty)} · Avg: {formatMoney(avgCost, currencySymbol)}
                </p>
                <p className="text-xs text-neutral-600">
                  Value: {marketValue !== null ? formatMoney(marketValue, currencySymbol) : "—"} · P/L:{" "}
                  <span className={unrealizedPl !== null && unrealizedPl < 0 ? "text-rose-700" : "text-emerald-700"}>
                    {unrealizedPl !== null ? formatMoney(unrealizedPl, currencySymbol) : "—"}
                  </span>
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
                  <span className="text-[11px] text-neutral-500">Max: {formatCompactNumber(maxQty)}</span>
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
                  Est. fee: {estFee !== null ? formatMoney(estFee, currencySymbol) : "—"}
                </p>
                <p className="text-[11px] text-neutral-500">
                  Tax is charged only on profit when you sell.
                </p>
                {inputQty !== null && inputQty > 0 && qty > 0 && estGain !== null && estTax !== null ? (
                  <p className="text-[11px] text-neutral-500">
                    Est. gain: {formatMoney(estGain, currencySymbol)} · Est. tax: {formatMoney(estTax, currencySymbol)}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
