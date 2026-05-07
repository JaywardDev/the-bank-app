import "server-only";

import { fetchFromSupabaseWithService } from "./snapshot";

const AI_LOCK_TTL_SECONDS = 90;

const rpcBoolean = (rows: boolean | boolean[] | null) =>
  Array.isArray(rows) ? rows[0] === true : rows === true;

export const acquireLock = async ({
  gameId,
  playerId,
  stateVersion,
  lockToken,
}: {
  gameId: string;
  playerId: string;
  stateVersion: number;
  lockToken: string;
}) => {
  const rows = await fetchFromSupabaseWithService<boolean | boolean[]>("rpc/acquire_ai_turn_lock", {
    method: "POST",
    body: JSON.stringify({
      p_game_id: gameId,
      p_player_id: playerId,
      p_state_version: stateVersion,
      p_lock_token: lockToken,
      p_lock_ttl_seconds: AI_LOCK_TTL_SECONDS,
    }),
  });
  return rpcBoolean(rows);
};

export const validateAndRenewLock = async ({
  gameId,
  playerId,
  stateVersion,
  lockToken,
}: {
  gameId: string;
  playerId: string;
  stateVersion: number;
  lockToken: string;
}) => {
  const rows = await fetchFromSupabaseWithService<boolean | boolean[]>("rpc/validate_and_renew_ai_turn_lock", {
    method: "POST",
    body: JSON.stringify({
      p_game_id: gameId,
      p_player_id: playerId,
      p_state_version: stateVersion,
      p_lock_token: lockToken,
      p_lock_ttl_seconds: AI_LOCK_TTL_SECONDS,
    }),
  });
  return rpcBoolean(rows);
};

export const releaseLock = async (gameId: string, lockToken: string) => {
  await fetchFromSupabaseWithService("rpc/release_ai_turn_lock", {
    method: "POST",
    body: JSON.stringify({ p_game_id: gameId, p_lock_token: lockToken }),
  });
};
