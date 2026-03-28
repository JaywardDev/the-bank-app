import { formatCurrency } from "@/lib/currency";

type SuperTaxPendingAction = {
  type: "SUPER_TAX_CONFIRM";
  player_id: string | null;
  tile_id: string;
  tile_index: number;
  tile_name: string;
  boardpack_id: string | null;
  current_cash: number;
  asset_value: number;
  total_liabilities: number;
  net_worth_for_tax: number;
  tax_rate: number;
  tax_amount: number;
  uses_custom_formula: boolean;
  currency_code: string;
  currency_symbol: string;
  tax_exemption_pass_count: number;
};

type SuperTaxModalV2Props = {
  pendingSuperTax: SuperTaxPendingAction | null;
  actorName: string | null;
  isActor: boolean;
  actionLoading: string | null;
  onConfirm: () => void;
  onUseTaxExemptionPass: () => void;
};

export default function SuperTaxModalV2({
  pendingSuperTax,
  actorName,
  isActor,
  actionLoading,
  onConfirm,
  onUseTaxExemptionPass,
}: SuperTaxModalV2Props) {
  if (!pendingSuperTax) {
    return null;
  }

  const currency = {
    code: pendingSuperTax.currency_code,
    symbol: pendingSuperTax.currency_symbol,
  };
  const formatMoney = (value: number) => formatCurrency(value, currency);
  const taxRatePercent = Math.round(pendingSuperTax.tax_rate * 100);
  const hasTaxExemptionPass = pendingSuperTax.tax_exemption_pass_count > 0;

  return (
    <div className="w-full rounded-3xl border border-violet-300/35 bg-violet-500/10 p-4 text-sm text-violet-50">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">Tax notice</p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">Super Tax Due</h2>
      <p className="mt-2 text-xs leading-5 text-violet-100/85">
        You landed on Super Tax. Review how the amount was calculated, then continue to pay the tax.
      </p>

      <div className="mt-4 rounded-2xl border border-violet-200/20 bg-black/10 p-3">
        {pendingSuperTax.uses_custom_formula ? (
          <div className="space-y-3">
            <BreakdownRow label="Current Cash" value={formatMoney(pendingSuperTax.current_cash)} />
            <BreakdownRow label="Asset Value" value={formatMoney(pendingSuperTax.asset_value)} />
            <BreakdownRow
              label="Liabilities"
              value={`−${formatMoney(pendingSuperTax.total_liabilities)}`}
              tone="muted"
            />
            <div className="border-t border-dashed border-violet-200/25" />
            <BreakdownRow
              label="Net Worth for Tax"
              value={formatMoney(pendingSuperTax.net_worth_for_tax)}
              tone="strong"
            />
            <BreakdownRow label="Tax Rate" value={`${taxRatePercent}%`} />
            <div className="border-t border-dashed border-violet-200/25" />
            <div className="rounded-2xl bg-violet-500/90 px-3 py-2 text-violet-50">
              <BreakdownRow
                label="Super Tax Due"
                value={formatMoney(pendingSuperTax.tax_amount)}
                inverted
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl bg-violet-500/90 px-3 py-2 text-violet-50">
              <BreakdownRow
                label="Fixed Super Tax"
                value={formatMoney(pendingSuperTax.tax_amount)}
                inverted
              />
            </div>
            <p className="text-xs leading-5 text-violet-100/80">
              This board uses a fixed Super Tax amount.
            </p>
          </div>
        )}
      </div>

      {pendingSuperTax.uses_custom_formula ? (
        <div className="mt-3 space-y-1 text-xs text-violet-100/80">
          <p>Super Tax on this board is 10% of your current net worth for tax purposes.</p>
          <p className="text-violet-100/70">
            Net worth for tax = cash + property assets - outstanding liabilities.
          </p>
        </div>
      ) : null}

      {isActor ? (
        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={actionLoading === "CONFIRM_SUPER_TAX"}
            className="w-full rounded-2xl bg-violet-300 px-4 py-2.5 text-sm font-semibold text-violet-950 transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {actionLoading === "CONFIRM_SUPER_TAX" ? "Paying…" : "Pay Tax"}
          </button>
          {hasTaxExemptionPass ? (
            <>
              <button
                type="button"
                onClick={onUseTaxExemptionPass}
                disabled={actionLoading === "USE_TAX_EXEMPTION_PASS"}
                className="w-full rounded-2xl border border-violet-300/35 bg-white/5 px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionLoading === "USE_TAX_EXEMPTION_PASS"
                  ? "Using pass…"
                  : "Use Tax Exemption Pass"}
              </button>
              <p className="text-center text-xs text-violet-100/75">
                Use this card to avoid paying this tax. The card will be consumed.
              </p>
              <p className="text-center text-xs text-violet-100/75">
                Tax Exemption Pass available: {pendingSuperTax.tax_exemption_pass_count}
              </p>
            </>
          ) : null}
          <p className="text-center text-xs text-violet-100/75">This action will continue your turn.</p>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-violet-200/20 bg-white/5 px-3 py-2 text-sm text-violet-100/85">
          Waiting for {actorName ?? "player"} to acknowledge Super Tax…
        </div>
      )}
    </div>
  );
}

type BreakdownRowProps = {
  label: string;
  value: string;
  tone?: "default" | "muted" | "strong";
  inverted?: boolean;
};

function BreakdownRow({
  label,
  value,
  tone = "default",
  inverted = false,
}: BreakdownRowProps) {
  const labelClass = inverted
    ? "text-violet-100/90"
    : tone === "muted"
      ? "text-violet-100/65"
      : tone === "strong"
        ? "text-white"
        : "text-violet-100/75";
  const valueClass = inverted
    ? "text-white"
    : tone === "muted"
      ? "text-violet-100/75"
      : tone === "strong"
        ? "text-white"
        : "text-violet-50";

  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <dt className={`font-medium ${labelClass}`}>{label}</dt>
      <dd className={`text-right font-semibold tabular-nums ${valueClass}`}>{value}</dd>
    </div>
  );
}
