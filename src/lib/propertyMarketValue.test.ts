import test from "node:test";
import assert from "node:assert/strict";

import {
  getPropertyMarketValue,
  PROPERTY_APPRECIATION_RATE_CAP,
} from "./propertyMarketValue.ts";

test("acquired_round null returns base price", () => {
  const result = getPropertyMarketValue({
    basePrice: 100_000,
    acquiredRound: null,
    currentRound: 50,
  });

  assert.equal(result.marketPrice, 100_000);
  assert.equal(result.appreciationRate, 0);
  assert.equal(result.isAppreciated, false);
});

test("0-4 rounds held returns base price", () => {
  const result = getPropertyMarketValue({
    basePrice: 100_000,
    acquiredRound: 10,
    currentRound: 14,
  });

  assert.equal(result.roundsHeld, 4);
  assert.equal(result.appreciationSteps, 0);
  assert.equal(result.marketPrice, 100_000);
});

test("5 rounds held applies +7%", () => {
  const result = getPropertyMarketValue({
    basePrice: 100_000,
    acquiredRound: 10,
    currentRound: 15,
  });

  assert.equal(result.appreciationSteps, 1);
  assert.equal(result.appreciationRate, 0.07);
  assert.equal(result.appreciationPercent, 7);
  assert.equal(result.marketPrice, 107_000);
});

test("10 rounds held applies +14%", () => {
  const result = getPropertyMarketValue({
    basePrice: 100_000,
    acquiredRound: 10,
    currentRound: 20,
  });

  assert.equal(result.appreciationSteps, 2);
  assert.equal(result.appreciationRate, 0.14);
  assert.equal(result.marketPrice, 114_000);
});

test("appreciation caps at +100%", () => {
  const result = getPropertyMarketValue({
    basePrice: 100_000,
    acquiredRound: 0,
    currentRound: 10_000,
  });

  assert.equal(result.appreciationRate, PROPERTY_APPRECIATION_RATE_CAP);
  assert.equal(result.marketPrice, 200_000);
});

test("negative rounds held safely returns base", () => {
  const result = getPropertyMarketValue({
    basePrice: 100_000,
    acquiredRound: 20,
    currentRound: 10,
  });

  assert.equal(result.roundsHeld, 0);
  assert.equal(result.appreciationSteps, 0);
  assert.equal(result.marketPrice, 100_000);
});

test("base price rounding works", () => {
  const result = getPropertyMarketValue({
    basePrice: 99_999,
    acquiredRound: 0,
    currentRound: 5,
  });

  assert.equal(result.marketPrice, 106_999);
});
