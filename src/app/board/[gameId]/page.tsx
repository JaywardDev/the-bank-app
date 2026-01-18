"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageShell from "@/app/components/PageShell";
import { getBoardPackById } from "@/lib/boardPacks";
import { supabaseClient, type SupabaseSession } from "@/lib/supabase/client";

type Player = {
  id: string;
  user_id: string;
  display_name: string | null;
  created_at: string | null;
};

type GameMeta = {
  id: string;
  board_pack_id: string | null;
};

type GameState = {
  game_id: string;
  version: number;
  current_player_id: string | null;
  last_roll: number | null;
};

type GameEvent = {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  version: number;
};

type BoardDisplayPageProps = {
  params: {
    gameId: string;
  };
};

export default function BoardDisplayPage({ params }: BoardDisplayPageProps) {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [gameMeta, setGameMeta] = useState<GameMeta | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isConfigured = useMemo(() => supabaseClient.isConfigured(), []);

  const loadPlayers = useCallback(
    async (accessToken?: string) => {
      const playerRows = await supabaseClient.fetchFromSupabase<Player[]>(
        `players?select=id,user_id,display_name,created_at&game_id=eq.${params.gameId}&order=created_at.asc`,
        { method: "GET" },
        accessToken,
      );
      setPlayers(playerRows);
    },
    [params.gameId],
  );

  const loadGameMeta = useCallback(
    async (accessToken?: string) => {
      const [game] = await supabaseClient.fetchFromSupabase<GameMeta[]>(
        `games?select=id,board_pack_id&id=eq.${params.gameId}&limit=1`,
        { method: "GET" },
        accessToken,
      );
      setGameMeta(game ?? null);
    },
    [params.gameId],
  );

  const loadGameState = useCallback(
    async (accessToken?: string) => {
      const [stateRow] = await supabaseClient.fetchFromSupabase<GameState[]>(
        `game_state?select=game_id,version,current_player_id,last_roll&game_id=eq.${params.gameId}&limit=1`,
        { method: "GET" },
        accessToken,
      );
      setGameState(stateRow ?? null);
    },
    [params.gameId],
  );

  const loadEvents = useCallback(
    async (accessToken?: string) => {
      const eventRows = await supabaseClient.fetchFromSupabase<GameEvent[]>(
        `game_events?select=id,event_type,payload,created_at,version&game_id=eq.${params.gameId}&order=version.desc&limit=12`,
        { method: "GET" },
        accessToken,
      );
      setEvents(eventRows);
    },
    [params.gameId],
  );

  const loadBoardData = useCallback(async () => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const currentSession = await supabaseClient.getSession();
      setSession(currentSession);

      await Promise.all([
        loadGameMeta(currentSession?.access_token),
        loadPlayers(currentSession?.access_token),
        loadGameState(currentSession?.access_token),
        loadEvents(currentSession?.access_token),
      ]);
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Unable to load board data.");
      }
    } finally {
      setLoading(false);
    }
  }, [isConfigured, loadEvents, loadGameMeta, loadGameState, loadPlayers]);

  useEffect(() => {
    void loadBoardData();
  }, [loadBoardData]);

  useEffect(() => {
    if (!isConfigured) {
      return;
    }

    const realtimeClient = supabaseClient.getRealtimeClient();
    if (!realtimeClient) {
      return;
    }

    const channel = realtimeClient
      .channel(`board-display:${params.gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `game_id=eq.${params.gameId}`,
        },
        () => {
          void loadPlayers(session?.access_token);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_state",
          filter: `game_id=eq.${params.gameId}`,
        },
        () => {
          void loadGameState(session?.access_token);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_events",
          filter: `game_id=eq.${params.gameId}`,
        },
        () => {
          void loadEvents(session?.access_token);
        },
      )
      .subscribe();

    return () => {
      realtimeClient.removeChannel(channel);
    };
  }, [
    isConfigured,
    loadEvents,
    loadGameState,
    loadPlayers,
    params.gameId,
    session?.access_token,
  ]);

  const currentPlayer = players.find(
    (player) => player.user_id === gameState?.current_player_id,
  );
  const boardPack = getBoardPackById(gameMeta?.board_pack_id);

  return (
    <PageShell
      title="Board Display"
      subtitle="Read-only, large-screen projection of the live table."
      variant="board"
    >
      {!isConfigured ? (
        <div className="rounded-3xl border border-amber-200/30 bg-amber-500/10 p-6 text-amber-100">
          Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to
          enable live board updates.
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-lg text-white/70">
          Loading board…
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-3xl border border-rose-300/40 bg-rose-500/10 p-6 text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
                Board map
              </p>
              <p className="text-xs text-white/50">
                Board pack: {boardPack?.displayName ?? "Unknown"}
              </p>
            </div>
            <span className="text-xs text-white/50">Projection only</span>
          </div>
          <div className="flex h-[320px] items-center justify-center rounded-3xl border border-dashed border-white/20 bg-black/30 text-center text-sm text-white/60 md:h-[420px]">
            Board map placeholder (properties, tokens, and auctions)
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: "Bank balance", value: "$205,000" },
              { label: "Cash in circulation", value: "$74,300" },
              { label: "Properties owned", value: "16 / 28" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <p className="text-xs uppercase tracking-wide text-white/50">
                  {stat.label}
                </p>
                <p className="text-2xl font-semibold text-white">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
                Current turn
              </p>
              <p className="text-3xl font-semibold">
                {currentPlayer?.display_name ?? "Waiting for start"}
              </p>
              <p className="text-sm text-white/70">
                Last roll: {gameState?.last_roll ?? "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-3">
              <p className="text-xs uppercase tracking-wide text-white/50">
                Active phase
              </p>
              <p className="text-lg font-semibold">
                Rolling + trade confirmation
              </p>
              <p className="text-sm text-white/60">Next: TBD</p>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
              Turn order
            </p>
            <ol className="space-y-3 text-lg">
              {players.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-white/20 bg-black/30 px-4 py-6 text-center text-sm text-white/60">
                  No players yet.
                </li>
              ) : (
                players.map((player, index) => (
                  <li
                    key={player.id}
                    className={`flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3 ${
                      player.id === currentPlayer?.id
                        ? "bg-white/10"
                        : "bg-black/20"
                    }`}
                  >
                    <span>{player.display_name ?? "Player"}</span>
                    <span className="text-sm text-white/60">#{index + 1}</span>
                  </li>
                ))
              )}
            </ol>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
              Event log
            </p>
            <span className="text-xs text-white/50">Read-only feed</span>
          </div>
          <ul className="space-y-3 text-base">
            {events.length === 0 ? (
              <li className="rounded-2xl border border-dashed border-white/20 bg-black/30 px-4 py-5 text-center text-xs text-white/50">
                Events will appear once the game starts.
              </li>
            ) : (
              events.map((event) => (
                <li
                  key={event.id}
                  className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3"
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                    <span>{event.event_type.replaceAll("_", " ")}</span>
                    <span>v{event.version}</span>
                  </div>
                  <p className="mt-2 text-sm text-white/80">
                    Event details placeholder
                  </p>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
            Economy summary
          </p>
          <div className="space-y-4">
            {[
              {
                label: "Bank balance",
                value: "$205,000",
                note: "Placeholder until live metrics",
              },
              {
                label: "Cash in circulation",
                value: "$74,300",
                note: "Placeholder",
              },
              {
                label: "Trades pending",
                value: "3",
                note: "Placeholder",
              },
              {
                label: "Auction pressure",
                value: "Moderate",
                note: "Placeholder",
              },
            ].map((metric) => (
              <div
                key={metric.label}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <p className="text-xs uppercase tracking-wide text-white/50">
                  {metric.label}
                </p>
                <p className="text-2xl font-semibold text-white">
                  {metric.value}
                </p>
                <p className="text-sm text-white/60">{metric.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
