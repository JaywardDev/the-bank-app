import InfoTooltip from "@/app/components/InfoTooltip";

type PendingMacroEvent = {
  [key: string]: unknown;
};

type PendingMacroModalV2Props = {
  pendingMacroEvent: PendingMacroEvent | null;
  macroTooltipById: Map<string, string>;
  actorName: string | null;
  isActor: boolean;
  actionLoading: string | null;
  onConfirm: () => void;
};

export default function PendingMacroModalV2({
  pendingMacroEvent,
  macroTooltipById,
  actorName,
  isActor,
  actionLoading,
  onConfirm,
}: PendingMacroModalV2Props) {
  if (!pendingMacroEvent) {
    return null;
  }

  const macroName =
    (typeof pendingMacroEvent.name === "string" && pendingMacroEvent.name) ||
    "Macroeconomic Shift";
  const rarity =
    typeof pendingMacroEvent.rarity === "string"
      ? pendingMacroEvent.rarity
      : null;
  const rarityLabel = rarity?.replaceAll("_", " ") ?? null;
  const headline =
    typeof pendingMacroEvent.headline === "string"
      ? pendingMacroEvent.headline
      : null;
  const flavor =
    typeof pendingMacroEvent.flavor === "string"
      ? pendingMacroEvent.flavor
      : null;
  const rulesText =
    typeof pendingMacroEvent.rulesText === "string"
      ? pendingMacroEvent.rulesText
      : null;
  const durationRounds =
    typeof pendingMacroEvent.durationRounds === "number"
      ? pendingMacroEvent.durationRounds
      : typeof pendingMacroEvent.duration_rounds === "number"
        ? pendingMacroEvent.duration_rounds
        : 0;
  const macroCardId =
    typeof pendingMacroEvent.macroCardId === "string"
      ? pendingMacroEvent.macroCardId
      : null;
  const tooltip =
    (typeof pendingMacroEvent.tooltip === "string" && pendingMacroEvent.tooltip) ||
    (macroCardId ? macroTooltipById.get(macroCardId) ?? "" : "");

  return (
    <div className="w-full rounded-3xl border border-sky-200 bg-white/95 p-5 text-center shadow-2xl ring-1 ring-black/10 backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-wide text-sky-500">Macro event</p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <p className="text-lg font-semibold text-neutral-900">{macroName}</p>
        {rarityLabel ? (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
            {rarityLabel}
          </span>
        ) : null}
      </div>

      <div className="mx-auto mt-4 max-w-xl space-y-3 text-center leading-relaxed">
        {headline ? <p className="text-lg font-semibold text-neutral-900">{headline}</p> : null}
        {flavor ? <p className="text-sm italic text-neutral-600">{flavor}</p> : null}
        {rulesText ? <p className="text-sm text-neutral-700">{rulesText}</p> : null}
        {durationRounds > 0 ? (
          <p className="text-sm text-neutral-600">Lasts {durationRounds} rounds</p>
        ) : null}
        {tooltip ? (
          <div className="flex justify-center">
            <InfoTooltip text={tooltip} />
          </div>
        ) : null}
      </div>

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
