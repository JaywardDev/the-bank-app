import type { ReactNode } from "react";

type BoardLayoutShellProps = {
  dashboard: ReactNode;
  board: ReactNode;
};

export default function BoardLayoutShell({ dashboard, board }: BoardLayoutShellProps) {
  return (
    <main className="min-h-dvh bg-neutral-950 text-neutral-100">
      <div className="flex min-h-dvh w-full flex-col lg:flex-row">
        <aside className="w-full border-b border-white/10 bg-neutral-900/90 p-4 backdrop-blur lg:h-dvh lg:w-[360px] lg:min-w-[320px] lg:max-w-[420px] lg:overflow-y-auto lg:border-b-0 lg:border-r">
          {dashboard}
        </aside>
        <section className="relative flex-1 p-3 lg:p-4">{board}</section>
      </div>
    </main>
  );
}
