import type { BoardTile } from "./boardPacks";

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
) => Math.floor(0.2 * Math.max(0, currentCash - baselineCash));

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
  playerId: string;
  boardTiles: BoardTile[];
  ownershipByTile: OwnershipByTileForTax;
  activeCollateralLoans: PlayerLoanForTax[];
  activePurchaseMortgages: PurchaseMortgageForTax[];
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
  playerId,
  boardTiles,
  ownershipByTile,
  activeCollateralLoans,
  activePurchaseMortgages,
}: NetWorthForTaxInput): SuperTaxBreakdown => {
  let assetValue = 0;

  for (const tile of boardTiles) {
    if (
      tile.type !== "PROPERTY" &&
      tile.type !== "RAIL" &&
      tile.type !== "UTILITY"
    ) {
      continue;
    }

    const ownership = ownershipByTile[tile.index];
    if (!ownership || ownership.owner_player_id !== playerId) {
      continue;
    }

    assetValue += tile.price ?? 0;
  }

  const collateralLiabilities = activeCollateralLoans.reduce((sum, loan) => {
    const principalRemaining =
      typeof loan.remaining_principal === "number"
        ? loan.remaining_principal
        : loan.principal;
    return sum + principalRemaining;
  }, 0);

  const purchaseMortgageLiabilities = activePurchaseMortgages.reduce(
    (sum, mortgage) =>
      sum + mortgage.principal_remaining + mortgage.accrued_interest_unpaid,
    0,
  );

  const totalLiabilities = collateralLiabilities + purchaseMortgageLiabilities;
  const netWorthForTax = currentCash + assetValue - totalLiabilities;
  const taxRate = 0.1;

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
