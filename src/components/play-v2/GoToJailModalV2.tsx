type PendingGoToJail = {
  eventId: string;
  eventVersion: number;
  playerId: string;
};

type GoToJailModalV2Props = {
  pendingGoToJail: PendingGoToJail | null;
  isActor: boolean;
  actorName: string | null;
  onAcknowledge: () => void;
};

export default function GoToJailModalV2({
  pendingGoToJail,
  isActor,
  actorName,
  onAcknowledge,
}: GoToJailModalV2Props) {
  if (!pendingGoToJail) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-20 bg-black/50 backdrop-blur-[2px]" />
      <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-3xl border border-neutral-200 bg-white p-6 text-center shadow-2xl ring-1 ring-black/10">
          <p className="text-2xl font-black tracking-wide text-neutral-900">GO TO JAIL</p>
          {isActor ? (
            <button
              type="button"
              onClick={onAcknowledge}
              className="mt-5 w-full rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
            >
              OK
            </button>
          ) : (
            <p className="mt-5 text-sm text-neutral-500">Waiting for {actorName ?? "player"}…</p>
          )}
        </div>
      </div>
    </>
  );
}
