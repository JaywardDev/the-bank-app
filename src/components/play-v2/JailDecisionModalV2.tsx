type JailDecisionModalV2Props = {
  open: boolean;
  isActor: boolean;
  actorName: string | null;
  jailTurnsRemaining: number;
  jailFineAmount: number;
  hasGetOutOfJailFree: boolean;
  canRollForDoubles: boolean;
  actionLoading: string | null;
  onPayFine: () => void;
  onUseGetOutOfJailFree: () => void;
  onRollForDoubles: () => void;
};

export default function JailDecisionModalV2({
  open,
  isActor,
  actorName,
  jailTurnsRemaining,
  jailFineAmount,
  hasGetOutOfJailFree,
  canRollForDoubles,
  actionLoading,
  onPayFine,
  onUseGetOutOfJailFree,
  onRollForDoubles,
}: JailDecisionModalV2Props) {
  if (!open) {
    return null;
  }

  return (
    <div className="w-full rounded-3xl border border-rose-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">Jail decision</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">You are in jail.</p>
          <p className="text-sm text-neutral-600">Turns remaining: {jailTurnsRemaining}</p>

          {isActor ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-rose-200"
                type="button"
                onClick={onPayFine}
                disabled={actionLoading === "JAIL_PAY_FINE"}
              >
                {actionLoading === "JAIL_PAY_FINE" ? "Paying…" : `Pay $${jailFineAmount} fine`}
              </button>
              <button
                className="rounded-2xl border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-900 disabled:cursor-not-allowed disabled:border-rose-200 disabled:text-rose-300"
                type="button"
                onClick={onUseGetOutOfJailFree}
                disabled={actionLoading === "USE_GET_OUT_OF_JAIL_FREE" || !hasGetOutOfJailFree}
              >
                {actionLoading === "USE_GET_OUT_OF_JAIL_FREE"
                  ? "Using…"
                  : "Use Get Out of Jail Free"}
              </button>
              <button
                className="rounded-2xl border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-900 disabled:cursor-not-allowed disabled:border-rose-200 disabled:text-rose-300 sm:col-span-2"
                type="button"
                onClick={onRollForDoubles}
                disabled={!canRollForDoubles || actionLoading === "JAIL_ROLL_FOR_DOUBLES"}
              >
                {actionLoading === "JAIL_ROLL_FOR_DOUBLES" ? "Rolling…" : "Roll for doubles"}
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-neutral-500">Waiting for {actorName ?? "player"}…</p>
          )}
    </div>
  );
}
