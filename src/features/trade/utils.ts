import type {
  TradeExecutionPerspective,
  TradeExecutionSummary,
  TradeProposal,
  TradeSnapshotTile,
} from "./types";

export const normalizeTradeSnapshot = (
  snapshot: TradeProposal["snapshot"],
): TradeSnapshotTile[] => {
  if (!snapshot) {
    return [];
  }
  if (Array.isArray(snapshot)) {
    return snapshot;
  }
  if (
    typeof snapshot === "object" &&
    "tiles" in snapshot &&
    Array.isArray(snapshot.tiles)
  ) {
    return snapshot.tiles;
  }
  return [];
};

export const toOptionalPositiveCash = (amount: number) =>
  amount > 0 ? amount : undefined;

export const toOptionalTileIndices = (tileIndices: number[]) =>
  tileIndices.length > 0 ? tileIndices : undefined;

export const hasTradeValue = ({
  offerCash,
  offerFreeBuildTokens = 0,
  offerFreeUpgradeTokens = 0,
  offerTiles,
  requestCash,
  requestFreeBuildTokens = 0,
  requestFreeUpgradeTokens = 0,
  requestTiles,
}: {
  offerCash: number;
  offerFreeBuildTokens?: number;
  offerFreeUpgradeTokens?: number;
  offerTiles: number[];
  requestCash: number;
  requestFreeBuildTokens?: number;
  requestFreeUpgradeTokens?: number;
  requestTiles: number[];
}) =>
  offerCash > 0 ||
  offerFreeBuildTokens > 0 ||
  offerFreeUpgradeTokens > 0 ||
  offerTiles.length > 0 ||
  requestCash > 0 ||
  requestFreeBuildTokens > 0 ||
  requestFreeUpgradeTokens > 0 ||
  requestTiles.length > 0;

export const deriveTradeExecutionPerspective = ({
  tradeExecutionSummary,
  currentUserPlayerId,
  getPlayerNameById,
}: {
  tradeExecutionSummary: TradeExecutionSummary;
  currentUserPlayerId: string;
  getPlayerNameById: (playerId: string | null | undefined) => string;
}): TradeExecutionPerspective => {
  const isProposer =
    currentUserPlayerId === tradeExecutionSummary.proposerPlayerId;
  const giveTiles = isProposer
    ? tradeExecutionSummary.offerTiles
    : tradeExecutionSummary.requestTiles;
  const receiveTiles = isProposer
    ? tradeExecutionSummary.requestTiles
    : tradeExecutionSummary.offerTiles;
  const giveCash = isProposer
    ? tradeExecutionSummary.offerCash
    : tradeExecutionSummary.requestCash;
  const receiveCash = isProposer
    ? tradeExecutionSummary.requestCash
    : tradeExecutionSummary.offerCash;
  const giveFreeBuildTokens = isProposer
    ? tradeExecutionSummary.offerFreeBuildTokens
    : tradeExecutionSummary.requestFreeBuildTokens;
  const giveFreeUpgradeTokens = isProposer
    ? tradeExecutionSummary.offerFreeUpgradeTokens
    : tradeExecutionSummary.requestFreeUpgradeTokens;
  const receiveFreeBuildTokens = isProposer
    ? tradeExecutionSummary.requestFreeBuildTokens
    : tradeExecutionSummary.offerFreeBuildTokens;
  const receiveFreeUpgradeTokens = isProposer
    ? tradeExecutionSummary.requestFreeUpgradeTokens
    : tradeExecutionSummary.offerFreeUpgradeTokens;
  const counterpartyName = isProposer
    ? getPlayerNameById(tradeExecutionSummary.counterpartyPlayerId)
    : getPlayerNameById(tradeExecutionSummary.proposerPlayerId);

  return {
    giveTiles,
    receiveTiles,
    giveCash,
    receiveCash,
    giveFreeBuildTokens,
    giveFreeUpgradeTokens,
    receiveFreeBuildTokens,
    receiveFreeUpgradeTokens,
    counterpartyName,
    snapshotTiles: tradeExecutionSummary.snapshotTiles,
  };
};
