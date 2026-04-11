"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getConfigErrors } from "@/lib/env";
import { boardPacks, defaultBoardPackId } from "@/lib/boardPacks";
import { postGameActionRequest } from "@/lib/client/postGameActionRequest";
import { supabaseClient, type SupabaseSession } from "@/lib/supabase/client";
import InfoTooltip from "@/app/components/InfoTooltip";
import CompactOverlayModal from "@/app/components/CompactOverlayModal";
import { compactLandscapeStyles } from "@/app/components/compactLandscape";
import RotateToLandscapeOverlay from "@/components/play-v2/RotateToLandscapeOverlay";

const lastGameKey = "bank.lastGameId";

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
  const [gameMode, setGameMode] = useState<"classic" | "round_mode">("classic");
  const [roundLimit, setRoundLimit] = useState<100 | 150 | 200 | 300>(100);
  const [resumeGames, setResumeGames] = useState<ResumeGame[]>([]);
  const [lastOpenedGameId, setLastOpenedGameId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<"signin" | "join" | "host" | "resume" | null>(
    null,
  );

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
      const payload = {
        action: "CREATE_GAME",
        playerName: playerName.trim(),
        boardPackId,
        gameMode,
        roundLimit: gameMode === "round_mode" ? roundLimit : null,
      };
      const response = await postGameActionRequest({
        payload,
        accessToken: session.access_token,
      });

      if (response.refreshedSession) {
        const refreshedSession = await supabaseClient.getSession();
        setSession(refreshedSession);
      }

      if (!response.ok) {
        const error = response.body as { error?: string } | null;
        throw new Error(error?.error ?? "Unable to create the game.");
      }

      const data = response.body as { gameId?: string } | null;
      if (!data?.gameId) {
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
      const payload = {
        action: "JOIN_GAME",
        joinCode: joinCode.trim(),
        displayName: playerName.trim(),
      };
      const response = await postGameActionRequest({
        payload,
        accessToken: session.access_token,
      });

      if (response.refreshedSession) {
        const refreshedSession = await supabaseClient.getSession();
        setSession(refreshedSession);
      }

      if (!response.ok) {
        const error = response.body as { error?: string } | null;
        if (response.status === 409) {
          throw new Error(
            error?.error ?? "That game has already started. Ask the host to reset.",
          );
        }
        throw new Error(error?.error ?? "Unable to join the game.");
      }

      const data = response.body as {
        gameId?: string;
        join_code?: string | null;
        created_at?: string | null;
        board_pack_id?: string | null;
        status?: string | null;
        created_by?: string | null;
      } | null;

      if (!data?.gameId || !data.join_code) {
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
      game.status === "lobby"
        ? `/lobby/${game.gameId}`
        : `/play-v2/${game.gameId}`;
    router.push(href);
  };

  return (
    <main className={`home-skin bg-[#F6F1E8] ${compactLandscapeStyles.viewport}`}>
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-[url('/icons/home_page.svg')] bg-cover bg-center bg-fixed"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 z-10 bg-neutral-950/15"
        aria-hidden="true"
      />
      <div className={compactLandscapeStyles.container}>
        <header className={`${compactLandscapeStyles.header} flex items-center justify-between gap-3 py-2`}>
          <h1 className="text-lg font-semibold leading-tight text-neutral-900 sm:text-xl">
            The Bank
          </h1>
          {session ? (
            <button
              className="rounded-lg border border-amber-200/80 bg-white/80 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:bg-white disabled:opacity-60"
              type="button"
              onClick={handleSignOut}
              disabled={loadingAction === "signout"}
            >
              {loadingAction === "signout" ? "Signing out…" : "Sign out"}
            </button>
          ) : (
            <button
              className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-neutral-800"
              type="button"
              onClick={() => setActiveModal("signin")}
            >
              Sign in
            </button>
          )}
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

        <section className={`flex min-h-0 flex-1 flex-col justify-between p-4 sm:p-5 ${compactLandscapeStyles.panel}`}>
          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold text-neutral-900 sm:text-2xl">
              {session ? "Choose a table" : "Sign in to play"}
            </h2>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => (session ? setActiveModal("join") : setActiveModal("signin"))}
              className="rounded-xl border border-amber-300/80 bg-white/85 px-4 py-3 text-left shadow-[0_8px_20px_rgba(34,21,10,0.1)] transition hover:bg-white"
            >
              <p className="text-sm font-semibold text-neutral-900">Join table</p>
              <p className="text-xs text-neutral-600">Enter a table code</p>
            </button>
            <button
              type="button"
              onClick={() => (session ? setActiveModal("host") : setActiveModal("signin"))}
              className="rounded-xl border border-neutral-900/70 bg-neutral-900 px-4 py-3 text-left shadow-[0_8px_20px_rgba(20,14,8,0.25)] transition hover:bg-neutral-800"
            >
              <p className="text-sm font-semibold text-white">Host table</p>
              <p className="text-xs text-neutral-200">Create a new table</p>
            </button>
            <button
              type="button"
              onClick={() => (session ? setActiveModal("resume") : setActiveModal("signin"))}
              className="rounded-xl border border-amber-200/80 bg-[#F7F2EA]/90 px-4 py-3 text-left transition hover:bg-[#F3EBDF]"
            >
              <p className="text-sm font-semibold text-neutral-900">Resume tables</p>
              <p className="text-xs text-neutral-600">
                {resumeGames.length > 0 ? `${resumeGames.length} active tables` : "No active tables"}
              </p>
            </button>
            <button
              type="button"
              onClick={() => router.push("/watch")}
              className="rounded-xl border border-amber-200/80 bg-[#F7F2EA]/90 px-4 py-3 text-left transition hover:bg-[#F3EBDF]"
            >
              <p className="text-sm font-semibold text-neutral-900">Watch game</p>
              <p className="text-xs text-neutral-600">Spectator mode</p>
            </button>
          </div>
        </section>

        {notice ? (
          <div className="flex-none rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            {notice}
          </div>
        ) : null}
      </div>

      <CompactOverlayModal
        open={activeModal === "signin"}
        title="Sign in"
        onClose={() => setActiveModal(null)}
      >
        {authLoading ? (
          <p className="text-sm text-neutral-500">Checking session…</p>
        ) : (
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase text-neutral-500">Email</label>
            <input
              className="w-full rounded-xl border border-amber-200/70 bg-[#F4EFE7] px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-500 focus-visible:border-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
              type="email"
              placeholder="you@example.com"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
            />
            <button
              className="w-full rounded-xl bg-gradient-to-b from-neutral-900 to-neutral-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              type="button"
              onClick={handleSendMagicLink}
              disabled={loadingAction === "auth" || hasConfigErrors}
            >
              {loadingAction === "auth" ? "Sending…" : "Send magic link"}
            </button>
          </div>
        )}
      </CompactOverlayModal>

      <CompactOverlayModal open={activeModal === "join"} title="Join table" onClose={() => setActiveModal(null)}>
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase text-neutral-500">Display name</label>
            <input
              className="w-full rounded-xl border border-amber-200/70 bg-[#F4EFE7] px-3 py-2 text-sm text-neutral-900"
              type="text"
              placeholder="Banker Alex"
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase text-neutral-500">Join code</label>
            <input
              className="w-full rounded-xl border border-amber-200/70 bg-[#F4EFE7] px-3 py-2 text-sm uppercase tracking-[0.3em] text-neutral-900"
              type="text"
              placeholder="ABC123"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
            />
          </div>
          <button
            className="w-full rounded-xl border border-amber-300/70 bg-[#F7F2EA]/80 px-4 py-2 text-sm font-semibold text-neutral-800 disabled:opacity-60"
            type="button"
            onClick={handleJoinGame}
            disabled={!session || loadingAction === "join"}
          >
            {loadingAction === "join" ? "Joining…" : "Join table"}
          </button>
        </div>
      </CompactOverlayModal>

      <CompactOverlayModal open={activeModal === "host"} title="Host table" onClose={() => setActiveModal(null)}>
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase text-neutral-500">Display name</label>
            <input
              className="w-full rounded-xl border border-amber-200/70 bg-[#F4EFE7] px-3 py-2 text-sm text-neutral-900"
              type="text"
              placeholder="Banker Alex"
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase text-neutral-500">Game mode</label>
              <select
                className="w-full rounded-xl border border-amber-200/70 bg-[#F4EFE7] px-3 py-2 text-sm text-neutral-900"
                value={gameMode}
                onChange={(event) =>
                  setGameMode(event.target.value === "round_mode" ? "round_mode" : "classic")
                }
              >
                <option value="classic">Classic</option>
                <option value="round_mode">Round Mode</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase text-neutral-500">Board pack</label>
              <select
                className="w-full rounded-xl border border-amber-200/70 bg-[#F4EFE7] px-3 py-2 text-sm text-neutral-900"
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
          </div>
          {gameMode === "round_mode" ? (
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase text-neutral-500">Round limit</label>
              <select
                className="w-full rounded-xl border border-amber-200/70 bg-[#F4EFE7] px-3 py-2 text-sm text-neutral-900"
                value={roundLimit}
                onChange={(event) => setRoundLimit(Number(event.target.value) as 100 | 150 | 200 | 300)}
              >
                <option value={100}>100</option>
                <option value={150}>150</option>
                <option value={200}>200</option>
                <option value={300}>300</option>
              </select>
            </div>
          ) : null}
          {boardPacks.find((pack) => pack.id === boardPackId)?.tooltip ? (
            <div className="flex items-center gap-2 text-xs text-neutral-600">
              <span>Board details</span>
              <InfoTooltip text={boardPacks.find((pack) => pack.id === boardPackId)?.tooltip ?? ""} />
            </div>
          ) : null}
          <button
            className="w-full rounded-xl bg-gradient-to-b from-neutral-900 to-neutral-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            type="button"
            onClick={handleCreateGame}
            disabled={!session || loadingAction === "create"}
          >
            {loadingAction === "create" ? "Creating…" : "Create and host"}
          </button>
        </div>
      </CompactOverlayModal>

      <CompactOverlayModal
        open={activeModal === "resume"}
        title="Resume tables"
        onClose={() => setActiveModal(null)}
      >
        {resumeGames.length === 0 ? (
          <p className="text-sm text-neutral-600">No active tables found for this account.</p>
        ) : (
          <div className="space-y-1.5">
            {resumeGames.map((game) => (
              <button
                key={game.gameId}
                type="button"
                onClick={() => openResumeGame(game)}
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                  lastOpenedGameId === game.gameId
                    ? "border-amber-400 bg-amber-50"
                    : "border-amber-200/70 bg-[#F7F2EA]/80 hover:bg-[#F1E9DD]"
                }`}
              >
                <div className="flex items-center justify-between gap-2 font-semibold text-neutral-900">
                  <span>{game.status === "lobby" ? "Lobby" : "In progress"}</span>
                  <span className="font-mono text-xs tracking-[0.2em]">{game.joinCode}</span>
                </div>
                <div className="text-xs text-neutral-600">
                  {game.displayName ? `Playing as ${game.displayName}` : "Resume table"}
                </div>
              </button>
            ))}
          </div>
        )}
      </CompactOverlayModal>
      <RotateToLandscapeOverlay />
    </main>
  );
}
