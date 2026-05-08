export type EconomicBoomGameEvent = {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at?: string;
  version: number;
};

export type EconomicBoomRevenueItem = {
  eventId: string;
  boomId: string;
  round: number | null;
  drawNumber: number | null;
  tileIndex: number | null;
  tileName: string;
  ownerPlayerId: string | null;
  ownerName: string;
  payoutAmount: number;
  rentBasis: number | null;
};

export type EconomicBoomSummary = {
  boomId: string;
  round: number;
  eventId: string;
  version: number;
  eligibleTileCount: number | null;
  selectedTileCount: number | null;
  totalPayout: number;
  revenueItems: EconomicBoomRevenueItem[];
};

type MutableBoomSummary = Omit<EconomicBoomSummary, "totalPayout" | "revenueItems"> & {
  revenueItems: EconomicBoomRevenueItem[];
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const asString = (value: unknown) => (typeof value === "string" ? value : null);

const asFiniteNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asInteger = (value: unknown) => {
  const numberValue = asFiniteNumber(value);
  return numberValue === null ? null : Math.floor(numberValue);
};

const compareRevenueItems = (
  left: EconomicBoomRevenueItem,
  right: EconomicBoomRevenueItem,
) => {
  const leftDraw = left.drawNumber ?? Number.MAX_SAFE_INTEGER;
  const rightDraw = right.drawNumber ?? Number.MAX_SAFE_INTEGER;
  if (leftDraw !== rightDraw) {
    return leftDraw - rightDraw;
  }
  const leftTile = left.tileIndex ?? Number.MAX_SAFE_INTEGER;
  const rightTile = right.tileIndex ?? Number.MAX_SAFE_INTEGER;
  if (leftTile !== rightTile) {
    return leftTile - rightTile;
  }
  return left.eventId.localeCompare(right.eventId);
};

export const groupEconomicBoomEvents = (
  events: EconomicBoomGameEvent[],
): EconomicBoomSummary[] => {
  const grouped = new Map<string, MutableBoomSummary>();
  const orphanRevenueByBoomId = new Map<string, EconomicBoomRevenueItem[]>();

  events.forEach((event) => {
    const payload = asRecord(event.payload);
    if (!payload) {
      return;
    }

    if (event.event_type === "ECONOMIC_BOOM_STARTED") {
      const boomId = asString(payload.boom_id);
      const round = asInteger(payload.round);
      if (!boomId || round === null) {
        return;
      }
      const existing = grouped.get(boomId);
      grouped.set(boomId, {
        boomId,
        round,
        eventId: event.id,
        version: event.version,
        eligibleTileCount: asInteger(payload.eligible_tile_count),
        selectedTileCount: asInteger(payload.selected_tile_count),
        revenueItems: existing?.revenueItems ?? orphanRevenueByBoomId.get(boomId) ?? [],
      });
      orphanRevenueByBoomId.delete(boomId);
      return;
    }

    if (event.event_type !== "ECONOMIC_BOOM_REVENUE") {
      return;
    }

    const boomId = asString(payload.boom_id);
    if (!boomId) {
      return;
    }
    const item: EconomicBoomRevenueItem = {
      eventId: event.id,
      boomId,
      round: asInteger(payload.round),
      drawNumber: asInteger(payload.draw_number),
      tileIndex: asInteger(payload.tile_index),
      tileName: asString(payload.tile_name) ?? "Unknown district",
      ownerPlayerId: asString(payload.owner_player_id),
      ownerName: asString(payload.owner_player_name) ?? "Unknown owner",
      payoutAmount: asFiniteNumber(payload.payout_amount) ?? 0,
      rentBasis: asFiniteNumber(payload.rent_basis),
    };

    const summary = grouped.get(boomId);
    if (summary) {
      summary.revenueItems.push(item);
      return;
    }
    const orphanItems = orphanRevenueByBoomId.get(boomId) ?? [];
    orphanItems.push(item);
    orphanRevenueByBoomId.set(boomId, orphanItems);
  });

  return Array.from(grouped.values())
    .map((summary): EconomicBoomSummary => {
      const revenueItems = [...summary.revenueItems].sort(compareRevenueItems);
      return {
        ...summary,
        revenueItems,
        totalPayout: revenueItems.reduce(
          (total, item) => total + item.payoutAmount,
          0,
        ),
      };
    })
    .sort((left, right) => {
      if (right.round !== left.round) {
        return right.round - left.round;
      }
      return right.version - left.version;
    });
};

export const findCurrentRoundEconomicBoomSummary = ({
  events,
  currentRound,
}: {
  events: EconomicBoomGameEvent[];
  currentRound: number | null | undefined;
}) => {
  if (typeof currentRound !== "number" || !Number.isFinite(currentRound)) {
    return null;
  }
  return (
    groupEconomicBoomEvents(events).find(
      (summary) => summary.round === Math.floor(currentRound),
    ) ?? null
  );
};

export const isEconomicBoomSummaryComplete = (summary: EconomicBoomSummary | null) => {
  if (!summary) {
    return false;
  }
  if (summary.selectedTileCount === null) {
    return true;
  }
  return summary.revenueItems.length >= summary.selectedTileCount;
};

export const shouldShowEconomicBoomModal = ({
  summary,
  dismissedBoomIds,
}: {
  summary: EconomicBoomSummary | null;
  dismissedBoomIds: readonly string[];
}) =>
  Boolean(
    summary &&
      isEconomicBoomSummaryComplete(summary) &&
      !dismissedBoomIds.includes(summary.boomId),
  );
