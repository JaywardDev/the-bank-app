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
  startingCash: number,
) => Math.floor(0.2 * Math.max(0, currentCash - startingCash));

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

type NetWorthForTaxInput = {
  currentCash: number;
  playerId: string;
  boardTiles: BoardTile[];
  ownershipByTile: OwnershipByTileForTax;
  activeCollateralLoans: PlayerLoanForTax[];
  activePurchaseMortgages: PurchaseMortgageForTax[];
};

export const computeNetWorthForTax = ({
  currentCash,
  playerId,
  boardTiles,
  ownershipByTile,
  activeCollateralLoans,
  activePurchaseMortgages,
}: NetWorthForTaxInput) => {
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

  return currentCash + assetValue - (collateralLiabilities + purchaseMortgageLiabilities);
};

export const computeSuperTaxAmount = (netWorthForTax: number) =>
  Math.floor(0.1 * Math.max(0, netWorthForTax));
