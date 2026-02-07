import type { CSSProperties } from "react";

type TokenPlayer = {
  id: string;
  display_name: string | null;
  color: string;
  isCurrent?: boolean;
  isLastMoved?: boolean;
};

type TokenStackProps = {
  players: TokenPlayer[];
};

const getInitials = (name: string | null) => {
  if (!name) return "P";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0]?.slice(0, 2).toUpperCase() ?? "P";
  }
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
};

export default function TokenStack({ players }: TokenStackProps) {
  if (players.length === 0) {
    return null;
  }

  return (
    <div className="relative h-full w-full">
      {players.map((player, index) => {
        const style: CSSProperties & Record<string, string> = {
          backgroundColor: player.color,
          "--token-shift-x": `calc(var(--token-step) * ${index})`,
          "--token-shift-y": `calc(var(--token-step) * ${index})`,
        };

        return (
          <span
            key={player.id}
            style={style}
            title={player.display_name ?? "Player"}
            className={`absolute left-0 top-0 z-30 inline-flex h-[var(--token-size)] w-[var(--token-size)] translate-x-[min(var(--token-shift-x),calc(100%-var(--token-size)))] translate-y-[min(var(--token-shift-y),calc(100%-var(--token-size)))] items-center justify-center overflow-hidden rounded-full border border-black/30 font-bold text-[clamp(6px,100%,11px)] leading-none text-black shadow-[0_3px_6px_rgba(0,0,0,0.35)] ${
              player.isCurrent ? "ring-2 ring-emerald-300" : ""
            } ${player.isLastMoved ? "ring-2 ring-amber-300" : ""}`}
            aria-label={player.display_name ?? "Player token"}
          >
            {getInitials(player.display_name)}
          </span>
        );
      })}
    </div>
  );
}
