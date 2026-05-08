import { useMemo } from "react";

import type { BoardTile } from "@/lib/boardPacks";
import { getTileBandColor } from "@/lib/boardTileStyles";
import type {
  EconomicBoomRevenueItem,
  EconomicBoomSummary,
} from "@/lib/economicBoomEvents";

type EconomicBoomModalProps = {
  summary: EconomicBoomSummary | null;
  formatMoney: (amount: number) => string;
  onDismiss: () => void;
  boardTiles?: BoardTile[];
};

const getRevenueItemTile = (
  item: EconomicBoomRevenueItem,
  tileByIndex: Map<number, BoardTile>,
  tileByName: Map<string, BoardTile>,
) => {
  if (item.tileIndex !== null) {
    const indexedTile = tileByIndex.get(item.tileIndex);
    if (indexedTile) {
      return indexedTile;
    }
  }

  return tileByName.get(item.tileName.toLowerCase()) ?? null;
};

export default function EconomicBoomModal({
  summary,
  formatMoney,
  onDismiss,
  boardTiles = [],
}: EconomicBoomModalProps) {
  const tileLookups = useMemo(() => {
    const tileByIndex = new Map<number, BoardTile>();
    const tileByName = new Map<string, BoardTile>();

    boardTiles.forEach((tile) => {
      tileByIndex.set(tile.index, tile);
      tileByName.set(tile.name.toLowerCase(), tile);
    });

    return { tileByIndex, tileByName };
  }, [boardTiles]);

  if (!summary) {
    return null;
  }

  const hasPayouts = summary.revenueItems.length > 0;

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-[#2A1709]/70 p-2 backdrop-blur-sm sm:p-4">
      <section
        aria-labelledby="economic-boom-title"
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-amber-200/45 bg-[#4E3018]/95 text-white shadow-2xl ring-1 ring-black/20 sm:max-h-[calc(100dvh-2rem)]"
      >
        <header className="shrink-0 border-b border-amber-200/20 bg-gradient-to-r from-amber-200/18 via-white/8 to-transparent px-4 py-3 sm:px-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="rounded-full border border-amber-100/20 bg-amber-100/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
                  Round {summary.round}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-100/65">
                  Market Rally
                </p>
              </div>
              <h2
                id="economic-boom-title"
                className="mt-1 text-xl font-semibold leading-tight text-white sm:text-2xl"
              >
                Economic Boom Season
              </h2>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-amber-50/78 sm:text-sm">
                Consumer activity surges as travelers, households, and businesses flood high-demand districts.
              </p>
            </div>

            <div className="rounded-2xl border border-amber-200/25 bg-amber-300/10 px-3 py-2 text-left sm:min-w-56 sm:text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-100/70">
                Total distributed
              </p>
              <p className="mt-0.5 text-2xl font-bold leading-none text-white sm:text-3xl">
                {formatMoney(summary.totalPayout)}
              </p>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-3 p-3 sm:grid-cols-[minmax(0,1.8fr)_minmax(15rem,0.9fr)] sm:p-4">
          <div className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-black/12">
            <div className="shrink-0 border-b border-white/10 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/70">
                Payouts
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2 pr-2.5">
              {hasPayouts ? (
                summary.revenueItems.map((item) => {
                  const tile = getRevenueItemTile(
                    item,
                    tileLookups.tileByIndex,
                    tileLookups.tileByName,
                  );
                  const bandColor = getTileBandColor(tile);

                  return (
                    <article
                      key={item.eventId}
                      className="grid grid-cols-[0.35rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-2.5 py-2 shadow-sm shadow-black/10"
                    >
                      <span
                        aria-hidden="true"
                        data-testid="economic-boom-property-color-band"
                        className="h-full min-h-12 rounded-full"
                        style={{ backgroundColor: bandColor }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {item.tileName}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-white/65">
                          Owner: <span className="font-semibold text-white/85">{item.ownerName}</span>
                        </p>
                        {item.rentBasis !== null ? (
                          <p className="mt-0.5 truncate text-[11px] text-amber-100/65">
                            Basis: {formatMoney(item.rentBasis)} rent
                          </p>
                        ) : null}
                      </div>
                      <p className="whitespace-nowrap text-right text-base font-bold text-amber-100 sm:text-lg">
                        +{formatMoney(item.payoutAmount)}
                      </p>
                    </article>
                  );
                })
              ) : (
                <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
                  The market rallied, but no eligible owned districts received a payout.
                </p>
              )}
            </div>
          </div>

          <aside className="rounded-2xl border border-amber-200/15 bg-amber-50/[0.07] p-3 text-sm text-amber-50/78 sm:overflow-hidden">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-100/70">
              Season Brief
            </p>
            <p className="mt-2 leading-relaxed">
              A short-lived demand spike sends bonus rent revenue to selected owned districts.
            </p>
            <div className="mt-3 grid gap-2 text-xs text-white/68">
              <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                <span className="font-semibold text-white">{summary.revenueItems.length}</span>{" "}
                payout row{summary.revenueItems.length === 1 ? "" : "s"} recorded for this boom.
              </div>
              <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                Review the market activity, then acknowledge to return to the board.
              </div>
            </div>
          </aside>
        </div>

        <footer className="sticky bottom-0 shrink-0 border-t border-white/10 bg-[#3A230F]/95 px-4 py-3 backdrop-blur sm:px-5">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onDismiss}
              className="min-h-11 w-full rounded-2xl bg-amber-200 px-5 py-2.5 text-sm font-semibold text-[#3A230F] shadow-lg shadow-black/20 transition hover:bg-amber-100 sm:w-auto sm:min-w-44"
            >
              Continue
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
