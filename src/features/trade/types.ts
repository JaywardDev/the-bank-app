export type TradeSnapshotTile = {
  tile_index: number;
  collateral_loan_id: string | null;
  purchase_mortgage_id: string | null;
  houses: number;
};

export type TradeProposal = {
  id: string;
  game_id: string;
  proposer_player_id: string;
  counterparty_player_id: string;
  offer_cash: number;
  offer_free_build_tokens: number;
  offer_free_upgrade_tokens: number;
  offer_tile_indices: number[];
  request_cash: number;
  request_free_build_tokens: number;
  request_free_upgrade_tokens: number;
  request_tile_indices: number[];
  snapshot: TradeSnapshotTile[] | { tiles: TradeSnapshotTile[] } | null;
  status: string;
  created_at: string | null;
};

export type TradeExecutionSummary = {
  tradeId: string;
  proposerPlayerId: string;
  counterpartyPlayerId: string;
  offerCash: number;
  offerTiles: number[];
  requestCash: number;
  requestTiles: number[];
  snapshotTiles: TradeSnapshotTile[];
};

export type TradeExecutionPerspective = {
  giveTiles: number[];
  receiveTiles: number[];
  giveCash: number;
  receiveCash: number;
  counterpartyName: string;
  snapshotTiles: TradeSnapshotTile[];
};

export type TradePropertyOption = {
  tileIndex: number;
  tileName: string;
  houses: number;
};

export type TradeCounterpartyOption = {
  id: string;
  displayName: string;
};

export type TradeLiabilitySummary = {
  tileIndex: number;
  collateralPayment: number | null;
  mortgageInterest: number | null;
};
