import type { ReactNode } from "react";

type CompactOverlayModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export default function CompactOverlayModal({
  open,
  title,
  onClose,
  children,
}: CompactOverlayModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-950/65 p-3 sm:p-4">
      <div className="w-full max-w-xl max-h-[min(84svh,520px)] overflow-hidden rounded-2xl border border-amber-200/80 bg-[#FBFAF7] shadow-[0_18px_36px_rgba(24,16,8,0.45)]">
        <div className="flex items-center justify-between border-b border-amber-100/80 px-4 py-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-neutral-800">{title}</h3>
          <button
            type="button"
            className="rounded-md border border-amber-200/80 bg-white/80 px-2.5 py-1 text-xs font-semibold text-neutral-700"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="max-h-[min(calc(84svh-56px),464px)] overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>
  );
}
