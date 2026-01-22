import type { BoardTile } from "@/lib/boardPacks";

type PlayerMarker = {
  id: string;
  display_name: string | null;
  position: number;
};

type BoardMiniMapProps = {
  tiles?: BoardTile[];
  players: PlayerMarker[];
  currentPlayerId?: string | null;
  variant?: "light" | "dark";
};

const fallbackTiles: BoardTile[] = Array.from({ length: 40 }, (_, index) => ({
  index,
  tile_id: `tile-${index}`,
  type: index === 0 ? "START" : "PROPERTY",
  name: `Tile ${index}`,
}));

const getInitials = (name: string | null) => {
  if (!name) {
    return "P";
  }

  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0]?.slice(0, 2).toUpperCase() ?? "P";
  }

  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
};

export default function BoardMiniMap({
  tiles,
  players,
  currentPlayerId,
  variant = "light",
}: BoardMiniMapProps) {
  const boardTiles = tiles && tiles.length > 0 ? tiles : fallbackTiles;
  const playersByTile = players.reduce<Record<number, PlayerMarker[]>>(
    (acc, player) => {
      const position = Number.isFinite(player.position) ? player.position : 0;
      acc[position] = acc[position] ? [...acc[position], player] : [player];
      return acc;
    },
    {},
  );
  const currentPlayer = players.find((player) => player.id === currentPlayerId);
  const currentTile = boardTiles.find(
    (tile) => tile.index === (currentPlayer?.position ?? 0),
  );
  const isDark = variant === "dark";

  return (
    <div className="space-y-3">
      <div
        className={`grid grid-cols-10 gap-1 rounded-2xl border p-3 ${
          isDark
            ? "border-white/10 bg-black/20 text-white/80"
            : "border-neutral-200 bg-white text-neutral-700"
        }`}
      >
        {boardTiles.map((tile) => {
          const tilePlayers = playersByTile[tile.index] ?? [];
          const isCurrentTile = tilePlayers.some(
            (player) => player.id === currentPlayerId,
          );

          return (
            <div
              key={tile.tile_id}
              className={`rounded-lg border px-1.5 py-1 text-[10px] leading-tight ${
                isDark
                  ? "border-white/10 bg-black/30"
                  : "border-neutral-200 bg-neutral-50"
              } ${isCurrentTile ? "ring-2 ring-emerald-400/70" : ""}`}
            >
              <div className="flex items-center justify-between gap-1 font-semibold">
                <span>{tile.index}</span>
                <span className="truncate text-[9px] uppercase text-neutral-400">
                  {tile.type.replaceAll("_", " ")}
                </span>
              </div>
              <div className="truncate text-[10px] font-medium">{tile.name}</div>
              {tilePlayers.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {tilePlayers.map((player) => (
                    <span
                      key={player.id}
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                        isDark
                          ? "bg-white/10 text-white"
                          : "bg-neutral-900 text-white"
                      } ${
                        player.id === currentPlayerId
                          ? "ring-2 ring-emerald-300"
                          : ""
                      }`}
                    >
                      {getInitials(player.display_name)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <p
        className={`text-sm ${
          isDark ? "text-white/70" : "text-neutral-600"
        }`}
      >
        Current tile:{" "}
        <span className="font-semibold">
          {currentTile ? `${currentTile.index} ${currentTile.name}` : "—"}
        </span>
      </p>
    </div>
  );
}
