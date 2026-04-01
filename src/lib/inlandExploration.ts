export const INLAND_BOARD_WIDTH = 13;
export const INLAND_BOARD_HEIGHT = 9;
export const INLAND_EXPLORATION_COST = 150;

export type InlandCell = {
  row: number;
  col: number;
};

export const toInlandCellKey = ({ row, col }: InlandCell) => `${row}:${col}`;

export const parseInlandCellKey = (key: string): InlandCell | null => {
  const [rowRaw, colRaw] = key.split(":");
  const row = Number.parseInt(rowRaw ?? "", 10);
  const col = Number.parseInt(colRaw ?? "", 10);
  if (!Number.isInteger(row) || !Number.isInteger(col)) {
    return null;
  }
  return { row, col };
};

export const isInlandCellInBounds = ({ row, col }: InlandCell) =>
  row >= 1 && row <= INLAND_BOARD_HEIGHT - 2 && col >= 1 && col <= INLAND_BOARD_WIDTH - 2;

const getTileRowCol = (tileIndex: number) => {
  const topRowEndIndex = 2 * INLAND_BOARD_WIDTH + INLAND_BOARD_HEIGHT - 3;

  if (tileIndex === 0) return { row: INLAND_BOARD_HEIGHT - 1, col: INLAND_BOARD_WIDTH - 1 };
  if (tileIndex >= 1 && tileIndex <= INLAND_BOARD_WIDTH - 1) {
    return { row: INLAND_BOARD_HEIGHT - 1, col: INLAND_BOARD_WIDTH - 1 - tileIndex };
  }
  if (tileIndex >= INLAND_BOARD_WIDTH && tileIndex <= INLAND_BOARD_WIDTH + INLAND_BOARD_HEIGHT - 3) {
    return { row: INLAND_BOARD_HEIGHT - 1 - (tileIndex - (INLAND_BOARD_WIDTH - 1)), col: 0 };
  }
  if (tileIndex >= INLAND_BOARD_WIDTH + INLAND_BOARD_HEIGHT - 2 && tileIndex <= topRowEndIndex) {
    return { row: 0, col: tileIndex - (INLAND_BOARD_WIDTH + INLAND_BOARD_HEIGHT - 2) };
  }
  return { row: tileIndex - topRowEndIndex, col: INLAND_BOARD_WIDTH - 1 };
};

const orthogonalNeighborOffsets = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
] as const;

const getOrthogonalNeighbors = ({ row, col }: InlandCell) =>
  orthogonalNeighborOffsets.map((offset) => ({
    row: row + offset.row,
    col: col + offset.col,
  }));

export const normalizeInlandExploredCellKeys = (value: unknown): Set<string> => {
  if (!Array.isArray(value)) {
    return new Set();
  }
  const keys = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    const parsed = parseInlandCellKey(entry);
    if (!parsed || !isInlandCellInBounds(parsed)) {
      continue;
    }
    keys.add(toInlandCellKey(parsed));
  }
  return keys;
};

export const canExploreInlandCell = ({
  cell,
  exploredKeys,
  ownedTileIndices,
}: {
  cell: InlandCell;
  exploredKeys: Set<string>;
  ownedTileIndices: number[];
}) => {
  if (!isInlandCellInBounds(cell)) {
    return false;
  }

  const targetKey = toInlandCellKey(cell);
  if (exploredKeys.has(targetKey)) {
    return false;
  }

  if (ownedTileIndices.length === 0) {
    return false;
  }

  const neighbors = getOrthogonalNeighbors(cell);
  if (neighbors.some((neighbor) => exploredKeys.has(toInlandCellKey(neighbor)))) {
    return true;
  }

  const ownedTileCells = ownedTileIndices.map((tileIndex) => getTileRowCol(tileIndex));
  return ownedTileCells.some((ownedCell) =>
    neighbors.some((neighbor) => neighbor.row === ownedCell.row && neighbor.col === ownedCell.col),
  );
};
