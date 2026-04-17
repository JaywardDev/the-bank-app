import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { handleTradeAction } from "./tradeActions";

type FetchMock = (
  path: string,
  options: RequestInit,
) => Promise<unknown>;

const makeBase = () => {
  const emitted: Array<{ event_type: string; payload: Record<string, unknown> }> = [];
  const players = [
    {
      id: "p1",
      user_id: "u1",
      display_name: "P1",
      free_build_tokens: 3,
      free_upgrade_tokens: 2,
      is_eliminated: false,
    },
    {
      id: "p2",
      user_id: "u2",
      display_name: "P2",
      free_build_tokens: 2,
      free_upgrade_tokens: 4,
      is_eliminated: false,
    },
  ];

  return {
    gameId: "g1",
    gameState: { balances: { p1: 500, p2: 500 }, rules: null },
    players,
    currentUserPlayer: players[0],
    currentVersion: 10,
    user: { id: "u1" },
    boardPack: null,
    emitGameEvents: async (
      _gameId: string,
      _startVersion: number,
      events: Array<{ event_type: string; payload: Record<string, unknown> }>,
    ) => {
      emitted.push(...events);
    },
    emitted,
  };
};

const createFetchMock = (impl: FetchMock) =>
  (impl as unknown as <T>(path: string, options: RequestInit) => Promise<T | null>);

test("valid voucher proposal emits TRADE_PROPOSED with voucher fields", async () => {
  const base = makeBase();

  const fetchMock = createFetchMock(async (url) => {
    if (url.includes("status=eq.PENDING")) return [];
    if (url.startsWith("property_ownership?")) return [];
    if (url.startsWith("trade_proposals?select=")) {
      return [
        {
          id: "t1",
          game_id: "g1",
          proposer_player_id: "p1",
          counterparty_player_id: "p2",
          offer_cash: 0,
          offer_free_build_tokens: 2,
          offer_free_upgrade_tokens: 1,
          offer_tile_indices: [],
          request_cash: 0,
          request_free_build_tokens: 0,
          request_free_upgrade_tokens: 3,
          request_tile_indices: [],
          snapshot: [],
          status: "PENDING",
          created_at: new Date().toISOString(),
        },
      ];
    }
    if (url.startsWith("game_state?")) {
      return [{ balances: { p1: 500, p2: 500 }, rules: null }];
    }
    throw new Error(`Unexpected URL: ${url}`);
  });

  const response = await handleTradeAction({
    ...base,
    body: {
      action: "PROPOSE_TRADE",
      counterpartyPlayerId: "p2",
      offerFreeBuildTokens: 2,
      offerFreeUpgradeTokens: 1,
      requestFreeUpgradeTokens: 3,
    },
    fetchFromSupabaseWithService: fetchMock,
    loadOwnershipByTile: async () => ({}),
    maybeUnlockCommunicationUtility: () => null,
  });

  assert.ok(response);
  assert.equal(response.status, 200);
  assert.equal(base.emitted[0]?.event_type, "TRADE_PROPOSED");
  assert.equal(base.emitted[0]?.payload.offer_free_build_tokens, 2);
  assert.equal(base.emitted[0]?.payload.offer_free_upgrade_tokens, 1);
  assert.equal(base.emitted[0]?.payload.request_free_build_tokens, 0);
  assert.equal(base.emitted[0]?.payload.request_free_upgrade_tokens, 3);
});

test("invalid voucher proposal values are rejected", async () => {
  const base = makeBase();
  const response = await handleTradeAction({
    ...base,
    body: {
      action: "PROPOSE_TRADE",
      counterpartyPlayerId: "p2",
      offerFreeBuildTokens: -1,
    },
    fetchFromSupabaseWithService: createFetchMock(async () => {
      throw new Error("should not fetch");
    }),
    emitGameEvents: async () => {},
    loadOwnershipByTile: async () => ({}),
    maybeUnlockCommunicationUtility: () => null,
  });

  assert.ok(response);
  assert.equal(response.status, 400);
  assert.match(await response.text(), /offerFreeBuildTokens must be a non-negative integer/i);
});

test("insufficient offered vouchers are rejected at proposal time", async () => {
  const base = makeBase();
  const response = await handleTradeAction({
    ...base,
    currentUserPlayer: {
      ...base.currentUserPlayer,
      free_build_tokens: 0,
    },
    body: {
      action: "PROPOSE_TRADE",
      counterpartyPlayerId: "p2",
      offerFreeBuildTokens: 1,
    },
    fetchFromSupabaseWithService: createFetchMock(async () => []),
    emitGameEvents: async () => {},
    loadOwnershipByTile: async () => ({}),
    maybeUnlockCommunicationUtility: () => null,
  });

  assert.ok(response);
  assert.equal(response.status, 409);
  assert.match(await response.text(), /Not enough free build vouchers/i);
});

test("insufficient vouchers at accept time maps RPC error to conflict", async () => {
  const base = makeBase();
  base.currentUserPlayer = base.players[1];
  base.user = { id: "u2" };

  const fetchMock = createFetchMock(async (url) => {
    if (url.startsWith("trade_proposals?select=") && url.includes("&id=eq.t1")) {
      return [
        {
          id: "t1",
          game_id: "g1",
          proposer_player_id: "p1",
          counterparty_player_id: "p2",
          offer_cash: 0,
          offer_free_build_tokens: 1,
          offer_free_upgrade_tokens: 0,
          offer_tile_indices: [],
          request_cash: 0,
          request_free_build_tokens: 0,
          request_free_upgrade_tokens: 0,
          request_tile_indices: [],
          snapshot: [],
          status: "PENDING",
          created_at: null,
        },
      ];
    }
    if (url === "rpc/accept_trade_proposal_atomic") {
      throw new Error("INSUFFICIENT_PROPOSER_BUILD_VOUCHERS");
    }
    throw new Error(`Unexpected URL: ${url}`);
  });

  const response = await handleTradeAction({
    ...base,
    body: { action: "ACCEPT_TRADE", tradeId: "t1" },
    fetchFromSupabaseWithService: fetchMock,
    emitGameEvents: async () => {},
    loadOwnershipByTile: async () => ({}),
    maybeUnlockCommunicationUtility: () => null,
  });

  assert.ok(response);
  assert.equal(response.status, 409);
  assert.match(await response.text(), /Proposer no longer has enough free build vouchers/i);
});

test("mixed cash/property/voucher proposal persists all legs", async () => {
  const base = makeBase();
  let postedBody: Record<string, unknown> | null = null;

  const fetchMock = createFetchMock(async (url, options) => {
    if (url.includes("status=eq.PENDING")) return [];
    if (url.startsWith("property_ownership?")) {
      return [
        {
          tile_index: 1,
          owner_player_id: "p1",
          collateral_loan_id: null,
          purchase_mortgage_id: null,
          houses: 0,
        },
        {
          tile_index: 2,
          owner_player_id: "p2",
          collateral_loan_id: null,
          purchase_mortgage_id: null,
          houses: 0,
        },
      ];
    }
    if (url.startsWith("trade_proposals?select=")) {
      postedBody = JSON.parse(options.body as string) as Record<string, unknown>;
      return [
        {
          id: "t2",
          game_id: "g1",
          proposer_player_id: "p1",
          counterparty_player_id: "p2",
          offer_cash: 50,
          offer_free_build_tokens: 1,
          offer_free_upgrade_tokens: 1,
          offer_tile_indices: [1],
          request_cash: 25,
          request_free_build_tokens: 2,
          request_free_upgrade_tokens: 0,
          request_tile_indices: [2],
          snapshot: [],
          status: "PENDING",
          created_at: new Date().toISOString(),
        },
      ];
    }
    if (url.startsWith("game_state?")) {
      return [{ balances: { p1: 500, p2: 500 }, rules: null }];
    }
    throw new Error(`Unexpected URL: ${url}`);
  });

  const response = await handleTradeAction({
    ...base,
    body: {
      action: "PROPOSE_TRADE",
      counterpartyPlayerId: "p2",
      offerCash: 50,
      offerTiles: [1],
      offerFreeBuildTokens: 1,
      offerFreeUpgradeTokens: 1,
      requestCash: 25,
      requestTiles: [2],
      requestFreeBuildTokens: 2,
      requestFreeUpgradeTokens: 0,
    },
    fetchFromSupabaseWithService: fetchMock,
    loadOwnershipByTile: async () => ({}),
    maybeUnlockCommunicationUtility: () => null,
  });

  assert.ok(response);
  assert.equal(response.status, 200);
  assert.equal(postedBody?.["offer_cash"], 50);
  assert.deepEqual(postedBody?.["offer_tile_indices"], [1]);
  assert.equal(postedBody?.["offer_free_build_tokens"], 1);
  assert.equal(postedBody?.["offer_free_upgrade_tokens"], 1);
  assert.equal(postedBody?.["request_cash"], 25);
  assert.deepEqual(postedBody?.["request_tile_indices"], [2]);
  assert.equal(postedBody?.["request_free_build_tokens"], 2);
  assert.equal(postedBody?.["request_free_upgrade_tokens"], 0);
});

test("zero-value voucher proposal stays valid and explicit", async () => {
  const base = makeBase();

  const fetchMock = createFetchMock(async (url) => {
    if (url.includes("status=eq.PENDING")) return [];
    if (url.startsWith("trade_proposals?select=")) {
      return [
        {
          id: "t3",
          game_id: "g1",
          proposer_player_id: "p1",
          counterparty_player_id: "p2",
          offer_cash: 0,
          offer_free_build_tokens: 0,
          offer_free_upgrade_tokens: 0,
          offer_tile_indices: [],
          request_cash: 0,
          request_free_build_tokens: 0,
          request_free_upgrade_tokens: 0,
          request_tile_indices: [],
          snapshot: [],
          status: "PENDING",
          created_at: new Date().toISOString(),
        },
      ];
    }
    if (url.startsWith("game_state?")) {
      return [{ balances: { p1: 500, p2: 500 }, rules: null }];
    }
    throw new Error(`Unexpected URL: ${url}`);
  });

  const response = await handleTradeAction({
    ...base,
    body: {
      action: "PROPOSE_TRADE",
      counterpartyPlayerId: "p2",
      offerFreeBuildTokens: 0,
      offerFreeUpgradeTokens: 0,
      requestFreeBuildTokens: 0,
      requestFreeUpgradeTokens: 0,
    },
    fetchFromSupabaseWithService: fetchMock,
    loadOwnershipByTile: async () => ({}),
    maybeUnlockCommunicationUtility: () => null,
  });

  assert.ok(response);
  assert.equal(response.status, 200);
  assert.equal(base.emitted[0]?.payload.offer_free_build_tokens, 0);
  assert.equal(base.emitted[0]?.payload.offer_free_upgrade_tokens, 0);
  assert.equal(base.emitted[0]?.payload.request_free_build_tokens, 0);
  assert.equal(base.emitted[0]?.payload.request_free_upgrade_tokens, 0);
});

test("eliminated players cannot propose voucher trades", async () => {
  const base = makeBase();

  const response = await handleTradeAction({
    ...base,
    currentUserPlayer: { ...base.currentUserPlayer, is_eliminated: true },
    body: { action: "PROPOSE_TRADE", counterpartyPlayerId: "p2", offerFreeBuildTokens: 1 },
    fetchFromSupabaseWithService: createFetchMock(async () => []),
    emitGameEvents: async () => {},
    loadOwnershipByTile: async () => ({}),
    maybeUnlockCommunicationUtility: () => null,
  });

  assert.ok(response);
  assert.equal(response.status, 403);
  assert.match(await response.text(), /Eliminated players cannot take actions/i);
});

test("pending insolvency blocks trade actions", async () => {
  const base = makeBase();

  const response = await handleTradeAction({
    ...base,
    gameState: {
      ...base.gameState,
      pending_action: {
        type: "INSOLVENCY_RECOVERY",
        player_id: "p1",
      },
    },
    body: { action: "PROPOSE_TRADE", counterpartyPlayerId: "p2", offerFreeBuildTokens: 1 },
    fetchFromSupabaseWithService: createFetchMock(async () => []),
    emitGameEvents: async () => {},
    loadOwnershipByTile: async () => ({}),
    maybeUnlockCommunicationUtility: () => null,
  });

  assert.ok(response);
  assert.equal(response.status, 409);
  assert.match(await response.text(), /Resolve insolvency with recovery actions before continuing/i);
});

test("play and play-v2 both include voucher trade fields in select queries", () => {
  const playPage = fs.readFileSync(path.join(process.cwd(), "src/app/play/page.tsx"), "utf8");
  const playV2Page = fs.readFileSync(path.join(process.cwd(), "src/app/play-v2/[gameId]/page.tsx"), "utf8");

  const requiredFields = [
    "offer_free_build_tokens",
    "offer_free_upgrade_tokens",
    "request_free_build_tokens",
    "request_free_upgrade_tokens",
  ];

  for (const field of requiredFields) {
    assert.ok(playPage.includes(field), `play/page.tsx missing ${field}`);
    assert.ok(playV2Page.includes(field), `play-v2/[gameId]/page.tsx missing ${field}`);
  }
});

test("event feed formatter supports trade events with and without voucher values", () => {
  const formatterSource = fs.readFileSync(
    path.join(process.cwd(), "src/lib/eventFeedFormatters.ts"),
    "utf8",
  );

  assert.ok(
    formatterSource.includes("parseNumber(payload?.offer_free_build_tokens) ?? 0"),
  );
  assert.ok(
    formatterSource.includes("parseNumber(payload?.offer_free_upgrade_tokens) ?? 0"),
  );
  assert.ok(
    formatterSource.includes("parseNumber(payload?.request_free_build_tokens) ?? 0"),
  );
  assert.ok(
    formatterSource.includes("parseNumber(payload?.request_free_upgrade_tokens) ?? 0"),
  );
});
