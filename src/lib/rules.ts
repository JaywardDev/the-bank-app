export type GameRules = {
  freeParkingJackpotEnabled: boolean;
  loanCollateralEnabled: boolean;
  collateralLtv: number;
  loanRatePerTurn: number;
  loanTermTurns: number;
  auctionEnabled: boolean;
  auctionMinIncrement: number;
  auctionTurnSeconds: number;
  auctionAllowInitiatorToBid: boolean;
  macroEnabled: boolean;
};

export const DEFAULT_RULES: GameRules = {
  freeParkingJackpotEnabled: false,
  loanCollateralEnabled: true,
  collateralLtv: 0.5,
  loanRatePerTurn: 0.008,
  loanTermTurns: 10,
  auctionEnabled: true,
  auctionMinIncrement: 10,
  auctionTurnSeconds: 60,
  auctionAllowInitiatorToBid: true,
  macroEnabled: true,
};

export const getRules = (rules?: Partial<GameRules> | null): GameRules => ({
  ...DEFAULT_RULES,
  ...(rules ?? {}),
});
