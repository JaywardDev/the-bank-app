"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageShell from "@/app/components/PageShell";
import { supabaseClient } from "@/lib/supabase/client";

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

type BoardLobbyPageProps = {
  params: {
    gameId: string;
  };
};

export default function BoardLobbyPage({ params }: BoardLobbyPageProps) {
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isConfigured = useMemo(() => supabaseClient.isConfigured(), []);

  const loadPlayers = useCallback(async () => {
    const playerRows = await supabaseClient.fetchFromSupabase<Player[]>(
      `players?select=id,display_name,created_at&game_id=eq.${params.gameId}&order=created_at.asc`,
      { method: "GET" },
    );
    setPlayers(playerRows);
  }, [params.gameId]);

  const loadLobby = useCallback(async () => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const [gameRow] = await supabaseClient.fetchFromSupabase<Game[]>(
        `games?select=id,join_code,created_at&id=eq.${params.gameId}&limit=1`,
        { method: "GET" },
      );

      if (!gameRow) {
        throw new Error("Game not found.");
      }

      setGame(gameRow);
      await loadPlayers();
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Unable to load the lobby.");
      }
    } finally {
      setLoading(false);
    }
  }, [isConfigured, loadPlayers, params.gameId]);

  const refreshPlayers = useCallback(async () => {
    if (!isConfigured) {
      return;
    }

    try {
      await loadPlayers();
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Unable to refresh players.");
      }
    }
  }, [isConfigured, loadPlayers]);

  useEffect(() => {
    void loadLobby();
  }, [loadLobby]);

  useEffect(() => {
    if (!isConfigured) {
      return;
    }

    const realtimeClient = supabaseClient.getRealtimeClient();
    if (!realtimeClient) {
      return;
    }

    const channel = realtimeClient
      .channel(`board-lobby:${params.gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `game_id=eq.${params.gameId}`,
        },
        () => {
          void refreshPlayers();
        },
      )
      .subscribe();

    return () => {
      realtimeClient.removeChannel(channel);
    };
  }, [isConfigured, params.gameId, refreshPlayers]);

  const lobbyStatus = loading
    ? "Syncing lobby…"
    : errorMessage
      ? "Waiting for connection"
      : players.length > 0
        ? "Waiting for the bank to start"
        : "Waiting for players to join";

  return (
    <PageShell
      title="Board Lobby"
      subtitle="Big-screen view for the table before the game begins."
      variant="board"
    >
      {!isConfigured ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-100 p-6 text-amber-900">
          Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to
          enable live lobby updates.
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-lg text-white/70">
          Loading lobby…
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-3xl border border-rose-300/40 bg-rose-500/10 p-6 text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      {game ? (
        <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
                Join code
              </p>
              <span className="text-xs text-white/50">Lobby open</span>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/40 px-6 py-8 text-center">
              <div className="text-sm uppercase tracking-[0.4em] text-white/60">
                Share this code
              </div>
              <div className="mt-3 text-4xl font-semibold tracking-[0.4em] text-white">
                {game.join_code}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-xs uppercase tracking-wide text-white/50">
                  Lobby status
                </p>
                <p className="text-lg font-semibold text-white">
                  {lobbyStatus}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-xs uppercase tracking-wide text-white/50">
                  Players ready
                </p>
                <p className="text-2xl font-semibold text-white">
                  {players.length}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-xs uppercase tracking-wide text-white/50">
                  Game ID
                </p>
                <p className="truncate text-sm font-semibold text-white">
                  {game.id}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
                Players in lobby
              </p>
              <p className="text-sm text-white/60">
                Updates automatically when someone joins or leaves.
              </p>
            </div>
            <ul className="space-y-3 text-lg">
              {players.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-white/20 bg-black/30 px-4 py-6 text-center text-sm text-white/60">
                  No players yet. Have everyone join with the code.
                </li>
              ) : (
                players.map((player, index) => (
                  <li
                    key={player.id}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-3"
                  >
                    <span>{player.display_name ?? "Player"}</span>
                    <span className="text-sm text-white/60">
                      #{index + 1}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}
