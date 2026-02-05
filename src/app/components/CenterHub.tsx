import Image from "next/image";

type CenterHubProps = {
  boardPackName: string;
  lastRoll: number | null;
};

const CHANCE_SVG = "/icons/chance.svg";
const COMMUNITY_CHEST_SVG = "/icons/community_chest.svg";

export default function CenterHub({ boardPackName, lastRoll }: CenterHubProps) {
  return (
    <div className="pointer-events-none absolute inset-[16%] flex items-center justify-center">
      <div className="w-full max-w-2xl rounded-3xl border border-neutral-700/30 bg-neutral-950/80 p-6 text-center text-white shadow-2xl backdrop-blur-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">Projection only</p>
        <p className="mt-2 text-2xl font-semibold">{boardPackName}</p>
        <p className="mt-3 text-sm text-white/70">Table display</p>
        <p className="mt-4 text-lg font-semibold text-amber-300">Last roll: {lastRoll ?? "—"}</p>
        <div className="mt-6 flex items-center justify-center gap-8">
          {[
            { label: "Chance", src: CHANCE_SVG },
            { label: "Community Chest", src: COMMUNITY_CHEST_SVG },
          ].map((deck) => (
            <div key={deck.label} className="w-[170px] text-center">
              <div className="flex aspect-[4/3] items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-b from-white/15 to-white/[0.03] p-4 shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
                <Image
                  src={deck.src}
                  alt={`${deck.label} deck`}
                  width={90}
                  height={90}
                  className="opacity-95 drop-shadow"
                />
              </div>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
                {deck.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
