import type { BoardPack } from "@/lib/boardPacks";
import {
  getPendingCardDescription,
  resolvePendingCardText,
} from "@/lib/gameNarrativeHelpers";

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
  boardPack: BoardPack | null;
  currencySymbol: string;
  onConfirm: () => void;
};

export default function PendingCardModalV2({
  pendingCard,
  actorName,
  isActor,
  actionLoading,
  boardPack,
  currencySymbol,
  onConfirm,
}: PendingCardModalV2Props) {
  if (!pendingCard) {
    return null;
  }

  const pendingCardText = resolvePendingCardText(pendingCard, boardPack);
  const pendingCardDescription =
    pendingCardText ??
    getPendingCardDescription(
      pendingCard.kind,
      pendingCard.payload,
      boardPack,
      currencySymbol,
    );

  const deckLabel =
    pendingCard.deck === "CHANCE"
      ? "Chance"
      : pendingCard.deck === "COMMUNITY"
        ? "Community Chest"
        : pendingCard.deck ?? "Card";

  return (
    <div className="w-full rounded-3xl border border-emerald-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500">Card revealed</p>
      <p className="text-lg font-semibold text-neutral-900">{deckLabel}</p>
      <p className="mt-2 text-base font-semibold text-neutral-900">{pendingCard.title}</p>
      <div className="mx-auto mt-3 max-w-lg whitespace-pre-line text-sm leading-relaxed text-neutral-700">
        {pendingCardDescription}
      </div>
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
  );
}
