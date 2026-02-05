import type { ReactNode } from "react";
import Image from "next/image";

type CenterHubProps = {
  boardPackName: string;
  lastRoll: number | null;
  revealedCard: {
    deck: "CHANCE" | "COMMUNITY";
    title: string;
    description: string | null;
    statusLine: string | null;
  } | null;
};

const CHANCE_SVG = "/icons/chance.svg";
const COMMUNITY_CHEST_SVG = "/icons/community_chest.svg";

type DeckVisualProps = {
  label: string;
  deck: "CHANCE" | "COMMUNITY";
  src: string;
  isCardRevealed: boolean;
  children?: ReactNode;
};

function DeckVisual({ label, deck, src, isCardRevealed, children }: DeckVisualProps) {
  const revealFromDirection = deck === "CHANCE" ? "translate-x-2" : "-translate-x-2";

  return (
    <div className="relative w-[270px] text-center">
      <div className="mx-auto w-[170px]">
        <div className="relative flex aspect-[4/3] items-center justify-center rounded-2xl border border-white/25 bg-gradient-to-br from-white/20 via-white/10 to-white/[0.02] p-4 shadow-[0_14px_24px_rgba(0,0,0,0.45)]">
          <div className="absolute inset-0 translate-x-[6px] translate-y-[6px] rounded-2xl border border-white/12 bg-neutral-900/25" />
          <div className="absolute inset-0 translate-x-[12px] translate-y-[12px] rounded-2xl border border-white/10 bg-neutral-900/20" />
          <div className="absolute inset-[2px] rounded-[14px] border border-white/20" />
          <div className="relative -rotate-[1.5deg]">
            <Image
              src={src}
              alt={`${label} deck`}
              width={90}
              height={90}
              className="opacity-95 drop-shadow"
            />
          </div>
        </div>
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/75">{label}</p>
      </div>
      <div
        className={`pointer-events-none absolute top-1/2 ${deck === "CHANCE" ? "left-[186px]" : "right-[186px]"} -translate-y-1/2 transition-all duration-300 ease-out ${
          isCardRevealed ? "translate-x-0 opacity-100" : `${revealFromDirection} opacity-0`
        }`}
      >
        {children}
      </div>
    </div>
  );
}

type RevealedCardProps = {
  deckLabel: string;
  title: string;
  description: string | null;
  statusLine: string | null;
};

function RevealedCard({ deckLabel, title, description, statusLine }: RevealedCardProps) {
  return (
    <div className="w-[340px] rounded-2xl border border-emerald-200/45 bg-white/95 p-5 text-left text-neutral-900 shadow-[0_22px_42px_rgba(0,0,0,0.45)] backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">{deckLabel}</p>
      <p className="mt-2 text-xl font-semibold leading-tight text-neutral-950">{title}</p>
      {description ? <p className="mt-2 text-base leading-snug text-neutral-700">{description}</p> : null}
      {statusLine ? <p className="mt-4 text-sm font-medium text-neutral-500">{statusLine}</p> : null}
    </div>
  );
}

export default function CenterHub({ boardPackName, lastRoll, revealedCard }: CenterHubProps) {
  return (
    <div className="pointer-events-none absolute inset-[16%] flex items-center justify-center">
      <div className="w-full max-w-2xl rounded-3xl border border-neutral-700/30 bg-neutral-950/80 p-6 text-center text-white shadow-2xl backdrop-blur-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">Projection only</p>
        <p className="mt-2 text-2xl font-semibold">{boardPackName}</p>
        <p className="mt-3 text-sm text-white/70">Table display</p>
        <p className="mt-4 text-lg font-semibold text-amber-300">Last roll: {lastRoll ?? "—"}</p>
        <div className="mt-6 flex items-center justify-center gap-4">
          {[
            { label: "Chance", src: CHANCE_SVG, deck: "CHANCE" as const },
            { label: "Community Chest", src: COMMUNITY_CHEST_SVG, deck: "COMMUNITY" as const },
          ].map((deck) => (
            <DeckVisual
              key={deck.label}
              label={deck.label}
              deck={deck.deck}
              src={deck.src}
              isCardRevealed={revealedCard?.deck === deck.deck}
            >
              {revealedCard?.deck === deck.deck ? (
                <RevealedCard
                  deckLabel={deck.label.toUpperCase()}
                  title={revealedCard.title}
                  description={revealedCard.description}
                  statusLine={revealedCard.statusLine}
                />
              ) : null}
            </DeckVisual>
          ))}
        </div>
      </div>
    </div>
  );
}
