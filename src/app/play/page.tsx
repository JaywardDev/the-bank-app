import PageShell from "../components/PageShell";

export default function PlayPage() {
  return (
    <PageShell
      title="Player Console"
      subtitle="Mobile-first tools for wallet, assets, actions, and trades."
    >
      <section className="space-y-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Wallet
              </p>
              <p className="text-2xl font-semibold text-neutral-900">$12,500</p>
            </div>
            <button
              className="rounded-xl border px-4 py-2 text-sm font-medium text-neutral-700"
              type="button"
            >
              Add Cash
            </button>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Assets
            </p>
            <p className="text-lg font-semibold text-neutral-900">Board holdings</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              "Railroad",
              "Utility",
              "Property Set",
              "Houses",
              "Hotels",
            ].map((label) => (
              <span
                key={label}
                className="rounded-full border px-3 py-1 text-xs font-medium text-neutral-600"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Actions
        </p>
        <div className="grid gap-3">
          {[
            "Pay Bank",
            "Receive from Bank",
            "Mortgage / Unmortgage",
            "Build / Sell Houses",
          ].map((label) => (
            <button
              key={label}
              className="w-full rounded-2xl border bg-white px-4 py-4 text-left text-base font-semibold text-neutral-800 shadow-sm active:scale-[0.99]"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Trade Confirm
          </p>
          <p className="text-sm text-neutral-600">
            Verify the terms before both sides accept.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            className="rounded-2xl border px-4 py-3 text-sm font-semibold text-neutral-700"
            type="button"
          >
            Propose Trade
          </button>
          <button
            className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white"
            type="button"
          >
            Accept Trade
          </button>
        </div>
      </section>
    </PageShell>
  );
}
