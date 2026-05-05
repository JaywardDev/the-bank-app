"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const boardPacks_1 = require("../src/lib/boardPacks");
const rules_1 = require("../src/lib/rules");
const selectedBoardPackId = process.argv[2] ?? "philippines-hard";
const boardPack = boardPacks_1.boardPacks.find((candidate) => candidate.id === selectedBoardPackId);
if (!boardPack) {
    throw new Error(`Boardpack '${selectedBoardPackId}' not found in canonical src/lib/boardPacks.ts`);
}
const tiles = boardPack.tiles.map((tile) => {
    const type = String(tile.type).toLowerCase();
    const exportTile = {
        index: tile.index,
        name: tile.name,
        type,
    };
    if (typeof tile.price === "number") {
        exportTile.price = tile.price;
        exportTile.value = tile.price;
    }
    if (typeof tile.baseRent === "number") {
        exportTile.base_rent = tile.baseRent;
    }
    if (Array.isArray(tile.rentByHouses) && tile.rentByHouses.length > 0) {
        exportTile.rent_ladder = tile.rentByHouses;
    }
    if (typeof tile.colorGroup === "string") {
        exportTile.color_group = tile.colorGroup;
    }
    if (typeof tile.houseCost === "number") {
        exportTile.building_cost = tile.houseCost;
    }
    if (typeof tile.taxAmount === "number") {
        exportTile.tax_amount = tile.taxAmount;
        exportTile.tax_type = "fixed";
    }
    if (type === "utility") {
        exportTile.utility_multiplier = boardPack.economy.utilityRentMultipliers.single;
        if (typeof boardPack.economy.utilityBaseAmount === "number") {
            exportTile.utility_base_amount = boardPack.economy.utilityBaseAmount;
        }
    }
    if (type === "rail") {
        exportTile.rail_rent_by_count = boardPack.economy.railRentByCount;
    }
    return exportTile;
});
const rules = (0, rules_1.getRules)(boardPack.rules);
const fixture = {
    source: "offline_python_simulation_lab_phase_4",
    generated_at: new Date().toISOString(),
    boardpack: {
        id: boardPack.id,
        name: boardPack.displayName,
    },
    currency: {
        code: boardPack.economy.currency.code,
        symbol: boardPack.economy.currency.symbol,
    },
    starting_cash: boardPack.economy.startingBalance ?? 1500,
    go_salary: boardPack.economy.passGoAmount ?? 200,
    board_size: tiles.length,
    loan_rules: {
        source: "game_rules_v1",
        mortgage: {
            enabled: true,
            ltv: rules.mortgageLtv,
            rate_per_turn: rules.mortgageRatePerTurn,
            term_turns: rules.mortgageTermTurns,
            payment_model: "amortized_fixed_payment",
            allowed_down_payment_percents: [30, 40, 50, 60, 70, 80],
        },
        collateral: {
            enabled: true,
            ltv_effective: 0.6,
            ltv_rules_field: rules.collateralLtv,
            rate_per_turn: rules.collateralRatePerTurn,
            term_turns: rules.collateralTermTurns,
            payment_model: "fixed_payment_from_backend_schedule",
        },
    },
    tiles,
};
const outputPath = (0, node_path_1.resolve)("tools/python/exports/generated_boardpack_fixture.json");
(0, node_fs_1.mkdirSync)((0, node_path_1.resolve)("tools/python/exports"), { recursive: true });
(0, node_fs_1.writeFileSync)(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf-8");
console.log(`Exported simulation fixture for '${boardPack.id}' to ${outputPath}`);
