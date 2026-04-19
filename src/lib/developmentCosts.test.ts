import test from "node:test";
import assert from "node:assert/strict";

import {
  getBuildCostMultipliers,
  getMaxDevelopmentLevel,
  getNextBuildCost,
} from "./developmentCosts.ts";

test("build cost multipliers remain stable", () => {
  assert.deepEqual(getBuildCostMultipliers(), [1, 1.1, 1.3, 1.35, 1.4]);
});

test("next build cost scales by current development level", () => {
  const baseCost = 400;
  assert.equal(getNextBuildCost({ baseCost, currentLevel: 0 }), 400);
  assert.equal(getNextBuildCost({ baseCost, currentLevel: 1 }), 440);
  assert.equal(getNextBuildCost({ baseCost, currentLevel: 2 }), 520);
  assert.equal(getNextBuildCost({ baseCost, currentLevel: 3 }), 540);
  assert.equal(getNextBuildCost({ baseCost, currentLevel: 4 }), 560);
});

test("next build cost uses deterministic rounding", () => {
  assert.equal(getNextBuildCost({ baseCost: 335, currentLevel: 1 }), 369);
  assert.equal(getNextBuildCost({ baseCost: 335, currentLevel: 3 }), 452);
});

test("max development level follows rent table length", () => {
  assert.equal(getMaxDevelopmentLevel([20, 100, 300, 900, 1600, 2500]), 5);
  assert.equal(getMaxDevelopmentLevel([12, 40]), 1);
  assert.equal(getMaxDevelopmentLevel(null), 5);
});
