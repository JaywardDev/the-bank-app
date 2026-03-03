type PendingMacroEvent = {
  [key: string]: unknown;
};

type PendingMacroModalV2Props = {
  pendingMacroEvent: PendingMacroEvent | null;
  actorName: string | null;
  isActor: boolean;
  actionLoading: string | null;
  onConfirm: () => void;
};

export default function PendingMacroModalV2({
  pendingMacroEvent,
  actorName,
  isActor,
  actionLoading,
  onConfirm,
}: PendingMacroModalV2Props) {
  if (!pendingMacroEvent) {
    return null;
  }

  return (
    <div className="w-full rounded-3xl border border-sky-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-500">Macro event</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">
            {(typeof pendingMacroEvent.name === "string" && pendingMacroEvent.name) || "Macroeconomic Shift"}
          </p>
          {isActor ? (
            <button
              className="mt-4 w-full rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-sky-200"
              type="button"
              onClick={onConfirm}
              disabled={actionLoading === "CONFIRM_MACRO_EVENT"}
            >
              {actionLoading === "CONFIRM_MACRO_EVENT" ? "Confirming…" : "OK"}
            </button>
          ) : (
            <p className="mt-4 text-sm text-neutral-500">Waiting for {actorName ?? "player"}…</p>
          )}
    </div>
  );
}
