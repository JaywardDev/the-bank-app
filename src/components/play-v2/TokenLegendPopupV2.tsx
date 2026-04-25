"use client";

import Image from "next/image";
import { useEffect } from "react";

type PlayerRow = {
  id: string;
  display_name: string | null;
  is_eliminated: boolean;
};

type TokenLegendPopupV2Props = {
  isOpen: boolean;
  onClose: () => void;
  players: PlayerRow[];
};

export default function TokenLegendPopupV2({
  isOpen,
  onClose,
  players,
}: TokenLegendPopupV2Props) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60]" onClick={onClose} aria-hidden={!isOpen}>
      <div className="absolute inset-0 bg-[#2A1709]/35" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Token legend"
        className="absolute bottom-3 left-3 w-[min(92vw,340px)] max-h-[70vh] overflow-hidden rounded-2xl border border-[#C7935A]/30 bg-[#4E3018]/95 text-white shadow-2xl backdrop-blur"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/15 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
            Token Legend
          </p>
        </div>
        <ul className="max-h-[55vh] space-y-1 overflow-y-auto p-2">
          {players.map((player, index) => {
            const tokenIndex = (index % 8) + 1;
            const playerName = player.display_name ?? "Player";
            const isEliminated = player.is_eliminated;

            return (
              <li
                key={player.id}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                  isEliminated ? "opacity-65 saturate-50" : "bg-white/5"
                }`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black/10">
                  {isEliminated ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
                      Eliminated
                    </span>
                  ) : (
                    <Image
                      src={`/assets/token/token-${tokenIndex}.svg`}
                      alt={`${playerName} token`}
                      width={24}
                      height={24}
                      className="h-6 w-6 object-contain"
                    />
                  )}
                </div>
                <span
                  className={`min-w-0 truncate ${
                    isEliminated ? "text-white/55" : "text-white/95"
                  }`}
                >
                  {playerName}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
