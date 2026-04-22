import test from "node:test";
import assert from "node:assert/strict";

import {
  isRoundLimitOption,
  ROUND_LIMIT_OPTIONS,
  resolveRoundLimitForMode,
  shouldEndRoundModeGame,
} from "./gameConfig";

test("create game with 50 rounds succeeds", () => {
  assert.deepEqual(ROUND_LIMIT_OPTIONS, [50, 100, 150, 200, 300]);
  assert.equal(
    resolveRoundLimitForMode({ gameMode: "round_mode", roundLimit: 50 }),
    50,
  );
});

test("update settings to 50 rounds succeeds", () => {
  assert.equal(
    resolveRoundLimitForMode({ gameMode: "round_mode", roundLimit: 50 }),
    50,
  );
});

test("invalid round limit 75 is rejected", () => {
  assert.equal(isRoundLimitOption(75), false);
  assert.equal(
    resolveRoundLimitForMode({ gameMode: "round_mode", roundLimit: 75 }),
    null,
  );
});

test("round progression ends exactly at 50", () => {
  assert.equal(
    shouldEndRoundModeGame({
      gameMode: "round_mode",
      roundLimit: 50,
      tableRoundAdvanced: true,
      nextRound: 49,
    }),
    false,
  );

  assert.equal(
    shouldEndRoundModeGame({
      gameMode: "round_mode",
      roundLimit: 50,
      tableRoundAdvanced: true,
      nextRound: 50,
    }),
    true,
  );
});
