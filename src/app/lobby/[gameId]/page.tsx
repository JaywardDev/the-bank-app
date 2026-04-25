"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getConfigErrors } from "@/lib/env";
import { postGameActionRequest } from "@/lib/client/postGameActionRequest";
import { supabaseClient, type SupabaseSession } from "@/lib/supabase/client";
import RotateToLandscapeOverlay from "@/components/play-v2/RotateToLandscapeOverlay";
import CompactOverlayModal from "@/app/components/CompactOverlayModal";
import { compactLandscapeStyles } from "@/app/components/compactLandscape";
import {
  DEFAULT_ROUND_LIMIT,
  ROUND_LIMIT_OPTIONS,
  isRoundLimitOption,
  type RoundLimitOption,
} from "@/lib/gameConfig";

const lastGameKey = "bank.lastGameId";
const SESSION_EXPIRED_MESSAGE = "Session expired — please sign in again";

type Game = {
  id: string;
  join_code: string;
  created_at: string | null;
  board_pack_id: string | null;
  game_mode: "classic" | "round_mode" | null;
  round_limit: number | null;
  status: string | null;
  created_by: string | null;
};

type Player = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  created_at: string | null;
  lobby_ready: boolean;
  lobby_ready_at: string | null;
  position: number;
  is_eliminated: boolean;
  eliminated_at: string | null;
};

type GameState = {
  game_id: string;
  version: number;
};

export default function LobbyPage() {
  const router = useRouter();
  const params = useParams<{ gameId?: string | string[] }>();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [hostGameMode, setHostGameMode] = useState<"classic" | "round_mode">("classic");
  const [hostRoundLimit, setHostRoundLimit] = useState<RoundLimitOption>(DEFAULT_ROUND_LIMIT);
  const [authLoading, setAuthLoading] = useState(true);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [sessionInvalid, setSessionInvalid] = useState(false);
  const [activeModal, setActiveModal] = useState<"invite" | "settings" | "end-session" | null>(
    null,
  );
  const latestSessionRef = useRef<SupabaseSession | null>(null);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef(false);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);

  const isConfigured = useMemo(() => supabaseClient.isConfigured(), []);
  const configErrors = useMemo(() => getConfigErrors(), []);
  const hasConfigErrors = configErrors.length > 0;
  const gameId = useMemo(() => {
    const param = params?.gameId;
    return Array.isArray(param) ? param[0] : param;
  }, [params]);
  const isValidUuid = useMemo(
    () =>
      Boolean(
        gameId &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            gameId,
          ),
      ),
    [gameId],
  );

  const loadLobby = useCallback(
    async (gameId: string, accessToken: string) => {
      const game = await supabaseClient.fetchFromSupabase<Game[]>(
        `games?select=id,join_code,created_at,board_pack_id,game_mode,round_limit,status,created_by&id=eq.${gameId}&limit=1`,
        { method: "GET" },
        accessToken,
      );

      if (!game[0]) {
        throw new Error("Game not found.");
      }

      const playerRows = await supabaseClient.fetchFromSupabase<Player[]>(
        `players?select=id,user_id,display_name,created_at,lobby_ready,lobby_ready_at,position,is_eliminated,eliminated_at&game_id=eq.${gameId}&order=created_at.asc`,
        { method: "GET" },
        accessToken,
      );

      const [stateRow] = await supabaseClient.fetchFromSupabase<GameState[]>(
        `game_state?select=game_id,version&game_id=eq.${gameId}&limit=1`,
        { method: "GET" },
        accessToken,
      );

      setActiveGame(game[0]);
      setHostGameMode(game[0].game_mode === "round_mode" ? "round_mode" : "classic");
      setHostRoundLimit(
        isRoundLimitOption(game[0].round_limit) ? game[0].round_limit : DEFAULT_ROUND_LIMIT,
      );
      setPlayers(playerRows);
      setGameState(stateRow ?? null);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(lastGameKey, gameId);
      }
    },
    [],
  );

  const refreshLobby = useCallback(async () => {
    if (!gameId) {
      return;
    }

    const currentSession = latestSessionRef.current;
    if (!currentSession) {
      return;
    }

    try {
      await loadLobby(gameId, currentSession.access_token);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === SESSION_EXPIRED_MESSAGE) {
          setSessionInvalid(true);
        }
        setNotice(error.message);
      } else {
        setNotice("Unable to load the lobby.");
      }
    }
  }, [gameId, loadLobby]);


  const performBankActionWithRecovery = useCallback(
    async (body: Record<string, unknown>) => {
      if (!session?.access_token) {
        throw new Error("Sign in on the home page to continue.");
      }

      const result = await postGameActionRequest({
        payload: body,
        accessToken: session.access_token,
      });

      let accessToken = session.access_token;

      if (result.refreshedSession) {
        const refreshedSessionState = await supabaseClient.getSession();
        setSession(refreshedSessionState);
        latestSessionRef.current = refreshedSessionState;

        if (!refreshedSessionState?.access_token) {
          setSessionInvalid(true);
          setNotice(SESSION_EXPIRED_MESSAGE);
          return null;
        }

        accessToken = refreshedSessionState.access_token;
      }

      if (result.status === 401) {
        setSessionInvalid(true);
        setNotice(SESSION_EXPIRED_MESSAGE);
        return null;
      }

      if (!result.ok) {
        const error = result.body as { error?: string } | null;
        throw new Error(error?.error ?? "Unable to complete this action.");
      }

      setSessionInvalid(false);
      return { response: result, accessToken };
    },
    [session],
  );

  const setupRealtimeChannel = useCallback(() => {
    if (!isConfigured || !gameId || !isValidUuid) {
      return;
    }

    const realtimeClient = supabaseClient.getRealtimeClient();
    if (!realtimeClient) {
      return;
    }

    const existingChannel = realtimeChannelRef.current;
    if (existingChannel && existingChannel.state === "joined") {
      return;
    }

    if (existingChannel) {
      realtimeClient.removeChannel(existingChannel);
      realtimeChannelRef.current = null;
    }

    const channel = realtimeClient
      .channel(`lobby:${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "players",
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          void refreshLobby();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "players",
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          void refreshLobby();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "players",
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          void refreshLobby();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_state",
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          void refreshLobby();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        () => {
          void refreshLobby();
        },
      )
      .subscribe();

    realtimeChannelRef.current = channel;
  }, [gameId, isConfigured, isValidUuid, refreshLobby]);

  const requestRefresh = useCallback(() => {
    if (!gameId || !latestSessionRef.current) {
      return;
    }

    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = setTimeout(async () => {
      if (refreshInFlightRef.current) {
        return;
      }

      refreshInFlightRef.current = true;
      try {
        await refreshLobby();
        setupRealtimeChannel();
      } finally {
        refreshInFlightRef.current = false;
      }
    }, 400);
  }, [gameId, refreshLobby, setupRealtimeChannel]);

  useEffect(() => {
    latestSessionRef.current = session;
  }, [session]);

  useEffect(() => {
    let isMounted = true;

    const hydrateSession = async () => {
      if (!isConfigured) {
        setAuthLoading(false);
        return;
      }

      if (!gameId) {
        setNotice("Invalid lobby URL");
        setAuthLoading(false);
        return;
      }

      if (!isValidUuid) {
        setNotice("Invalid game id");
        setAuthLoading(false);
        return;
      }

      const currentSession = await supabaseClient.getSession();
      if (!isMounted) {
        return;
      }

      setSession(currentSession);
      latestSessionRef.current = currentSession;
      setAuthLoading(false);

      if (!currentSession) {
        setNotice("Sign in on the home page to view this lobby.");
        return;
      }

      await refreshLobby();
    };

    hydrateSession();

    return () => {
      isMounted = false;
    };
  }, [gameId, isConfigured, isValidUuid, loadLobby, refreshLobby]);

  useEffect(() => {
    if (!isConfigured || !gameId || !isValidUuid) {
      return;
    }

    latestSessionRef.current = session;
    setupRealtimeChannel();

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      const realtimeClient = supabaseClient.getRealtimeClient();
      if (realtimeClient && realtimeChannelRef.current) {
        void realtimeChannelRef.current.unsubscribe();
        realtimeClient.removeChannel(realtimeChannelRef.current);
      }
      realtimeChannelRef.current = null;
    };
  }, [gameId, isConfigured, isValidUuid, refreshLobby, session, setupRealtimeChannel]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        requestRefresh();
      }
    };

    const handleFocus = () => {
      requestRefresh();
    };

    const handleOnline = () => {
      requestRefresh();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);

      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [requestRefresh]);

  useEffect(() => {
    if (activeGame?.status === "in_progress") {
      router.replace(`/play-v2/${gameId}`);
    }
  }, [activeGame?.status, gameId, router]);

  useEffect(() => {
    if (activeGame?.status !== "ended") {
      return;
    }

    setActiveGame(null);
    setPlayers([]);
    setGameState(null);

    if (typeof window !== "undefined") {
      if (window.localStorage.getItem(lastGameKey) === gameId) {
        window.localStorage.removeItem(lastGameKey);
      }
    }

    setNotice("This session has ended.");
    router.replace("/");
  }, [activeGame?.status, gameId, router]);

  const handleLeaveLobby = async () => {
    if (!session || !gameId) {
      router.push("/");
      return;
    }

    setLoadingAction("leave");
    setNotice(null);

    try {
      const result = await performBankActionWithRecovery({
        action: "LEAVE_GAME",
        gameId,
      });

      if (!result) {
        return;
      }

      setActiveGame(null);
      setPlayers([]);
      setGameState(null);

      if (typeof window !== "undefined") {
        if (window.localStorage.getItem(lastGameKey) === gameId) {
          window.localStorage.removeItem(lastGameKey);
        }
      }

      router.push("/");
    } catch (error) {
      if (error instanceof Error) {
        setNotice(error.message);
      } else {
        setNotice("Unable to leave the table.");
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handleEndSession = async () => {
    if (!session || !activeGame) {
      setNotice("Join a lobby before ending the session.");
      return;
    }

    setLoadingAction("end");
    setNotice(null);

    try {
      const result = await performBankActionWithRecovery({
        action: "END_GAME",
        gameId: activeGame.id,
        expectedVersion: gameState?.version ?? 0,
      });

      if (!result) {
        return;
      }

      if (typeof window !== "undefined") {
        if (window.localStorage.getItem(lastGameKey) === activeGame.id) {
          window.localStorage.removeItem(lastGameKey);
        }
      }

      router.push("/");
    } catch (error) {
      if (error instanceof Error) {
        setNotice(error.message);
      } else {
        setNotice("Unable to end the session.");
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSetReady = async () => {
    if (!session || !activeGame) {
      setNotice("Join a lobby before starting.");
      return;
    }

    setLoadingAction("start");
    setNotice(null);

    try {
      const result = await performBankActionWithRecovery({
        action: "SET_LOBBY_READY",
        gameId: activeGame.id,
      });

      if (!result) {
        return;
      }

      if ((result.response.body as { started?: boolean } | null)?.started) {
        router.push(`/play-v2/${activeGame.id}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        setNotice(error.message);
      } else {
        setNotice("Unable to set ready status.");
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handleUpdateGameSettings = async () => {
    if (!session?.access_token || !gameId) {
      return;
    }

    setLoadingAction("settings");
    setNotice(null);
    try {
      const result = await performBankActionWithRecovery({
        action: "UPDATE_GAME_SETTINGS",
        gameId,
        gameMode: hostGameMode,
        roundLimit: hostGameMode === "round_mode" ? hostRoundLimit : null,
      });
      if (!result) {
        return;
      }
      setNotice("Game settings updated.");
      await loadLobby(gameId, result.accessToken);
    } catch (error) {
      if (error instanceof Error) {
        setNotice(error.message);
      } else {
        setNotice("Unable to update game settings.");
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const isHost = Boolean(
    session && activeGame?.created_by && session.user.id === activeGame.created_by,
  );
  const currentPlayer = useMemo(
    () => players.find((player) => player.user_id === session?.user.id) ?? null,
    [players, session?.user.id],
  );
  const allPlayersReady = players.length > 0 && players.every((player) => player.lobby_ready);
  const readyActionLabel =
    activeGame?.status === "in_progress"
      ? "Started"
      : currentPlayer?.lobby_ready
        ? "Ready · Waiting"
        : "Start / Ready";

  const handleCopyCode = useCallback(async () => {
    if (!activeGame?.join_code) {
      return;
    }

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(activeGame.join_code);
        setCopyNotice("Copied!");
      } else {
        setCopyNotice("Select and copy the code.");
      }
    } catch {
      setCopyNotice("Unable to copy. Please select the code.");
    }

    window.setTimeout(() => {
      setCopyNotice(null);
    }, 2000);
  }, [activeGame?.join_code]);

  return (
    <main className={`lobby-skin bg-neutral-50 ${compactLandscapeStyles.viewport}`}>
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-[url('/icons/lobby_page.svg')] bg-cover bg-center bg-fixed"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 z-10 bg-neutral-950/40"
        aria-hidden="true"
      />
      <div className={compactLandscapeStyles.container}>
        <header
          className={`${compactLandscapeStyles.header} flex items-center justify-between gap-3`}
        >
          <h1 className="text-xl font-semibold leading-tight text-neutral-900 sm:text-2xl">
            Waiting room
          </h1>
          {activeGame ? (
            <button
              className="rounded-lg border border-amber-200/80 bg-white/80 px-3 py-1.5 text-xs font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={handleLeaveLobby}
              disabled={Boolean(currentPlayer?.lobby_ready && activeGame.status === "lobby")}
            >
              Leave
            </button>
          ) : null}
        </header>

        {hasConfigErrors ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-semibold">Configuration required</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {configErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <section className={`flex min-h-0 flex-1 flex-col p-4 ${compactLandscapeStyles.panel}`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-neutral-700">
              Players
            </h2>
            <span className="rounded-full border border-neutral-200 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-neutral-600">
              {players.length} players
            </span>
          </div>
          {authLoading ? (
            <div className="mt-3 rounded-xl border border-amber-200/70 bg-white/70 p-3 text-xs text-neutral-600">
              Loading lobby…
            </div>
          ) : activeGame ? (
            <div className="mt-3 flex min-h-0 flex-1 flex-col">
              <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
                {players.map((player) => (
                  <li
                    key={player.id}
                    className="flex items-center justify-between rounded-lg border border-neutral-200/80 bg-white/85 px-3 py-2 text-sm text-neutral-700 shadow-[0_4px_10px_rgba(37,25,10,0.08)]"
                  >
                    <span>{player.display_name ?? "Player"}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${
                          player.lobby_ready ? "text-emerald-600" : "text-amber-700"
                        }`}
                      >
                        {player.lobby_ready ? "Ready" : "Not ready"}
                      </span>
                      {player.user_id === activeGame.created_by ? (
                        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                          Host
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <section className="mt-3 rounded-xl border bg-white/80 p-3 text-xs text-neutral-500">
              Lobby not loaded yet.
            </section>
          )}

          {activeGame?.status === "lobby" ? (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-neutral-400"
                  type="button"
                  onClick={handleSetReady}
                  disabled={loadingAction === "start" || Boolean(currentPlayer?.lobby_ready)}
                >
                  {loadingAction === "start" ? "Updating…" : readyActionLabel}
                </button>
                <button
                  className="rounded-lg border border-neutral-300 bg-white/85 px-4 py-2 text-sm font-semibold text-neutral-800"
                  type="button"
                  onClick={() => setActiveModal("invite")}
                >
                  Invite details
                </button>
                {isHost ? (
                  <>
                    <button
                      className="rounded-lg border border-neutral-300 bg-white/85 px-4 py-2 text-sm font-semibold text-neutral-800"
                      type="button"
                      onClick={() => setActiveModal("settings")}
                    >
                      Host settings
                    </button>
                    <button
                      className="rounded-lg border border-rose-200/80 bg-rose-50/85 px-4 py-2 text-sm font-semibold text-rose-800"
                      type="button"
                      onClick={() => setActiveModal("end-session")}
                    >
                      End session
                    </button>
                  </>
                ) : null}
              </div>
              <div className="text-xs text-neutral-600">
                {allPlayersReady ? "All players ready — starting…" : "Waiting for all players to be ready."}
              </div>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <button
                className="rounded-lg border border-neutral-300 bg-white/85 px-4 py-2 text-sm font-semibold text-neutral-800"
                type="button"
                onClick={() => setActiveModal("invite")}
              >
                Invite details
              </button>
            </div>
          )}
        </section>

        {notice ? (
          <div className="flex-none rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            <p>{notice}</p>
            {sessionInvalid ? (
              <button
                className="mt-3 rounded-full bg-sky-900 px-4 py-2 text-xs font-semibold text-white"
                type="button"
                onClick={async () => {
                  await supabaseClient.signOut();
                  if (typeof window !== "undefined") {
                    window.localStorage.removeItem(lastGameKey);
                  }
                  router.push("/");
                }}
              >
                Sign out and go home
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <CompactOverlayModal
        open={activeModal === "invite"}
        title="Invite players"
        onClose={() => setActiveModal(null)}
      >
        <div className="space-y-2">
          <p className="text-xs text-neutral-600">Share this join code with players at the table.</p>
          <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-center text-lg font-semibold uppercase tracking-[0.32em] text-neutral-900">
            <span className="select-all font-mono">{activeGame?.join_code ?? "------"}</span>
          </div>
          <button
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-800"
            type="button"
            onClick={handleCopyCode}
          >
            Copy join code
          </button>
          {copyNotice ? <p className="text-xs text-neutral-500">{copyNotice}</p> : null}
        </div>
      </CompactOverlayModal>

      <CompactOverlayModal
        open={activeModal === "settings"}
        title="Host settings"
        onClose={() => setActiveModal(null)}
      >
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-[0.05em] text-neutral-500">
              Game mode
            </label>
            <select
              className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm text-neutral-900"
              value={hostGameMode}
              onChange={(event) =>
                setHostGameMode(event.target.value === "round_mode" ? "round_mode" : "classic")
              }
            >
              <option value="classic">Classic</option>
              <option value="round_mode">Round Mode</option>
            </select>
          </div>
          {hostGameMode === "round_mode" ? (
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.05em] text-neutral-500">
                Round limit
              </label>
              <select
                className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm text-neutral-900"
                value={hostRoundLimit}
                onChange={(event) =>
                  setHostRoundLimit(Number(event.target.value) as RoundLimitOption)
                }
              >
                {ROUND_LIMIT_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option} rounds</option>
                ))}
              </select>
            </div>
          ) : null}
          <button
            className="h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-800 disabled:opacity-60"
            type="button"
            onClick={handleUpdateGameSettings}
            disabled={loadingAction === "settings"}
          >
            {loadingAction === "settings" ? "Saving…" : "Save settings"}
          </button>
        </div>
      </CompactOverlayModal>

      <CompactOverlayModal
        open={activeModal === "end-session"}
        title="End session"
        onClose={() => setActiveModal(null)}
      >
        <div className="space-y-3">
          <p className="text-sm text-neutral-700">End this session for all players and return home?</p>
          <button
            className="h-9 w-full rounded-lg border border-rose-200/80 bg-rose-50/85 px-3 text-sm font-semibold text-rose-800 disabled:opacity-60"
            type="button"
            onClick={handleEndSession}
            disabled={loadingAction === "end"}
          >
            {loadingAction === "end" ? "Ending…" : "Confirm end session"}
          </button>
        </div>
      </CompactOverlayModal>
      <RotateToLandscapeOverlay />
    </main>
  );
}
