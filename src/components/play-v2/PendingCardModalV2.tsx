type PendingCard = {
  id: string | null;
  deck: "CHANCE" | "COMMUNITY" | null;
  title: string;
  kind: string | null;
  payload: Record<string, unknown> | null;
  drawnBy: string | null;
};

type PendingCardModalV2Props = {
  pendingCard: PendingCard | null;
  actorName: string | null;
  isActor: boolean;
  actionLoading: string | null;
  onConfirm: () => void;
};

export default function PendingCardModalV2({
  pendingCard,
  actorName,
  isActor,
  actionLoading,
  onConfirm,
}: PendingCardModalV2Props) {
  if (!pendingCard) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
      <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border border-emerald-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500">Card revealed</p>
          <p className="text-lg font-semibold text-neutral-900">{pendingCard.deck ?? "CARD"}</p>
          <p className="mt-2 text-base font-semibold text-neutral-900">{pendingCard.title}</p>
          {isActor ? (
            <button
              className="mt-4 w-full rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-emerald-200"
              type="button"
              onClick={onConfirm}
              disabled={actionLoading === "CONFIRM_PENDING_CARD"}
            >
              {actionLoading === "CONFIRM_PENDING_CARD" ? "Confirming…" : "OK"}
            </button>
          ) : (
            <p className="mt-4 text-sm text-neutral-500">Waiting for {actorName ?? "player"}…</p>
          )}
        </div>
      </div>
    </>
  );
}
