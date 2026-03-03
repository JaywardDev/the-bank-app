import type { BoardTile } from "@/lib/boardPacks";

type PendingPurchase = {
  type: "BUY_PROPERTY";
  player_id: string | null;
  tile_index: number;
  price: number;
};

type PendingPurchaseModalV2Props = {
  pendingPurchase: PendingPurchase | null;
  pendingTile: BoardTile | null;
  actorName: string | null;
  isActor: boolean;
  actionLoading: string | null;
  onBuy: () => void;
  onDecline: () => void;
};

export default function PendingPurchaseModalV2({
  pendingPurchase,
  pendingTile,
  actorName,
  isActor,
  actionLoading,
  onBuy,
  onDecline,
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
      <p className="mt-1 text-sm text-neutral-600">Price: ${pendingPurchase.price}</p>

      {isActor ? (
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={onBuy}
            disabled={actionLoading === "BUY_PROPERTY"}
            className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-neutral-300"
          >
            {actionLoading === "BUY_PROPERTY" ? "Buying…" : "Buy"}
          </button>
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-2xl border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-400"
            title="Auction is not implemented in V2 yet"
          >
            Auction (soon)
          </button>
          <button
            type="button"
            onClick={onDecline}
            disabled={actionLoading === "DECLINE_PROPERTY"}
            className="rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-900 disabled:border-neutral-200 disabled:text-neutral-400"
          >
            {actionLoading === "DECLINE_PROPERTY" ? "Declining…" : "Decline"}
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-neutral-500">Waiting for {actorName ?? "player"}…</p>
      )}
    </div>
  );
}
