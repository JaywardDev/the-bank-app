export const ROUND_LIMIT_OPTIONS = [50, 100, 150, 200, 300] as const;

export type RoundLimitOption = (typeof ROUND_LIMIT_OPTIONS)[number];

export const DEFAULT_ROUND_LIMIT: RoundLimitOption = 100;

export const isRoundLimitOption = (value: unknown): value is RoundLimitOption =>
  typeof value === "number" && ROUND_LIMIT_OPTIONS.includes(value as RoundLimitOption);

export const resolveRoundLimitForMode = ({
  gameMode,
  roundLimit,
}: {
  gameMode: "classic" | "round_mode";
  roundLimit: unknown;
}) => (gameMode === "round_mode" && isRoundLimitOption(roundLimit) ? roundLimit : null);

export const shouldEndRoundModeGame = ({
  gameMode,
  roundLimit,
  tableRoundAdvanced,
  nextRound,
}: {
  gameMode: "classic" | "round_mode";
  roundLimit: number | null;
  tableRoundAdvanced: boolean;
  nextRound: number;
}) =>
  gameMode === "round_mode" &&
  typeof roundLimit === "number" &&
  tableRoundAdvanced &&
  nextRound >= roundLimit;
