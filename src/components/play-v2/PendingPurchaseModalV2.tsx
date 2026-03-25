import type { BoardTile } from "@/lib/boardPacks";

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
  mortgageDownPaymentLabel: string;
  mortgageLtvPercent: number;
  mortgageDownPaymentPercent: number;
  priceLabel: string;
  discountSummary?: string | null;
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
  mortgageDownPaymentLabel,
  mortgageLtvPercent,
  mortgageDownPaymentPercent,
  priceLabel,
  discountSummary,
  onBuy,
  onBuyWithMortgage,
  onAuction,
}: PendingPurchaseModalV2Props) {
  if (!pendingPurchase) {
    return null;
  }

  return (
    <div className="w-full rounded-3xl border border-amber-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Pending decision</p>
      <p className="mt-1 text-lg font-semibold text-neutral-900">
        {pendingTile?.name ?? `Tile ${pendingPurchase.tile_index}`}
      </p>
      <p className="mt-1 text-sm text-neutral-600">Price: {priceLabel}</p>
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
                ? `Financing: ${mortgageLtvPercent}% (Down: ${mortgageDownPaymentPercent}%)`
                : "Not enough cash for down payment"
            }
          >
            {actionLoading === "BUY_PROPERTY"
              ? "Buying…"
              : `Buy with Mortgage (${mortgageDownPaymentLabel} down)`}
          </button>
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
