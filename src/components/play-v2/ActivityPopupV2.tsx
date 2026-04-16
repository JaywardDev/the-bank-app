"use client";

import { useEffect, useMemo, useState } from "react";
import type { BoardPack } from "@/lib/boardPacks";
import {
  deriveWalletTransactions,
  formatEventDescription,
  type GameEventRow,
} from "@/lib/eventFeedFormatters";
import { formatSignedCurrency, getCurrencyMetaFromBoardPack } from "@/lib/currency";

type PlayerRow = { id: string; display_name: string | null };

type ActivityPopupV2Props = {
  isOpen: boolean;
  onClose: () => void;
  events: GameEventRow[];
  players: PlayerRow[];
  boardPack: BoardPack | null;
  currencySymbol: string;
  currentPlayerId: string | null;
};

const formatAmount = (
  amount: number,
  currencySymbol: string,
  boardPack: BoardPack | null,
) => {
  const currency = getCurrencyMetaFromBoardPack(boardPack);
  return formatSignedCurrency(amount, {
    code: currency.code ?? undefined,
    symbol: currencySymbol || currency.symbol || "$",
  });
};

export default function ActivityPopupV2({
  isOpen,
  onClose,
  events,
  players,
  boardPack,
  currencySymbol,
  currentPlayerId,
}: ActivityPopupV2Props) {
  const [tab, setTab] = useState<"activity" | "transactions">("activity");

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const hiddenActivityEventTypes = useMemo(() => {
    const hiddenTypes = new Set<string>();
    for (const event of events) {
      const description = formatEventDescription(event, { players, boardPack, currencySymbol });
      if (description === "Update received") {
        hiddenTypes.add(event.event_type);
      }
    }
    return hiddenTypes;
  }, [boardPack, currencySymbol, events, players]);

  const activityEvents = useMemo(
    () => events.filter((event) => !hiddenActivityEventTypes.has(event.event_type)).slice(0, 15),
    [events, hiddenActivityEventTypes],
  );

  const transactions = useMemo(
    () =>
      deriveWalletTransactions(events, {
        players,
        boardPack,
        currentPlayerId,
      }),
    [boardPack, currentPlayerId, events, players],
  );

  const visibleTransactions = useMemo(() => transactions.slice(0, 15), [transactions]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60]" onClick={onClose} aria-hidden={!isOpen}>
      <div className="absolute inset-0 bg-[#2A1709]/35" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Activity and wallet transactions"
        className="absolute bottom-3 left-3 w-[min(92vw,340px)] max-h-[70vh] overflow-hidden rounded-2xl border border-[#C7935A]/30 bg-[#4E3018]/95 text-white shadow-2xl backdrop-blur"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/15 p-2">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setTab("activity")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                tab === "activity" ? "bg-white/20 text-white" : "text-white/75 hover:bg-white/10"
              }`}
            >
              Activity
            </button>
            <button
              type="button"
              onClick={() => setTab("transactions")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                tab === "transactions"
                  ? "bg-white/20 text-white"
                  : "text-white/75 hover:bg-white/10"
              }`}
            >
              Transactions
            </button>
          </div>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {tab === "activity" ? (
            <ul className="divide-y divide-white/10">
              {activityEvents.map((event) => (
                <li key={event.id} className="px-2 py-1.5 text-[12px]">
                  <p className="overflow-hidden text-ellipsis whitespace-nowrap text-white/95">
                    {formatEventDescription(event, { players, boardPack, currencySymbol })}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-white/10">
              {visibleTransactions.length === 0 ? (
                <li className="px-2 py-3 text-[12px] text-white/65">No wallet transactions yet.</li>
              ) : (
                visibleTransactions.map((txn) => (
                  <li key={txn.id} className="px-2 py-1.5 text-[12px]">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <p className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-white/95">
                        {txn.subtitle ?? txn.title}
                      </p>
                      <p className={txn.amount >= 0 ? "text-emerald-300" : "text-rose-300"}>
                        {formatAmount(txn.amount, currencySymbol, boardPack)}
                      </p>
                    </div>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
