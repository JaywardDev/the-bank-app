import type { ReactNode } from "react";

type BoardSquareProps = {
  children: ReactNode;
  variant?: "board" | "viewport";
};

export default function BoardSquare({ children, variant = "board" }: BoardSquareProps) {
  const isViewport = variant === "viewport";

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        className={`relative aspect-square h-full w-full rounded-[1.7rem] border border-white/20 bg-[linear-gradient(160deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0.02)_28%,rgba(0,0,0,0.22)_100%)] shadow-[0_34px_90px_rgba(0,0,0,0.6),0_2px_4px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.32),inset_0_-12px_18px_rgba(0,0,0,0.28)] ${
          isViewport ? "max-h-full max-w-full p-0" : "max-h-[calc(100dvh-3.25rem)] max-w-[calc(100vw-23rem)] p-3"
        }`}
      >
        <div
          aria-hidden
          className={`pointer-events-none absolute rounded-[1.35rem] border border-white/12 shadow-[inset_0_18px_28px_rgba(255,255,255,0.05),inset_0_-22px_40px_rgba(0,0,0,0.2)] ${isViewport ? "inset-0.5" : "inset-2"}`}
        />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(242,229,196,0.09)_0%,rgba(26,22,16,0.07)_100%)]" />
        <div className="relative z-10 h-full w-full">{children}</div>
      </div>
    </div>
  );
}
