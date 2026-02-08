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
  properties: [...classicPhBoardPack.properties],
  economy: PHILIPPINES_HARD_ECONOMY,
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
