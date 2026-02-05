import Image from "next/image";

type CenterHubProps = {
  boardPackName: string;
  lastRoll: number | null;
  highlightedDeck: "CHANCE" | "COMMUNITY" | null;
};

const CHANCE_SVG = "/icons/chance.svg";
const COMMUNITY_CHEST_SVG = "/icons/community_chest.svg";

type DeckVisualProps = {
  label: string;
  deck: "CHANCE" | "COMMUNITY";
  src: string;
  isHighlighted: boolean;
};

function DeckVisual({ label, deck, src, isHighlighted }: DeckVisualProps) {
  const accent =
    deck === "CHANCE"
      ? {
          frame: "border-amber-400/65",
          frameGlow: "ring-1 ring-amber-300/50",
          iconTint: "brightness-100 saturate-100",
        }
      : {
          frame: "border-sky-400/65",
          frameGlow: "ring-1 ring-sky-300/50",
          iconTint: "brightness-100 saturate-100",
        };

  return (
    <div className="relative w-[270px] text-center">
      <div className="mx-auto w-[170px]">
        <div className={`relative flex aspect-[4/3] items-center justify-center rounded-2xl border bg-gradient-to-br from-[#fffef8] via-[#f9f5ea] to-[#f3ece0] p-4 shadow-[0_10px_18px_rgba(0,0,0,0.28)] transition-all duration-300 ${accent.frameGlow} ${
          isHighlighted
            ? "border-emerald-200/70 ring-2 ring-emerald-300/45"
            : "border-neutral-300/90"
        }`}>
          <div className="absolute inset-0 translate-x-[6px] translate-y-[6px] rounded-2xl border border-neutral-300/60 bg-neutral-200/50" />
          <div className="absolute inset-0 translate-x-[12px] translate-y-[12px] rounded-2xl border border-neutral-400/55 bg-neutral-300/45" />
          <div className={`absolute inset-[2px] rounded-[14px] border ${accent.frame}`} />
          <div className="relative -rotate-[1.5deg]">
            <Image
              src={src}
              alt={`${label} deck`}
              width={90}
              height={90}
              className={`opacity-95 drop-shadow-[0_2px_4px_rgba(0,0,0,0.2)] ${accent.iconTint}`}
            />
          </div>
        </div>
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/75">{label}</p>
      </div>
    </div>
  );
}

export default function CenterHub({ boardPackName, lastRoll, highlightedDeck }: CenterHubProps) {
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
              isHighlighted={highlightedDeck === deck.deck}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
