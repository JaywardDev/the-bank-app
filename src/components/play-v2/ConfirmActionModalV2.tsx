import type { ReactNode } from "react";

type ConfirmActionModalV2Props = {
  open: boolean;
  title: string;
  titleClassName?: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  isConfirming?: boolean;
  confirmVariant?: "danger" | "success";
  showEyebrow?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmActionModalV2({
  open,
  title,
  titleClassName,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  isConfirming = false,
  confirmVariant = "danger",
  showEyebrow = true,
  onConfirm,
  onCancel,
}: ConfirmActionModalV2Props) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-3xl border border-amber-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
        {showEyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Confirm action</p>
        ) : null}
        <p
          className={`${showEyebrow ? "mt-1" : ""} ${titleClassName ?? "text-lg"} font-semibold text-neutral-900`}
        >
          {title}
        </p>
        <div className="mt-2 text-sm text-neutral-700">{description}</div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700"
            onClick={onCancel}
            disabled={isConfirming}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`flex-1 rounded-2xl px-4 py-2 text-sm font-semibold text-white ${
              confirmVariant === "success"
                ? "bg-emerald-600 disabled:bg-emerald-200"
                : "bg-red-600 disabled:bg-red-200"
            }`}
            onClick={onConfirm}
            disabled={isConfirming}
          >
            {isConfirming ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
