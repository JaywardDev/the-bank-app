"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import RotateToLandscapeOverlay from "@/components/play-v2/RotateToLandscapeOverlay";

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
    <main className="relative flex h-dvh flex-col overflow-hidden bg-neutral-50 p-4 sm:p-6">
      <div className="mx-auto flex h-full w-full max-w-5xl items-center justify-center rounded-3xl border border-neutral-200/80 bg-white/90 p-5 text-sm text-neutral-500 shadow-sm sm:p-8">
        Loading lobby…
      </div>
      <RotateToLandscapeOverlay />
    </main>
  );
}
