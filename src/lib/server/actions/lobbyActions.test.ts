import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { handleLobbyAction } from "./lobbyActions";

type FetchMock = (path: string, options: RequestInit) => Promise<unknown>;

const createFetchMock = (impl: FetchMock) =>
  (impl as unknown as <T>(path: string, options: RequestInit) => Promise<T | null>);

const baseParams = {
  user: { id: "user-1" },
  loadOwnershipByTile: async () => ({}),
  createJoinCode: () => "ABC123",
};

test("non-host can mark ready", async () => {
  const calls: string[] = [];
  const response = await handleLobbyAction({
    ...baseParams,
    body: { action: "SET_LOBBY_READY", gameId: "game-1" },
    fetchFromSupabaseWithService: createFetchMock(async (url) => {
      calls.push(url);
      if (url.startsWith("games?select=id,status")) {
        return [{ id: "game-1", status: "lobby" }];
      }
      if (url.startsWith("players?select=id,user_id")) {
        return [{ id: "p1", user_id: "user-1", display_name: "P1", created_at: null, lobby_ready: true, lobby_ready_at: new Date().toISOString(), position: 0, is_in_jail: false, jail_turns_remaining: 0, get_out_of_jail_free_count: 0, tax_exemption_pass_count: 0, free_build_tokens: 0, free_upgrade_tokens: 0, is_eliminated: false, eliminated_at: null }];
      }
      if (url === "rpc/start_game_if_all_ready_atomic") {
        return [{ started: false, status: "lobby", rejection_reason: "NOT_ALL_READY" }];
      }
      throw new Error(`Unexpected URL: ${url}`);
    }),
  });

  assert.ok(response);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok: boolean; started: boolean };
  assert.equal(body.ok, true);
  assert.equal(body.started, false);
  assert.ok(calls.includes("rpc/start_game_if_all_ready_atomic"));
});

test("final ready player triggers immediate start via RPC result", async () => {
  const response = await handleLobbyAction({
    ...baseParams,
    body: { action: "SET_LOBBY_READY", gameId: "game-1" },
    fetchFromSupabaseWithService: createFetchMock(async (url) => {
      if (url.startsWith("games?select=id,status")) {
        return [{ id: "game-1", status: "lobby" }];
      }
      if (url.startsWith("players?select=id,user_id")) {
        return [{ id: "p1", user_id: "user-1", display_name: "P1", created_at: null, lobby_ready: true, lobby_ready_at: new Date().toISOString(), position: 0, is_in_jail: false, jail_turns_remaining: 0, get_out_of_jail_free_count: 0, tax_exemption_pass_count: 0, free_build_tokens: 0, free_upgrade_tokens: 0, is_eliminated: false, eliminated_at: null }];
      }
      if (url === "rpc/start_game_if_all_ready_atomic") {
        return [{ started: true, status: "in_progress", rejection_reason: null }];
      }
      throw new Error(`Unexpected URL: ${url}`);
    }),
  });

  assert.ok(response);
  const body = (await response.json()) as { started: boolean; status: string };
  assert.equal(body.started, true);
  assert.equal(body.status, "in_progress");
});

test("settings update resets readiness for all players", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];

  const response = await handleLobbyAction({
    ...baseParams,
    body: { action: "UPDATE_GAME_SETTINGS", gameId: "game-1", gameMode: "classic" },
    fetchFromSupabaseWithService: createFetchMock(async (url, options) => {
      const requestBody = options.body ? JSON.parse(String(options.body)) : null;
      calls.push({ url, body: requestBody });
      if (url.startsWith("games?select=id,status,created_by,game_mode,round_limit")) {
        return [{ id: "game-1", status: "lobby", created_by: "user-1", game_mode: "classic", round_limit: null }];
      }
      if (url.startsWith("games?select=id,game_mode,round_limit")) {
        return [{ id: "game-1", game_mode: "classic", round_limit: null }];
      }
      if (url.startsWith("players?game_id=eq.game-1")) {
        return [];
      }
      throw new Error(`Unexpected URL: ${url}`);
    }),
  });

  assert.ok(response);
  assert.equal(response.status, 200);
  const resetCall = calls.find((call) => call.url.startsWith("players?game_id=eq.game-1"));
  assert.ok(resetCall);
  assert.deepEqual(resetCall?.body, { lobby_ready: false, lobby_ready_at: null });
});

test("ready player cannot leave while game remains in lobby", async () => {
  const response = await handleLobbyAction({
    ...baseParams,
    body: { action: "LEAVE_GAME", gameId: "game-1" },
    fetchFromSupabaseWithService: createFetchMock(async (url) => {
      if (url.startsWith("games?select=id,status,created_by")) {
        return [{ id: "game-1", status: "lobby", created_by: "other-user" }];
      }
      if (url.startsWith("players?select=id,user_id")) {
        return [{ id: "p1", user_id: "user-1", display_name: "P1", created_at: null, lobby_ready: true, lobby_ready_at: new Date().toISOString(), position: 0, is_in_jail: false, jail_turns_remaining: 0, get_out_of_jail_free_count: 0, tax_exemption_pass_count: 0, free_build_tokens: 0, free_upgrade_tokens: 0, is_eliminated: false, eliminated_at: null }];
      }
      throw new Error(`Unexpected URL: ${url}`);
    }),
  });

  assert.ok(response);
  assert.equal(response.status, 409);
  assert.match(await response.text(), /Ready players cannot leave/i);
});

test("unready player can still leave while in lobby", async () => {
  const response = await handleLobbyAction({
    ...baseParams,
    body: { action: "LEAVE_GAME", gameId: "game-1" },
    fetchFromSupabaseWithService: createFetchMock(async (url) => {
      if (url.startsWith("games?select=id,status,created_by")) {
        return [{ id: "game-1", status: "lobby", created_by: "other-user" }];
      }
      if (url.startsWith("players?select=id,user_id")) {
        return [{ id: "p1", user_id: "user-1", display_name: "P1", created_at: null, lobby_ready: false, lobby_ready_at: null, position: 0, is_in_jail: false, jail_turns_remaining: 0, get_out_of_jail_free_count: 0, tax_exemption_pass_count: 0, free_build_tokens: 0, free_upgrade_tokens: 0, is_eliminated: false, eliminated_at: null }];
      }
      if (url.startsWith("game_state?select=version")) {
        return [{ version: 3 }];
      }
      if (url.startsWith("game_events?select=version")) {
        return [{ version: 3 }];
      }
      if (url.startsWith("players?select=id&game_id=eq.game-1")) {
        return [{ id: "p1" }];
      }
      if (url.startsWith("players?game_id=eq.game-1&user_id=eq.user-1")) {
        return [];
      }
      return [];
    }),
  });

  assert.ok(response);
  assert.equal(response.status, 200);
});

test("duplicate ready clicks remain idempotent", async () => {
  const fetchMock = createFetchMock(async (url) => {
    if (url.startsWith("games?select=id,status")) {
      return [{ id: "game-1", status: "lobby" }];
    }
    if (url.startsWith("players?select=id,user_id")) {
      return [{ id: "p1", user_id: "user-1", display_name: "P1", created_at: null, lobby_ready: true, lobby_ready_at: new Date().toISOString(), position: 0, is_in_jail: false, jail_turns_remaining: 0, get_out_of_jail_free_count: 0, tax_exemption_pass_count: 0, free_build_tokens: 0, free_upgrade_tokens: 0, is_eliminated: false, eliminated_at: null }];
    }
    if (url === "rpc/start_game_if_all_ready_atomic") {
      return [{ started: false, status: "lobby", rejection_reason: "NOT_ALL_READY" }];
    }
    throw new Error(`Unexpected URL: ${url}`);
  });

  const first = await handleLobbyAction({ ...baseParams, body: { action: "SET_LOBBY_READY", gameId: "game-1" }, fetchFromSupabaseWithService: fetchMock });
  const second = await handleLobbyAction({ ...baseParams, body: { action: "SET_LOBBY_READY", gameId: "game-1" }, fetchFromSupabaseWithService: fetchMock });

  assert.ok(first && second);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
});

test("migration and route enforce atomic all-ready start protections", async () => {
  const baseMigrationPath = path.join(
    process.cwd(),
    "src/lib/supabase/migrations/20260425103000_lobby_ready_start_atomic.sql",
  );
  const parityMigrationPath = path.join(
    process.cwd(),
    "src/lib/supabase/migrations/20260425113000_start_game_atomic_startup_parity.sql",
  );
  const deckFixMigrationPath = path.join(
    process.cwd(),
    "src/lib/supabase/migrations/20260425123000_start_game_atomic_deck_order_runtime_init.sql",
  );
  const baseMigrationSql = fs.readFileSync(baseMigrationPath, "utf8");
  const parityMigrationSql = fs.readFileSync(parityMigrationPath, "utf8");
  const deckFixMigrationSql = fs.readFileSync(deckFixMigrationPath, "utf8");

  assert.match(baseMigrationSql, /start_game_if_all_ready_atomic/i);
  assert.match(baseMigrationSql, /for update/i);
  assert.match(baseMigrationSql, /bool_and\(lobby_ready\)/i);
  assert.match(baseMigrationSql, /trg_players_join_only_lobby/i);

  assert.match(parityMigrationSql, /chance_order/i);
  assert.match(parityMigrationSql, /community_order/i);
  assert.match(parityMigrationSql, /chance_seed/i);
  assert.match(parityMigrationSql, /community_seed/i);
  assert.match(parityMigrationSql, /last_macro_event_id\s*=\s*excluded\.last_macro_event_id/i);

  assert.match(deckFixMigrationSql, /create or replace function public\.start_game_if_all_ready_atomic/i);
  assert.match(deckFixMigrationSql, /chance_seed[\s\S]*null/i);
  assert.match(deckFixMigrationSql, /community_seed[\s\S]*null/i);
  assert.match(deckFixMigrationSql, /chance_order[\s\S]*null/i);
  assert.match(deckFixMigrationSql, /community_order[\s\S]*null/i);
  assert.doesNotMatch(deckFixMigrationSql, /v_default_chance_deck_size/i);
  assert.doesNotMatch(deckFixMigrationSql, /v_default_community_deck_size/i);
  assert.doesNotMatch(deckFixMigrationSql, /generate_series\s*\(/i);
  assert.doesNotMatch(deckFixMigrationSql, /generate_series\s*\(\s*0\s*,\s*15\s*\)/i);

  const routePath = path.join(process.cwd(), "src/app/api/bank/action/route.ts");
  const routeCode = fs.readFileSync(routePath, "utf8");
  assert.match(routeCode, /rpc\/start_game_if_all_ready_atomic/);
  assert.match(routeCode, /All players must be ready before the game can start/);
});
