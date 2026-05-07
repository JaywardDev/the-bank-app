import "server-only";

import { getBoardPackById } from "@/lib/boardPacks";
import { resolveBoardTilesForRules } from "@/lib/resolvedBoardTiles";
import {
  executeBankActionRequest,
  type BankActionRequest,
} from "@/lib/server/actions/executeBankActionRequest";
import { acquireLock, releaseLock, validateAndRenewLock } from "./locks";
import { pendingPurchaseTileIndex } from "./helpers/loans";
import { chooseAiAction } from "./planners";
import { pendingPlayerId, pendingType } from "./planners/easy";
import { loadSnapshot } from "./snapshot";
import type { AiActionContext, AiTurnResult, GameStateRow, PlayerRow } from "./types";

export const getActionablePlayerId = (gameState: GameStateRow) =>
  gameState.auction_active
    ? gameState.auction_turn_player_id
    : gameState.current_player_id;

export const getActionContext = (gameState: GameStateRow): AiActionContext =>
  gameState.auction_active ? "auction" : "normal_turn";

export const findActionablePlayer = ({
  gameState,
  players,
}: {
  gameState: GameStateRow;
  players: PlayerRow[];
}) => {
  const actionContext = getActionContext(gameState);
  const actingPlayerId = getActionablePlayerId(gameState);
  const player = actingPlayerId
    ? (players.find((candidate) => candidate.id === actingPlayerId) ?? null)
    : null;

  return { actionContext, actingPlayerId, player };
};

export const auctionTurnExpired = (gameState: GameStateRow) =>
  Boolean(
    gameState.auction_active &&
      gameState.auction_turn_player_id &&
      gameState.auction_turn_ends_at &&
      Date.now() > Date.parse(gameState.auction_turn_ends_at),
  );

export const getRepeatedStateKey = ({
  gameState,
  actionContext,
}: {
  gameState: GameStateRow;
  actionContext: AiActionContext;
}) =>
  JSON.stringify({
    version: gameState.version,
    currentPlayerId: gameState.current_player_id,
    actionContext,
    phase: gameState.turn_phase,
    pending: pendingType(gameState),
    lastRoll: gameState.last_roll,
    auctionTurnPlayerId: gameState.auction_turn_player_id,
    auctionTurnEndsAt: gameState.auction_turn_ends_at,
    auctionCurrentBid: gameState.auction_current_bid,
    auctionCurrentWinnerPlayerId: gameState.auction_current_winner_player_id,
  });

export const runAiTurn = async ({ gameId }: { gameId: string }): Promise<AiTurnResult> => {
  const initial = await loadSnapshot(gameId);
  if (initial.game?.status !== "in_progress" || !initial.gameState) {
    return { ok: true, stopped: "not_in_progress" };
  }
  const initialActionable = findActionablePlayer({
    gameState: initial.gameState,
    players: initial.players,
  });
  if (!initialActionable.player || initialActionable.player.is_eliminated) {
    return {
      ok: true,
      stopped: "not_ai_actionable",
      actionContext: initialActionable.actionContext,
    };
  }
  if (!initialActionable.player.is_ai) {
    return {
      ok: true,
      stopped: initialActionable.actionContext === "auction" ? "not_ai_actionable" : "not_ai_turn",
      actionContext: initialActionable.actionContext,
    };
  }
  if (initialActionable.player.ai_difficulty === "hard") {
    return {
      ok: true,
      stopped: "difficulty_unavailable",
      actionContext: initialActionable.actionContext,
    };
  }

  const lockToken = crypto.randomUUID();
  const locked = await acquireLock({
    gameId,
    playerId: initialActionable.player.id,
    stateVersion: initial.gameState.version,
    lockToken,
  });
  if (!locked) {
    return { ok: true, stopped: "already_running" };
  }

  let lockedPlayerId = initialActionable.player.id;
  const actions: string[] = [];
  let collateralPurchaseTileIndex: number | null = null;
  const seenStates = new Set<string>();
  try {
    for (let step = 0; step < 12; step += 1) {
      const { game, gameState, players, ownershipRows, loanRows } = await loadSnapshot(gameId);
      if (game?.status !== "in_progress" || !gameState) return { ok: true, actions, stopped: "game_over" };
      const { actionContext, player } = findActionablePlayer({ gameState, players });
      if (!player || player.is_eliminated) {
        return { ok: true, actions, stopped: "missing_actionable_player", actionContext };
      }
      if (!player.is_ai) {
        return {
          ok: true,
          actions,
          stopped: actionContext === "auction" ? "not_ai_actionable" : "human_or_missing_turn",
          actionContext,
        };
      }
      if (player.ai_difficulty === "hard") return { ok: true, actions, stopped: "difficulty_unavailable", actionContext };

      if (player.id !== lockedPlayerId) {
        if (actions.length === 0) {
          return { ok: true, actions, stopped: "lock_lost", actionContext };
        }

        try {
          await releaseLock(gameId, lockToken);
        } catch {
          return { ok: true, actions, stopped: "lock_lost", actionContext };
        }

        const handoffLocked = await acquireLock({
          gameId,
          playerId: player.id,
          stateVersion: gameState.version,
          lockToken,
        });
        if (!handoffLocked) {
          return { ok: true, actions, stopped: "already_running", actionContext };
        }
        lockedPlayerId = player.id;
      } else {
        const lockPlayerId = actionContext === "auction" ? gameState.auction_turn_player_id : gameState.current_player_id;
        if (lockPlayerId !== player.id) {
          return { ok: true, actions, stopped: "lock_lost", actionContext };
        }
        const lockStillOwned = await validateAndRenewLock({
          gameId,
          playerId: player.id,
          stateVersion: gameState.version,
          lockToken,
        });
        if (!lockStillOwned) {
          return { ok: true, actions, stopped: "lock_lost", actionContext };
        }
      }

      const stateKey = getRepeatedStateKey({ gameState, actionContext });
      if (seenStates.has(stateKey)) return { ok: true, actions, stopped: "repeated_state" };
      seenStates.add(stateKey);

      if (collateralPurchaseTileIndex !== null) {
        const currentPendingTileIndex = pendingPurchaseTileIndex(gameState);
        if (pendingType(gameState) !== "BUY_PROPERTY" || pendingPlayerId(gameState) !== player.id || currentPendingTileIndex !== collateralPurchaseTileIndex) {
          return { ok: true, actions, stopped: "collateral_purchase_changed", actionContext };
        }
      }

      const boardPack = getBoardPackById(game.board_pack_id);
      const boardTiles = resolveBoardTilesForRules({ boardPack, rules: gameState.rules });
      const aiAction = chooseAiAction({
        state: gameState,
        player,
        game,
        players,
        boardTiles,
        ownershipRows,
        loanRows,
        actionsTaken: actions,
      });
      if (!aiAction) return { ok: true, actions, stopped: "unsupported_state" };

      const actionResponse = await executeBankActionRequest({
        user: { id: player.user_id, email: null },
        body: {
          ...aiAction,
          gameId,
          expectedVersion: gameState.version,
        } as BankActionRequest,
      });
      const payload = (await actionResponse.json().catch(() => null)) as { error?: string; currentVersion?: number } | null;
      if (!actionResponse.ok) {
        const auctionTimeoutAdvanced =
          actionContext === "auction" &&
          actionResponse.status === 409 &&
          (payload?.error === "Auction turn advanced. Sync to continue." ||
            payload?.error === "Version mismatch.");
        if (auctionTimeoutAdvanced && auctionTurnExpired(gameState)) {
          continue;
        }

        return {
          ok: true,
          actions,
          stopped: actionResponse.status === 409 && payload?.error === "Version mismatch." ? "version_conflict" : "action_rejected",
          actionContext,
          status: actionResponse.status,
          error: payload?.error ?? null,
        };
      }
      if (aiAction.action === "TAKE_COLLATERAL_LOAN") {
        collateralPurchaseTileIndex = pendingPurchaseTileIndex(gameState);
      }
      if (
        (aiAction.action === "BUY_PROPERTY" || aiAction.action === "DECLINE_PROPERTY") &&
        aiAction.tileIndex === collateralPurchaseTileIndex
      ) {
        collateralPurchaseTileIndex = null;
      }
      actions.push(aiAction.action);
    }

    return { ok: true, actions, stopped: "max_steps" };
  } finally {
    await releaseLock(gameId, lockToken).catch(() => undefined);
  }
};
