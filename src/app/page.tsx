export default function Home() {
  return (
    <main className="min-h-dvh p-6 flex items-center justify-center">
      <div className="w-full max-w-sm space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Monopoly Bank</h1>
          <p className="text-sm text-neutral-600">
            Mobile-first companion app. (No game logic yet.)
          </p>
        </header>

        <div className="rounded-2xl border p-4 space-y-3">
          <button
            className="w-full rounded-xl border px-4 py-3 text-left active:scale-[0.99]"
            type="button"
          >
            <div className="font-medium">Create a Game</div>
            <div className="text-sm text-neutral-600">Start a new table session</div>
          </button>

          <button
            className="w-full rounded-xl border px-4 py-3 text-left active:scale-[0.99]"
            type="button"
          >
            <div className="font-medium">Join a Game</div>
            <div className="text-sm text-neutral-600">Enter a join code</div>
          </button>
        </div>

        <footer className="text-xs text-neutral-500">
          v0.1 • Bank-authoritative architecture planned • Supabase later
        </footer>
      </div>
    </main>
  );
}
