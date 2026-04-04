import type { ReactNode } from "react";

type FinalStanding = {
  playerId: string;
  playerName: string;
  rank: number;
  cash: number;
  netWorth: number;
  isWinner: boolean;
  isEliminated: boolean;
  ownedCount: number;
  liabilityCount: number;
};

type EndedGameResultsPanelProps = {
  standings: FinalStanding[];
  reasonLabel?: string | null;
  standingsSource?: "event" | "fallback" | "missing";
  formatMoney: (value: number) => string;
  onReturnHome: () => void;
  onShowSummary?: () => void;
};

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/75">
      {children}
    </span>
  );
}

function StatusCell({
  isWinner,
  isEliminated,
}: {
  isWinner: boolean;
  isEliminated: boolean;
}) {
  if (!isWinner && !isEliminated) {
    return <span className="text-xs font-medium text-white/45">—</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {isWinner ? <Pill>Winner</Pill> : null}
      {isEliminated ? <Pill>Eliminated</Pill> : null}
    </div>
  );
}

export default function EndedGameResultsPanel({
  standings,
  reasonLabel,
  standingsSource = "event",
  formatMoney,
  onReturnHome,
  onShowSummary,
}: EndedGameResultsPanelProps) {
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm sm:p-6">
      <div className="flex max-h-[85vh] w-[90vw] max-w-[1400px] flex-col overflow-hidden rounded-3xl border border-white/15 bg-neutral-950/95 shadow-2xl shadow-black/40">
        <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-lg font-semibold text-white sm:text-xl">Final Results</h2>
            {reasonLabel ? (
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/55">
                {reasonLabel}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {onShowSummary ? (
              <button
                type="button"
                onClick={onShowSummary}
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/15"
              >
                Show Summary
              </button>
            ) : null}
            <button
              type="button"
              onClick={onReturnHome}
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-950 transition hover:bg-white/90"
            >
              Return Home
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 p-4 pt-3 sm:p-6 sm:pt-4">
          {standingsSource === "fallback" ? (
            <p className="mb-3 rounded-xl border border-amber-200/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Final standings payload was missing or malformed; showing reconstructed standings from
              synced game state.
            </p>
          ) : null}
          {standingsSource === "missing" ? (
            <p className="mb-3 rounded-xl border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              Final standings are unavailable for this ended game. Try refreshing; if it persists,
              this game likely ended without a persisted GAME_OVER standings payload.
            </p>
          ) : null}
          <div className="flex h-full min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left">
                <thead className="sticky top-0 z-10 bg-neutral-950/95 backdrop-blur-xl">
                  <tr className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">
                    <th className="px-4 py-3">Rank</th>
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Net Worth</th>
                    <th className="px-4 py-3 text-right">Cash</th>
                    <th className="px-4 py-3 text-right">Properties</th>
                    <th className="px-4 py-3 text-right">Loans / Liabilities</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.length === 0 ? (
                    <tr className="text-sm text-white/80">
                      <td className="px-4 py-5" colSpan={7}>
                        No rankings are available.
                      </td>
                    </tr>
                  ) : null}
                  {standings.map((entry, index) => (
                    <tr
                      key={entry.playerId}
                      className={`text-sm text-white/85 odd:bg-white/[0.02] ${
                        entry.isWinner ? "bg-amber-300/10" : ""
                      }`}
                    >
                      <td
                        className={`px-4 py-3.5 align-middle ${
                          index > 0 ? "border-t border-white/8" : ""
                        }`}
                      >
                        <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-white text-[11px] font-bold text-neutral-950">
                          {entry.rank}
                        </span>
                      </td>
                      <td
                        className={`max-w-[16rem] px-4 py-3.5 align-middle ${
                          index > 0 ? "border-t border-white/8" : ""
                        }`}
                      >
                        <p className="truncate font-semibold text-white">
                          {entry.playerName}
                        </p>
                      </td>
                      <td
                        className={`px-4 py-3.5 align-middle ${
                          index > 0 ? "border-t border-white/8" : ""
                        }`}
                      >
                        <StatusCell
                          isWinner={entry.isWinner}
                          isEliminated={entry.isEliminated}
                        />
                      </td>
                      <td
                        className={`px-4 py-3.5 text-right align-middle font-semibold tabular-nums text-emerald-300 ${
                          index > 0 ? "border-t border-white/8" : ""
                        }`}
                      >
                        {formatMoney(entry.netWorth)}
                      </td>
                      <td
                        className={`px-4 py-3.5 text-right align-middle tabular-nums text-white/75 ${
                          index > 0 ? "border-t border-white/8" : ""
                        }`}
                      >
                        {formatMoney(entry.cash)}
                      </td>
                      <td
                        className={`px-4 py-3.5 text-right align-middle tabular-nums text-white/75 ${
                          index > 0 ? "border-t border-white/8" : ""
                        }`}
                      >
                        {entry.ownedCount}
                      </td>
                      <td
                        className={`px-4 py-3.5 text-right align-middle tabular-nums text-white/75 ${
                          index > 0 ? "border-t border-white/8" : ""
                        }`}
                      >
                        {entry.liabilityCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
