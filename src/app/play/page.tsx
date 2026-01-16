import PageShell from "../components/PageShell";

export default function PlayPage() {
  return (
    <PageShell
      title="Player Console"
      subtitle="Mobile-first tools for wallet, assets, actions, and trades."
    >
      <section className="space-y-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Balance
              </p>
              <p className="text-3xl font-semibold text-neutral-900">$12,500</p>
              <p className="text-sm text-neutral-500">Available to spend</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-neutral-400">Net worth</p>
              <p className="text-lg font-semibold text-neutral-700">$26,200</p>
            </div>
          </div>
          <div className="grid gap-3 rounded-2xl border border-dashed border-neutral-200 p-3 text-sm text-neutral-600">
            <div className="flex items-center justify-between">
              <span>Recent income</span>
              <span className="font-medium text-emerald-600">+$1,800</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Recent expenses</span>
              <span className="font-medium text-rose-500">-$950</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Cash flow target</span>
              <span className="font-medium text-neutral-700">$15,000</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Properties
            </p>
            <p className="text-lg font-semibold text-neutral-900">
              Current holdings
            </p>
          </div>
          <div className="space-y-3">
            {[
              {
                name: "Pacific Avenue",
                group: "Green Set",
                rent: "$1,200",
              },
              { name: "Reading Railroad", group: "Railroads", rent: "$200" },
              { name: "Electric Company", group: "Utilities", rent: "$150" },
            ].map((property) => (
              <div
                key={property.name}
                className="rounded-2xl border px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-neutral-900">
                      {property.name}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {property.group}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase text-neutral-400">Rent</p>
                    <p className="text-sm font-semibold text-neutral-700">
                      {property.rent}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Actions
          </p>
          <span className="text-xs text-neutral-400">Coming soon</span>
        </div>
        <div className="grid gap-3">
          {[
            "Pay Bank",
            "Receive from Bank",
            "Mortgage / Unmortgage",
            "Build / Sell Houses",
          ].map((label) => (
            <button
              key={label}
              className="w-full rounded-2xl border bg-white px-4 py-4 text-left text-base font-semibold text-neutral-800 shadow-sm opacity-50 cursor-not-allowed"
              type="button"
              disabled
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Transaction History
          </p>
          <p className="text-sm text-neutral-600">
            Latest activity synced to your wallet.
          </p>
        </div>
        <div className="space-y-3 text-sm">
          {[
            {
              title: "Rent paid to Indigo",
              amount: "-$1,200",
              detail: "Pacific Avenue",
            },
            {
              title: "Dividend from bank",
              amount: "+$200",
              detail: "Community payout",
            },
            {
              title: "Utility charge",
              amount: "-$150",
              detail: "Electric Company",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="flex items-center justify-between rounded-2xl border px-4 py-3"
            >
              <div>
                <p className="font-medium text-neutral-800">{item.title}</p>
                <p className="text-xs text-neutral-500">{item.detail}</p>
              </div>
              <p
                className={`text-sm font-semibold ${
                  item.amount.startsWith("-")
                    ? "text-rose-500"
                    : "text-emerald-600"
                }`}
              >
                {item.amount}
              </p>
            </div>
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
