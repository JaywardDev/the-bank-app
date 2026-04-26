import type { BoardTile } from "@/lib/boardPacks";
import { getTileBandColor } from "@/lib/boardTileStyles";

type PendingPurchase = {
  type: "BUY_PROPERTY";
  player_id: string | null;
  tile_index: number;
  price: number;
  base_price?: number;
  property_purchase_discount_pct?: number;
  property_purchase_discount_macro_name?: string | null;
};

type PendingPurchaseModalV2Props = {
  pendingPurchase: PendingPurchase | null;
  pendingTile: BoardTile | null;
  actorName: string | null;
  isActor: boolean;
  actionLoading: string | null;
  canAffordPurchase: boolean;
  canAffordMortgage: boolean;
  selectedDownPaymentPercent: number;
  minDownPaymentPercent: number;
  maxDownPaymentPercent: number;
  mortgageDownPaymentPercent: number;
  downPaymentAmountLabel: string;
  mortgageAmountLabel: string;
  perTurnPaymentLabel: string;
  priceLabel: string;
  discountSummary?: string | null;
  onDecreaseDownPayment: () => void;
  onIncreaseDownPayment: () => void;
  onBuy: () => void;
  onBuyWithMortgage: () => void;
  onAuction: () => void;
};

export default function PendingPurchaseModalV2({
  pendingPurchase,
  pendingTile,
  actorName,
  isActor,
  actionLoading,
  canAffordPurchase,
  canAffordMortgage,
  selectedDownPaymentPercent,
  minDownPaymentPercent,
  maxDownPaymentPercent,
  mortgageDownPaymentPercent,
  downPaymentAmountLabel,
  mortgageAmountLabel,
  perTurnPaymentLabel,
  priceLabel,
  discountSummary,
  onDecreaseDownPayment,
  onIncreaseDownPayment,
  onBuy,
  onBuyWithMortgage,
  onAuction,
}: PendingPurchaseModalV2Props) {
  if (!pendingPurchase) {
    return null;
  }

  const tileBandColor = getTileBandColor(pendingTile);

  return (
    <div className="w-full rounded-3xl border border-amber-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Pending decision</p>
      <div className="mt-1 flex items-stretch gap-2">
        <span
          aria-hidden="true"
          className="w-1 shrink-0 rounded-full"
          style={{ backgroundColor: tileBandColor }}
        />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-neutral-900">
            {pendingTile?.name ?? `Tile ${pendingPurchase.tile_index}`}
          </p>
          <p className="mt-1 text-sm text-neutral-600">Price: {priceLabel}</p>
        </div>
      </div>
      {discountSummary ? (
        <p className="mt-1 text-xs text-neutral-500">{discountSummary}</p>
      ) : null}

      {isActor ? (
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={onBuy}
            disabled={actionLoading === "BUY_PROPERTY" || !canAffordPurchase}
            className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-neutral-300"
            title={canAffordPurchase ? "Buy this property" : "Not enough cash to buy"}
          >
            {actionLoading === "BUY_PROPERTY" ? "Buying…" : "Buy"}
          </button>
          <button
            type="button"
            onClick={onBuyWithMortgage}
            disabled={actionLoading === "BUY_PROPERTY" || !canAffordMortgage}
            className="rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-400"
            title={
              canAffordMortgage
                ? `Financing: ${mortgageDownPaymentPercent}% mortgage (${selectedDownPaymentPercent}% down)`
                : "Not enough cash for down payment"
            }
          >
            {actionLoading === "BUY_PROPERTY"
              ? "Buying…"
              : "Buy with Mortgage"}
          </button>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-neutral-900">Down payment %</p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onDecreaseDownPayment}
                  disabled={selectedDownPaymentPercent <= minDownPaymentPercent}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-300 bg-white text-sm font-semibold text-neutral-800 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-400"
                  aria-label="Decrease down payment percentage"
                >
                  −
                </button>
                <span className="min-w-10 text-center text-sm font-semibold text-neutral-900">
                  {selectedDownPaymentPercent}%
                </span>
                <button
                  type="button"
                  onClick={onIncreaseDownPayment}
                  disabled={selectedDownPaymentPercent >= maxDownPaymentPercent}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-300 bg-white text-sm font-semibold text-neutral-800 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-400"
                  aria-label="Increase down payment percentage"
                >
                  +
                </button>
              </div>
            </div>
            <div className="mt-2 space-y-1 text-[11px] text-neutral-600">
              <p>Cash required now: {downPaymentAmountLabel}</p>
              <p>Mortgage amount: {mortgageAmountLabel}</p>
              <p>Per-turn payment: {perTurnPaymentLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onAuction}
            disabled={actionLoading === "DECLINE_PROPERTY"}
            className="rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-900 disabled:border-neutral-200 disabled:text-neutral-400"
            title="Start auction for this property"
          >
            {actionLoading === "DECLINE_PROPERTY" ? "Auctioning…" : "Auction"}
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-neutral-500">Waiting for {actorName ?? "player"}…</p>
      )}
    </div>
  );
}
