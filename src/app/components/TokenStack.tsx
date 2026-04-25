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
    <div
      className="relative h-full w-full overflow-visible"
      style={{ "--token-overlap-step": "calc(var(--token-size) * 0.6)" } as CSSProperties}
    >
      {players.map((player, index) => {
        const style: CSSProperties = {
          backgroundColor: player.color,
          bottom: 0,
          left: `calc(${index} * var(--token-overlap-step))`,
          zIndex: 30 + index,
        };

        return (
          <span
            key={player.id}
            style={style}
            title={player.display_name ?? "Player"}
            className={`absolute inline-flex h-[var(--token-size)] w-[var(--token-size)] items-center justify-center overflow-hidden rounded-full border border-black/30 font-bold text-[clamp(6px,100%,11px)] leading-none text-black shadow-[0_3px_6px_rgba(0,0,0,0.35)] ${
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
