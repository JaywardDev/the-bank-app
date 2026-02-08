export type MacroCenterCard = {
  id: string;
  title: string;
  body: string;
  turnsLeft: number | null;
};

type CenterHubProps = {
  boardPackName: string;
  lastRoll: number | null;
  activeMacroCards: MacroCenterCard[];
  overflowCount: number;
};

function MacroCard({ card }: { card: MacroCenterCard }) {
  const turnsLabel =
    typeof card.turnsLeft === "number"
      ? `${card.turnsLeft} turn${card.turnsLeft === 1 ? "" : "s"} left`
      : "Active";

  return (
    <article className="flex h-[170px] w-[260px] flex-col overflow-hidden rounded-2xl border border-white/45 bg-white/80 p-4 text-left text-slate-900 shadow-[0_12px_28px_rgba(0,0,0,0.22)] backdrop-blur-md md:h-[190px] md:w-[340px]">
      <header className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
          Macro event
        </p>
        <span className="inline-flex shrink-0 rounded-full border border-amber-500/30 bg-amber-100/90 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
          {turnsLabel}
        </span>
      </header>

      <h3 className="mt-2 line-clamp-2 text-base font-bold leading-tight md:text-lg">{card.title}</h3>
      <p className="mt-2 line-clamp-4 text-xs leading-snug text-slate-700 md:text-sm">{card.body}</p>

      <footer className="mt-auto flex items-center justify-between gap-2 pt-2">
        <span className="text-[10px] uppercase tracking-[0.16em] text-emerald-700">Active</span>
        <span className="text-[10px] text-slate-600">
          Turns left: {typeof card.turnsLeft === "number" ? card.turnsLeft : "Active"}
        </span>
      </footer>
    </article>
  );
}

export default function CenterHub({
  boardPackName,
  lastRoll,
  activeMacroCards,
  overflowCount,
}: CenterHubProps) {
  void boardPackName;

  return (
    <div className="pointer-events-none absolute inset-[16%] flex items-center justify-center">
      <div className="w-full max-w-5xl rounded-[1.6rem] border border-white/20 bg-slate-900/35 p-4 text-white shadow-[0_18px_45px_rgba(0,0,0,0.34)] backdrop-blur-md">
        <p className="text-center text-sm font-medium text-amber-100/95">Last roll: {lastRoll ?? "—"}</p>

        {activeMacroCards.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {activeMacroCards.map((card) => (
              <MacroCard key={card.id} card={card} />
            ))}
            {overflowCount > 0 ? (
              <span className="inline-flex h-10 items-center justify-center rounded-full border border-white/40 bg-black/25 px-4 text-sm font-semibold text-white">
                +{overflowCount} more
              </span>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-center text-sm text-white/75">No active macro effects.</p>
        )}
      </div>
    </div>
  );
}
