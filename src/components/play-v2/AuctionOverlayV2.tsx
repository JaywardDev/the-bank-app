import type { BoardTile } from "@/lib/boardPacks";

type AuctionOverlayV2Props = {
  auctionActive: boolean;
  auctionTile: BoardTile | null;
  highestBid: number;
  highestBidderName: string | null;
  turnPlayerName: string | null;
  auctionCountdownLabel: string | null;
  canAct: boolean;
  actionLoading: string | null;
  onBid: () => void;
  onPass: () => void;
};

export default function AuctionOverlayV2({
  auctionActive,
  auctionTile,
  highestBid,
  highestBidderName,
  turnPlayerName,
  auctionCountdownLabel,
  canAct,
  actionLoading,
  onBid,
  onPass,
}: AuctionOverlayV2Props) {
  if (!auctionActive) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
      <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border border-amber-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
            Auction in progress
          </p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">
            {auctionTile?.name ?? "Unowned tile"}
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            Highest bid: ${highestBid}
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            Current leader: {highestBidderName ?? "No bids yet"}
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            {turnPlayerName ? `Current bidder: ${turnPlayerName}` : "Waiting for bidder"}
            {auctionCountdownLabel ? ` · ${auctionCountdownLabel}` : ""}
          </p>

          {canAct ? (
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={onBid}
                disabled={actionLoading === "AUCTION_BID"}
                className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-neutral-300"
              >
                {actionLoading === "AUCTION_BID" ? "Bidding…" : "Bid"}
              </button>
              <button
                type="button"
                onClick={onPass}
                disabled={actionLoading === "AUCTION_PASS"}
                className="rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-900 disabled:border-neutral-200 disabled:text-neutral-400"
              >
                {actionLoading === "AUCTION_PASS" ? "Passing…" : "Pass"}
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-neutral-500">
              Waiting for eligible bidder...
            </p>
          )}
        </div>
      </div>
    </>
  );
}

