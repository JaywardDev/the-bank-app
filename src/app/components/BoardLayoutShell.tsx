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
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/35" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(17,24,39,0.12)_25%,rgba(3,7,18,0.62)_100%)]"
      />

      <div className="relative z-10 flex min-h-dvh w-full flex-col lg:flex-row">
        <aside className="w-full border-b border-white/10 bg-neutral-900/90 p-4 backdrop-blur lg:h-dvh lg:w-[360px] lg:min-w-[320px] lg:max-w-[420px] lg:overflow-y-auto lg:border-b-0 lg:border-r">
          {dashboard}
        </aside>
        <section className="relative flex-1 p-3 lg:p-4">{board}</section>
      </div>
    </main>
  );
}
