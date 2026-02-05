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
};

const getInitials = (name: string | null) => {
  if (!name) return "P";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0]?.slice(0, 2).toUpperCase() ?? "P";
  }
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
};

export default function TokenStack({ players, compact = false }: TokenStackProps) {
  if (players.length === 0) {
    return null;
  }

  const dotSizeClass = compact ? "h-5 w-5 text-[9px]" : "h-6 w-6 text-[10px]";

  return (
    <div className="flex flex-wrap items-center gap-1">
      {players.map((player) => {
        const style: CSSProperties = {
          backgroundColor: player.color,
        };

        return (
          <span
            key={player.id}
            style={style}
            title={player.display_name ?? "Player"}
            className={`inline-flex ${dotSizeClass} items-center justify-center rounded-full font-semibold text-black shadow ${
              player.isCurrent ? "ring-2 ring-emerald-300" : ""
            } ${player.isLastMoved ? "ring-2 ring-amber-300" : ""}`}
          >
            {getInitials(player.display_name)}
          </span>
        );
      })}
    </div>
  );
}
