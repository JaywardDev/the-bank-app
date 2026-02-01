import type { BoardTile } from "@/lib/boardPacks";
import HousesDots from "@/app/components/HousesDots";
import { getMutedGroupTintClass } from "@/lib/boardTileStyles";

type PlayerMarker = {
  id: string;
  display_name: string | null;
  position: number;
};

type OwnershipByTile = Record<
  number,
  { owner_player_id: string; houses?: number | null }
>;

type BoardMiniMapProps = {
  tiles?: BoardTile[];
  players: PlayerMarker[];
  currentPlayerId?: string | null;
  lastMovedPlayerId?: string | null;
  lastMovedTileIndex?: number | null;
  variant?: "light" | "dark";
  size?: "compact" | "default" | "large";
  ownershipByTile?: OwnershipByTile;
  showOwnership?: boolean;
  selectedTileIndex?: number | null;
  onTileClick?: (tileIndex: number) => void;
};

type OwnershipColor = {
  border: string;
  inset: string;
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

const ownershipPalette: OwnershipColor[] = [
  { border: "rgba(37, 99, 235, 0.9)", inset: "rgba(37, 99, 235, 0.28)" },
  { border: "rgba(220, 38, 38, 0.9)", inset: "rgba(220, 38, 38, 0.26)" },
  { border: "rgba(5, 150, 105, 0.9)", inset: "rgba(5, 150, 105, 0.25)" },
  { border: "rgba(124, 58, 237, 0.9)", inset: "rgba(124, 58, 237, 0.26)" },
  { border: "rgba(217, 119, 6, 0.9)", inset: "rgba(217, 119, 6, 0.24)" },
  { border: "rgba(8, 145, 178, 0.9)", inset: "rgba(8, 145, 178, 0.24)" },
];

export default function BoardMiniMap({
  tiles,
  players,
  currentPlayerId,
  lastMovedPlayerId,
  lastMovedTileIndex,
  variant = "light",
  size = "default",
  ownershipByTile,
  showOwnership = false,
  selectedTileIndex,
  onTileClick,
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
  const ownershipColorsByPlayer = players.reduce<Record<string, OwnershipColor>>(
    (acc, player, index) => {
      acc[player.id] = ownershipPalette[index % ownershipPalette.length];
      return acc;
    },
    {},
  );
  const currentPlayer = players.find((player) => player.id === currentPlayerId);
  const currentTile = boardTiles.find(
    (tile) => tile.index === (currentPlayer?.position ?? 0),
  );
  const isDark = variant === "dark";
  const sizing = {
    grid:
      size === "large"
        ? "grid-cols-10 gap-2 p-4 md:p-5"
        : size === "compact"
          ? "grid-cols-10 gap-0.5 p-2"
          : "grid-cols-10 gap-1.5 p-3",
    tile:
      size === "large"
        ? "rounded-2xl px-2.5 py-2.5 text-xs md:text-sm"
        : size === "compact"
          ? "rounded-lg px-1 py-1 text-[9px]"
          : "rounded-xl px-2 py-2 text-[11px]",
    heading:
      size === "large"
        ? "text-xs md:text-sm"
        : size === "compact"
          ? "text-[8px]"
          : "text-[10px]",
    name:
      size === "large"
        ? "text-xs md:text-sm"
        : size === "compact"
          ? "text-[9px]"
          : "text-[10px]",
    marker:
      size === "large"
        ? "px-2 py-1 text-xs"
        : size === "compact"
          ? "px-1 py-0.5 text-[9px]"
          : "px-1.5 py-0.5 text-[10px]",
  };

  const getShortName = (name: string) => {
    const trimmed = name.trim();
    if (trimmed.length <= 14) {
      return trimmed;
    }
    return `${trimmed.slice(0, 12)}…`;
  };
  const isInteractive = Boolean(onTileClick);

  return (
    <div className="space-y-3">
      <div
        className={`grid ${sizing.grid} rounded-2xl border ${
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
          const isLastMovedTile = lastMovedTileIndex === tile.index;
          const isLastMovedPlayerHere = tilePlayers.some(
            (player) => player.id === lastMovedPlayerId,
          );
          const ownerId = ownershipByTile?.[tile.index]?.owner_player_id;
          const houses = ownershipByTile?.[tile.index]?.houses ?? 0;
          const ownershipColor =
            showOwnership && ownerId ? ownershipColorsByPlayer[ownerId] : undefined;
          const ownershipStyle = ownershipColor
            ? {
                borderColor: ownershipColor.border,
                boxShadow: `inset 0 0 0 2px ${ownershipColor.inset}`,
              }
            : undefined;
          const isSelectedTile = selectedTileIndex === tile.index;
          const interactiveClassName = isInteractive
            ? `${
                isDark
                  ? "cursor-pointer hover:border-white/30 hover:bg-white/10"
                  : "cursor-pointer hover:border-neutral-300 hover:bg-white"
              } transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400/60 focus-visible:outline-offset-2`
            : "";

          const mutedGroupTintClass = getMutedGroupTintClass(tile);

          return (
            <div
              key={tile.tile_id}
              style={ownershipStyle}
              className={`border leading-tight ${sizing.tile} ${
                isDark
                  ? "border-white/10 bg-black/30"
                  : "border-neutral-200 bg-neutral-50"
              } ${
                isCurrentTile ? "ring-2 ring-emerald-400/70" : ""
              } ${
                isLastMovedTile
                  ? "ring-2 ring-amber-300/80 animate-[pulse_1.2s_ease-in-out_3]"
                  : ""
              } ${
                isSelectedTile
                  ? "outline outline-2 outline-indigo-300/70 outline-offset-2"
                  : ""
              } ${interactiveClassName}`}
              role={isInteractive ? "button" : undefined}
              tabIndex={isInteractive ? 0 : undefined}
              onClick={() => onTileClick?.(tile.index)}
              onKeyDown={(event) => {
                if (!isInteractive) {
                  return;
                }
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onTileClick?.(tile.index);
                }
              }}
            >
              <div className="relative">
                {mutedGroupTintClass ? (
                  <div
                    className={`pointer-events-none absolute left-0 top-0 h-1.5 w-full ${mutedGroupTintClass}`}
                  />
                ) : null}
                <div
                  className={`flex items-center justify-between gap-1 font-semibold ${sizing.heading}`}
                >
                  <span>{tile.index}</span>
                  <span
                    className={`truncate text-[10px] uppercase ${
                      isDark ? "text-white/50" : "text-neutral-400"
                    }`}
                  >
                    {getShortName(tile.name)}
                  </span>
                </div>
                <div className={`truncate font-medium ${sizing.name}`}>
                  {tile.name}
                </div>
              </div>
              {houses > 0 ? (
                <div className="mt-1 flex justify-end">
                  <HousesDots houses={houses} size="sm" />
                </div>
              ) : null}
              {tilePlayers.length > 0 ? (
                <div className="mt-2 flex flex-col gap-1">
                  {tilePlayers.map((player) => (
                    <div
                      key={player.id}
                      className={`flex items-center gap-1.5 rounded-full ${sizing.marker} font-semibold ${
                        isDark
                          ? "bg-white/10 text-white"
                          : "bg-neutral-900 text-white"
                      } ${
                        player.id === currentPlayerId
                          ? "ring-2 ring-emerald-300"
                          : ""
                      } ${
                        player.id === lastMovedPlayerId
                          ? "ring-2 ring-amber-300/80"
                          : ""
                      } ${isLastMovedPlayerHere ? "shadow-[0_0_0_2px_rgba(251,191,36,0.35)]" : ""}`}
                    >
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/40 text-[10px] uppercase">
                        {getInitials(player.display_name)}
                      </span>
                      <span className="truncate text-[10px] font-medium">
                        {player.display_name ?? "Player"}
                      </span>
                    </div>
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
