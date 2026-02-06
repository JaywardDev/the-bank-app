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
  compact?: boolean;
  stacked?: boolean;
};

const getInitials = (name: string | null) => {
  if (!name) return "P";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0]?.slice(0, 2).toUpperCase() ?? "P";
  }
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
};

export default function TokenStack({
  players,
  compact = false,
  stacked = false,
}: TokenStackProps) {
  if (players.length === 0) {
    return null;
  }

  const dotSizeClass = compact ? "h-7 w-7 text-[11px]" : "h-8 w-8 text-xs";
  const containerClass = stacked
    ? "flex flex-col items-start gap-0.5"
    : "flex flex-wrap items-center gap-1";

  return (
    <div className={containerClass}>
      {players.map((player) => {
        const style: CSSProperties = {
          backgroundColor: player.color,
        };

        return (
          <span
            key={player.id}
            style={style}
            title={player.display_name ?? "Player"}
            className={`inline-flex ${dotSizeClass} items-center justify-center rounded-full border border-black/30 font-bold text-black shadow-[0_3px_6px_rgba(0,0,0,0.35)] ${
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
