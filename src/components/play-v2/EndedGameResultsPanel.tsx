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
  formatMoney,
  onReturnHome,
  onShowSummary,
}: EndedGameResultsPanelProps) {
  return (
    <div className="fixed bottom-4 right-4 z-[140] w-[min(60rem,calc(100vw-2rem))] rounded-3xl border border-white/15 bg-neutral-950/90 p-4 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
            Final Standings
          </p>
          <p className="mt-1 text-sm text-white/70">
            Review the finished board without reopening gameplay.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {onShowSummary ? (
            <button
              type="button"
              onClick={onShowSummary}
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/15"
            >
              Show Summary
            </button>
          ) : null}
          <button
            type="button"
            onClick={onReturnHome}
            className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white px-3 py-1.5 text-[11px] font-semibold text-neutral-950 transition hover:bg-white/90"
          >
            Return Home
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
        <div className="overflow-x-auto">
          <div className="max-h-[min(24rem,calc(100vh-12rem))] overflow-y-auto">
            <table className="min-w-full border-separate border-spacing-0 text-left">
              <thead className="sticky top-0 z-10 bg-neutral-950/95 backdrop-blur-xl">
                <tr className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">
                  <th className="px-3 py-3">Rank</th>
                  <th className="px-3 py-3">Player</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Net Worth</th>
                  <th className="px-3 py-3 text-right">Cash</th>
                  <th className="px-3 py-3 text-right">Properties</th>
                  <th className="px-3 py-3 text-right">Loans / Liabilities</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((entry, index) => (
                  <tr
                    key={entry.playerId}
                    className="text-sm text-white/85 odd:bg-white/[0.02]"
                  >
                    <td
                      className={`px-3 py-3 align-middle ${
                        index > 0 ? "border-t border-white/8" : ""
                      }`}
                    >
                      <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-white text-[11px] font-bold text-neutral-950">
                        {entry.rank}
                      </span>
                    </td>
                    <td
                      className={`max-w-[12rem] px-3 py-3 align-middle ${
                        index > 0 ? "border-t border-white/8" : ""
                      }`}
                    >
                      <p className="truncate font-semibold text-white">
                        {entry.playerName}
                      </p>
                    </td>
                    <td
                      className={`px-3 py-3 align-middle ${
                        index > 0 ? "border-t border-white/8" : ""
                      }`}
                    >
                      <StatusCell
                        isWinner={entry.isWinner}
                        isEliminated={entry.isEliminated}
                      />
                    </td>
                    <td
                      className={`px-3 py-3 text-right align-middle font-semibold text-emerald-300 ${
                        index > 0 ? "border-t border-white/8" : ""
                      }`}
                    >
                      {formatMoney(entry.netWorth)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right align-middle text-white/75 ${
                        index > 0 ? "border-t border-white/8" : ""
                      }`}
                    >
                      {formatMoney(entry.cash)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right align-middle text-white/75 ${
                        index > 0 ? "border-t border-white/8" : ""
                      }`}
                    >
                      {entry.ownedCount}
                    </td>
                    <td
                      className={`px-3 py-3 text-right align-middle text-white/75 ${
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
  );
}
