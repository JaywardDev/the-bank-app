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
        const tokenIndex = (index % 8) + 1;
        const isActive = Boolean(player.isCurrent);
        const style: CSSProperties = {
          bottom: 0,
          left: `calc(${index} * var(--token-overlap-step))`,
          zIndex: 30 + index,
          transform: isActive ? "scale(1.5)" : "scale(1)",
          filter: isActive ? "none" : "saturate(0.6)",
          opacity: isActive ? 1 : 0.85,
          transition: "transform 150ms ease, filter 150ms ease, opacity 150ms ease",
        };

        return (
          <img
            key={player.id}
            src={`/assets/token/token-${tokenIndex}.svg`}
            alt={`Player ${player.display_name ?? "Player"}`}
            title={player.display_name ?? "Player"}
            style={style}
            className={`absolute h-[var(--token-size)] w-[var(--token-size)] ${
              player.isCurrent ? "ring-2 ring-emerald-300" : ""
            } ${player.isLastMoved ? "ring-2 ring-amber-300" : ""}`}
            aria-label={player.display_name ?? "Player token"}
          />
        );
      })}
    </div>
  );
}
