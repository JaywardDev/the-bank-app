import HousesDots from "@/app/components/HousesDots";
import TokenStack from "@/app/components/TokenStack";
import type { BoardTile } from "@/lib/boardPacks";
import { getTileBandColor } from "@/lib/boardTileStyles";

type BoardPlayer = {
  id: string;
  display_name: string | null;
  position: number;
};

type OwnershipByTile = Record<
  number,
  {
    owner_player_id: string;
    collateral_loan_id: string | null;
    purchase_mortgage_id: string | null;
    houses: number;
  }
>;

type BoardTrackProps = {
  tiles?: BoardTile[];
  players: BoardPlayer[];
  ownershipByTile: OwnershipByTile;
  playerColorsById: Record<string, string>;
  currentPlayerId?: string | null;
  lastMovedPlayerId?: string | null;
  lastMovedTileIndex?: number | null;
};

const fallbackTiles: BoardTile[] = Array.from({ length: 40 }, (_, index) => ({
  index,
  tile_id: `tile-${index}`,
  type: index === 0 ? "START" : "PROPERTY",
  name: `Tile ${index}`,
}));

const shortName = (name: string) => (name.length > 14 ? `${name.slice(0, 12)}…` : name);

const getTypeIcon = (tile: BoardTile) => {
  if (tile.type === "RAIL") return "🚂";
  if (tile.type === "UTILITY") return "⚡";
  if (tile.type === "CHANCE") return "?";
  if (tile.type === "COMMUNITY_CHEST") return "☰";
  if (tile.type === "TAX") return "$";
  return null;
};

const getRowCol = (tileIndex: number) => {
  // Classic perimeter mapping for indices 0..39 (GO at bottom-right):
  // 0: bottom-right corner
  // 1..9: bottom edge moving right -> left
  // 10: bottom-left corner
  // 11..19: left edge moving bottom -> top
  // 20: top-left corner
  // 21..29: top edge moving left -> right
  // 30: top-right corner
  // 31..39: right edge moving top -> bottom
  if (tileIndex === 0) return { row: 10, col: 10 };
  if (tileIndex >= 1 && tileIndex <= 9) return { row: 10, col: 10 - tileIndex };
  if (tileIndex === 10) return { row: 10, col: 0 };
  if (tileIndex >= 11 && tileIndex <= 19) return { row: 20 - tileIndex, col: 0 };
  if (tileIndex === 20) return { row: 0, col: 0 };
  if (tileIndex >= 21 && tileIndex <= 29) return { row: 0, col: tileIndex - 20 };
  if (tileIndex === 30) return { row: 0, col: 10 };
  return { row: tileIndex - 30, col: 10 };
};

export default function BoardTrack({
  tiles,
  players,
  ownershipByTile,
  playerColorsById,
  currentPlayerId,
  lastMovedPlayerId,
  lastMovedTileIndex,
}: BoardTrackProps) {
  const boardTiles = tiles && tiles.length > 0 ? tiles : fallbackTiles;
  const playersByTile = players.reduce<Record<number, BoardPlayer[]>>((acc, player) => {
    acc[player.position] = acc[player.position] ? [...acc[player.position], player] : [player];
    return acc;
  }, {});

  return (
    <div className="relative h-full w-full rounded-3xl border border-white/20 bg-[#f4f0dd] p-3 shadow-2xl">
      <div className="grid h-full w-full grid-cols-11 grid-rows-11 gap-1.5 rounded-2xl bg-[#ddd6bd] p-1.5">
        {boardTiles.map((tile) => {
          const position = getRowCol(tile.index);
          const ownership = ownershipByTile[tile.index];
          const ownerColor = ownership?.owner_player_id
            ? playerColorsById[ownership.owner_player_id] ?? "#e5e7eb"
            : null;
          const tilePlayers = playersByTile[tile.index] ?? [];
          const isCorner = tile.index % 10 === 0;
          const typeIcon = getTypeIcon(tile);

          return (
            <article
              key={tile.tile_id}
              className={`relative overflow-hidden border border-neutral-700/20 bg-[#faf8ed] text-neutral-800 ${
                isCorner ? "rounded-lg" : "rounded-md"
              } ${lastMovedTileIndex === tile.index ? "ring-2 ring-amber-400" : ""}`}
              style={{
                gridRowStart: position.row + 1,
                gridColumnStart: position.col + 1,
              }}
            >
              <div className="h-1.5 w-full" style={{ backgroundColor: getTileBandColor(tile) }} />
              <div className="p-1">
                <div className="flex items-start justify-between gap-1">
                  <p className="text-[10px] font-bold leading-none">{tile.index}</p>
                  {typeIcon ? <span className="text-[10px] leading-none">{typeIcon}</span> : null}
                </div>
                <p className="mt-0.5 text-[9px] font-semibold leading-tight">{shortName(tile.name)}</p>

                {ownership ? (
                  <span
                    className="mt-1 inline-block rounded-full border px-1.5 py-0.5 text-[8px] font-semibold"
                    style={{ borderColor: ownerColor ?? "#9ca3af", backgroundColor: `${ownerColor ?? "#9ca3af"}33` }}
                  >
                    Owned
                  </span>
                ) : null}

                {ownership?.houses ? (
                  <div className="mt-1">
                    <HousesDots houses={ownership.houses} size="sm" />
                  </div>
                ) : null}

                <div className="mt-1">
                  <TokenStack
                    compact
                    players={tilePlayers.map((player) => ({
                      id: player.id,
                      display_name: player.display_name,
                      color: playerColorsById[player.id] ?? "#93c5fd",
                      isCurrent: player.id === currentPlayerId,
                      isLastMoved: player.id === lastMovedPlayerId,
                    }))}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
