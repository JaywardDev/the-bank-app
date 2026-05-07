import "server-only";

import { DEFAULT_BOARD_PACK_ECONOMY, getBoardPackById } from "@/lib/boardPacks";
import type { AiAction, AiPlanningContext } from "../types";
import { calculateAuctionMaxBid } from "../helpers/auction";
import { hasLoanMortgageBlockingMacro } from "../helpers/macro";
import { pendingPurchaseTileIndex } from "../helpers/loans";
import { getSetOwnershipStatus, isOwnableTile, wouldCompleteSet } from "../helpers/ownership";
import { getCollateralCandidates } from "../heuristics/collateral";
import { calculateReserve } from "../heuristics/reserves";
import { getWeakSellableAssets } from "../heuristics/sellableAssets";
import { chooseEasyAction, pendingPlayerId, pendingType } from "./easy";

const countOwnedOwnables = ({
  boardTiles,
  ownershipRows,
  playerId,
}: {
  boardTiles: AiPlanningContext["boardTiles"];
  ownershipRows: AiPlanningContext["ownershipRows"];
  playerId: string;
}) => {
  const ownableTileIndexes = new Set(boardTiles.filter(isOwnableTile).map((tile) => tile.index));
  return ownershipRows.filter(
    (row) => row.owner_player_id === playerId && ownableTileIndexes.has(row.tile_index),
  ).length;
};

const isInExpansionMode = ({
  ownedOwnableCount,
  roundsElapsed,
}: {
  ownedOwnableCount: number;
  roundsElapsed: number;
}) => ownedOwnableCount < 3 || (roundsElapsed <= 3 && ownedOwnableCount < 2);

// Medium v1 intentionally stays conservative: set-building, cash reserves, limited liquidity, and no trading/building/inland heuristics.
export const chooseMediumAction = (context: AiPlanningContext): AiAction | null => {
  const { state, player, game, boardTiles, ownershipRows, loanRows, actionsTaken } = context;
  const passGoAmount = getBoardPackById(game?.board_pack_id)?.economy.passGoAmount ?? DEFAULT_BOARD_PACK_ECONOMY.passGoAmount ?? 200;
  const cash = state.balances?.[player.id] ?? 0;

  if (state.auction_active) {
    if (state.auction_turn_player_id !== player.id) return null;
    const tileIndex = state.auction_tile_index;
    const tile = typeof tileIndex === "number" ? boardTiles.find((entry) => entry.index === tileIndex) : null;
    const propertyPrice = tile?.price;
    if (!tile || !isOwnableTile(tile) || typeof propertyPrice !== "number" || propertyPrice <= 0) {
      return { action: "AUCTION_PASS" };
    }

    const status = getSetOwnershipStatus({ boardTiles, ownershipRows, playerId: player.id, tile });
    const currentBid = state.auction_current_bid ?? 0;
    const minIncrement = state.auction_min_increment ?? getBoardPackById(game?.board_pack_id)?.economy.auctionMinIncrement ?? 10;
    const nextBid = currentBid === 0 ? minIncrement : currentBid + minIncrement;
    const reserve = calculateReserve({ propertyPrice, passGoAmount, completion: wouldCompleteSet(status) });
    const strategyMaxBid = calculateAuctionMaxBid({ state, playerId: player.id, status, propertyPrice });

    return nextBid <= strategyMaxBid && nextBid <= cash - reserve
      ? { action: "AUCTION_BID", amount: nextBid }
      : { action: "AUCTION_PASS" };
  }

  const type = pendingType(state);
  const actorId = pendingPlayerId(state);
  if (type === "BUY_PROPERTY" && actorId === player.id) {
    const tileIndex = pendingPurchaseTileIndex(state);
    const price = typeof state.pending_action?.price === "number" ? state.pending_action.price : null;
    const targetTile = typeof tileIndex === "number" ? boardTiles.find((entry) => entry.index === tileIndex) : null;
    if (tileIndex === null || !targetTile || !isOwnableTile(targetTile) || typeof price !== "number" || price <= 0) return null;

    const targetStatus = getSetOwnershipStatus({ boardTiles, ownershipRows, playerId: player.id, tile: targetTile });
    const completion = wouldCompleteSet(targetStatus);
    const roundsElapsed = state.rounds_elapsed ?? 0;
    const ownsNoneNonCompletion = targetStatus.ownsNone && !completion;
    const expansionMode = isInExpansionMode({
      ownedOwnableCount: countOwnedOwnables({ boardTiles, ownershipRows, playerId: player.id }),
      roundsElapsed,
    });
    if (ownsNoneNonCompletion && !expansionMode) {
      return { action: "DECLINE_PROPERTY", tileIndex };
    }

    const reserve = calculateReserve({ propertyPrice: price, passGoAmount, completion });
    if (cash - price >= reserve) return { action: "BUY_PROPERTY", tileIndex };

    const loanMortgageBlocked = hasLoanMortgageBlockingMacro(state);
    const downPayment = Math.ceil(price * 0.5);
    if (!loanMortgageBlocked && cash - downPayment >= reserve) {
      return { action: "BUY_PROPERTY", tileIndex, financing: "MORTGAGE", downPaymentPercent: 50 };
    }

    if (ownsNoneNonCompletion && expansionMode) {
      return { action: "DECLINE_PROPERTY", tileIndex };
    }

    const alreadyRestructuredForThisPurchase = actionsTaken.includes("SELL_TO_MARKET") || actionsTaken.includes("TAKE_COLLATERAL_LOAN");
    const weakAssets = alreadyRestructuredForThisPurchase ? [] : getWeakSellableAssets({
      boardTiles,
      ownershipRows,
      playerId: player.id,
      targetStatus,
      roundsElapsed,
    });
    if (weakAssets.length > 0) return { action: "SELL_TO_MARKET", tileIndex: weakAssets[0].index };

    const activeCollateralLoans = loanRows.filter((loan) => loan.player_id === player.id && loan.status === "active");
    if (!loanMortgageBlocked && !alreadyRestructuredForThisPurchase && activeCollateralLoans.length === 0) {
      const collateralCandidates = getCollateralCandidates({
        boardTiles,
        ownershipRows,
        playerId: player.id,
        targetTile,
        targetStatus,
      });
      if (collateralCandidates.length > 0) return { action: "TAKE_COLLATERAL_LOAN", tileIndex: collateralCandidates[0].index };
    }

    return { action: "DECLINE_PROPERTY", tileIndex };
  }

  return chooseEasyAction({ state, player });
};
