"use client";

export default function RotateToLandscapeOverlay() {
  return (
    <section className="play-v2-rotate-overlay fixed inset-0 z-[1000] hidden items-center justify-center bg-neutral-950/95 p-6 text-center text-white">
      <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-neutral-900/90 p-6 shadow-2xl">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="mx-auto mb-4 h-10 w-10 text-white/80"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="7" y="2" width="10" height="20" rx="2.5" />
          <path d="M5 9 2.5 12 5 15" />
          <path d="M19 9 21.5 12 19 15" />
        </svg>
        <h2 className="text-xl font-semibold">Rotate your phone</h2>
        <p className="mt-2 text-sm text-white/75">This game plays best in landscape.</p>
        <p className="mt-3 text-xs text-white/55">If it doesn’t rotate, turn off rotation lock.</p>
      </div>

      <style jsx>{`
        @media (orientation: portrait) {
          .play-v2-rotate-overlay {
            display: flex;
          }
        }

        @media (orientation: landscape) {
          .play-v2-rotate-overlay {
            display: none;
          }
        }
      `}</style>
    </section>
  );
}
