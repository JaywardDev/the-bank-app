import Link from "next/link";

type EventHighlight = {
  id: string;
  title: string;
  subtext: string | null;
  version: number;
};

type BoardDashboardProps = {
  boardPackName: string;
  gameStatus: string;
  currentPlayerName: string;
  currentPlayerColor: string;
  lastRoll: number | null;
  currentTileName: string;
  jailStatusLabel: string | null;
  phaseLabel: string;
  pendingCard: {
    deckLabel: string;
    title: string;
    description: string | null;
    actorName: string | null;
  } | null;
  auctionSummary: {
    tileName: string;
    currentBid: number | null;
    highestBidderName: string | null;
    statusLine: string;
  } | null;
  eventHighlights: EventHighlight[];
  liveUpdatesNotice: string | null;
  onManualRefresh: () => void;
};

export default function BoardDashboard({
  boardPackName,
  gameStatus,
  currentPlayerName,
  currentPlayerColor,
  lastRoll,
  currentTileName,
  jailStatusLabel,
  phaseLabel,
  pendingCard,
  auctionSummary,
  eventHighlights,
  liveUpdatesNotice,
  onManualRefresh,
}: BoardDashboardProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-white/60">
        <Link href="/" className="hover:text-white">
          ← Back
        </Link>
        <span>Projection board</span>
      </div>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-white/60">Game identity</p>
        <p className="mt-2 text-2xl font-semibold leading-tight">{boardPackName}</p>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="rounded-full border border-white/20 px-2 py-1">{gameStatus}</span>
          <span className="text-white/70">Projection only</span>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-white/60">Current turn</p>
        <div className="mt-2 flex items-center gap-3">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: currentPlayerColor }} />
          <p className="text-2xl font-semibold">{currentPlayerName}</p>
        </div>
        <p className="mt-2 text-lg text-white/80">Last roll: {lastRoll ?? "—"}</p>
        <p className="mt-1 text-sm text-white/70">Current tile: {currentTileName}</p>
        {jailStatusLabel ? <p className="mt-1 text-sm text-amber-300">{jailStatusLabel}</p> : null}
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-white/60">Phase / status</p>
        <p className="mt-2 text-xl font-semibold">{phaseLabel}</p>
      </section>

      {auctionSummary ? (
        <section className="rounded-2xl border border-amber-200/30 bg-amber-500/10 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-amber-100">Auction in progress</p>
          <p className="mt-2 text-lg font-semibold text-white">{auctionSummary.tileName}</p>
          <p className="mt-2 text-sm text-amber-50/90">
            Highest bid: {auctionSummary.currentBid !== null ? `$${auctionSummary.currentBid}` : "—"}
            {auctionSummary.highestBidderName
              ? ` · ${auctionSummary.highestBidderName}`
              : ""}
          </p>
          <p className="mt-1 text-sm text-amber-100/90">{auctionSummary.statusLine}</p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-emerald-200/20 bg-emerald-500/10 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-emerald-200">Macro/Card spotlight</p>
        {pendingCard ? (
          <>
            <p className="mt-2 text-lg font-semibold">{pendingCard.deckLabel}</p>
            <p className="mt-1 text-xl font-semibold text-white">{pendingCard.title}</p>
            {pendingCard.description ? <p className="mt-2 text-sm text-emerald-50/90">{pendingCard.description}</p> : null}
            <p className="mt-3 text-sm text-emerald-100/80">
              Waiting for {pendingCard.actorName ?? "current player"}…
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-emerald-50/80">No pending card at the moment.</p>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.18em] text-white/60">Event highlights</p>
          <button
            type="button"
            onClick={onManualRefresh}
            className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-white/40 hover:text-white"
          >
            Refresh
          </button>
        </div>
        <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
          {eventHighlights.length === 0 ? (
            <li className="rounded-xl border border-dashed border-white/20 px-3 py-2 text-sm text-white/60">No events yet.</li>
          ) : (
            eventHighlights.map((event) => (
              <li key={event.id} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-white/50">v{event.version}</p>
                <p className="mt-1 text-sm text-white/80">{event.title}</p>
                {event.subtext ? <p className="mt-1 text-xs text-white/55">{event.subtext}</p> : null}
              </li>
            ))
          )}
        </ul>
      </section>

      {liveUpdatesNotice ? (
        <section className="rounded-2xl border border-amber-200/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          {liveUpdatesNotice}
        </section>
      ) : null}
    </div>
  );
}
