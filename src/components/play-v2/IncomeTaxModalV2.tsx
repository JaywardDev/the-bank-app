import { formatCurrency } from "@/lib/currency";

type IncomeTaxPendingAction = {
  type: "INCOME_TAX_CONFIRM";
  player_id: string | null;
  tile_id: string;
  tile_index: number;
  tile_name: string;
  boardpack_id: string | null;
  current_cash: number;
  baseline_cash: number;
  taxable_gain: number;
  tax_rate: number;
  tax_amount: number;
  currency_code: string;
  currency_symbol: string;
};

type IncomeTaxModalV2Props = {
  pendingIncomeTax: IncomeTaxPendingAction | null;
  actorName: string | null;
  isActor: boolean;
  actionLoading: string | null;
  onConfirm: () => void;
};

export default function IncomeTaxModalV2({
  pendingIncomeTax,
  actorName,
  isActor,
  actionLoading,
  onConfirm,
}: IncomeTaxModalV2Props) {
  if (!pendingIncomeTax) return null;

  const currency = {
    code: pendingIncomeTax.currency_code,
    symbol: pendingIncomeTax.currency_symbol,
  };
  const formatMoney = (value: number) => formatCurrency(value, currency);
  const hasTaxableGain = pendingIncomeTax.taxable_gain > 0;
  const actionLabel = hasTaxableGain ? "Pay Tax" : "Continue";

  return (
    <div className="w-full max-w-xl rounded-[2rem] border border-emerald-200/70 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur sm:p-7">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">Tax notice</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Income Tax Due</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        You landed on Income Tax. Review how the amount was calculated before continuing.
      </p>

      <div className="mt-5 rounded-[1.75rem] border border-slate-200 bg-slate-50/90 p-4 shadow-inner sm:p-5">
        <div className="space-y-3">
          <BreakdownRow label="Current Cash" value={formatMoney(pendingIncomeTax.current_cash)} />
          <BreakdownRow
            label="Last Income Tax Baseline"
            value={formatMoney(pendingIncomeTax.baseline_cash)}
          />
          <div className="border-t border-dashed border-slate-200" />
          <BreakdownRow label="Taxable Gain" value={formatMoney(pendingIncomeTax.taxable_gain)} tone="strong" />
          <BreakdownRow label="Tax Rate" value={`${Math.round(pendingIncomeTax.tax_rate * 100)}%`} />
          <div className="border-t border-dashed border-slate-200" />
          <div className="rounded-2xl bg-emerald-600 px-4 py-3 text-emerald-50 shadow-lg shadow-emerald-600/20">
            <BreakdownRow label="Income Tax Due" value={formatMoney(pendingIncomeTax.tax_amount)} inverted />
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2 text-sm text-slate-600">
        <p>Income Tax is calculated as 20% of the cash you gained since your last Income Tax checkpoint.</p>
        {!hasTaxableGain ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
            No taxable gain since the last checkpoint.
          </p>
        ) : null}
      </div>

      {isActor ? (
        <div className="mt-6 space-y-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={actionLoading === "CONFIRM_INCOME_TAX"}
            className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {actionLoading === "CONFIRM_INCOME_TAX" ? "Processing…" : actionLabel}
          </button>
          <p className="text-center text-xs text-slate-500">This action will continue your turn.</p>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-100/80 px-4 py-3 text-sm text-slate-600">
          Waiting for {actorName ?? "player"} to resolve Income Tax…
        </div>
      )}
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  tone = "default",
  inverted = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "strong";
  inverted?: boolean;
}) {
  const labelClass = inverted
    ? "text-emerald-100"
    : tone === "strong"
      ? "text-slate-950"
      : "text-slate-600";
  const valueClass = inverted
    ? "text-white"
    : tone === "strong"
      ? "text-slate-950"
      : "text-slate-900";

  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <dt className={`font-medium ${labelClass}`}>{label}</dt>
      <dd className={`text-right font-semibold tabular-nums ${valueClass}`}>{value}</dd>
    </div>
  );
}
