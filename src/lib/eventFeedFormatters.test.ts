import test from "node:test";
import assert from "node:assert/strict";

import { deriveWalletTransactions, formatEventDescription } from "./eventFeedFormatters";

test("activity formatter handles economic boom events", () => {
  const ctx = { players: [{ id: "p1", display_name: "Ada" }], boardPack: null, currencySymbol: "$" };
  assert.equal(
    formatEventDescription({ id: "e1", event_type: "ECONOMIC_BOOM_STARTED", payload: {}, created_at: "", version: 1 }, ctx),
    "Economic Boom Season begins as consumer activity surges across the board.",
  );
  assert.equal(
    formatEventDescription({ id: "e2", event_type: "ECONOMIC_BOOM_REVENUE", payload: { tile_name: "Market Street", owner_player_name: "Ada", payout_amount: 25 }, created_at: "", version: 2 }, ctx),
    "Market Street attracted strong consumer demand. Ada received $25.",
  );
});

test("wallet transaction labels economic boom revenue cleanly", () => {
  const transactions = deriveWalletTransactions([
    {
      id: "cash-1",
      event_type: "CASH_CREDIT",
      payload: { player_id: "p1", amount: 25, reason: "ECONOMIC_BOOM_REVENUE", tile_index: 5 },
      created_at: "2026-05-08T00:00:00.000Z",
      version: 3,
    },
  ], {
    players: [{ id: "p1", display_name: "Ada" }],
    boardPack: { economy: { currency: { code: "USD", symbol: "$" } }, tiles: [{ index: 5, tile_id: "market", type: "PROPERTY", name: "Market Street" }] } as never,
    currentPlayerId: "p1",
  });

  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].subtitle, "economic boom revenue · Market Street");
  assert.equal(transactions[0].amount, 25);
});
