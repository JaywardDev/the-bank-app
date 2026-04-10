import { useMemo, useState } from "react";

import type { BoardPackEconomy, BoardTile } from "@/lib/boardPacks";
import { formatCurrency, getCurrencyMetaFromEconomy } from "@/lib/currency";

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
  boardPackEconomy: BoardPackEconomy;
  onBid: (amount: number) => void;
  onPass: () => void;
};

type AuctionBidControlsProps = {
  minNextBid: number;
  minIncrement: number;
  bidderCash: number;
  actionLoading: string | null;
  boardPackEconomy: BoardPackEconomy;
  onBid: (amount: number) => void;
  onPass: () => void;
};

function getCountdownChipClass(secondsLeft: number | null) {
  if (secondsLeft != null && secondsLeft < 5) {
    return "border-red-400 bg-red-600 text-white shadow-sm shadow-red-600/30 animate-pulse";
  }
  if (secondsLeft != null && secondsLeft < 10) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (secondsLeft != null && secondsLeft <= 15) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-neutral-200 bg-neutral-50 text-neutral-700";
}

function AuctionBidControls({
  minNextBid,
  minIncrement,
  bidderCash,
  actionLoading,
  boardPackEconomy,
  onBid,
  onPass,
}: AuctionBidControlsProps) {
  const currency = useMemo(() => getCurrencyMetaFromEconomy(boardPackEconomy), [boardPackEconomy]);
  const [bidAmount, setBidAmount] = useState<number>(minNextBid);
  const canIncreaseBid = bidAmount + minIncrement <= bidderCash;
  const canDecreaseBid = bidAmount - minIncrement >= minNextBid;
  const canSubmitBid = bidAmount >= minNextBid && bidAmount <= bidderCash;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Your bid</p>
          <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2">
            <button
              className="h-9 w-9 rounded-full border border-neutral-300 bg-white text-lg font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:text-neutral-300"
              type="button"
              onClick={() => setBidAmount((prev) => prev - minIncrement)}
              disabled={!canDecreaseBid}
            >
              –
            </button>
            <div className="text-2xl font-semibold text-neutral-900">
              {formatCurrency(bidAmount, currency)}
            </div>
            <button
              className="h-9 w-9 rounded-full border border-neutral-300 bg-white text-lg font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:text-neutral-300"
              type="button"
              onClick={() => setBidAmount((prev) => prev + minIncrement)}
              disabled={!canIncreaseBid}
            >
              +
            </button>
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Bid rules</p>
          <p className="mt-2">Min next bid: {formatCurrency(minNextBid, currency)}</p>
          <p className="mt-1">Increment: {formatCurrency(minIncrement, currency)}</p>
          <p className="mt-1">Your cash: {formatCurrency(bidderCash, currency)}</p>
        </div>
      </div>

      <div className="mt-1 flex flex-col gap-2 border-t border-neutral-200 pt-4 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={onPass}
          disabled={actionLoading === "AUCTION_PASS"}
          className="order-2 rounded-2xl border border-neutral-300 px-5 py-3 text-sm font-semibold text-neutral-900 disabled:border-neutral-200 disabled:text-neutral-400 sm:order-1"
        >
          {actionLoading === "AUCTION_PASS" ? "Passing…" : "Pass"}
        </button>
        <button
          type="button"
          onClick={() => onBid(bidAmount)}
          disabled={actionLoading === "AUCTION_BID" || !canSubmitBid}
          className="order-1 rounded-2xl bg-neutral-900 px-6 py-3 text-sm font-semibold text-white disabled:bg-neutral-300 sm:order-2"
        >
          {actionLoading === "AUCTION_BID" ? "Placing Bid…" : "Place Bid"}
        </button>
      </div>
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
  boardPackEconomy,
  onBid,
  onPass,
}: AuctionOverlayV2Props) {
  const currency = useMemo(() => getCurrencyMetaFromEconomy(boardPackEconomy), [boardPackEconomy]);
  const minNextBid = useMemo(
    () => (highestBid > 0 ? highestBid + minIncrement : minIncrement),
    [highestBid, minIncrement],
  );
  const secondsLeft = useMemo(() => {
    if (!auctionCountdownLabel) {
      return null;
    }
    const parsed = Number.parseInt(auctionCountdownLabel, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }, [auctionCountdownLabel]);

  if (!auctionActive) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-20 bg-black/50 backdrop-blur-[2px]" />
      <div className="fixed inset-0 z-30 flex items-center justify-center p-4 md:p-6">
        <div className="flex max-h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-amber-200 bg-white/95 shadow-2xl ring-1 ring-black/10 backdrop-blur">
          <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 md:px-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                Auction in progress
              </p>
              <p className="mt-1 text-xl font-semibold text-neutral-900 md:text-2xl">
                {auctionTile?.name ?? "Unowned tile"}
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                Property price: {auctionTile?.price != null ? formatCurrency(auctionTile.price, currency) : "—"}
              </p>
            </div>
            <div
              className={`shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold ${getCountdownChipClass(secondsLeft)}`}
            >
              {auctionCountdownLabel ?? "—"}
            </div>
          </div>

          <div className="grid flex-1 gap-4 overflow-y-auto p-5 md:grid-cols-12 md:p-6">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 md:col-span-7">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Current Bid</p>
              <p className="mt-2 text-4xl font-bold leading-none text-neutral-900 md:text-5xl">
                {formatCurrency(highestBid, currency)}
              </p>
            </div>

            <div className="grid gap-3 md:col-span-5">
              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Leader</p>
                <p className="mt-1 text-lg font-semibold text-neutral-900">
                  {highestBidderName ?? "No bids yet"}
                </p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Current bidder</p>
                <p className="mt-1 text-lg font-semibold text-neutral-900">
                  {turnPlayerName ?? "Waiting for bidder"}
                </p>
                <p className="mt-2 inline-flex rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-semibold text-neutral-700">
                  {canAct ? "Your turn" : `Waiting for ${turnPlayerName ?? "next bidder"}`}
                </p>
              </div>
            </div>

            <div className="md:col-span-12">
              {canAct ? (
                <AuctionBidControls
                  key={`${highestBid}:${turnPlayerId ?? "none"}`}
                  minNextBid={minNextBid}
                  minIncrement={minIncrement}
                  bidderCash={bidderCash}
                  actionLoading={actionLoading}
                  boardPackEconomy={boardPackEconomy}
                  onBid={onBid}
                  onPass={onPass}
                />
              ) : (
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                  You can review the current bid while waiting for the active bidder.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
