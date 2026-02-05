import type { ReactNode } from "react";

type BoardLayoutShellProps = {
  dashboard: ReactNode;
  board: ReactNode;
};

export default function BoardLayoutShell({ dashboard, board }: BoardLayoutShellProps) {
  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-neutral-950 text-neutral-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[url('/icons/board.svg')] bg-cover bg-center bg-no-repeat"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.06)_22%,rgba(0,0,0,0.72)_100%)]" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.55)_0%,rgba(0,0,0,0.24)_35%,rgba(0,0,0,0.58)_100%)]"
      />

      <div className="relative z-10 flex min-h-dvh w-full flex-col lg:flex-row">
        <aside className="w-full border-b border-white/10 bg-neutral-900/78 p-4 backdrop-blur-xl lg:h-dvh lg:w-[360px] lg:min-w-[320px] lg:max-w-[420px] lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-5">
          {dashboard}
        </aside>
        <section className="relative flex-1 p-3 lg:p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-4 bottom-5 top-5 rounded-[2.3rem] border border-white/10 bg-[radial-gradient(circle_at_45%_30%,rgba(255,255,255,0.15)_0%,rgba(255,255,255,0.04)_28%,rgba(0,0,0,0.35)_100%)] shadow-[0_30px_70px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-30px_80px_rgba(0,0,0,0.22)]"
          />
          <div className="relative h-full">{board}</div>
        </section>
      </div>
    </main>
  );
}
