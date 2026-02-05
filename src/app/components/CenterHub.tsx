type CenterHubProps = {
  boardPackName: string;
  lastRoll: number | null;
};

export default function CenterHub({ boardPackName, lastRoll }: CenterHubProps) {
  return (
    <div className="pointer-events-none absolute inset-[16%] flex items-center justify-center">
      <div className="w-full max-w-md rounded-3xl border border-neutral-700/30 bg-neutral-950/80 p-6 text-center text-white shadow-2xl backdrop-blur-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">Projection only</p>
        <p className="mt-2 text-2xl font-semibold">{boardPackName}</p>
        <p className="mt-3 text-sm text-white/70">Table display</p>
        <p className="mt-4 text-lg font-semibold text-amber-300">Last roll: {lastRoll ?? "—"}</p>
      </div>
    </div>
  );
}
