export type GameRules = {
  freeParkingJackpotEnabled: boolean;
  loanCollateralEnabled: boolean;
  mortgageRatePerTurn: number;
  mortgageTermTurns: number;
  mortgageLtv: number;
  collateralLtv: number;
  collateralRatePerTurn: number;
  collateralTermTurns: number;
  /** @deprecated Use collateralRatePerTurn. */
  loanRatePerTurn: number;
  /** @deprecated Use collateralTermTurns. */
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
  mortgageRatePerTurn: 0.015,
  mortgageTermTurns: 30,
  mortgageLtv: 0.5,
  collateralLtv: 0.5,
  collateralRatePerTurn: 0.008,
  collateralTermTurns: 10,
  loanRatePerTurn: 0.008,
  loanTermTurns: 10,
  auctionEnabled: true,
  auctionMinIncrement: 10,
  auctionTurnSeconds: 60,
  auctionAllowInitiatorToBid: true,
  macroEnabled: true,
};

export const getRules = (rules?: Partial<GameRules> | null): GameRules => {
  const resolved = {
    ...DEFAULT_RULES,
    ...(rules ?? {}),
  };

  const collateralRatePerTurn =
    typeof rules?.collateralRatePerTurn === "number"
      ? rules.collateralRatePerTurn
      : typeof rules?.loanRatePerTurn === "number"
        ? rules.loanRatePerTurn
        : DEFAULT_RULES.collateralRatePerTurn;

  const collateralTermTurns =
    typeof rules?.collateralTermTurns === "number"
      ? rules.collateralTermTurns
      : typeof rules?.loanTermTurns === "number"
        ? rules.loanTermTurns
        : DEFAULT_RULES.collateralTermTurns;

  return {
    ...resolved,
    collateralRatePerTurn,
    collateralTermTurns,
    loanRatePerTurn: collateralRatePerTurn,
    loanTermTurns: collateralTermTurns,
  };
};
