"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function WatchPage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedCode = joinCode.trim().toUpperCase();
    if (!normalizedCode) {
      setNotice("Enter a game join code to watch the board.");
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const response = await fetch("/api/board/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ joinCode: normalizedCode }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(
            "We couldn't find a watchable game with that code. Check the code and try again.",
          );
        }
        throw new Error("We couldn't open that game right now. Please try again.");
      }

      const data = (await response.json()) as { gameId?: string };
      if (!data.gameId) {
        throw new Error("We couldn't open that game right now. Please try again.");
      }

      router.push(`/board/${data.gameId}`);
    } catch (error) {
      if (error instanceof Error) {
        setNotice(error.message);
      } else {
        setNotice("We couldn't open that game right now. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-dvh bg-[#F6F1E8] p-6 flex items-start justify-center">
      <div className="relative z-20 w-full max-w-md space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-neutral-900">Watch Game</h1>
          <p className="text-sm text-neutral-600">
            Enter a join code to open the live read-only board.
          </p>
        </header>

        <section className="space-y-3 rounded-2xl border border-amber-100/70 bg-[#FBFAF7] p-4 shadow-[0_10px_24px_rgba(34,21,10,0.12)]">
          <form className="space-y-3" onSubmit={handleSubmit}>
            <input
              className="w-full rounded-xl border border-amber-200/70 bg-[#F4EFE7] px-3 py-2 text-sm uppercase tracking-[0.3em] text-neutral-900 placeholder:text-neutral-500 focus-visible:border-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
              type="text"
              placeholder="ABC123"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
            />
            <button
              className="w-full rounded-xl bg-gradient-to-b from-neutral-900 to-neutral-800 px-4 py-3 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_22px_rgba(29,20,12,0.35)] transition active:translate-y-0.5 active:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_5px_12px_rgba(29,20,12,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FBFAF7] disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={loading}
            >
              {loading ? "Opening board…" : "Watch board"}
            </button>
          </form>
        </section>

        {notice ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            {notice}
          </div>
        ) : null}

        <Link className="inline-flex text-sm text-neutral-700 underline" href="/">
          Back to home
        </Link>
      </div>
    </main>
  );
}
