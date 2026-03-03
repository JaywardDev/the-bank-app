import { useMemo, useState } from "react";

import type { BoardTile } from "@/lib/boardPacks";

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

type AuctionOverlayV2Props = {
  auctionActive: boolean;
  auctionTile: BoardTile | null;
  highestBid: number;
  highestBidderName: string | null;
  turnPlayerId: string | null;
  turnPlayerName: string | null;
  auctionCountdownLabel: string | null;
  canAct: boolean;
  minIncrement: number;
  bidderCash: number;
  actionLoading: string | null;
  onBid: (amount: number) => void;
  onPass: () => void;
};

type AuctionBidControlsProps = {
  minNextBid: number;
  minIncrement: number;
  bidderCash: number;
  actionLoading: string | null;
  onBid: (amount: number) => void;
  onPass: () => void;
};

function AuctionBidControls({
  minNextBid,
  minIncrement,
  bidderCash,
  actionLoading,
  onBid,
  onPass,
}: AuctionBidControlsProps) {
  const [bidAmount, setBidAmount] = useState<number>(minNextBid);
  const canIncreaseBid = bidAmount + minIncrement <= bidderCash;
  const canDecreaseBid = bidAmount - minIncrement >= minNextBid;
  const canSubmitBid = bidAmount >= minNextBid && bidAmount <= bidderCash;

  return (
    <div className="mt-4 grid gap-2">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Your bid: {formatMoney(bidAmount)}
        </p>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-2">
          <button
            className="rounded-full border border-neutral-200 px-3 py-1 text-sm font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:text-neutral-300"
            type="button"
            onClick={() => setBidAmount((prev) => prev - minIncrement)}
            disabled={!canDecreaseBid}
          >
            –
          </button>
          <div className="text-lg font-semibold text-neutral-900">
            {formatMoney(bidAmount)}
          </div>
          <button
            className="rounded-full border border-neutral-200 px-3 py-1 text-sm font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:text-neutral-300"
            type="button"
            onClick={() => setBidAmount((prev) => prev + minIncrement)}
            disabled={!canIncreaseBid}
          >
            +
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          Minimum bid: {formatMoney(minNextBid)} · Cash: {formatMoney(bidderCash)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onBid(bidAmount)}
        disabled={actionLoading === "AUCTION_BID" || !canSubmitBid}
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
  );
}

export default function AuctionOverlayV2({
  auctionActive,
  auctionTile,
  highestBid,
  highestBidderName,
  turnPlayerId,
  turnPlayerName,
  auctionCountdownLabel,
  canAct,
  minIncrement,
  bidderCash,
  actionLoading,
  onBid,
  onPass,
}: AuctionOverlayV2Props) {
  const minNextBid = useMemo(
    () => (highestBid > 0 ? highestBid + minIncrement : minIncrement),
    [highestBid, minIncrement],
  );

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
            Highest bid: {formatMoney(highestBid)}
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            Current leader: {highestBidderName ?? "No bids yet"}
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            {turnPlayerName ? `Current bidder: ${turnPlayerName}` : "Waiting for bidder"}
            {auctionCountdownLabel ? ` · ${auctionCountdownLabel}` : ""}
          </p>

          {canAct ? (
            <AuctionBidControls
              key={`${highestBid}:${turnPlayerId ?? "none"}`}
              minNextBid={minNextBid}
              minIncrement={minIncrement}
              bidderCash={bidderCash}
              actionLoading={actionLoading}
              onBid={onBid}
              onPass={onPass}
            />
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
