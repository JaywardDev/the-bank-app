import "server-only";

import type { GameStateRow } from "../types";
import type { SetOwnershipStatus } from "./ownership";
import { wouldCompleteSet } from "./ownership";

export const calculateAuctionMaxBid = ({
  state,
  playerId,
  status,
  propertyPrice,
}: {
  state: GameStateRow;
  playerId: string;
  status: SetOwnershipStatus;
  propertyPrice: number;
}) => {
  if (wouldCompleteSet(status)) return Math.floor(propertyPrice * 1.4);
  if (status.ownsAny) return Math.floor(propertyPrice * 1.1);
  return Math.floor(propertyPrice * (state.auction_initiator_player_id === playerId ? 0.7 : 0.5));
};
