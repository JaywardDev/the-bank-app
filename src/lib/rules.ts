export type GameRules = {
  freeParkingJackpotEnabled: boolean;
  loanCollateralEnabled: boolean;
  collateralLtv: number;
  loanRatePerTurn: number;
  loanTermTurns: number;
};

export const DEFAULT_RULES: GameRules = {
  freeParkingJackpotEnabled: false,
  loanCollateralEnabled: true,
  collateralLtv: 0.5,
  loanRatePerTurn: 0.008,
  loanTermTurns: 10,
};

export const getRules = (rules?: Partial<GameRules> | null): GameRules => ({
  ...DEFAULT_RULES,
  ...(rules ?? {}),
});
