"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const lastGameKey = "bank.lastGameId";

export default function LobbyRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedGameId = window.localStorage.getItem(lastGameKey);
    if (storedGameId) {
      router.replace(`/lobby/${storedGameId}`);
      return;
    }

    router.replace("/");
  }, [router]);

  return (
    <main className="min-h-dvh bg-neutral-50 p-6 flex items-start justify-center">
      <div className="w-full max-w-md rounded-2xl border bg-white p-5 text-sm text-neutral-500">
        Loading lobby…
      </div>
    </main>
  );
}
