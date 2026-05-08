import type { EconomicBoomSummary } from "@/lib/economicBoomEvents";

type EconomicBoomModalProps = {
  summary: EconomicBoomSummary | null;
  formatMoney: (amount: number) => string;
  onDismiss: () => void;
};

export default function EconomicBoomModal({
  summary,
  formatMoney,
  onDismiss,
}: EconomicBoomModalProps) {
  if (!summary) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-[#2A1709]/70 p-4 backdrop-blur-sm">
      <section className="w-full max-w-2xl overflow-hidden rounded-3xl border border-amber-200/45 bg-[#4E3018]/95 text-white shadow-2xl ring-1 ring-black/20">
        <div className="border-b border-amber-200/20 bg-gradient-to-br from-amber-200/18 via-white/8 to-transparent px-5 py-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-100/80">
            Round {summary.round}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Economic Boom Season
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-amber-50/80">
            Consumer activity surges across the country as travelers,
            households, and businesses flood high-demand districts.
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-2xl border border-amber-200/20 bg-amber-300/10 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-100/70">
                Total distributed
              </p>
              <p className="mt-1 text-lg font-semibold text-white">
                {formatMoney(summary.totalPayout)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/55">
                Properties affected
              </p>
              <p className="mt-1 text-lg font-semibold text-white">
                {summary.revenueItems.length}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/55">
                Market cycle
              </p>
              <p className="mt-1 text-lg font-semibold text-white">
                Round {summary.round}
              </p>
            </div>
          </div>

          <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
            {summary.revenueItems.length > 0 ? (
              summary.revenueItems.map((item) => (
                <article
                  key={item.eventId}
                  className="rounded-2xl border border-white/10 bg-black/15 px-3 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {item.tileName}
                      </p>
                      <p className="mt-1 text-xs text-white/65">
                        {item.ownerName} received {formatMoney(item.payoutAmount)}
                        {item.rentBasis !== null
                          ? ` from a ${formatMoney(item.rentBasis)} rent basis`
                          : ""}
                        .
                      </p>
                    </div>
                    {item.drawNumber !== null ? (
                      <span className="rounded-full border border-amber-100/20 bg-amber-100/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                        Draw {item.drawNumber}
                      </span>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
                The market rallied, but no eligible owned districts received a payout.
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-white/10 bg-black/10 px-5 py-4">
          <button
            type="button"
            onClick={onDismiss}
            className="w-full rounded-2xl bg-amber-200 px-4 py-3 text-sm font-semibold text-[#3A230F] shadow-lg shadow-black/20 transition hover:bg-amber-100"
          >
            Review Market Activity
          </button>
        </div>
      </section>
    </div>
  );
}
