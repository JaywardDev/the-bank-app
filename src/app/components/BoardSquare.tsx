import type { ReactNode } from "react";

type BoardSquareProps = {
  children: ReactNode;
};

export default function BoardSquare({ children }: BoardSquareProps) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="relative aspect-square h-full max-h-[calc(100dvh-3.25rem)] w-full max-w-[calc(100vw-23rem)] rounded-[1.7rem] border border-white/20 bg-[linear-gradient(160deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0.02)_28%,rgba(0,0,0,0.22)_100%)] p-3 shadow-[0_34px_90px_rgba(0,0,0,0.6),0_2px_4px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.32),inset_0_-12px_18px_rgba(0,0,0,0.28)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-2 rounded-[1.35rem] border border-white/12 shadow-[inset_0_18px_28px_rgba(255,255,255,0.05),inset_0_-22px_40px_rgba(0,0,0,0.2)]"
        />
        <div className="relative h-full w-full overflow-hidden rounded-[1.3rem] bg-[url('/icons/board.svg')] bg-cover bg-center bg-no-repeat">
          <div className="relative z-10 h-full w-full">{children}</div>
        </div>
      </div>
    </div>
  );
}
