"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  const latestSessionRef = useRef<SupabaseSession | null>(null);

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
        `players?select=id,user_id,display_name,created_at&game_id=eq.${gameId}&order=created_at.asc`,
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

    const realtimeClient = supabaseClient.getRealtimeClient();
    if (!realtimeClient) {
      return;
    }

    latestSessionRef.current = session;

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

    return () => {
      void channel.unsubscribe();
      realtimeClient.removeChannel(channel);
    };
  }, [gameId, isConfigured, isValidUuid, refreshLobby, session]);

  useEffect(() => {
    if (activeGame?.status === "in_progress") {
      router.replace("/play");
    }
  }, [activeGame?.status, router]);

  useEffect(() => {
    if (activeGame?.status !== "ended") {
      return;
    }

    setActiveGame(null);
    setPlayers([]);
    setGameState(null);

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(lastGameKey);
    }

    setNotice("This session has ended.");
    router.replace("/");
  }, [activeGame?.status, router]);

  const handleLeaveLobby = () => {
    setActiveGame(null);
    setPlayers([]);
    setGameState(null);

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(lastGameKey);
    }

    router.push("/");
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
        window.localStorage.removeItem(lastGameKey);
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

      router.push("/play");
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

  return (
    <main className="min-h-dvh bg-neutral-50 p-6 flex items-start justify-center">
      <div className="w-full max-w-md space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-neutral-900">Game lobby</h1>
          <p className="text-sm text-neutral-600">
            Share the join code and wait for the host to start.
          </p>
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
          <div className="rounded-2xl border bg-white p-5 text-sm text-neutral-500">
            Loading lobby…
          </div>
        ) : null}

        {activeGame ? (
          <section className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Waiting room</h2>
                <p className="text-sm text-neutral-500">
                  Invite players before kicking off the game.
                </p>
              </div>
              <button
                className="text-xs font-medium text-neutral-500 hover:text-neutral-900"
                type="button"
                onClick={handleLeaveLobby}
              >
                Leave
              </button>
            </div>
            {isHost ? (
              <button
                className="w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 hover:border-rose-300 disabled:cursor-not-allowed disabled:border-rose-100 disabled:text-rose-300"
                type="button"
                onClick={handleEndSession}
                disabled={loadingAction === "end"}
              >
                {loadingAction === "end" ? "Ending…" : "End session"}
              </button>
            ) : null}
            {isHost && activeGame.status === "lobby" ? (
              <button
                className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-400"
                type="button"
                onClick={handleStartGame}
                disabled={loadingAction === "start"}
              >
                {loadingAction === "start" ? "Starting…" : "Start game"}
              </button>
            ) : null}
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
              <div className="text-xs uppercase text-neutral-500">Join code</div>
              <div className="text-lg font-semibold tracking-[0.3em] text-neutral-900">
                {activeGame.join_code}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase text-neutral-500">
                Players ({players.length})
              </div>
              <ul className="space-y-2">
                {players.map((player) => (
                  <li
                    key={player.id}
                    className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
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
