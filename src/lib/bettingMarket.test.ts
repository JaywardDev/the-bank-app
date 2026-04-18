import test from "node:test";
import assert from "node:assert/strict";

import { settleBettingMarketForRoll } from "./bettingMarket";

const playersById = {
  p1: { display_name: "P1" },
  p2: { display_name: "P2" },
};

test("TOTAL 7 wins on normal roll and credits correctly", () => {
  const result = settleBettingMarketForRoll({
    bettingMarketState: {
      next_roll_seq: 4,
      bets: [
        {
          id: "b1",
          player_id: "p1",
          target_roll_seq: 4,
          kind: "TOTAL",
          stake: 100,
          selection: { total: 7 },
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      total_stake_by_player: { p1: 100 },
    },
    balances: { p1: 500 },
    playersById,
    dice: [3, 4],
  });

  assert.equal(result.balances.p1, 800);
  assert.equal(result.bettingMarketState.next_roll_seq, 5);
  assert.equal(result.bettingMarketState.bets.length, 0);
  assert.equal(result.events.filter((event) => event.event_type === "CASH_CREDIT").length, 1);
  assert.equal(
    result.events.filter((event) => event.event_type === "BETTING_MARKET_BET_WON").length,
    1,
  );
});

test("TOTAL 7 loses on normal roll and clears correctly", () => {
  const result = settleBettingMarketForRoll({
    bettingMarketState: {
      next_roll_seq: 2,
      bets: [
        {
          id: "b1",
          player_id: "p1",
          target_roll_seq: 2,
          kind: "TOTAL",
          stake: 100,
          selection: { total: 7 },
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      total_stake_by_player: { p1: 100 },
    },
    balances: { p1: 500 },
    playersById,
    dice: [2, 2],
  });

  assert.equal(result.balances.p1, 500);
  assert.equal(result.bettingMarketState.next_roll_seq, 3);
  assert.equal(result.bettingMarketState.bets.length, 0);
  assert.equal(result.events.length, 0);
});

test("TOTAL 7 wins on jail roll and credits correctly", () => {
  const result = settleBettingMarketForRoll({
    bettingMarketState: {
      next_roll_seq: 8,
      bets: [
        {
          id: "b1",
          player_id: "p1",
          target_roll_seq: 8,
          kind: "TOTAL",
          stake: 50,
          selection: { total: 7 },
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      total_stake_by_player: { p1: 50 },
    },
    balances: { p1: 100 },
    playersById,
    dice: [1, 6],
  });

  assert.equal(result.balances.p1, 250);
  assert.equal(result.bettingMarketState.next_roll_seq, 9);
  assert.equal(result.bettingMarketState.bets.length, 0);
});

test("TOTAL 7 loses on jail roll and clears correctly", () => {
  const result = settleBettingMarketForRoll({
    bettingMarketState: {
      next_roll_seq: 8,
      bets: [
        {
          id: "b1",
          player_id: "p1",
          target_roll_seq: 8,
          kind: "TOTAL",
          stake: 50,
          selection: { total: 7 },
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      total_stake_by_player: { p1: 50 },
    },
    balances: { p1: 100 },
    playersById,
    dice: [1, 5],
  });

  assert.equal(result.balances.p1, 100);
  assert.equal(result.bettingMarketState.next_roll_seq, 9);
  assert.equal(result.bettingMarketState.bets.length, 0);
  assert.equal(result.events.length, 0);
});

test("two players settle independently and resolved bets do not settle again", () => {
  const first = settleBettingMarketForRoll({
    bettingMarketState: {
      next_roll_seq: 11,
      bets: [
        {
          id: "b1",
          player_id: "p1",
          target_roll_seq: 11,
          kind: "TOTAL",
          stake: 100,
          selection: { total: 7 },
          created_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "b2",
          player_id: "p2",
          target_roll_seq: 11,
          kind: "TOTAL",
          stake: 100,
          selection: { total: 6 },
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      total_stake_by_player: { p1: 100, p2: 100 },
    },
    balances: { p1: 0, p2: 0 },
    playersById,
    dice: [4, 3],
  });

  assert.equal(first.balances.p1, 300);
  assert.equal(first.balances.p2, 0);
  assert.equal(first.bettingMarketState.next_roll_seq, 12);
  assert.equal(first.bettingMarketState.bets.length, 0);
  assert.equal(first.events.filter((event) => event.event_type === "CASH_CREDIT").length, 1);
  assert.equal(
    first.events.filter((event) => event.event_type === "BETTING_MARKET_BET_WON").length,
    1,
  );

  const second = settleBettingMarketForRoll({
    bettingMarketState: first.bettingMarketState,
    balances: first.balances,
    playersById,
    dice: [5, 2],
  });

  assert.equal(second.balances.p1, 300);
  assert.equal(second.balances.p2, 0);
  assert.equal(second.events.length, 0);
  assert.equal(second.bettingMarketState.next_roll_seq, 13);
});
