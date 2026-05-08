import test from "node:test";
import assert from "node:assert/strict";

import {
  findCurrentRoundEconomicBoomSummary,
  groupEconomicBoomEvents,
  shouldShowEconomicBoomModal,
  type EconomicBoomGameEvent,
} from "./economicBoomEvents";

const makeEvent = (
  id: string,
  event_type: string,
  payload: Record<string, unknown>,
  version: number,
): EconomicBoomGameEvent => ({
  id,
  event_type,
  payload,
  created_at: "2026-05-08T00:00:00.000Z",
  version,
});

const boomEvents = [
  makeEvent("rev-2", "ECONOMIC_BOOM_REVENUE", {
    boom_id: "boom-10",
    round: 10,
    draw_number: 2,
    tile_index: 7,
    tile_name: "Harbor Market",
    owner_player_id: "p2",
    owner_player_name: "Ben",
    payout_amount: 30,
    rent_basis: 60,
  }, 4),
  makeEvent("started", "ECONOMIC_BOOM_STARTED", {
    boom_id: "boom-10",
    round: 10,
    eligible_tile_count: 4,
    selected_tile_count: 2,
  }, 2),
  makeEvent("rev-1", "ECONOMIC_BOOM_REVENUE", {
    boom_id: "boom-10",
    round: 10,
    draw_number: 1,
    tile_index: 3,
    tile_name: "Market Street",
    owner_player_id: "p1",
    owner_player_name: "Ada",
    payout_amount: 20,
    rent_basis: 40,
  }, 3),
];

test("economic boom parser groups revenue entries, sorts by draw, and totals payout", () => {
  const [summary] = groupEconomicBoomEvents(boomEvents);

  assert.equal(summary?.boomId, "boom-10");
  assert.equal(summary?.round, 10);
  assert.equal(summary?.totalPayout, 50);
  assert.deepEqual(
    summary?.revenueItems.map((item) => item.tileName),
    ["Market Street", "Harbor Market"],
  );
});

test("economic boom parser finds only the current round summary", () => {
  assert.equal(
    findCurrentRoundEconomicBoomSummary({ events: boomEvents, currentRound: 10 })
      ?.boomId,
    "boom-10",
  );
  assert.equal(
    findCurrentRoundEconomicBoomSummary({ events: boomEvents, currentRound: 11 }),
    null,
  );
});

test("economic boom modal guard shows once for a new boom id in a session", () => {
  const summary = findCurrentRoundEconomicBoomSummary({
    events: boomEvents,
    currentRound: 10,
  });

  assert.equal(
    shouldShowEconomicBoomModal({ summary, dismissedBoomIds: [] }),
    true,
  );
  assert.equal(
    shouldShowEconomicBoomModal({ summary, dismissedBoomIds: ["boom-10"] }),
    false,
  );
});


test("economic boom modal guard waits until all selected revenue entries are loaded", () => {
  const summary = groupEconomicBoomEvents([boomEvents[1], boomEvents[2]])[0] ?? null;

  assert.equal(
    shouldShowEconomicBoomModal({ summary, dismissedBoomIds: [] }),
    false,
  );
});

test("economic boom parser keeps current boom review hidden after round advances", () => {
  const summary = findCurrentRoundEconomicBoomSummary({
    events: boomEvents,
    currentRound: 11,
  });

  assert.equal(summary, null);
});
