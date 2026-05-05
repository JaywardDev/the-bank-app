"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRules = exports.DEFAULT_RULES = void 0;
exports.DEFAULT_RULES = {
    incomeTaxRate: 0.2,
    superTaxRate: 0.1,
    freeParkingJackpotEnabled: false,
    loanCollateralEnabled: true,
    mortgageRatePerTurn: 0.015,
    mortgageTermTurns: 30,
    mortgageLtv: 0.5,
    collateralLtv: 0.5,
    collateralRatePerTurn: 0.008,
    collateralTermTurns: 10,
    loanRatePerTurn: 0.008,
    loanTermTurns: 10,
    auctionEnabled: true,
    auctionMinIncrement: 10,
    auctionTurnSeconds: 60,
    auctionAllowInitiatorToBid: true,
    macroEnabled: true,
};
const getRules = (rules) => {
    const resolved = {
        ...exports.DEFAULT_RULES,
        ...(rules ?? {}),
    };
    const collateralRatePerTurn = typeof rules?.collateralRatePerTurn === "number"
        ? rules.collateralRatePerTurn
        : typeof rules?.loanRatePerTurn === "number"
            ? rules.loanRatePerTurn
            : exports.DEFAULT_RULES.collateralRatePerTurn;
    const collateralTermTurns = typeof rules?.collateralTermTurns === "number"
        ? rules.collateralTermTurns
        : typeof rules?.loanTermTurns === "number"
            ? rules.loanTermTurns
            : exports.DEFAULT_RULES.collateralTermTurns;
    return {
        ...resolved,
        collateralRatePerTurn,
        collateralTermTurns,
        loanRatePerTurn: collateralRatePerTurn,
        loanTermTurns: collateralTermTurns,
    };
};
exports.getRules = getRules;
