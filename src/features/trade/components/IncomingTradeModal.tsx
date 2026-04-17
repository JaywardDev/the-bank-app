import type { TradeLiabilitySummary, TradeSnapshotTile } from "../types";

type IncomingTradeModalProps = {
  isOpen: boolean;
  counterpartyName: string;
  requestCash: number;
  requestFreeBuildTokens: number;
  requestFreeUpgradeTokens: number;
  requestTileIndices: number[];
  offerCash: number;
  offerFreeBuildTokens: number;
  offerFreeUpgradeTokens: number;
  offerTileIndices: number[];
  snapshotTiles: TradeSnapshotTile[];
  liabilities: TradeLiabilitySummary[];
  currencySymbol: string;
  getTileNameByIndex: (tileIndex: number) => string;
  formatMoney: (amount: number, currencySymbol?: string) => string;
  isRejecting: boolean;
  isAccepting: boolean;
  onClose: () => void;
  onReject: () => void;
  onAccept: () => void;
};

export const IncomingTradeModal = ({
  isOpen,
  counterpartyName,
  requestCash,
  requestFreeBuildTokens,
  requestFreeUpgradeTokens,
  requestTileIndices,
  offerCash,
  offerFreeBuildTokens,
  offerFreeUpgradeTokens,
  offerTileIndices,
  snapshotTiles,
  liabilities,
  currencySymbol,
  getTileNameByIndex,
  formatMoney,
  isRejecting,
  isAccepting,
  onClose,
  onReject,
  onAccept,
}: IncomingTradeModalProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
      <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-3xl border border-indigo-200 bg-white/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                Incoming trade offer
              </p>
              <p className="text-lg font-semibold text-neutral-900">
                {counterpartyName} wants to trade
              </p>
            </div>
            <button
              className="rounded-full border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-700"
              type="button"
              onClick={onClose}
              aria-label="Close incoming trade"
            >
              ✕
            </button>
          </div>
          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-neutral-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                You give
              </p>
              <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                {requestCash > 0 ? (
                  <li>Cash: {formatMoney(requestCash, currencySymbol)}</li>
                ) : null}
                {requestFreeBuildTokens > 0 ? (
                  <li>Build vouchers: {requestFreeBuildTokens}</li>
                ) : null}
                {requestFreeUpgradeTokens > 0 ? (
                  <li>Upgrade vouchers: {requestFreeUpgradeTokens}</li>
                ) : null}
                {requestTileIndices.length > 0 ? (
                  requestTileIndices.map((tileIndex) => {
                    const snapshot = snapshotTiles.find(
                      (entry) => entry.tile_index === tileIndex,
                    );
                    const houses = snapshot?.houses ?? 0;
                    return (
                      <li key={`give-${tileIndex}`}>
                        {getTileNameByIndex(tileIndex)}
                        {houses > 0
                          ? ` · ${houses} ${houses === 1 ? "house" : "houses"}`
                          : ""}
                      </li>
                    );
                  })
                ) : requestCash === 0 &&
                  requestFreeBuildTokens === 0 &&
                  requestFreeUpgradeTokens === 0 ? (
                  <li className="text-neutral-400">Nothing</li>
                ) : null}
              </ul>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                You receive
              </p>
              <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                {offerCash > 0 ? (
                  <li>Cash: {formatMoney(offerCash, currencySymbol)}</li>
                ) : null}
                {offerFreeBuildTokens > 0 ? (
                  <li>Build vouchers: {offerFreeBuildTokens}</li>
                ) : null}
                {offerFreeUpgradeTokens > 0 ? (
                  <li>Upgrade vouchers: {offerFreeUpgradeTokens}</li>
                ) : null}
                {offerTileIndices.length > 0 ? (
                  offerTileIndices.map((tileIndex) => {
                    const snapshot = snapshotTiles.find(
                      (entry) => entry.tile_index === tileIndex,
                    );
                    const houses = snapshot?.houses ?? 0;
                    return (
                      <li key={`receive-${tileIndex}`}>
                        {getTileNameByIndex(tileIndex)}
                        {houses > 0
                          ? ` · ${houses} ${houses === 1 ? "house" : "houses"}`
                          : ""}
                      </li>
                    );
                  })
                ) : offerCash === 0 &&
                  offerFreeBuildTokens === 0 &&
                  offerFreeUpgradeTokens === 0 ? (
                  <li className="text-neutral-400">Nothing</li>
                ) : null}
              </ul>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Liabilities assumed
              </p>
              {liabilities.some(
                (entry) =>
                  entry.collateralPayment !== null ||
                  entry.mortgageInterest !== null,
              ) ? (
                <ul className="mt-2 space-y-2 text-sm text-neutral-700">
                  {liabilities.map((entry) => {
                    const details = [];
                    if (entry.collateralPayment !== null) {
                      details.push(
                        `Collateral: ${formatMoney(entry.collateralPayment, currencySymbol)}/turn`,
                      );
                    }
                    if (entry.mortgageInterest !== null) {
                      details.push(
                        `Mortgage interest: ${formatMoney(entry.mortgageInterest, currencySymbol)}/turn`,
                      );
                    }
                    if (details.length === 0) {
                      return null;
                    }
                    return (
                      <li
                        key={`liability-${entry.tileIndex}`}
                        className="rounded-xl bg-white px-3 py-2"
                      >
                        <p className="text-xs font-semibold text-neutral-500">
                          {getTileNameByIndex(entry.tileIndex)}
                        </p>
                        <p className="text-sm text-neutral-800">
                          {details.join(" · ")}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-neutral-500">
                  No liabilities on incoming properties.
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              className="rounded-2xl border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:border-neutral-100 disabled:text-neutral-400"
              type="button"
              onClick={onReject}
              disabled={isRejecting}
            >
              {isRejecting ? "Rejecting…" : "Reject"}
            </button>
            <button
              className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
              type="button"
              onClick={onAccept}
              disabled={isAccepting}
            >
              {isAccepting ? "Accepting…" : "Accept"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
