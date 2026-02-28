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
        className={`relative h-full w-full ${
          isViewport ? "max-h-full max-w-full p-0" : "max-h-[calc(100dvh-3.25rem)] max-w-[calc(100vw-23rem)] p-3"
        }`}
      >
        <div className="relative z-10 h-full w-full">{children}</div>
      </div>
    </div>
  );
}
