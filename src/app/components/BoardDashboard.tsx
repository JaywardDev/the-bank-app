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

const statusTone: Record<string, string> = {
  LIVE: "bg-emerald-300",
  SNAPSHOT: "bg-amber-300",
  OFFLINE: "bg-rose-300",
};

function getStatusLabel(gameStatus: string) {
  const status = gameStatus.trim().toUpperCase();
  if (status.includes("LIVE")) return "LIVE";
  if (status.includes("SNAP")) return "SNAPSHOT";
  return "OFFLINE";
}

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
  const statusLabel = getStatusLabel(gameStatus);

  return (
    <div className="space-y-3 text-white/90">
      <div className="flex items-center justify-between gap-2 text-sm text-white/70">
        <Link href="/" className="rounded-md px-1.5 py-1 transition hover:bg-white/10 hover:text-white">
          ← Back
        </Link>
        <p className="text-base font-medium text-white/90">{boardPackName}</p>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/20 px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-white/80">
            <span className={`h-1.5 w-1.5 rounded-full ${statusTone[statusLabel]}`} />
            {statusLabel}
          </span>
          <button
            type="button"
            aria-label="Sync updates"
            onClick={onManualRefresh}
            className="rounded-full border border-white/15 bg-black/20 p-2 text-white/75 transition hover:border-white/35 hover:text-white"
          >
            ↻
          </button>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-white/12 bg-[linear-gradient(170deg,rgba(255,255,255,0.09)_0%,rgba(17,24,39,0.66)_42%,rgba(2,6,23,0.84)_100%)] shadow-[0_20px_40px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-xl">
        <div className="border-b border-white/10 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-white/55">Current turn</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: currentPlayerColor }} />
            <p className="text-2xl font-semibold leading-none text-white">{currentPlayerName}</p>
          </div>
          <p className="mt-2 text-lg text-white/85">Last roll: {lastRoll ?? "—"}</p>
          <p className="mt-1 text-sm text-white/65">Current tile: {currentTileName}</p>
          {jailStatusLabel ? <p className="mt-1 text-sm text-amber-300">{jailStatusLabel}</p> : null}
        </div>

        <div className="border-b border-white/10 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-white/55">Phase / status</p>
          <p className="mt-2 text-xl font-semibold text-white">{phaseLabel}</p>
        </div>

        {auctionSummary ? (
          <div className="border-b border-white/10 bg-amber-500/8 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-amber-100">Auction in progress</p>
            <p className="mt-2 text-lg font-semibold text-white">{auctionSummary.tileName}</p>
            <p className="mt-2 text-sm text-amber-50/90">
              Highest bid: {auctionSummary.currentBid !== null ? `$${auctionSummary.currentBid}` : "—"}
              {auctionSummary.highestBidderName ? ` · ${auctionSummary.highestBidderName}` : ""}
            </p>
            <p className="mt-1 text-sm text-amber-100/90">{auctionSummary.statusLine}</p>
          </div>
        ) : null}

        <div className="border-b border-white/10 bg-emerald-500/8 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-200">Macro/Card spotlight</p>
          {pendingCard ? (
            <>
              <p className="mt-2 text-lg font-semibold">{pendingCard.deckLabel}</p>
              <p className="mt-1 text-xl font-semibold text-white">{pendingCard.title}</p>
              {pendingCard.description ? <p className="mt-2 text-sm text-emerald-50/90">{pendingCard.description}</p> : null}
              <p className="mt-3 text-sm text-emerald-100/80">Waiting for {pendingCard.actorName ?? "current player"}…</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-emerald-50/80">No pending card at the moment.</p>
          )}
        </div>

        <div className="p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-white/55">Event highlights</p>
          <ul className="mt-3 max-h-[26rem] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/25 [&::-webkit-scrollbar-track]:bg-transparent">
            {eventHighlights.length === 0 ? (
              <li className="rounded-xl border border-dashed border-white/20 px-3 py-2 text-sm text-white/60">No events yet.</li>
            ) : (
              eventHighlights.map((event) => (
                <li key={event.id} className="rounded-xl border border-white/8 bg-black/30 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-white/45">v{event.version}</p>
                  <p className="mt-1 text-sm text-white/80">{event.title}</p>
                  {event.subtext ? <p className="mt-1 text-xs text-white/55">{event.subtext}</p> : null}
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      {liveUpdatesNotice ? (
        <section className="rounded-xl border border-amber-200/35 bg-amber-500/10 p-3 text-sm text-amber-100">
          {liveUpdatesNotice}
        </section>
      ) : null}
    </div>
  );
}
