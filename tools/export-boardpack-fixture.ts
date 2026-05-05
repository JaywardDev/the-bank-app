import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { boardPacks } from "../src/lib/boardPacks";
import { getRules } from "../src/lib/rules";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

type ExportTile = {
  index: number;
  name: string;
  type: string;
  price?: number;
  value?: number;
  base_rent?: number;
  rent_ladder?: number[];
  color_group?: string;
  building_cost?: number;
  tax_amount?: number;
  tax_type?: string;
  utility_multiplier?: number;
  utility_base_amount?: number;
  rail_rent_by_count?: number[];
};

const selectedBoardPackId = process.argv[2] ?? "philippines-hard";

const boardPack = boardPacks.find((candidate) => candidate.id === selectedBoardPackId);
if (!boardPack) {
  throw new Error(`Boardpack '${selectedBoardPackId}' not found in canonical src/lib/boardPacks.ts`);
}

const tiles: ExportTile[] = boardPack.tiles.map((tile) => {
  const type = String(tile.type).toLowerCase();
  const exportTile: ExportTile = {
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

const rules = getRules(boardPack.rules);

// Phase 6 simulation metadata mirror of canonical inland exploration config.
// Keep this in sync with src/lib/inlandExploration.ts values.
const inlandRules = {
  enabled: true,
  go_salary_anchor: "boardpack.go_salary",
  exploration_cost_multiplier: 0.8,
  passive_income_timing: "start_of_player_turn_approximation",
  resources: {
    OIL: { weight: 7.5, category: "DEVELOP", development_cost_multiplier: 2.0, passive_income_per_turn_multiplier: 0.28, sell_multiplier: null, bonus: null },
    DEEP_WELL: { weight: 2.0, category: "DEVELOP", development_cost_multiplier: 2.75, passive_income_per_turn_multiplier: 0.40, sell_multiplier: null, bonus: null },
    COAL: { weight: 8.5, category: "SELL", development_cost_multiplier: null, passive_income_per_turn_multiplier: null, sell_multiplier: 0.65, bonus: null },
    TIMBER: { weight: 8.0, category: "BONUS", development_cost_multiplier: null, passive_income_per_turn_multiplier: null, sell_multiplier: null, bonus: "FREE_BUILD" },
    RARE_EARTH: { weight: 3.0, category: "BONUS", development_cost_multiplier: null, passive_income_per_turn_multiplier: null, sell_multiplier: null, bonus: "FREE_UPGRADE" },
    BRONZE: { weight: 8.0, category: "SELL", development_cost_multiplier: null, passive_income_per_turn_multiplier: null, sell_multiplier: 1.2, bonus: null },
    GOLD: { weight: 3.0, category: "SELL", development_cost_multiplier: null, passive_income_per_turn_multiplier: null, sell_multiplier: 1.8, bonus: null },
    EMPTY: { weight: 60.0, category: "NONE", development_cost_multiplier: null, passive_income_per_turn_multiplier: null, sell_multiplier: null, bonus: null },
  },
} as const;

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
  tax_rules: {
    income_tax_rate: rules.incomeTaxRate,
    super_tax_rate: rules.superTaxRate,
  },
  inland_rules: inlandRules,
  tiles,
} satisfies Record<string, JsonValue>;

const outputPath = resolve("tools/python/exports/generated_boardpack_fixture.json");
mkdirSync(resolve("tools/python/exports"), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf-8");

console.log(`Exported simulation fixture for '${boardPack.id}' to ${outputPath}`);
