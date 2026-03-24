type GoToJailModalV2Props = {
  isOpen: boolean;
  isActor: boolean;
  actionLoading: boolean;
  onConfirm: () => void;
};

export default function GoToJailModalV2({
  isOpen,
  isActor,
  actionLoading,
  onConfirm,
}: GoToJailModalV2Props) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="w-full rounded-3xl border border-neutral-200 bg-white p-6 text-center shadow-2xl ring-1 ring-black/10">
      <p className="text-2xl font-black tracking-wide text-neutral-900">GO TO JAIL</p>
      <button
        type="button"
        onClick={onConfirm}
        disabled={!isActor || actionLoading}
        className="mt-5 w-full rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {actionLoading ? "Sending..." : "OK"}
      </button>
    </div>
  );
}
