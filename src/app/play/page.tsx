"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageShell from "../components/PageShell";
import { supabaseClient, type SupabaseSession } from "@/lib/supabase/client";

const lastGameKey = "bank.lastGameId";

type Player = {
  id: string;
  user_id: string;
  display_name: string | null;
  created_at: string | null;
};

type GameState = {
  game_id: string;
  version: number;
  current_player_id: string | null;
  balances: Record<string, number> | null;
  last_roll: number | null;
};

type GameEvent = {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  version: number;
};

export default function PlayPage() {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const isConfigured = useMemo(() => supabaseClient.isConfigured(), []);

  const loadPlayers = useCallback(async (activeGameId: string) => {
    const playerRows = await supabaseClient.fetchFromSupabase<Player[]>(
      `players?select=id,user_id,display_name,created_at&game_id=eq.${activeGameId}&order=created_at.asc`,
      { method: "GET" },
    );
    setPlayers(playerRows);
  }, []);

  const loadGameState = useCallback(async (activeGameId: string) => {
    const [stateRow] = await supabaseClient.fetchFromSupabase<GameState[]>(
      `game_state?select=game_id,version,current_player_id,balances,last_roll&game_id=eq.${activeGameId}&limit=1`,
      { method: "GET" },
    );
    setGameState(stateRow ?? null);
  }, []);

  const loadEvents = useCallback(async (activeGameId: string) => {
    const eventRows = await supabaseClient.fetchFromSupabase<GameEvent[]>(
      `game_events?select=id,event_type,payload,created_at,version&game_id=eq.${activeGameId}&order=version.desc&limit=10`,
      { method: "GET" },
    );
    setEvents(eventRows);
  }, []);

  const loadGameData = useCallback(
    async (activeGameId: string) => {
      await Promise.all([
        loadPlayers(activeGameId),
        loadGameState(activeGameId),
        loadEvents(activeGameId),
      ]);
    },
    [loadEvents, loadGameState, loadPlayers],
  );

  useEffect(() => {
    let isMounted = true;

    const hydrate = async () => {
      if (!isConfigured) {
        setLoading(false);
        return;
      }

      const currentSession = await supabaseClient.getSession();
      if (!isMounted) {
        return;
      }

      setSession(currentSession);

      if (typeof window !== "undefined") {
        const storedGameId = window.localStorage.getItem(lastGameKey);
        setGameId(storedGameId);

        if (storedGameId) {
          try {
            await loadGameData(storedGameId);
          } catch (error) {
            if (error instanceof Error) {
              setNotice(error.message);
            } else {
              setNotice("Unable to load game data.");
            }
          }
        }
      }

      setLoading(false);
    };

    hydrate();

    return () => {
      isMounted = false;
    };
  }, [isConfigured, loadGameData]);

  useEffect(() => {
    if (!isConfigured || !gameId) {
      return;
    }

    const realtimeClient = supabaseClient.getRealtimeClient();
    if (!realtimeClient) {
      return;
    }

    const channel = realtimeClient
      .channel(`player-console:${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          void loadPlayers(gameId);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_state",
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          void loadGameState(gameId);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_events",
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          void loadEvents(gameId);
        },
      )
      .subscribe();

    return () => {
      realtimeClient.removeChannel(channel);
    };
  }, [gameId, isConfigured, loadEvents, loadGameState, loadPlayers]);

  const currentPlayer = players.find(
    (player) => player.id === gameState?.current_player_id,
  );
  const isMyTurn = Boolean(
    session && currentPlayer && currentPlayer.user_id === session.user.id,
  );

  const handleBankAction = useCallback(
    async (action: "ROLL_DICE" | "END_TURN") => {
      if (!session || !gameId) {
        setNotice("Join a game lobby first.");
        return;
      }

      setActionLoading(action);
      setNotice(null);

      try {
        const response = await fetch("/api/bank/action", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            gameId,
            action,
          }),
        });

        if (!response.ok) {
          const error = (await response.json()) as { error?: string };
          throw new Error(error.error ?? "Unable to perform action.");
        }
      } catch (error) {
        if (error instanceof Error) {
          setNotice(error.message);
        } else {
          setNotice("Unable to perform action.");
        }
      } finally {
        setActionLoading(null);
      }
    },
    [gameId, session],
  );

  return (
    <PageShell
      title="Player Console"
      subtitle="Mobile-first tools for wallet, assets, actions, and trades."
    >
      {!isConfigured ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to see
          live game updates.
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border bg-white p-5 text-sm text-neutral-500">
          Loading player console…
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          {notice}
        </div>
      ) : null}

      <section className="space-y-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Current turn
              </p>
              <p className="text-2xl font-semibold text-neutral-900">
                {currentPlayer?.display_name ?? "Waiting for start"}
              </p>
              <p className="text-sm text-neutral-500">
                Last roll: {gameState?.last_roll ?? "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-neutral-400">
                Turn status
              </p>
              <p className="text-sm font-semibold text-neutral-700">
                {isMyTurn ? "Your turn" : "Stand by"}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
              type="button"
              onClick={() => void handleBankAction("ROLL_DICE")}
              disabled={!isMyTurn || actionLoading === "ROLL_DICE"}
            >
              {actionLoading === "ROLL_DICE" ? "Rolling…" : "Roll Dice"}
            </button>
            <button
              className="rounded-2xl border px-4 py-3 text-sm font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
              type="button"
              onClick={() => void handleBankAction("END_TURN")}
              disabled={!isMyTurn || actionLoading === "END_TURN"}
            >
              {actionLoading === "END_TURN" ? "Ending…" : "End Turn"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Balance
              </p>
              <p className="text-3xl font-semibold text-neutral-900">
                ${
                  gameState?.balances && currentPlayer
                    ? gameState.balances[currentPlayer.id] ?? 0
                    : 0
                }
              </p>
              <p className="text-sm text-neutral-500">Available to spend</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-neutral-400">
                Net worth
              </p>
              <p className="text-lg font-semibold text-neutral-700">$26,200</p>
            </div>
          </div>
          <div className="grid gap-3 rounded-2xl border border-dashed border-neutral-200 p-3 text-sm text-neutral-600">
            <div className="flex items-center justify-between">
              <span>Recent income</span>
              <span className="font-medium text-emerald-600">+$1,800</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Recent expenses</span>
              <span className="font-medium text-rose-500">-$950</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Cash flow target</span>
              <span className="font-medium text-neutral-700">$15,000</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Event log
            </p>
            <p className="text-sm text-neutral-600">
              Recent table actions synced live from the bank.
            </p>
          </div>
          <div className="space-y-3 text-sm">
            {events.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-200 p-4 text-center text-neutral-500">
                Events will appear once the game starts.
              </div>
            ) : (
              events.map((event) => {
                const payload = event.payload as
                  | { roll?: number; to_player_name?: string }
                  | null;

                return (
                  <div
                    key={event.id}
                    className="rounded-2xl border px-4 py-3"
                  >
                    <div className="flex items-center justify-between text-xs uppercase text-neutral-400">
                      <span>{event.event_type.replaceAll("_", " ")}</span>
                      <span>v{event.version}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-neutral-800">
                      {event.event_type === "ROLL_DICE" &&
                      typeof payload?.roll === "number"
                        ? `Rolled ${payload.roll}`
                        : event.event_type === "END_TURN" &&
                            payload?.to_player_name
                          ? `Turn → ${payload.to_player_name}`
                          : event.event_type === "START_GAME"
                            ? "Game started"
                            : "Update received"}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Properties
            </p>
            <p className="text-lg font-semibold text-neutral-900">
              Current holdings
            </p>
          </div>
          <div className="space-y-3">
            {[
              {
                name: "Pacific Avenue",
                group: "Green Set",
                rent: "$1,200",
              },
              { name: "Reading Railroad", group: "Railroads", rent: "$200" },
              { name: "Electric Company", group: "Utilities", rent: "$150" },
            ].map((property) => (
              <div
                key={property.name}
                className="rounded-2xl border px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-neutral-900">
                      {property.name}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {property.group}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase text-neutral-400">Rent</p>
                    <p className="text-sm font-semibold text-neutral-700">
                      {property.rent}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Actions
          </p>
          <span className="text-xs text-neutral-400">Coming soon</span>
        </div>
        <div className="grid gap-3">
          {[
            "Pay Bank",
            "Receive from Bank",
            "Mortgage / Unmortgage",
            "Build / Sell Houses",
          ].map((label) => (
            <button
              key={label}
              className="w-full rounded-2xl border bg-white px-4 py-4 text-left text-base font-semibold text-neutral-800 shadow-sm opacity-50 cursor-not-allowed"
              type="button"
              disabled
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Transaction History
          </p>
          <p className="text-sm text-neutral-600">
            Latest activity synced to your wallet.
          </p>
        </div>
        <div className="space-y-3 text-sm">
          {[
            {
              title: "Rent paid to Indigo",
              amount: "-$1,200",
              detail: "Pacific Avenue",
            },
            {
              title: "Dividend from bank",
              amount: "+$200",
              detail: "Community payout",
            },
            {
              title: "Utility charge",
              amount: "-$150",
              detail: "Electric Company",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="flex items-center justify-between rounded-2xl border px-4 py-3"
            >
              <div>
                <p className="font-medium text-neutral-800">{item.title}</p>
                <p className="text-xs text-neutral-500">{item.detail}</p>
              </div>
              <p
                className={`text-sm font-semibold ${
                  item.amount.startsWith("-")
                    ? "text-rose-500"
                    : "text-emerald-600"
                }`}
              >
                {item.amount}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Trade Confirm
          </p>
          <p className="text-sm text-neutral-600">
            Verify the terms before both sides accept.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            className="rounded-2xl border px-4 py-3 text-sm font-semibold text-neutral-700"
            type="button"
          >
            Propose Trade
          </button>
          <button
            className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white"
            type="button"
          >
            Accept Trade
          </button>
        </div>
      </section>
    </PageShell>
  );
}
