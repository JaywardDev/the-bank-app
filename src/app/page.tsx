"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getConfigErrors, SITE_URL } from "@/lib/env";
import { boardPacks, defaultBoardPackId } from "@/lib/boardPacks";
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

export default function Home() {
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [boardPackId, setBoardPackId] = useState(defaultBoardPackId);
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const isConfigured = useMemo(() => supabaseClient.isConfigured(), []);
  const configErrors = useMemo(() => getConfigErrors(), []);
  const hasConfigErrors = configErrors.length > 0;

  const clearResumeStorage = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const { localStorage } = window;
    localStorage.removeItem(lastGameKey);

    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith("bank.lobby")) {
        localStorage.removeItem(key);
      }
    }
  }, []);

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

      if (game[0].status === "ended") {
        clearResumeStorage();
        setActiveGame(null);
        setPlayers([]);
        setNotice("Last session ended.");
        return;
      }

      const playerRows = await supabaseClient.fetchFromSupabase<Player[]>(
        `players?select=id,user_id,display_name,created_at,position,is_eliminated,eliminated_at&game_id=eq.${gameId}&order=created_at.asc`,
        { method: "GET" },
        accessToken,
      );

      setActiveGame(game[0]);
      setPlayers(playerRows);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(lastGameKey, gameId);
      }
    },
    [clearResumeStorage],
  );

  const restoreLobby = useCallback(
    async (currentSession: SupabaseSession) => {
      if (typeof window === "undefined") {
        return;
      }

      const storedGameId = window.localStorage.getItem(lastGameKey);
      if (!storedGameId) {
        return;
      }

      try {
        await loadLobby(storedGameId, currentSession.access_token);
      } catch (error) {
        if (error instanceof Error) {
          setNotice(error.message);
        } else {
          setNotice("Unable to restore the lobby.");
        }
      }
    },
    [loadLobby],
  );

  useEffect(() => {
    let isMounted = true;

    const hydrateSession = async () => {
      if (!isConfigured) {
        setAuthLoading(false);
        return;
      }

      const currentSession = await supabaseClient.getSession();
      if (!isMounted) {
        return;
      }

      setSession(currentSession);
      setAuthLoading(false);

      if (currentSession) {
        await restoreLobby(currentSession);
      }
    };

    hydrateSession();

    return () => {
      isMounted = false;
    };
  }, [isConfigured, restoreLobby]);

  useEffect(() => {
    if (!isConfigured || !activeGame) {
      return;
    }

    const realtimeClient = supabaseClient.getRealtimeClient();
    if (!realtimeClient) {
      return;
    }

    const channel = realtimeClient
      .channel(`home-lobby:${activeGame.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `game_id=eq.${activeGame.id}`,
        },
        () => {
          if (session) {
            void loadLobby(activeGame.id, session.access_token);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_state",
          filter: `game_id=eq.${activeGame.id}`,
        },
        () => {
          if (session) {
            void loadLobby(activeGame.id, session.access_token);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
          filter: `id=eq.${activeGame.id}`,
        },
        () => {
          if (session) {
            void loadLobby(activeGame.id, session.access_token);
          }
        },
      )
      .subscribe();

    return () => {
      realtimeClient.removeChannel(channel);
    };
  }, [activeGame, isConfigured, loadLobby, session]);

  const handleSendMagicLink = async () => {
    if (!authEmail) {
      setNotice("Enter your email to receive a magic link.");
      return;
    }

    setLoadingAction("auth");
    setNotice(null);

    try {
      if (hasConfigErrors) {
        setNotice("Fix configuration errors before signing in.");
        return;
      }

      await supabaseClient.signInWithOtp(authEmail);
      setNotice("Magic link sent! Check your inbox to finish sign-in.");
    } catch (error) {
      if (error instanceof Error) {
        setNotice(error.message);
      } else {
        setNotice("Unable to send magic link.");
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSignOut = async () => {
    if (!session) {
      return;
    }

    setLoadingAction("signout");
    setNotice(null);

    await supabaseClient.signOut();
    setSession(null);
    setActiveGame(null);
    setPlayers([]);

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(lastGameKey);
    }

    setLoadingAction(null);
  };

  const handleCreateGame = async () => {
    if (!session) {
      setNotice("Sign in first to create a game.");
      return;
    }

    if (!playerName.trim()) {
      setNotice("Add a player name before creating a game.");
      return;
    }

    setLoadingAction("create");
    setNotice(null);

    try {
      const response = await fetch("/api/bank/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "CREATE_GAME",
          playerName: playerName.trim(),
          boardPackId,
        }),
      });

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        throw new Error(error.error ?? "Unable to create the game.");
      }

      const data = (await response.json()) as { gameId?: string };
      if (!data.gameId) {
        throw new Error("Unable to create the game.");
      }

      await loadLobby(data.gameId, session.access_token);
      setNotice("Game created. Share the code to invite others.");
      router.push(`/lobby/${data.gameId}`);
    } catch (error) {
      if (error instanceof Error) {
        setNotice(error.message);
      } else {
        setNotice("Unable to create the game.");
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handleJoinGame = async () => {
    if (!session) {
      setNotice("Sign in first to join a game.");
      return;
    }

    if (!playerName.trim()) {
      setNotice("Add a player name before joining a game.");
      return;
    }

    if (!joinCode.trim()) {
      setNotice("Enter a join code to continue.");
      return;
    }

    setLoadingAction("join");
    setNotice(null);

    try {
      const response = await fetch("/api/bank/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "JOIN_GAME",
          joinCode: joinCode.trim(),
          displayName: playerName.trim(),
        }),
      });

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        if (response.status === 409) {
          throw new Error(
            error.error ?? "That game has already started. Ask the host to reset.",
          );
        }
        throw new Error(error.error ?? "Unable to join the game.");
      }

      const data = (await response.json()) as {
        gameId?: string;
        join_code?: string | null;
        created_at?: string | null;
        board_pack_id?: string | null;
        status?: string | null;
        created_by?: string | null;
        players?: Player[];
      };

      if (!data.gameId || !data.join_code) {
        throw new Error("Unable to join the game.");
      }

      setActiveGame({
        id: data.gameId,
        join_code: data.join_code,
        created_at: data.created_at ?? null,
        board_pack_id: data.board_pack_id ?? null,
        status: data.status ?? "lobby",
        created_by: data.created_by ?? null,
      });
      setPlayers(data.players ?? []);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(lastGameKey, data.gameId);
      }

      setNotice("You are in the lobby. Waiting for the host.");
      router.push(`/lobby/${data.gameId}`);
    } catch (error) {
      if (error instanceof Error) {
        setNotice(error.message);
      } else {
        setNotice("Unable to join the game.");
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const isMember = useMemo(
    () =>
      Boolean(session && players.some((player) => player.user_id === session.user.id)),
    [players, session],
  );
  const showLobbyResumeGate = Boolean(activeGame?.status === "lobby");
  const showPlayResumeGate = Boolean(activeGame?.status === "in_progress");

  return (
    <main className="min-h-dvh bg-neutral-50 p-6 flex items-start justify-center">
      <div className="w-full max-w-md space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-neutral-900">The Bank</h1>
          <p className="text-sm text-neutral-600">
            A strategy board game about money, decision-making, and managing finances.
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

        <section className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Player session</h2>
              <p className="text-sm text-neutral-500">
                Sign in to create or join a table.
              </p>
            </div>
            {session ? (
              <button
                className="text-xs font-medium text-neutral-500 hover:text-neutral-900"
                type="button"
                onClick={handleSignOut}
                disabled={loadingAction === "signout"}
              >
                Sign out
              </button>
            ) : null}
          </div>

          {authLoading ? (
            <p className="text-sm text-neutral-500">Checking session…</p>
          ) : session ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-900">
              Signed in as <strong>{session.user.email ?? "player"}</strong>.
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase text-neutral-500">
                Email for magic link
              </label>
              <input
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                type="email"
                placeholder="you@example.com"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
              />
              <button
                className="w-full rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-400"
                type="button"
                onClick={handleSendMagicLink}
                disabled={loadingAction === "auth" || hasConfigErrors}
              >
                {loadingAction === "auth" ? "Sending…" : "Send magic link"}
              </button>
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Player details</h2>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase text-neutral-500">
              Display name
            </label>
            <input
              className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
              type="text"
              placeholder="Banker Alex"
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
            />
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Create a game</h2>
          <p className="text-sm text-neutral-500">
            Host a new table and share the join code with players.
          </p>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase text-neutral-500">
              Board pack
            </label>
            <select
              className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
              value={boardPackId}
              onChange={(event) => setBoardPackId(event.target.value)}
            >
              {boardPacks.map((pack) => (
                <option key={pack.id} value={pack.id}>
                  {pack.displayName}
                </option>
              ))}
            </select>
          </div>
          <button
            className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-400"
            type="button"
            onClick={handleCreateGame}
            disabled={!session || loadingAction === "create"}
          >
            {loadingAction === "create" ? "Creating…" : "Create game"}
          </button>
        </section>

        <section className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Join a game</h2>
          <p className="text-sm text-neutral-500">
            Enter the code from the host to join their lobby.
          </p>
          <input
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm uppercase tracking-[0.3em]"
            type="text"
            placeholder="ABC123"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
          />
          <button
            className="w-full rounded-xl border border-neutral-900 px-4 py-3 text-sm font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-300"
            type="button"
            onClick={handleJoinGame}
            disabled={!session || loadingAction === "join"}
          >
            {loadingAction === "join" ? "Joining…" : "Join game"}
          </button>
        </section>

        {showLobbyResumeGate ? (
          <section className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Lobby ready</h2>
              <p className="text-sm text-neutral-500">
                Resume your waiting room to see who has joined.
              </p>
            </div>
            <button
              className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white"
              type="button"
              onClick={() => router.push(`/lobby/${activeGame?.id ?? ""}`)}
            >
              Enter lobby
            </button>
          </section>
        ) : null}

        {showPlayResumeGate ? (
          <section className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Game in progress</h2>
              <p className="text-sm text-neutral-500">
                A saved table is already running.
              </p>
            </div>
            {isMember ? (
              <button
                className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white"
                type="button"
                onClick={() => router.push("/play")}
              >
                Back to the table
              </button>
            ) : null}
          </section>
        ) : null}

        {notice ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            {notice}
          </div>
        ) : null}

        <footer className="space-y-1 text-xs text-neutral-500">
          <div>
            Phase 3: Supabase auth + create/join scaffold • Bank-authoritative
            logic coming next
          </div>
          {!hasConfigErrors ? (
            <div className="text-[10px] text-neutral-400">
              Config OK • SITE_URL: {SITE_URL}
            </div>
          ) : null}
        </footer>
      </div>
    </main>
  );
}
