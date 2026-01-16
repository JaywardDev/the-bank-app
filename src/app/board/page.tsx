import PageShell from "../components/PageShell";

export default function BoardPage() {
  return (
    <PageShell
      title="Board Display"
      subtitle="Read-only big-screen view for the table and event log."
      variant="board"
    >
      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8 space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
              Current Turn
            </p>
            <p className="text-3xl md:text-4xl font-semibold">Indigo</p>
            <p className="text-sm text-white/70">
              Waiting for an action to be confirmed.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: "Bank Balance", value: "$205,000" },
              { label: "Properties", value: "28" },
              { label: "Houses/Hotels", value: "12 / 3" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <p className="text-xs uppercase tracking-wide text-white/50">
                  {stat.label}
                </p>
                <p className="text-2xl font-semibold text-white">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
            Turn Order
          </p>
          <ol className="space-y-3 text-lg">
            {[
              "Indigo",
              "Ember",
              "Jade",
              "Nova",
            ].map((player, index) => (
              <li
                key={player}
                className={`flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3 ${
                  index === 0 ? "bg-white/10" : "bg-black/20"
                }`}
              >
                <span>{player}</span>
                <span className="text-sm text-white/60">#{index + 1}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-black/30 p-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
            Board Highlights
          </p>
          <div className="space-y-2 text-lg">
            <p>Most traded: Railroads</p>
            <p>Largest rent paid: $4,000</p>
            <p>Next event: Auction window</p>
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-black/30 p-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
            Timer
          </p>
          <p className="text-5xl font-semibold">04:32</p>
          <p className="text-sm text-white/70">Round time remaining</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-black/30 p-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
            Bank Status
          </p>
          <p className="text-lg">All accounts balanced</p>
          <p className="text-sm text-white/70">Last audit 2 minutes ago</p>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
            Event Log
          </p>
          <span className="text-xs text-white/50">Live updates later</span>
        </div>
        <ul className="space-y-3 text-base">
          {[
            "Ember paid rent to Indigo ($1,200)",
            "Bank issued dividend to all players ($200)",
            "Jade completed a property set",
          ].map((event) => (
            <li
              key={event}
              className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3"
            >
              {event}
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
