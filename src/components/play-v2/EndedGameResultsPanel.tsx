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

function StatRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-white/55">{label}</span>
      <span
        className={
          emphasis ? "font-semibold text-white" : "font-medium text-white/80"
        }
      >
        {value}
      </span>
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/75">
      {children}
    </span>
  );
}

export default function EndedGameResultsPanel({
  standings,
  formatMoney,
  onReturnHome,
  onShowSummary,
}: EndedGameResultsPanelProps) {
  return (
    <div className="fixed bottom-4 right-4 z-[140] w-[min(24rem,calc(100vw-2rem))] rounded-3xl border border-white/15 bg-neutral-950/90 p-4 shadow-2xl backdrop-blur-xl">
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

      <ol className="mt-4 space-y-3">
        {standings.map((entry) => (
          <li
            key={entry.playerId}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white text-[11px] font-bold text-neutral-950">
                    {entry.rank}
                  </span>
                  <p className="truncate text-sm font-semibold text-white">
                    {entry.playerName}
                  </p>
                  {entry.isWinner ? <Pill>Winner</Pill> : null}
                  {entry.isEliminated ? <Pill>Eliminated</Pill> : null}
                </div>
              </div>
              <p className="text-right text-sm font-semibold text-emerald-300">
                {formatMoney(entry.netWorth)}
              </p>
            </div>

            <div className="mt-3 space-y-1.5">
              <StatRow
                label="Net worth"
                value={formatMoney(entry.netWorth)}
                emphasis
              />
              <StatRow label="Cash" value={formatMoney(entry.cash)} />
              <StatRow label="Properties" value={String(entry.ownedCount)} />
              <StatRow
                label="Loans / liabilities"
                value={String(entry.liabilityCount)}
              />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
