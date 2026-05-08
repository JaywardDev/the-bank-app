import test from "node:test";
import assert from "node:assert/strict";

const configureSupabaseEnv = () => {
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
};

type FetchCall = {
  path: string;
  body: Record<string, unknown> | null;
};

const makePlayer = (overrides: Record<string, unknown>) => ({
  id: "debtor",
  user_id: "user-debtor",
  display_name: "Debtor",
  created_at: "2026-01-01T00:00:00.000Z",
  position: 0,
  is_in_jail: false,
  jail_turns_remaining: 0,
  get_out_of_jail_free_count: 0,
  tax_exemption_pass_count: 0,
  free_build_tokens: 0,
  free_upgrade_tokens: 0,
  is_eliminated: false,
  eliminated_at: null,
  is_ai: false,
  ai_difficulty: null,
  ...overrides,
});

const makeGameState = (pending_action: Record<string, unknown>, version = 10) => ({
  game_id: "game-1",
  version,
  current_player_id: "debtor",
  balances: { debtor: 20, creditor: 400 },
  last_roll: null,
  doubles_count: 0,
  rounds_elapsed: 0,
  last_macro_event_id: null,
  active_macro_effects: null,
  active_macro_effects_v1: null,
  turn_phase: "AWAITING_DECISION",
  pending_action,
  pending_card_active: false,
  pending_card_deck: null,
  pending_card_id: null,
  pending_card_title: null,
  pending_card_kind: null,
  pending_card_payload: null,
  pending_card_drawn_by_player_id: null,
  pending_card_drawn_at: null,
  pending_card_source_tile_index: null,
  skip_next_roll_by_player: null,
  income_tax_baseline_cash_by_player: null,
  betting_market_state: null,
  inland_explored_cells: null,
  chance_index: 0,
  community_index: 0,
  chance_order: null,
  community_order: null,
  chance_draw_ptr: 0,
  community_draw_ptr: 0,
  chance_seed: null,
  community_seed: null,
  chance_reshuffle_count: 0,
  community_reshuffle_count: 0,
  free_parking_pot: 0,
  rules: null,
  auction_active: false,
  auction_tile_index: null,
  auction_initiator_player_id: null,
  auction_current_bid: null,
  auction_current_winner_player_id: null,
  auction_turn_player_id: null,
  auction_turn_ends_at: null,
  auction_eligible_player_ids: null,
  auction_passed_player_ids: null,
  auction_min_increment: null,
});

const makePendingInsolvency = (reason: "PAY_RENT" | "PAY_TAX") => ({
  type: "INSOLVENCY_RECOVERY",
  player_id: "debtor",
  reason,
  amount_due: 100,
  cash_available: 20,
  shortfall: 80,
  owed_to_player_id: reason === "PAY_RENT" ? "creditor" : null,
  tile_index: reason === "PAY_RENT" ? 6 : 4,
  tile_id: reason === "PAY_RENT" ? "rent-tile" : "income-tax",
  label: reason === "PAY_RENT" ? "Rent Tile" : "Income Tax",
});

const installFetchMock = ({
  pendingAction,
  compensationVersion,
}: {
  pendingAction: Record<string, unknown>;
  compensationVersion?: number;
}) => {
  const calls: FetchCall[] = [];
  const initialState = makeGameState(pendingAction);

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const path = rawUrl.replace("https://supabase.test/rest/v1/", "");
    const requestBody = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    calls.push({ path, body: requestBody });

    if (path.startsWith("games?select=id,join_code")) {
      return Response.json([{ id: "game-1", join_code: null, status: "in_progress", starting_cash: 1500, created_at: null, created_by: "host", board_pack_id: null, game_mode: "classic", round_limit: null }]);
    }

    if (path.startsWith("players?select=id,user_id")) {
      return Response.json([
        makePlayer({ id: "debtor", user_id: "user-debtor", display_name: "Debtor" }),
        makePlayer({ id: "creditor", user_id: "user-creditor", display_name: "Creditor" }),
      ]);
    }

    if (path.startsWith("game_state?select=")) {
      return Response.json([initialState]);
    }

    if (path === "rpc/update_game_state_and_emit_events") {
      const nextVersion = compensationVersion ?? 11;
      return Response.json([{ game_state: { ...initialState, version: nextVersion, balances: requestBody?.p_patch && (requestBody.p_patch as { balances?: unknown }).balances }, events: [] }]);
    }

    if (path === "rpc/declare_bankruptcy") {
      const expectedVersion = requestBody?.expected_version;
      const requiredVersion = compensationVersion ?? 10;
      if (expectedVersion !== requiredVersion) {
        return new Response(JSON.stringify({ message: "VERSION_MISMATCH" }), { status: 409 });
      }
      return Response.json([{ game_state: { ...initialState, version: requiredVersion + 1, pending_action: null, balances: { debtor: 0, creditor: 450 }, eliminated_player_id: "debtor" } }]);
    }

    throw new Error(`Unexpected fetch path: ${path}`);
  }) as typeof fetch;

  return calls;
};

test("DECLARE_BANKRUPTCY uses compensation RPC returned version for rent insolvency", async () => {
  configureSupabaseEnv();
  const { executeBankActionRequest } = await import("./executeBankActionRequest");
  const calls = installFetchMock({
    pendingAction: makePendingInsolvency("PAY_RENT"),
    compensationVersion: 13,
  });

  const response = await executeBankActionRequest({
    body: { action: "DECLARE_BANKRUPTCY", gameId: "game-1", expectedVersion: 10 },
    user: { id: "user-debtor", email: null },
  });

  assert.equal(response.status, 200);
  const compensationCall = calls.find((call) => call.path === "rpc/update_game_state_and_emit_events");
  assert.ok(compensationCall, "rent bankruptcy should run creditor compensation");
  assert.equal(compensationCall.body?.p_expected_version, 10);
  assert.deepEqual((compensationCall.body?.p_patch as { balances?: unknown }).balances, { debtor: 20, creditor: 450 });
  assert.equal(((compensationCall.body?.p_events as unknown[]) ?? []).length, 2);

  const declareCall = calls.find((call) => call.path === "rpc/declare_bankruptcy");
  assert.equal(declareCall?.body?.expected_version, 13);

  const body = await response.json() as { gameState: { pending_action: unknown; eliminated_player_id: string; balances: Record<string, number> } };
  assert.equal(body.gameState.pending_action, null);
  assert.equal(body.gameState.eliminated_player_id, "debtor");
  assert.equal(body.gameState.balances.creditor, 450);
});

test("DECLARE_BANKRUPTCY does not run compensation for non-rent insolvency", async () => {
  configureSupabaseEnv();
  const { executeBankActionRequest } = await import("./executeBankActionRequest");
  const calls = installFetchMock({
    pendingAction: makePendingInsolvency("PAY_TAX"),
  });

  const response = await executeBankActionRequest({
    body: { action: "DECLARE_BANKRUPTCY", gameId: "game-1", expectedVersion: 10 },
    user: { id: "user-debtor", email: null },
  });

  assert.equal(response.status, 200);
  assert.equal(calls.some((call) => call.path === "rpc/update_game_state_and_emit_events"), false);
  const declareCall = calls.find((call) => call.path === "rpc/declare_bankruptcy");
  assert.equal(declareCall?.body?.expected_version, 10);
});

test("authoritative update response version helper accepts nested, direct, and numeric versions", async () => {
  configureSupabaseEnv();
  const { resolveAuthoritativeVersionFromUpdateResponse } = await import("./executeBankActionRequest");

  assert.equal(resolveAuthoritativeVersionFromUpdateResponse([{ game_state: { version: 7 } }]), 7);
  assert.equal(resolveAuthoritativeVersionFromUpdateResponse({ version: 8 }), 8);
  assert.equal(resolveAuthoritativeVersionFromUpdateResponse(9), 9);
  assert.equal(resolveAuthoritativeVersionFromUpdateResponse([{ game_state: { version: "10" } }]), null);
});
