"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.philippinesHardBoardPack = void 0;
const classic_ph_1 = require("./classic-ph");
const macroDeckPhHardV1_1 = require("../macroDeckPhHardV1");
const PHILIPPINES_HARD_ECONOMY = {
    ...classic_ph_1.classicPhBoardPack.economy,
    bettingMarket: {
        minStakePerBet: 10_000,
        maxTotalStakePerRoll: 1_000_000,
    },
    houseImprovementValueMultipliers: [0, 0.8, 0.9, 1.4, 1.9, 1.7],
    startingBalance: 5_000_000,
    passGoAmount: 600_000,
};
exports.philippinesHardBoardPack = {
    id: "philippines-hard",
    displayName: "Philippines (Hard Mode)",
    tooltip: "Lower starting capital, reduced GO salary, and harsher macroeconomic events. Debt is riskier. Liquidity matters. Timing is everything. Recommended for experienced players.",
    properties: [...classic_ph_1.classicPhBoardPack.properties],
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
        cards: macroDeckPhHardV1_1.MACRO_DECK_PH_HARD_V1,
        draw: macroDeckPhHardV1_1.drawMacroCardPhHardV1,
    },
    eventDecks: {
        chance: classic_ph_1.classicPhChanceCards,
        community: classic_ph_1.classicPhCommunityCards,
    },
    tiles: [...classic_ph_1.classicPhBoardPack.tiles],
};
