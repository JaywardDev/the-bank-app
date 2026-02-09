import type { BoardPack, BoardPackEconomy } from "../boardPacks";
import {
  classicPhBoardPack,
  classicPhChanceCards,
  classicPhCommunityCards,
} from "./classic-ph";
import {
  MACRO_DECK_PH_HARD_V1,
  drawMacroCardPhHardV1,
} from "../macroDeckPhHardV1";

const PHILIPPINES_HARD_ECONOMY: BoardPackEconomy = {
  ...classicPhBoardPack.economy,
  startingBalance: 5_000_000,
  passGoAmount: 600_000,
};

export const philippinesHardBoardPack: BoardPack = {
  id: "philippines-hard",
  displayName: "Philippines (Hard Mode)",
  tooltip:
    "Lower starting capital, reduced GO salary, and harsher macroeconomic events. Debt is riskier. Liquidity matters. Timing is everything. Recommended for experienced players.",
  properties: [...classicPhBoardPack.properties],
  economy: PHILIPPINES_HARD_ECONOMY,
  rules: {
    mortgageRatePerTurn: 0.015,
    mortgageTermTurns: 40,
    mortgageLtv: 0.7,
    collateralLtv: 0.5,
    collateralRatePerTurn: 0.02,
    collateralTermTurns: 12,
  },
  macroDeck: {
    id: "macro-ph-hard-v1",
    name: "Macro PH Hard V1",
    cards: MACRO_DECK_PH_HARD_V1,
    draw: drawMacroCardPhHardV1,
  },
  eventDecks: {
    chance: classicPhChanceCards,
    community: classicPhCommunityCards,
  },
  tiles: [...classicPhBoardPack.tiles],
};
