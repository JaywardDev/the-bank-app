"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getConfigErrors } from "@/lib/env";
import { supabaseClient, type SupabaseSession } from "@/lib/supabase/client";

const lastGameKey = "bank.lastGameId";

type Game = {
  id: string;
  join_code: string;
  created_at: string | null;
  board_pack_id: string | null;
  status: string | null;
  created_by: string | null;
};

type Player = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  created_at: string | null;
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
  const [authLoading, setAuthLoading] = useState(true);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
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
        `games?select=id,join_code,created_at,board_pack_id,status,created_by&id=eq.${gameId}&limit=1`,
        { method: "GET" },
        accessToken,
      );

      if (!game[0]) {
        throw new Error("Game not found.");
      }

      const playerRows = await supabaseClient.fetchFromSupabase<Player[]>(
        `players?select=id,user_id,display_name,created_at,position,is_eliminated,eliminated_at&game_id=eq.${gameId}&order=created_at.asc`,
        { method: "GET" },
        accessToken,
      );

      const [stateRow] = await supabaseClient.fetchFromSupabase<GameState[]>(
        `game_state?select=game_id,version&game_id=eq.${gameId}&limit=1`,
        { method: "GET" },
        accessToken,
      );

      setActiveGame(game[0]);
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
        setNotice(error.message);
      } else {
        setNotice("Unable to load the lobby.");
      }
    }
  }, [gameId, loadLobby]);

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
      router.replace(`/play/${gameId}`);
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
      const response = await fetch("/api/bank/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "LEAVE_GAME",
          gameId,
        }),
      });

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        throw new Error(error.error ?? "Unable to leave the table.");
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
      const response = await fetch("/api/bank/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "END_GAME",
          gameId: activeGame.id,
          expectedVersion: gameState?.version ?? 0,
        }),
      });

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        if (response.status === 409) {
          await loadLobby(activeGame.id, session.access_token);
          throw new Error(error.error ?? "Game updated. Try again.");
        }
        throw new Error(error.error ?? "Unable to end the session.");
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

  const handleStartGame = async () => {
    if (!session || !activeGame) {
      setNotice("Join a lobby before starting.");
      return;
    }

    setLoadingAction("start");
    setNotice(null);

    try {
      const response = await fetch("/api/bank/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "START_GAME",
          gameId: activeGame.id,
          expectedVersion: gameState?.version ?? 0,
        }),
      });

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        if (response.status === 409) {
          await loadLobby(activeGame.id, session.access_token);
          throw new Error(error.error ?? "Game updated. Try again.");
        }
        throw new Error(error.error ?? "Unable to start the game.");
      }

      router.push(`/play/${activeGame.id}`);
    } catch (error) {
      if (error instanceof Error) {
        setNotice(error.message);
      } else {
        setNotice("Unable to start the game.");
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const isHost = Boolean(
    session && activeGame?.created_by && session.user.id === activeGame.created_by,
  );

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
    } catch (error) {
      setCopyNotice("Unable to copy. Please select the code.");
    }

    window.setTimeout(() => {
      setCopyNotice(null);
    }, 2000);
  }, [activeGame?.join_code]);

  return (
    <main className="lobby-skin relative flex min-h-dvh items-start justify-center bg-neutral-50 p-6">
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-[url('/icons/lobby_page.svg')] bg-cover bg-center bg-fixed"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 z-10 bg-neutral-950/40"
        aria-hidden="true"
      />
      <div className="relative z-20 w-full max-w-md space-y-6">
        <header className="rounded-3xl border border-amber-200/80 bg-[#f8f2e7]/95 px-5 py-4 shadow-[0_12px_30px_rgba(37,25,10,0.18)] backdrop-blur">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-neutral-900">Game lobby</h1>
            <p className="text-sm text-neutral-700">
              Share the join code and wait for the host to start.
            </p>
          </div>
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

        {authLoading ? (
          <div className="rounded-2xl border border-amber-200/70 bg-[#f8f2e7] p-5 text-sm text-neutral-600 shadow-[0_10px_24px_rgba(37,25,10,0.14)]">
            Loading lobby…
          </div>
        ) : null}

        {activeGame ? (
          <section className="space-y-4 rounded-3xl border border-amber-200/70 bg-[#f8f2e7] p-5 shadow-[0_14px_34px_rgba(37,25,10,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Waiting room</h2>
                <p className="text-sm text-neutral-600">
                  Invite players before kicking off the game.
                </p>
              </div>
              <button
                className="rounded-md text-xs font-semibold text-neutral-500 transition hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-700"
                type="button"
                onClick={handleLeaveLobby}
              >
                Leave table
              </button>
            </div>
            {isHost && activeGame.status === "lobby" ? (
              <button
                className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(15,23,42,0.25)] transition hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:bg-neutral-400"
                type="button"
                onClick={handleStartGame}
                disabled={loadingAction === "start"}
              >
                {loadingAction === "start" ? "Starting…" : "Start game"}
              </button>
            ) : null}
            {isHost ? (
              <button
                className="w-full rounded-xl border border-rose-200/80 bg-rose-50/80 px-4 py-3 text-sm font-semibold text-rose-800 transition hover:border-rose-300 hover:bg-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 disabled:cursor-not-allowed disabled:border-rose-100 disabled:text-rose-300"
                type="button"
                onClick={handleEndSession}
                disabled={loadingAction === "end"}
              >
                {loadingAction === "end" ? "Ending…" : "End session"}
              </button>
            ) : null}
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
              <div className="flex items-center justify-between gap-3 text-xs uppercase text-neutral-500">
                <span>Join code</span>
                <button
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-700"
                  type="button"
                  onClick={handleCopyCode}
                >
                  Copy
                </button>
              </div>
              <div className="mt-2 text-lg font-semibold uppercase tracking-[0.4em] text-neutral-900">
                <span className="select-all font-mono">{activeGame.join_code}</span>
              </div>
              {copyNotice ? (
                <div className="mt-1 text-xs text-neutral-500">{copyNotice}</div>
              ) : null}
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase text-neutral-500">
                Seated players ({players.length})
              </div>
              <ul className="space-y-2">
                {players.map((player) => (
                  <li
                    key={player.id}
                    className="flex items-center justify-between rounded-xl border border-neutral-200/80 bg-white/80 px-3 py-2 text-sm text-neutral-700 shadow-[0_6px_12px_rgba(37,25,10,0.08)]"
                  >
                    {player.display_name ?? "Player"}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border bg-white p-4 text-sm text-neutral-500">
            Lobby not loaded yet.
          </section>
        )}

        {notice ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            {notice}
          </div>
        ) : null}
      </div>
    </main>
  );
}
