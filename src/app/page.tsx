"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getConfigErrors } from "@/lib/env";
import { boardPacks, defaultBoardPackId } from "@/lib/boardPacks";
import { supabaseClient, type SupabaseSession } from "@/lib/supabase/client";
import InfoTooltip from "@/app/components/InfoTooltip";

const lastGameKey = "bank.lastGameId";

type Game = {
  id: string;
  join_code: string;
  created_at: string | null;
  board_pack_id: string | null;
  status: string | null;
  created_by: string | null;
};

type ResumeGameRow = {
  game_id: string;
  display_name: string | null;
  games: Game | Game[] | null;
  game_state:
    | {
        version: number;
        current_player_id: string | null;
        updated_at: string | null;
      }
    | Array<{
        version: number;
        current_player_id: string | null;
        updated_at: string | null;
      }>
    | null;
};

type ResumeGame = {
  gameId: string;
  status: "lobby" | "in_progress";
  joinCode: string;
  displayName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export default function Home() {
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [boardPackId, setBoardPackId] = useState(defaultBoardPackId);
  const [resumeGames, setResumeGames] = useState<ResumeGame[]>([]);
  const [lastOpenedGameId, setLastOpenedGameId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const isConfigured = useMemo(() => supabaseClient.isConfigured(), []);
  const configErrors = useMemo(() => getConfigErrors(), []);
  const hasConfigErrors = configErrors.length > 0;

  const loadResumeGames = useCallback(async (currentSession: SupabaseSession) => {
    const rows = await supabaseClient.fetchFromSupabase<ResumeGameRow[]>(
      `players?select=game_id,display_name,games!inner(id,join_code,status,created_at,created_by),game_state(version,current_player_id,updated_at)&user_id=eq.${currentSession.user.id}&games.status=in.(lobby,in_progress)`,
      { method: "GET" },
      currentSession.access_token,
    );

    const mapped = rows
      .map<ResumeGame | null>((row) => {
        const game = Array.isArray(row.games) ? row.games[0] : row.games;
        if (!game || (game.status !== "lobby" && game.status !== "in_progress")) {
          return null;
        }

        const state = Array.isArray(row.game_state)
          ? row.game_state[0]
          : row.game_state;

        return {
          gameId: row.game_id,
          status: game.status,
          joinCode: game.join_code,
          displayName: row.display_name,
          createdAt: game.created_at,
          updatedAt: state?.updated_at ?? null,
        };
      })
      .filter((row): row is ResumeGame => Boolean(row));

    mapped.sort((a, b) => {
      const left = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
      const right = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
      return right - left;
    });

    setResumeGames(mapped);
  }, []);

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

      if (typeof window !== "undefined") {
        setLastOpenedGameId(window.localStorage.getItem(lastGameKey));
      }

      if (currentSession) {
        await loadResumeGames(currentSession);
      }
    };

    hydrateSession();

    return () => {
      isMounted = false;
    };
  }, [isConfigured, loadResumeGames]);

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
    setResumeGames([]);
    setLastOpenedGameId(null);

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

      if (typeof window !== "undefined") {
        window.localStorage.setItem(lastGameKey, data.gameId);
        setLastOpenedGameId(data.gameId);
      }

      await loadResumeGames(session);
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
      };

      if (!data.gameId || !data.join_code) {
        throw new Error("Unable to join the game.");
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(lastGameKey, data.gameId);
        setLastOpenedGameId(data.gameId);
      }

      await loadResumeGames(session);

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

  const openResumeGame = (game: ResumeGame) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(lastGameKey, game.gameId);
      setLastOpenedGameId(game.gameId);
    }

    const href =
      game.status === "lobby" ? `/lobby/${game.gameId}` : `/play/${game.gameId}`;
    router.push(href);
  };

  return (
    <main className="relative min-h-dvh bg-[#F6F1E8] p-6 flex items-start justify-center">
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-[url('/icons/home_page.svg')] bg-cover bg-center bg-fixed"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 z-10 bg-neutral-950/15"
        aria-hidden="true"
      />
      <div className="relative z-20 w-full max-w-md space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-neutral-900">The Bank</h1>
            <p className="text-sm text-neutral-600">
              A high-stakes table game of deals, risks, and fortune.
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

        {!session ? (
          <div className="space-y-4">
            <section className="space-y-3 rounded-2xl border border-amber-100/70 bg-[#FBFAF7] p-4 shadow-[0_10px_24px_rgba(34,21,10,0.12)]">
              <div className="space-y-1">
                <h2 className="text-base font-semibold">Sign in</h2>
                <p className="text-sm text-neutral-500">
                  Confirm your seat at the table.
                </p>
              </div>

              {authLoading ? (
                <p className="text-sm text-neutral-500">Checking session…</p>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase text-neutral-500">
                    Email
                  </label>
                  <input
                    className="w-full rounded-xl border border-amber-200/70 bg-[#F4EFE7] px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-500 focus-visible:border-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
                    type="email"
                    placeholder="you@example.com"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                  />
                  <p className="text-xs text-neutral-500">
                    We&apos;ll send a confirmation link to your email.
                  </p>
                  <button
                    className="w-full rounded-xl bg-gradient-to-b from-neutral-900 to-neutral-800 px-4 py-2 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_8px_18px_rgba(29,20,12,0.35)] transition active:translate-y-0.5 active:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_10px_rgba(29,20,12,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FBFAF7] disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={handleSendMagicLink}
                    disabled={loadingAction === "auth" || hasConfigErrors}
                  >
                    {loadingAction === "auth" ? "Sending…" : "Confirm email"}
                  </button>
                </div>
              )}
            </section>

            <section className="space-y-2 rounded-2xl border border-amber-200/80 bg-[#F7F2EA]/90 p-4 shadow-[0_8px_18px_rgba(34,21,10,0.1)]">
              <button
                className="w-full rounded-xl border border-amber-300/70 bg-[#F7F2EA] px-4 py-2 text-sm font-semibold text-neutral-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition hover:bg-[#F1E9DD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
                type="button"
                onClick={() => router.push("/watch")}
              >
                Watch Game
              </button>
              <p className="text-xs text-neutral-600">
                Display the projection board on another device using a join code.
              </p>
            </section>
          </div>
        ) : null}

        {session ? (
          <>
            <section className="space-y-3 rounded-2xl border border-amber-100/70 bg-[#FBFAF7] p-4 shadow-[0_10px_24px_rgba(34,21,10,0.12)]">
              <h2 className="text-base font-semibold">Player</h2>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase text-neutral-500">
                  Display name
                </label>
                <input
                  className="w-full rounded-xl border border-amber-200/70 bg-[#F4EFE7] px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-500 focus-visible:border-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
                  type="text"
                  placeholder="Banker Alex"
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                />
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border border-amber-100/70 bg-[#FBFAF7] p-4 shadow-[0_10px_24px_rgba(34,21,10,0.12)]">
              <h2 className="text-base font-semibold">Host a table</h2>
              <p className="text-sm text-neutral-500">
                Start a table and share the code with players.
              </p>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase text-neutral-500">
                  Board pack
                </label>
                <select
                  className="w-full rounded-xl border border-amber-200/70 bg-[#F4EFE7] px-3 py-2 text-sm text-neutral-900 focus-visible:border-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
                  value={boardPackId}
                  onChange={(event) => setBoardPackId(event.target.value)}
                >
                  {boardPacks.map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {pack.displayName}{pack.tooltip ? " ℹ️" : ""}
                    </option>
                  ))}
                </select>
                {boardPacks.find((pack) => pack.id === boardPackId)?.tooltip ? (
                  <div className="flex items-center gap-2 text-xs text-neutral-600">
                    <span>Board details</span>
                    <InfoTooltip
                      text={
                        boardPacks.find((pack) => pack.id === boardPackId)?.tooltip ?? ""
                      }
                    />
                  </div>
                ) : null}
              </div>
              <button
                className="w-full rounded-xl bg-gradient-to-b from-neutral-900 to-neutral-800 px-4 py-3 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_22px_rgba(29,20,12,0.35)] transition active:translate-y-0.5 active:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_5px_12px_rgba(29,20,12,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FBFAF7] disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={handleCreateGame}
                disabled={!session || loadingAction === "create"}
              >
                {loadingAction === "create" ? "Creating…" : "Host table"}
              </button>
            </section>

            <section className="space-y-3 rounded-2xl border border-amber-100/70 bg-[#FBFAF7] p-4 shadow-[0_10px_24px_rgba(34,21,10,0.12)]">
              <h2 className="text-base font-semibold">Join a table</h2>
              <p className="text-sm text-neutral-500">
                Enter the code from the host to join their lobby.
              </p>
              <input
                className="w-full rounded-xl border border-amber-200/70 bg-[#F4EFE7] px-3 py-2 text-sm uppercase tracking-[0.3em] text-neutral-900 placeholder:text-neutral-500 focus-visible:border-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
                type="text"
                placeholder="ABC123"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
              />
              <button
                className="w-full rounded-xl border border-amber-300/70 bg-[#F7F2EA]/80 px-4 py-3 text-sm font-semibold text-neutral-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition hover:bg-[#F1E9DD] active:translate-y-0.5 active:shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 disabled:cursor-not-allowed disabled:border-amber-200/60 disabled:text-neutral-400 disabled:opacity-70"
                type="button"
                onClick={handleJoinGame}
                disabled={!session || loadingAction === "join"}
              >
                {loadingAction === "join" ? "Joining…" : "Join table"}
              </button>
            </section>
          </>
        ) : null}

        {session && resumeGames.length > 0 ? (
          <section className="space-y-3 rounded-2xl border border-amber-100/70 bg-[#FBFAF7] p-4 shadow-[0_10px_24px_rgba(34,21,10,0.12)]">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Resume tables</h2>
              <p className="text-sm text-neutral-500">
                Active games you are currently part of.
              </p>
            </div>
            <div className="space-y-2">
              {resumeGames.map((game) => (
                <button
                  key={game.gameId}
                  type="button"
                  onClick={() => openResumeGame(game)}
                  className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 ${
                    lastOpenedGameId === game.gameId
                      ? "border-amber-400 bg-amber-50"
                      : "border-amber-200/70 bg-[#F7F2EA]/80 hover:bg-[#F1E9DD]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 font-semibold text-neutral-900">
                    <span>{game.status === "lobby" ? "Lobby" : "In progress"}</span>
                    <span className="font-mono text-xs tracking-[0.2em]">{game.joinCode}</span>
                  </div>
                  <div className="mt-1 text-xs text-neutral-600">
                    {game.displayName ? `Playing as ${game.displayName}` : "Resume table"}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {notice ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            {notice}
          </div>
        ) : null}

      </div>
    </main>
  );
}
