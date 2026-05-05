import type { BoardTile } from "./boardPacks";
import { computeAuthoritativeNetWorthBreakdown } from "./netWorth";

const TAX_RULE_BOARDPACK_IDS = new Set([
  "classic-ph",
  "philippines-hard",
  "new-zealand",
]);

export const isCustomTaxBoardPack = (boardPackId?: string | null) =>
  TAX_RULE_BOARDPACK_IDS.has((boardPackId ?? "").toLowerCase());

export const computeIncomeTaxAmount = (
  currentCash: number,
  baselineCash: number,
  taxRate = 0.2,
) => Math.floor(taxRate * Math.max(0, currentCash - baselineCash));

export type IncomeTaxBreakdown = {
  currentCash: number;
  baselineCash: number;
  taxableGain: number;
  taxRate: number;
  taxAmount: number;
};

export const computeIncomeTaxBreakdown = ({
  currentCash,
  baselineCash,
  taxRate = 0.2,
}: {
  currentCash: number;
  baselineCash: number;
  taxRate?: number;
}): IncomeTaxBreakdown => {
  const taxableGain = Math.max(0, currentCash - baselineCash);
  return {
    currentCash,
    baselineCash,
    taxableGain,
    taxRate,
    taxAmount: Math.floor(taxRate * taxableGain),
  };
};

type OwnershipByTileForTax = Record<
  number,
  {
    owner_player_id: string;
    acquired_round?: number | null;
    houses?: number | null;
  }
>;

type PlayerLoanForTax = {
  principal: number;
  remaining_principal: number | null;
};

type PurchaseMortgageForTax = {
  principal_remaining: number;
  accrued_interest_unpaid: number;
};

export type NetWorthForTaxInput = {
  currentCash: number;
  currentRound?: number | null;
  playerId: string;
  boardTiles: BoardTile[];
  ownershipByTile: OwnershipByTileForTax;
  activeCollateralLoans: PlayerLoanForTax[];
  activePurchaseMortgages: PurchaseMortgageForTax[];
  inlandExploredCells?: unknown;
  boardPackEconomy?: {
    passGoAmount?: number;
    inlandLandBaseValueRatio?: number;
    houseImprovementValueMultipliers?: number[];
  } | null;
  taxRate?: number;
};


export type SuperTaxBreakdown = {
  currentCash: number;
  assetValue: number;
  totalLiabilities: number;
  netWorthForTax: number;
  taxRate: number;
  taxAmount: number;
};

export const computeSuperTaxBreakdown = ({
  currentCash,
  currentRound,
  playerId,
  boardTiles,
  ownershipByTile,
  activeCollateralLoans,
  activePurchaseMortgages,
  inlandExploredCells,
  boardPackEconomy,
  taxRate = 0.1,
}: NetWorthForTaxInput): SuperTaxBreakdown => {
  const netWorthBreakdown = computeAuthoritativeNetWorthBreakdown({
    currentCash,
    currentRound,
    playerId,
    boardTiles,
    ownershipByTile,
    activeCollateralLoans,
    activePurchaseMortgages,
    inlandExploredCells,
    boardPackEconomy,
  });
  const assetValue = netWorthBreakdown.assetValue;
  const totalLiabilities = netWorthBreakdown.totalLiabilities;
  const netWorthForTax = netWorthBreakdown.netWorth;

  return {
    currentCash,
    assetValue,
    totalLiabilities,
    netWorthForTax,
    taxRate,
    taxAmount: computeSuperTaxAmount(netWorthForTax, taxRate),
  };
};

export const computeNetWorthForTax = (input: NetWorthForTaxInput) =>
  computeSuperTaxBreakdown(input).netWorthForTax;

export const computeSuperTaxAmount = (
  netWorthForTax: number,
  taxRate = 0.1,
) => Math.floor(taxRate * Math.max(0, netWorthForTax));
