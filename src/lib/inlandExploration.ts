export const INLAND_BOARD_WIDTH = 13;
export const INLAND_BOARD_HEIGHT = 9;

export type InlandCell = {
  row: number;
  col: number;
};

export type InlandCellStatus =
  | "UNEXPLORED"
  | "EXPLORED_EMPTY"
  | "DISCOVERED_RESOURCE"
  | "DEVELOPED_SITE";

export type InlandResourceType =
  | "OIL"
  | "DEEP_WELL"
  | "COAL"
  | "TIMBER"
  | "RARE_EARTH"
  | "BRONZE"
  | "GOLD"
  | "EMPTY";
export type InlandResourceCategory = "SELL" | "DEVELOP" | "BONUS" | "NONE";

export type InlandResourceConfig = {
  type: InlandResourceType;
  label: string;
  icon: string;
  category: InlandResourceCategory;
  weight: number;
  sellMultiplier?: number;
  developmentCostMultiplier?: number;
  passiveIncomeMultiplierPerTurn?: number;
  voucherReward?: {
    freeBuildTokens?: number;
    freeUpgradeTokens?: number;
  };
};

export type InlandCellRecord = {
  key: string;
  row: number;
  col: number;
  status: Exclude<InlandCellStatus, "UNEXPLORED">;
  discoveredResourceType: InlandResourceType | null;
  developedSiteType: InlandResourceType | null;
  ownerPlayerId: string | null;
};

const roundInlandMoney = (amount: number) => Math.round(amount);

export const INLAND_RESOURCE_CONFIG: Record<InlandResourceType, InlandResourceConfig> = {
  OIL: {
    type: "OIL",
    label: "Oil Refinery",
    icon: "🛢️",
    category: "DEVELOP",
    weight: 7.5,
    developmentCostMultiplier: 3,
    passiveIncomeMultiplierPerTurn: 0.15,
  },
  DEEP_WELL: {
    type: "DEEP_WELL",
    label: "Water Reservoir",
    icon: "🕳️",
    category: "DEVELOP",
    weight: 7.5,
    developmentCostMultiplier: 2.5,
    passiveIncomeMultiplierPerTurn: 0.1,
  },
  COAL: {
    type: "COAL",
    label: "Power Plant",
    icon: "⚫",
    category: "DEVELOP",
    weight: 7.5,
    developmentCostMultiplier: 3,
    passiveIncomeMultiplierPerTurn: 0.12,
  },
  TIMBER: {
    type: "TIMBER",
    label: "Timber Grove",
    icon: "🪵",
    category: "BONUS",
    weight: 23.5,
    voucherReward: {
      freeBuildTokens: 1,
    },
  },
  RARE_EARTH: {
    type: "RARE_EARTH",
    label: "Rare Earth Cache",
    icon: "🧪",
    category: "BONUS",
    weight: 18,
    voucherReward: {
      freeUpgradeTokens: 1,
    },
  },
  BRONZE: {
    type: "BRONZE",
    label: "Bronze Deposit",
    icon: "🥉",
    category: "SELL",
    weight: 16,
    sellMultiplier: 1.2,
  },
  GOLD: {
    type: "GOLD",
    label: "Gold Vein",
    icon: "🥇",
    category: "SELL",
    weight: 9,
    sellMultiplier: 5,
  },
  EMPTY: {
    type: "EMPTY",
    label: "Empty Land",
    icon: "🟫",
    category: "NONE",
    weight: 11,
  },
};

const RESOURCE_ROLL_TABLE = Object.values(INLAND_RESOURCE_CONFIG);

const validateResourceWeightsTotal = () => {
  const total = RESOURCE_ROLL_TABLE.reduce((sum, resource) => sum + resource.weight, 0);
  if (Math.abs(total - 100) > 0.0001) {
    throw new Error(`Inland resource weights must total 100; received ${total}.`);
  }
};

validateResourceWeightsTotal();

export const getInlandExplorationCost = (goSalary: number) => roundInlandMoney(goSalary * 1);

export const getInlandSellValue = (resourceType: InlandResourceType, goSalary: number) => {
  const multiplier = INLAND_RESOURCE_CONFIG[resourceType].sellMultiplier;
  if (multiplier === undefined) {
    return null;
  }
  return roundInlandMoney(goSalary * multiplier);
};

export const getInlandDevelopmentCost = (
  resourceType: InlandResourceType,
  goSalary: number,
) => {
  const multiplier = INLAND_RESOURCE_CONFIG[resourceType].developmentCostMultiplier;
  if (multiplier === undefined) {
    return null;
  }
  return roundInlandMoney(goSalary * multiplier);
};

export const getInlandBankSalePrice = (
  record: Pick<InlandCellRecord, "status" | "discoveredResourceType" | "developedSiteType">,
  goSalary: number,
) => {
  if (record.status === "DISCOVERED_RESOURCE" && record.discoveredResourceType) {
    return roundInlandMoney(getInlandExplorationCost(goSalary) * 0.7);
  }
  if (record.status === "DEVELOPED_SITE" && record.developedSiteType) {
    const developmentCost = getInlandDevelopmentCost(record.developedSiteType, goSalary);
    if (developmentCost === null) {
      return null;
    }
    return roundInlandMoney(developmentCost * 0.7);
  }
  return null;
};

export const getInlandPassiveIncomePerTurn = (
  resourceType: InlandResourceType,
  goSalary: number,
) => {
  const multiplier = INLAND_RESOURCE_CONFIG[resourceType].passiveIncomeMultiplierPerTurn;
  if (multiplier === undefined) {
    return null;
  }
  return roundInlandMoney(goSalary * multiplier);
};

export const getInlandVoucherReward = (resourceType: InlandResourceType) =>
  INLAND_RESOURCE_CONFIG[resourceType].voucherReward ?? null;

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

const normalizeInlandCellRecord = (entry: unknown): InlandCellRecord | null => {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const row = Number.parseInt(String((entry as { row?: unknown }).row ?? ""), 10);
  const col = Number.parseInt(String((entry as { col?: unknown }).col ?? ""), 10);
  if (!Number.isInteger(row) || !Number.isInteger(col) || !isInlandCellInBounds({ row, col })) {
    return null;
  }

  const key = toInlandCellKey({ row, col });
  const statusRaw = (entry as { status?: unknown }).status;
  const status: InlandCellRecord["status"] =
    statusRaw === "DEVELOPED_SITE" || statusRaw === "DISCOVERED_RESOURCE"
      ? statusRaw
      : "EXPLORED_EMPTY";

  const discoveredResourceType = (entry as { discoveredResourceType?: unknown }).discoveredResourceType;
  const developedSiteType = (entry as { developedSiteType?: unknown }).developedSiteType;

  return {
    key,
    row,
    col,
    status,
    discoveredResourceType:
      typeof discoveredResourceType === "string" && discoveredResourceType in INLAND_RESOURCE_CONFIG
        ? (discoveredResourceType as InlandResourceType)
        : null,
    developedSiteType:
      typeof developedSiteType === "string" && developedSiteType in INLAND_RESOURCE_CONFIG
        ? (developedSiteType as InlandResourceType)
        : null,
    ownerPlayerId:
      typeof (entry as { ownerPlayerId?: unknown }).ownerPlayerId === "string"
        ? ((entry as { ownerPlayerId?: string }).ownerPlayerId ?? null)
        : null,
  };
};

export const normalizeInlandCellRecords = (value: unknown): Map<string, InlandCellRecord> => {
  const byKey = new Map<string, InlandCellRecord>();
  if (!Array.isArray(value)) {
    return byKey;
  }

  for (const entry of value) {
    if (typeof entry === "string") {
      const parsed = parseInlandCellKey(entry);
      if (!parsed || !isInlandCellInBounds(parsed)) {
        continue;
      }
      const key = toInlandCellKey(parsed);
      byKey.set(key, {
        key,
        row: parsed.row,
        col: parsed.col,
        status: "EXPLORED_EMPTY",
        discoveredResourceType: null,
        developedSiteType: null,
        ownerPlayerId: null,
      });
      continue;
    }

    const normalized = normalizeInlandCellRecord(entry);
    if (!normalized) {
      continue;
    }
    byKey.set(normalized.key, normalized);
  }

  return byKey;
};

export const serializeInlandCellRecords = (recordsByKey: Map<string, InlandCellRecord>) => {
  return Array.from(recordsByKey.values())
    .sort((a, b) => (a.row === b.row ? a.col - b.col : a.row - b.row))
    .map((record) => ({
      row: record.row,
      col: record.col,
      status: record.status,
      discoveredResourceType: record.discoveredResourceType,
      developedSiteType: record.developedSiteType,
      ownerPlayerId: record.ownerPlayerId,
    }));
};

export const normalizeInlandExploredCellKeys = (value: unknown): Set<string> => {
  return new Set(Array.from(normalizeInlandCellRecords(value).keys()));
};

export const isBankSellableInlandCell = (record: InlandCellRecord | null | undefined) => {
  if (!record || record.ownerPlayerId) {
    return false;
  }
  if (record.status === "DISCOVERED_RESOURCE") {
    return Boolean(record.discoveredResourceType);
  }
  if (record.status === "DEVELOPED_SITE") {
    return Boolean(record.developedSiteType);
  }
  return false;
};

export const clearInlandOwnershipForPlayer = ({
  recordsByKey,
  playerId,
}: {
  recordsByKey: Map<string, InlandCellRecord>;
  playerId: string;
}) => {
  let didChange = false;
  for (const [key, record] of recordsByKey.entries()) {
    if (record.ownerPlayerId !== playerId) {
      continue;
    }
    recordsByKey.set(key, {
      ...record,
      ownerPlayerId: null,
    });
    didChange = true;
  }
  return didChange;
};

export const canExploreInlandCell = ({
  cell,
  exploredKeys,
  playerExploredKeys,
  ownedTileIndices,
}: {
  cell: InlandCell;
  exploredKeys: Set<string>;
  playerExploredKeys: Set<string>;
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
  if (neighbors.some((neighbor) => playerExploredKeys.has(toInlandCellKey(neighbor)))) {
    return true;
  }

  const ownedTileCells = ownedTileIndices.map((tileIndex) => getTileRowCol(tileIndex));
  return ownedTileCells.some((ownedCell) =>
    neighbors.some((neighbor) => neighbor.row === ownedCell.row && neighbor.col === ownedCell.col),
  );
};

export const rollInlandResourceType = (rng: () => number = Math.random): InlandResourceType => {
  const totalWeight = RESOURCE_ROLL_TABLE.reduce((sum, resource) => sum + resource.weight, 0);
  const rolled = rng() * totalWeight;
  let cursor = 0;
  for (const resource of RESOURCE_ROLL_TABLE) {
    cursor += resource.weight;
    if (rolled <= cursor) {
      return resource.type;
    }
  }
  return RESOURCE_ROLL_TABLE[RESOURCE_ROLL_TABLE.length - 1].type;
};

export const getInlandResourceConfig = (resourceType: InlandResourceType) =>
  INLAND_RESOURCE_CONFIG[resourceType];

export const isInstantSellResource = (resourceType: InlandResourceType) =>
  getInlandResourceConfig(resourceType).category === "SELL";

export const isDevelopableResource = (resourceType: InlandResourceType) =>
  getInlandResourceConfig(resourceType).category === "DEVELOP";

export const isBonusResource = (resourceType: InlandResourceType) =>
  getInlandResourceConfig(resourceType).category === "BONUS";

export const isNoneResource = (resourceType: InlandResourceType) =>
  getInlandResourceConfig(resourceType).category === "NONE";

export const computeInlandPassiveIncomeForPlayer = ({
  recordsByKey,
  playerId,
  goSalary,
}: {
  recordsByKey: Map<string, InlandCellRecord>;
  playerId: string;
  goSalary: number;
}) => {
  const siteCounts: Partial<Record<InlandResourceType, number>> = {};
  let total = 0;

  for (const record of recordsByKey.values()) {
    if (record.status !== "DEVELOPED_SITE") {
      continue;
    }
    if (record.ownerPlayerId !== playerId || !record.developedSiteType) {
      continue;
    }
    const payout = getInlandPassiveIncomePerTurn(record.developedSiteType, goSalary) ?? 0;
    if (payout <= 0) {
      continue;
    }
    total += payout;
    siteCounts[record.developedSiteType] = (siteCounts[record.developedSiteType] ?? 0) + 1;
  }

  const breakdown = Object.entries(siteCounts).map(([resourceType, count]) => {
    const typedResourceType = resourceType as InlandResourceType;
    const passiveIncomePerTurn = getInlandPassiveIncomePerTurn(typedResourceType, goSalary) ?? 0;
    return {
      resourceType: typedResourceType,
      count,
      perSiteIncome: passiveIncomePerTurn,
      subtotal: passiveIncomePerTurn * count,
    };
  });

  return {
    total,
    breakdown,
  };
};

export const computeDevelopedSiteCountsByPlayerAndType = ({
  recordsByKey,
  resourceType,
}: {
  recordsByKey: Map<string, InlandCellRecord>;
  resourceType: InlandResourceType;
}) => {
  const countsByPlayer: Record<string, number> = {};
  for (const record of recordsByKey.values()) {
    if (record.status !== "DEVELOPED_SITE") {
      continue;
    }
    if (record.developedSiteType !== resourceType || !record.ownerPlayerId) {
      continue;
    }
    countsByPlayer[record.ownerPlayerId] =
      (countsByPlayer[record.ownerPlayerId] ?? 0) + 1;
  }
  return countsByPlayer;
};

export const computeOilRailSynergyPayouts = ({
  recordsByKey,
  rentPaid,
  railroadOwnerPlayerId,
}: {
  recordsByKey: Map<string, InlandCellRecord>;
  rentPaid: number;
  railroadOwnerPlayerId: string;
}) => {
  const oilRefineryCountsByPlayer = computeDevelopedSiteCountsByPlayerAndType({
    recordsByKey,
    resourceType: "OIL",
  });
  const totalRefineryCount = Object.values(oilRefineryCountsByPlayer).reduce(
    (sum, count) => sum + count,
    0,
  );
  const oilBonusPool = Math.round(rentPaid * 0.25);
  const perRefineryShare =
    totalRefineryCount > 0 ? Math.round(oilBonusPool / totalRefineryCount) : 0;
  const refineryPayoutsByPlayer: Record<string, number> = {};

  for (const [playerId, refineryCount] of Object.entries(
    oilRefineryCountsByPlayer,
  )) {
    const payout = perRefineryShare * refineryCount;
    if (payout <= 0) {
      continue;
    }
    refineryPayoutsByPlayer[playerId] = payout;
  }

  const railroadOwnerOilRefineryCount =
    oilRefineryCountsByPlayer[railroadOwnerPlayerId] ?? 0;
  const verticalIntegrationBonus =
    railroadOwnerOilRefineryCount > 0 ? Math.floor(rentPaid * 0.25) : 0;

  return {
    oilRefineryCountsByPlayer,
    refineryPayoutsByPlayer,
    verticalIntegrationBonus,
  };
};

export const computeCoalUtilitySynergyPayouts = ({
  recordsByKey,
  rentPaid,
  electricUtilityOwnerPlayerId,
}: {
  recordsByKey: Map<string, InlandCellRecord>;
  rentPaid: number;
  electricUtilityOwnerPlayerId: string;
}) => {
  const coalSiteCountsByPlayer = computeDevelopedSiteCountsByPlayerAndType({
    recordsByKey,
    resourceType: "COAL",
  });
  const totalCoalSiteCount = Object.values(coalSiteCountsByPlayer).reduce(
    (sum, count) => sum + count,
    0,
  );
  const coalBonusPool = Math.round(rentPaid * 0.25);
  const perCoalSiteShare =
    totalCoalSiteCount > 0 ? Math.round(coalBonusPool / totalCoalSiteCount) : 0;
  const coalSitePayoutsByPlayer: Record<string, number> = {};

  for (const [playerId, coalSiteCount] of Object.entries(coalSiteCountsByPlayer)) {
    const payout = perCoalSiteShare * coalSiteCount;
    if (payout <= 0) {
      continue;
    }
    coalSitePayoutsByPlayer[playerId] = payout;
  }

  const electricUtilityOwnerCoalSiteCount =
    coalSiteCountsByPlayer[electricUtilityOwnerPlayerId] ?? 0;
  const verticalIntegrationBonus =
    electricUtilityOwnerCoalSiteCount > 0 ? Math.floor(rentPaid * 0.25) : 0;

  return {
    coalSiteCountsByPlayer,
    coalSitePayoutsByPlayer,
    verticalIntegrationBonus,
  };
};

export const computeWaterUtilitySynergyPayouts = ({
  recordsByKey,
  rentPaid,
  waterUtilityOwnerPlayerId,
}: {
  recordsByKey: Map<string, InlandCellRecord>;
  rentPaid: number;
  waterUtilityOwnerPlayerId: string;
}) => {
  const waterSiteCountsByPlayer = computeDevelopedSiteCountsByPlayerAndType({
    recordsByKey,
    resourceType: "DEEP_WELL",
  });
  const totalWaterSiteCount = Object.values(waterSiteCountsByPlayer).reduce(
    (sum, count) => sum + count,
    0,
  );
  const waterBonusPool = Math.round(rentPaid * 0.25);
  const perWaterSiteShare =
    totalWaterSiteCount > 0 ? Math.round(waterBonusPool / totalWaterSiteCount) : 0;
  const waterSitePayoutsByPlayer: Record<string, number> = {};

  for (const [playerId, waterSiteCount] of Object.entries(
    waterSiteCountsByPlayer,
  )) {
    const payout = perWaterSiteShare * waterSiteCount;
    if (payout <= 0) {
      continue;
    }
    waterSitePayoutsByPlayer[playerId] = payout;
  }

  const waterUtilityOwnerWaterSiteCount =
    waterSiteCountsByPlayer[waterUtilityOwnerPlayerId] ?? 0;
  const verticalIntegrationBonus =
    waterUtilityOwnerWaterSiteCount > 0 ? Math.floor(rentPaid * 0.25) : 0;

  return {
    waterSiteCountsByPlayer,
    waterSitePayoutsByPlayer,
    verticalIntegrationBonus,
  };
};
