export const compactLandscapeStyles = {
  viewport:
    "relative flex h-dvh flex-col overflow-hidden px-3 py-2 sm:px-4 sm:py-3",
  container: "relative z-20 mx-auto flex w-full max-w-7xl min-h-0 flex-1 flex-col gap-3",
  header:
    "flex-none rounded-2xl border border-amber-200/70 bg-[#f8f2e7]/95 px-4 py-3 shadow-[0_10px_24px_rgba(37,25,10,0.16)] backdrop-blur",
  panel:
    "rounded-2xl border border-amber-200/70 bg-[#f8f2e7]/95 shadow-[0_10px_24px_rgba(37,25,10,0.16)]",
} as const;
