"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseClient, type SupabaseSession } from "@/lib/supabase/client";

const lastGameKey = "bank.lastGameId";

type Game = {
  id: string;
  join_code: string;
  created_at: string | null;
};

type Player = {
  id: string;
  display_name: string | null;
  created_at: string | null;
};

const createJoinCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const segments = Array.from({ length: 6 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)],
  );
  return segments.join("");
};

export default function Home() {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const isConfigured = useMemo(() => supabaseClient.isConfigured(), []);
  const magicLinkRedirectTo = useMemo(() => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

    if (process.env.NODE_ENV === "production") {
      return siteUrl ?? "";
    }

    return siteUrl ?? "http://localhost:3000";
  }, []);

  useEffect(() => {
    console.debug("Magic link redirectTo:", magicLinkRedirectTo);
  }, [magicLinkRedirectTo]);

  const loadLobby = useCallback(
    async (gameId: string, accessToken: string) => {
      const game = await supabaseClient.fetchFromSupabase<Game[]>(
        `games?select=id,join_code,created_at&id=eq.${gameId}&limit=1`,
        { method: "GET" },
        accessToken,
      );

      if (!game[0]) {
        throw new Error("Game not found.");
      }

      const playerRows = await supabaseClient.fetchFromSupabase<Player[]>(
        `players?select=id,display_name,created_at&game_id=eq.${gameId}&order=created_at.asc`,
        { method: "GET" },
        accessToken,
      );

      setActiveGame(game[0]);
      setPlayers(playerRows);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(lastGameKey, gameId);
      }
    },
    [],
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

  const handleSendMagicLink = async () => {
    if (!authEmail) {
      setNotice("Enter your email to receive a magic link.");
      return;
    }

    setLoadingAction("auth");
    setNotice(null);

    try {
      if (!magicLinkRedirectTo) {
        setNotice(
          "Missing NEXT_PUBLIC_SITE_URL for magic link redirect in production.",
        );
        return;
      }

      console.log(`Magic link redirect_to = ${magicLinkRedirectTo}`);
      await supabaseClient.signInWithOtp(authEmail, magicLinkRedirectTo);
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

    await supabaseClient.signOut(session.access_token);
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
      const joinCodeValue = createJoinCode();
      const [game] = await supabaseClient.fetchFromSupabase<Game[]>(
        "games?select=id,join_code,created_at",
        {
          method: "POST",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            join_code: joinCodeValue,
            created_by: session.user.id,
          }),
        },
        session.access_token,
      );

      if (!game) {
        throw new Error("Unable to create the game.");
      }

      await supabaseClient.fetchFromSupabase<Player[]>(
        "players?select=id,display_name,created_at",
        {
          method: "POST",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            game_id: game.id,
            user_id: session.user.id,
            display_name: playerName.trim(),
          }),
        },
        session.access_token,
      );

      await loadLobby(game.id, session.access_token);
      setNotice("Game created. Share the code to invite others.");
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
      const [game] = await supabaseClient.fetchFromSupabase<Game[]>(
        `games?select=id,join_code,created_at&join_code=eq.${joinCode
          .trim()
          .toUpperCase()}&limit=1`,
        { method: "GET" },
        session.access_token,
      );

      if (!game) {
        throw new Error("No game found for that code.");
      }

      await supabaseClient.fetchFromSupabase<Player[]>(
        "players?select=id,display_name,created_at",
        {
          method: "POST",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            game_id: game.id,
            user_id: session.user.id,
            display_name: playerName.trim(),
          }),
        },
        session.access_token,
      );

      await loadLobby(game.id, session.access_token);
      setNotice("You are in the lobby. Waiting for the host.");
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

  const handleLeaveLobby = () => {
    setActiveGame(null);
    setPlayers([]);

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(lastGameKey);
    }
  };

  return (
    <main className="min-h-dvh bg-neutral-50 p-6 flex items-start justify-center">
      <div className="w-full max-w-md space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-neutral-900">The Bank</h1>
          <p className="text-sm text-neutral-600">
            Mobile-first companion for managing wallet, assets, and trades.
          </p>
        </header>

        {!isConfigured ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to
            begin.
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
                disabled={loadingAction === "auth"}
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

        {activeGame ? (
          <section className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Game lobby</h2>
                <p className="text-sm text-neutral-500">
                  Waiting for the board screen to start the session.
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
        ) : null}

        {notice ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            {notice}
          </div>
        ) : null}

        <footer className="text-xs text-neutral-500">
          Phase 3: Supabase auth + create/join scaffold • Bank-authoritative
          logic coming next
        </footer>
      </div>
    </main>
  );
}
