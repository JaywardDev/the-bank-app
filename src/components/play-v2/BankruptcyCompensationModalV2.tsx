"use client";

type BankruptcyCompensationModalV2Props = {
  isOpen: boolean;
  debtorName: string;
  formattedAmount: string;
  onConfirm: () => void;
};

export default function BankruptcyCompensationModalV2({
  isOpen,
  debtorName,
  formattedAmount,
  onConfirm,
}: BankruptcyCompensationModalV2Props) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-3xl border border-amber-200/20 bg-gradient-to-b from-amber-950/95 via-amber-900/90 to-stone-950/95 p-5 text-amber-50 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.18em] text-amber-200/80">Notice</p>
        <h2 className="mt-2 text-xl font-semibold text-white">Debtor Defaulted</h2>
        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-amber-50/90">
          {`${debtorName} was unable to fulfill their financial obligation and has declared bankruptcy.\n\nThe bank has intervened to settle part of the debt.\n\nYou receive ${formattedAmount} as compensation.`}
        </p>
        <p className="mt-3 text-xs italic text-amber-200/75">
          Not all investments pay in full... but the system moves forward.
        </p>

        <button
          type="button"
          onClick={onConfirm}
          className="mt-5 w-full rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-amber-950 transition hover:bg-amber-200"
        >
          OK
        </button>
      </div>
    </div>
  );
}
