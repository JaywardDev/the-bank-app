import { useMemo, useState } from "react";

import type { BoardPackEconomy, BoardTile } from "@/lib/boardPacks";
import { getTileBandColor } from "@/lib/boardTileStyles";
import { formatCurrency, getCurrencyMetaFromEconomy } from "@/lib/currency";

type AuctionOverlayV2Props = {
  auctionActive: boolean;
  auctionTile: BoardTile | null;
  highestBid: number;
  highestBidderName: string | null;
  turnPlayerId: string | null;
  turnPlayerName: string | null;
  auctionCountdownLabel: string | null;
  auctionRemainingSeconds?: number | null;
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
  if (secondsLeft != null && secondsLeft <= 5) {
    return "border-red-500 bg-red-600 text-white shadow-sm shadow-red-600/30 animate-pulse";
  }
  if (secondsLeft != null && secondsLeft <= 10) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (secondsLeft != null && secondsLeft <= 30) {
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
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-3">
        <p className="min-w-16 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Your bid</p>
        <div className="flex min-w-[210px] flex-1 items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-2 py-1.5">
          <button
            className="h-10 w-10 rounded-full border border-neutral-300 bg-white text-lg font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:text-neutral-300"
            type="button"
            onClick={() => setBidAmount((prev) => prev - minIncrement)}
            disabled={!canDecreaseBid}
          >
            –
          </button>
          <div className="text-xl font-semibold text-neutral-900 sm:text-2xl">
            {formatCurrency(bidAmount, currency)}
          </div>
          <button
            className="h-10 w-10 rounded-full border border-neutral-300 bg-white text-lg font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:text-neutral-300"
            type="button"
            onClick={() => setBidAmount((prev) => prev + minIncrement)}
            disabled={!canIncreaseBid}
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={onPass}
          disabled={actionLoading === "AUCTION_PASS"}
          className="h-10 rounded-xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-900 disabled:border-neutral-200 disabled:text-neutral-400"
        >
          {actionLoading === "AUCTION_PASS" ? "Passing…" : "Pass"}
        </button>
        <button
          type="button"
          onClick={() => onBid(bidAmount)}
          disabled={actionLoading === "AUCTION_BID" || !canSubmitBid}
          className="h-10 rounded-xl bg-neutral-900 px-5 text-sm font-semibold text-white disabled:bg-neutral-300"
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
  auctionRemainingSeconds = null,
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
  const secondsLeft = auctionRemainingSeconds;
  const auctionTileBandColor = useMemo(() => getTileBandColor(auctionTile), [auctionTile]);

  if (!auctionActive) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-20 bg-[#2A1709]/52 backdrop-blur-[2px]" />
      <div className="fixed inset-0 z-30 flex items-center justify-center p-3 md:p-4">
        <div className="flex max-h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-amber-200 bg-white/95 shadow-2xl ring-1 ring-black/10 backdrop-blur">
          <div className="grid gap-2 border-b border-neutral-200 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">
                Auction in progress
              </p>
              <div className="mt-0.5 flex items-stretch gap-2">
                <span
                  aria-hidden
                  className="w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: auctionTileBandColor }}
                />
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-neutral-900 sm:text-xl">
                    {auctionTile?.name ?? "Unowned tile"}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {auctionTile?.price != null ? formatCurrency(auctionTile.price, currency) : "—"}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 sm:justify-self-end">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Current bid</p>
              <p className="text-3xl font-bold leading-none text-neutral-900 sm:text-4xl">
                {formatCurrency(highestBid, currency)}
              </p>
            </div>
            <div
              className={`w-fit shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold sm:justify-self-end ${getCountdownChipClass(secondsLeft)}`}
            >
              {auctionCountdownLabel ?? "—"}
            </div>
          </div>

          <div className="grid gap-2 p-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-neutral-600">
              <span>
                Leader: <span className="font-semibold text-neutral-900">{highestBidderName ?? "No bids yet"}</span>
              </span>
              <span>
                Current bidder:{" "}
                <span className="font-semibold text-neutral-900">{turnPlayerName ?? "Waiting for bidder"}</span>
              </span>
              <span>
                Min next bid: <span className="font-semibold text-neutral-900">{formatCurrency(minNextBid, currency)}</span>
              </span>
              <span>
                Your cash: <span className="font-semibold text-neutral-900">{formatCurrency(bidderCash, currency)}</span>
              </span>
              <span
                className={`font-semibold sm:ml-auto ${canAct ? "text-emerald-700" : "text-rose-700"}`}
              >
                {canAct ? "Your turn" : `Waiting for ${turnPlayerName ?? "next bidder"}`}
              </span>
            </div>

            <div>
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
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
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
