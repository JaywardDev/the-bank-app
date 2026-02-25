"use client";

import { useState, type ReactNode } from "react";

type PlayV2ShellProps = {
  cashLabel: string;
  netWorthLabel: string;
  turnPlayerLabel: string;
  loading: boolean;
  notice: string | null;
  debugPanel: ReactNode;
  boardViewport: ReactNode;
};

export default function PlayV2Shell({
  cashLabel,
  netWorthLabel,
  turnPlayerLabel,
  loading,
  notice,
  debugPanel,
  boardViewport,
}: PlayV2ShellProps) {
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [devOpen, setDevOpen] = useState(false);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-neutral-950 text-white">
      <div className="play-v2-shell-content">
        <section className="absolute inset-0 p-4 md:p-6 lg:p-8">
          <div className="h-full w-full">{boardViewport}</div>
        </section>

        <section className="pointer-events-none absolute left-1/2 top-3 z-20 w-[min(92vw,920px)] -translate-x-1/2 rounded-xl border border-white/15 bg-black/55 p-3 backdrop-blur">
          <div className="grid grid-cols-3 gap-3 text-xs sm:text-sm">
            <div>
              <p className="text-white/60">Cash</p>
              <p className="font-semibold">{cashLabel}</p>
            </div>
            <div>
              <p className="text-white/60">Net Worth</p>
              <p className="font-semibold">{netWorthLabel}</p>
            </div>
            <div>
              <p className="text-white/60">Turn</p>
              <p className="font-semibold">{turnPlayerLabel}</p>
            </div>
          </div>
          {loading ? <p className="mt-2 text-xs text-white/70">Loading…</p> : null}
          {notice ? <p className="mt-2 text-xs text-red-300">{notice}</p> : null}
        </section>

        <button
          type="button"
          onClick={() => setLeftOpen((value) => !value)}
          className="absolute left-2 top-1/2 z-30 -translate-y-1/2 rounded-r-lg border border-white/20 bg-black/70 px-2 py-3 text-xs font-semibold uppercase tracking-wide"
        >
          {leftOpen ? "Close" : "Left"}
        </button>

        <button
          type="button"
          onClick={() => setRightOpen((value) => !value)}
          className="absolute right-2 top-1/2 z-30 -translate-y-1/2 rounded-l-lg border border-white/20 bg-black/70 px-2 py-3 text-xs font-semibold uppercase tracking-wide"
        >
          {rightOpen ? "Close" : "Right"}
        </button>

        <aside
          className={`absolute left-0 top-0 z-20 h-full w-72 border-r border-white/15 bg-neutral-900/95 p-4 transition-transform duration-200 ${
            leftOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/80">Left Drawer</h2>
        </aside>

        <aside
          className={`absolute right-0 top-0 z-20 h-full w-72 border-l border-white/15 bg-neutral-900/95 p-4 transition-transform duration-200 ${
            rightOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/80">Right Drawer</h2>
        </aside>

        <section className="absolute bottom-4 right-4 z-20 flex flex-col gap-2">
          {[
            { label: "Roll" },
            { label: "End" },
            { label: "Confirm" },
          ].map((button) => (
            <button
              key={button.label}
              type="button"
              disabled
              className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white/70 disabled:cursor-not-allowed"
            >
              {button.label}
            </button>
          ))}
        </section>

        <button
          type="button"
          onClick={() => setDevOpen((value) => !value)}
          className="absolute bottom-4 left-4 z-30 rounded border border-white/30 bg-black/65 px-2 py-1 text-xs font-semibold"
        >
          DEV
        </button>

        {devOpen ? (
          <section className="absolute bottom-14 left-4 z-30 max-h-[70vh] w-[min(95vw,560px)] overflow-auto rounded-xl border border-white/15 bg-white p-4 text-sm text-neutral-900 shadow-2xl">
            {debugPanel}
          </section>
        ) : null}
      </div>

      <section className="play-v2-shell-overlay absolute inset-0 z-50 hidden items-center justify-center bg-neutral-950/95 p-6 text-center">
        <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-neutral-900/90 p-6 shadow-2xl">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="mx-auto mb-4 h-10 w-10 text-white/80"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="7" y="2" width="10" height="20" rx="2.5" />
            <path d="M5 9 2.5 12 5 15" />
            <path d="M19 9 21.5 12 19 15" />
          </svg>
          <h2 className="text-xl font-semibold">Rotate your phone</h2>
          <p className="mt-2 text-sm text-white/75">This game plays best in landscape.</p>
          <p className="mt-3 text-xs text-white/55">If it doesn’t rotate, turn off rotation lock.</p>
        </div>
      </section>

      <style jsx>{`
        @media (orientation: portrait) {
          .play-v2-shell-content {
            pointer-events: none;
            user-select: none;
          }

          .play-v2-shell-overlay {
            display: flex;
          }
        }

        @media (orientation: landscape) {
          .play-v2-shell-overlay {
            display: none;
          }
        }
      `}</style>
    </main>
  );
}
