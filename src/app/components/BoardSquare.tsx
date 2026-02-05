import type { ReactNode } from "react";

type BoardSquareProps = {
  children: ReactNode;
};

export default function BoardSquare({ children }: BoardSquareProps) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="aspect-square h-full max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100vw-22rem)]">
        {children}
      </div>
    </div>
  );
}
