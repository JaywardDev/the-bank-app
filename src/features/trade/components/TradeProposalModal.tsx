import type { TradeCounterpartyOption, TradePropertyOption } from "../types";

type TradeProposalModalProps = {
  isOpen: boolean;
  counterparties: TradeCounterpartyOption[];
  selectedCounterpartyId: string;
  onSelectedCounterpartyChange: (value: string) => void;
  offerCash: number;
  maxOfferCash: number;
  onOfferCashChange: (value: number) => void;
  offerProperties: TradePropertyOption[];
  selectedOfferTileIndices: number[];
  onOfferTileToggle: (tileIndex: number, checked: boolean) => void;
  requestCash: number;
  onRequestCashChange: (value: number) => void;
  requestProperties: TradePropertyOption[];
  selectedRequestTileIndices: number[];
  onRequestTileToggle: (tileIndex: number, checked: boolean) => void;
  canSubmitTradeProposal: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
};

export const TradeProposalModal = ({
  isOpen,
  counterparties,
  selectedCounterpartyId,
  onSelectedCounterpartyChange,
  offerCash,
  maxOfferCash,
  onOfferCashChange,
  offerProperties,
  selectedOfferTileIndices,
  onOfferTileToggle,
  requestCash,
  onRequestCashChange,
  requestProperties,
  selectedRequestTileIndices,
  onRequestTileToggle,
  canSubmitTradeProposal,
  isSubmitting,
  onClose,
  onSubmit,
}: TradeProposalModalProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
      <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-3xl border border-indigo-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                Propose trade
              </p>
              <p className="text-lg font-semibold text-neutral-900">
                Craft a trade offer
              </p>
            </div>
            <button
              className="rounded-full border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-700"
              type="button"
              onClick={onClose}
              aria-label="Close trade proposal"
            >
              ✕
            </button>
          </div>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Counterparty
              </label>
              <select
                className="w-full rounded-2xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700"
                value={selectedCounterpartyId}
                onChange={(event) => onSelectedCounterpartyChange(event.target.value)}
              >
                {counterparties.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  Offer
                </p>
                <label className="text-xs text-neutral-500">
                  Cash
                  <input
                    className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700"
                    type="number"
                    min={0}
                    max={maxOfferCash}
                    value={offerCash}
                    onChange={(event) =>
                      onOfferCashChange(Math.max(0, Number(event.target.value)))
                    }
                  />
                </label>
                <div className="space-y-1">
                  <p className="text-xs text-neutral-500">Properties</p>
                  {offerProperties.length === 0 ? (
                    <p className="text-xs text-neutral-400">
                      No owned properties to offer.
                    </p>
                  ) : (
                    <div className="max-h-40 space-y-2 overflow-y-auto pr-2 text-sm text-neutral-700">
                      {offerProperties.map((tile) => (
                        <label
                          key={`offer-${tile.tileIndex}`}
                          className="flex items-center gap-2"
                        >
                          <input
                            type="checkbox"
                            checked={selectedOfferTileIndices.includes(tile.tileIndex)}
                            onChange={(event) =>
                              onOfferTileToggle(tile.tileIndex, event.target.checked)
                            }
                          />
                          <span>
                            {tile.tileName}
                            {tile.houses > 0
                              ? ` · ${tile.houses} ${tile.houses === 1 ? "house" : "houses"}`
                              : ""}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  Request
                </p>
                <label className="text-xs text-neutral-500">
                  Cash
                  <input
                    className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700"
                    type="number"
                    min={0}
                    value={requestCash}
                    onChange={(event) =>
                      onRequestCashChange(Math.max(0, Number(event.target.value)))
                    }
                  />
                </label>
                <div className="space-y-1">
                  <p className="text-xs text-neutral-500">Properties</p>
                  {selectedCounterpartyId ? (
                    requestProperties.length === 0 ? (
                      <p className="text-xs text-neutral-400">
                        No properties owned by the selected player.
                      </p>
                    ) : (
                      <div className="max-h-40 space-y-2 overflow-y-auto pr-2 text-sm text-neutral-700">
                        {requestProperties.map((tile) => (
                          <label
                            key={`request-${tile.tileIndex}`}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="checkbox"
                              checked={selectedRequestTileIndices.includes(tile.tileIndex)}
                              onChange={(event) =>
                                onRequestTileToggle(tile.tileIndex, event.target.checked)
                              }
                            />
                            <span>
                              {tile.tileName}
                              {tile.houses > 0
                                ? ` · ${tile.houses} ${tile.houses === 1 ? "house" : "houses"}`
                                : ""}
                            </span>
                          </label>
                        ))}
                      </div>
                    )
                  ) : (
                    <p className="text-xs text-neutral-400">
                      Select a player to see their properties.
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-neutral-400">
                Trades are sent to the bank for review before delivery.
              </p>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-2xl border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
                  type="button"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  className="rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-indigo-200"
                  type="button"
                  onClick={onSubmit}
                  disabled={isSubmitting || !canSubmitTradeProposal}
                >
                  {isSubmitting ? "Sending…" : "Send trade"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
