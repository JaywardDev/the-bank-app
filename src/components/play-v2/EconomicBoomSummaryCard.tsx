import type { EconomicBoomSummary } from "@/lib/economicBoomEvents";

type EconomicBoomSummaryCardProps = {
  summary: EconomicBoomSummary;
  formatMoney: (amount: number) => string;
  compact?: boolean;
};

export default function EconomicBoomSummaryCard({
  summary,
  formatMoney,
  compact = false,
}: EconomicBoomSummaryCardProps) {
  return (
    <article className="rounded-lg border border-amber-300/30 bg-amber-400/10 p-3 shadow-inner shadow-amber-950/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-100">
            Seasonal economy
          </p>
          <h3 className="text-sm font-semibold text-white">
            Economic Boom Season
          </h3>
        </div>
        <span className="rounded-full border border-amber-200/25 bg-amber-200/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
          Round {summary.round}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-white/75">
        Consumer demand surged this round, sending revenue into selected owned
        districts.
      </p>
      <div className="mt-3 grid gap-2 text-[11px] text-white/75 sm:grid-cols-3">
        <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1">
          Total paid: {formatMoney(summary.totalPayout)}
        </span>
        <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1">
          Properties affected: {summary.revenueItems.length}
        </span>
        <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1">
          Round: {summary.round}
        </span>
      </div>
      {summary.revenueItems.length > 0 ? (
        <ul className={`${compact ? "mt-3 max-h-40" : "mt-4 max-h-56"} space-y-2 overflow-y-auto pr-1`}>
          {summary.revenueItems.map((item) => (
            <li
              key={item.eventId}
              className="rounded-lg border border-white/10 bg-black/10 px-2 py-2 text-xs text-white/82"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{item.tileName}</p>
                  <p className="text-[11px] text-white/60">
                    {item.ownerName} received {formatMoney(item.payoutAmount)}
                  </p>
                </div>
                {item.drawNumber !== null ? (
                  <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                    Draw {item.drawNumber}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
          No owned districts received boom revenue this round.
        </p>
      )}
    </article>
  );
}
