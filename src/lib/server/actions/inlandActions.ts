import { NextResponse } from "next/server";
import { DEFAULT_BOARD_PACK_ECONOMY, type BoardPackEconomy } from "@/lib/boardPacks";
import {
  canExploreInlandCell,
  getInlandBankSalePrice,
  getInlandDevelopmentCost,
  getInlandExplorationCost,
  getInlandSellValue,
  getInlandVoucherReward,
  isBankSellableInlandCell,
  isBonusResource,
  isDevelopableResource,
  isInstantSellResource,
  normalizeInlandCellRecords,
  rollInlandResourceType,
  serializeInlandCellRecords,
  toInlandCellKey,
} from "@/lib/inlandExploration";

type InlandActionRequest = {
  action?: string;
  interiorCell?: { row?: unknown; col?: unknown };
};

type GameStateRow = {
  pending_action: unknown;
  inland_explored_cells: unknown[] | null;
  balances: Record<string, number> | null;
  rules: Record<string, unknown> | null;
};

type PlayerRow = {
  id: string;
  display_name: string | null;
  free_build_tokens: number;
  free_upgrade_tokens: number;
};

type SupabaseUser = {
  id: string;
};

type OwnershipByTile = Record<number, { owner_player_id: string | null }>;

type HandleInlandActionParams = {
  body: InlandActionRequest;
  boardPackEconomy: BoardPackEconomy;
  gameState: GameStateRow;
  gameId: string;
  currentVersion: number;
  currentUserPlayer: PlayerRow;
  user: SupabaseUser;
  fetchFromSupabaseWithService: <T>(path: string, options: RequestInit) => Promise<T | null>;
  emitGameEvents: (
    gameId: string,
    startVersion: number,
    events: Array<{ event_type: string; payload: Record<string, unknown> }>,
    actorUserId: string,
  ) => Promise<void>;
  loadOwnershipByTile: (gameId: string) => Promise<OwnershipByTile>;
  maybeUnlockCommunicationUtility: (params: {
    gameState: GameStateRow;
    ownershipByTile: OwnershipByTile;
    events: Array<{ event_type: string; payload: Record<string, unknown> }>;
  }) => Record<string, unknown> | null;
};

export const handleInlandAction = async ({
  body,
  boardPackEconomy,
  gameState,
  gameId,
  currentVersion,
  currentUserPlayer,
  user,
  fetchFromSupabaseWithService,
  emitGameEvents,
  loadOwnershipByTile,
  maybeUnlockCommunicationUtility,
}: HandleInlandActionParams): Promise<NextResponse | null> => {
  if (body.action === "EXPLORE_INTERIOR") {
    if (gameState.pending_action) {
      return NextResponse.json(
        { error: "Resolve the current pending action before exploring inland." },
        { status: 409 },
      );
    }
    const interiorCell = body.interiorCell;
    const row =
      interiorCell && typeof interiorCell.row === "number"
        ? interiorCell.row
        : Number.NaN;
    const col =
      interiorCell && typeof interiorCell.col === "number"
        ? interiorCell.col
        : Number.NaN;
    if (!Number.isInteger(row) || !Number.isInteger(col)) {
      return NextResponse.json(
        { error: "A valid interiorCell is required." },
        { status: 400 },
      );
    }

    const ownershipByTile = await loadOwnershipByTile(gameId);
    const ownedTileIndices = Object.entries(ownershipByTile)
      .filter(([, ownership]) => ownership.owner_player_id === currentUserPlayer.id)
      .map(([tileIndex]) => Number(tileIndex))
      .filter((tileIndex) => Number.isInteger(tileIndex));
    if (ownedTileIndices.length === 0) {
      return NextResponse.json(
        { error: "You must own at least one property to explore inland." },
        { status: 409 },
      );
    }

    const exploredCellsByKey = normalizeInlandCellRecords(gameState.inland_explored_cells);
    const exploredKeys = new Set(Array.from(exploredCellsByKey.keys()));
    const playerExploredKeys = new Set(
      Array.from(exploredCellsByKey.values())
        .filter((record) => record.ownerPlayerId === currentUserPlayer.id)
        .map((record) => record.key),
    );
    const targetCell = { row, col };
    if (
      !canExploreInlandCell({
        cell: targetCell,
        exploredKeys,
        playerExploredKeys,
        ownedTileIndices,
      })
    ) {
      return NextResponse.json(
        { error: "This forest tile is not currently explorable." },
        { status: 409 },
      );
    }

    const goSalary = boardPackEconomy.passGoAmount ?? DEFAULT_BOARD_PACK_ECONOMY.passGoAmount ?? 0;
    const explorationCost = getInlandExplorationCost(goSalary);
    const balances = gameState.balances ?? {};
    const currentCash = balances[currentUserPlayer.id] ?? 0;
    if (currentCash < explorationCost) {
      return NextResponse.json(
        { error: "Insufficient cash to explore this tile." },
        { status: 409 },
      );
    }

    const finalVersion = currentVersion + 2;
    const targetKey = toInlandCellKey(targetCell);
    const discoveredResourceType = rollInlandResourceType();
    exploredCellsByKey.set(targetKey, {
      key: targetKey,
      row,
      col,
      status: "DISCOVERED_RESOURCE",
      discoveredResourceType,
      developedSiteType: null,
      ownerPlayerId: currentUserPlayer.id,
    });
    const nextExplored = serializeInlandCellRecords(exploredCellsByKey);
    const [updatedState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
      `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          version: finalVersion,
          balances: {
            ...balances,
            [currentUserPlayer.id]: currentCash - explorationCost,
          },
          inland_explored_cells: nextExplored,
          updated_at: new Date().toISOString(),
        }),
      },
    )) ?? [];
    if (!updatedState) {
      return NextResponse.json(
        { error: "Version mismatch." },
        { status: 409 },
      );
    }

    await emitGameEvents(
      gameId,
      currentVersion + 1,
      [
        {
          event_type: "CASH_DEBIT",
          payload: {
            player_id: currentUserPlayer.id,
            amount: explorationCost,
            reason: "RESOURCE_EXPLORATION",
            source_event_type: "INTERIOR_EXPLORED",
          },
        },
        {
          event_type: "INTERIOR_EXPLORED",
          payload: {
            player_id: currentUserPlayer.id,
            player_name: currentUserPlayer.display_name,
            row,
            col,
            cost: explorationCost,
            resource_type: discoveredResourceType,
          },
        },
      ],
      user.id,
    );

    return NextResponse.json({ gameState: updatedState });
  }

  if (
    body.action === "SELL_INTERIOR_RESOURCE" ||
    body.action === "DEVELOP_INTERIOR_SITE" ||
    body.action === "DEFER_INTERIOR_RESOURCE_DECISION"
  ) {
    const interiorCell = body.interiorCell;
    const row =
      interiorCell && typeof interiorCell.row === "number" ? interiorCell.row : Number.NaN;
    const col =
      interiorCell && typeof interiorCell.col === "number" ? interiorCell.col : Number.NaN;
    if (!Number.isInteger(row) || !Number.isInteger(col)) {
      return NextResponse.json({ error: "A valid interiorCell is required." }, { status: 400 });
    }

    const key = toInlandCellKey({ row, col });
    const inlandCells = normalizeInlandCellRecords(gameState.inland_explored_cells);
    const targetCell = inlandCells.get(key);
    if (!targetCell || targetCell.status !== "DISCOVERED_RESOURCE" || !targetCell.discoveredResourceType) {
      return NextResponse.json(
        { error: "No discovered inland resource is awaiting decision on this cell." },
        { status: 409 },
      );
    }
    if (targetCell.ownerPlayerId !== currentUserPlayer.id) {
      return NextResponse.json(
        { error: "Only the discovering player can decide this inland resource." },
        { status: 409 },
      );
    }

    const goSalary = boardPackEconomy.passGoAmount ?? DEFAULT_BOARD_PACK_ECONOMY.passGoAmount ?? 0;
    const balances = gameState.balances ?? {};
    const currentCash = balances[currentUserPlayer.id] ?? 0;
    const nowIso = new Date().toISOString();

    if (body.action === "DEFER_INTERIOR_RESOURCE_DECISION") {
      const events = [
        {
          event_type: "INTERIOR_RESOURCE_DECISION_DEFERRED" as const,
          payload: {
            player_id: currentUserPlayer.id,
            player_name: currentUserPlayer.display_name,
            row,
            col,
            resource_type: targetCell.discoveredResourceType,
          },
        },
      ];
      const startVersion = currentVersion + 1;
      const finalVersion = currentVersion + events.length;
      const [updatedState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
        `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            version: finalVersion,
            inland_explored_cells: serializeInlandCellRecords(inlandCells),
            updated_at: nowIso,
          }),
        },
      )) ?? [];
      if (!updatedState) {
        return NextResponse.json({ error: "Version mismatch." }, { status: 409 });
      }
      await emitGameEvents(gameId, startVersion, events, user.id);
      return NextResponse.json({ gameState: updatedState });
    }

    if (body.action === "SELL_INTERIOR_RESOURCE") {
      if (isDevelopableResource(targetCell.discoveredResourceType)) {
        return NextResponse.json(
          { error: "This resource cannot be sold instantly. Develop it instead." },
          { status: 409 },
        );
      }

      const isSellResource = isInstantSellResource(targetCell.discoveredResourceType);
      const isBonus = isBonusResource(targetCell.discoveredResourceType);

      const sellPayout = isSellResource
        ? (getInlandSellValue(targetCell.discoveredResourceType, goSalary) ?? 0)
        : 0;
      const voucherReward = isBonus
        ? getInlandVoucherReward(targetCell.discoveredResourceType)
        : null;
      const nextFreeBuildTokens =
        (currentUserPlayer.free_build_tokens ?? 0) + (voucherReward?.freeBuildTokens ?? 0);
      const nextFreeUpgradeTokens =
        (currentUserPlayer.free_upgrade_tokens ?? 0) + (voucherReward?.freeUpgradeTokens ?? 0);

      inlandCells.set(key, {
        ...targetCell,
        status: "EXPLORED_EMPTY",
        discoveredResourceType: null,
        developedSiteType: null,
      });
      const resolutionEvent =
        isSellResource
          ? {
              event_type: "INTERIOR_RESOURCE_SOLD" as const,
              payload: {
                player_id: currentUserPlayer.id,
                player_name: currentUserPlayer.display_name,
                row,
                col,
                resource_type: targetCell.discoveredResourceType,
                payout: sellPayout,
              },
            }
          : isBonus
            ? {
                event_type: "INTERIOR_RESOURCE_BONUS_GRANTED" as const,
                payload: {
                  player_id: currentUserPlayer.id,
                  player_name: currentUserPlayer.display_name,
                  row,
                  col,
                  resource_type: targetCell.discoveredResourceType,
                  free_build_tokens_granted: voucherReward?.freeBuildTokens ?? 0,
                  free_upgrade_tokens_granted: voucherReward?.freeUpgradeTokens ?? 0,
                  free_build_tokens_after: nextFreeBuildTokens,
                  free_upgrade_tokens_after: nextFreeUpgradeTokens,
                },
              }
            : {
                event_type: "INTERIOR_RESOURCE_EMPTY" as const,
                payload: {
                  player_id: currentUserPlayer.id,
                  player_name: currentUserPlayer.display_name,
                  row,
                  col,
                  resource_type: targetCell.discoveredResourceType,
                },
              };
      const events = [
        ...(isSellResource
          ? [
              {
                event_type: "CASH_CREDIT" as const,
                payload: {
                  player_id: currentUserPlayer.id,
                  amount: sellPayout,
                  reason: "RESOURCE_SOLD",
                  source_event_type: "INTERIOR_RESOURCE_SOLD",
                },
              },
            ]
          : []),
        resolutionEvent,
      ];
      const startVersion = currentVersion + 1;
      const finalVersion = currentVersion + events.length;

      const [updatedState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
        `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            version: finalVersion,
            balances: {
              ...balances,
              [currentUserPlayer.id]: currentCash + sellPayout,
            },
            inland_explored_cells: serializeInlandCellRecords(inlandCells),
            updated_at: nowIso,
          }),
        },
      )) ?? [];
      if (!updatedState) {
        return NextResponse.json({ error: "Version mismatch." }, { status: 409 });
      }

      if (isBonus) {
        const [updatedPlayer] = (await fetchFromSupabaseWithService<PlayerRow[]>(
          `players?id=eq.${currentUserPlayer.id}`,
          {
            method: "PATCH",
            headers: {
              Prefer: "return=representation",
            },
            body: JSON.stringify({
              free_build_tokens: nextFreeBuildTokens,
              free_upgrade_tokens: nextFreeUpgradeTokens,
            }),
          },
        )) ?? [];
        if (!updatedPlayer) {
          return NextResponse.json(
            { error: "Unable to grant inland bonus vouchers." },
            { status: 500 },
          );
        }
      }
      await emitGameEvents(gameId, startVersion, events, user.id);
      return NextResponse.json({ gameState: updatedState });
    }

    if (!isDevelopableResource(targetCell.discoveredResourceType)) {
      return NextResponse.json(
        { error: "This discovered resource is not developable." },
        { status: 409 },
      );
    }
    const developmentCost =
      getInlandDevelopmentCost(targetCell.discoveredResourceType, goSalary) ?? 0;
    if (currentCash < developmentCost) {
      return NextResponse.json(
        { error: "Insufficient cash to develop this inland site." },
        { status: 409 },
      );
    }
    inlandCells.set(key, {
      ...targetCell,
      status: "DEVELOPED_SITE",
      discoveredResourceType: null,
      developedSiteType: targetCell.discoveredResourceType,
    });
    const developmentEvents: Array<{
      event_type: string;
      payload: Record<string, unknown>;
    }> = [
      {
        event_type: "CASH_DEBIT",
        payload: {
          player_id: currentUserPlayer.id,
          amount: developmentCost,
          reason: "RESOURCE_DEVELOPMENT",
          source_event_type: "INTERIOR_SITE_DEVELOPED",
        },
      },
      {
        event_type: "INTERIOR_SITE_DEVELOPED",
        payload: {
          player_id: currentUserPlayer.id,
          player_name: currentUserPlayer.display_name,
          row,
          col,
          resource_type: targetCell.discoveredResourceType,
          development_cost: developmentCost,
        },
      },
    ];
    const ownershipByTile = await loadOwnershipByTile(gameId);
    const nextRules = maybeUnlockCommunicationUtility({
      gameState,
      ownershipByTile,
      events: developmentEvents,
    });
    const developmentFinalVersion = currentVersion + developmentEvents.length;
    const [updatedState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
      `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          version: developmentFinalVersion,
          balances: {
            ...balances,
            [currentUserPlayer.id]: currentCash - developmentCost,
          },
          inland_explored_cells: serializeInlandCellRecords(inlandCells),
          rules: nextRules,
          updated_at: nowIso,
        }),
      },
    )) ?? [];
    if (!updatedState) {
      return NextResponse.json({ error: "Version mismatch." }, { status: 409 });
    }
    await emitGameEvents(
      gameId,
      currentVersion + 1,
      developmentEvents,
      user.id,
    );
    return NextResponse.json({ gameState: updatedState });
  }

  if (body.action === "BUY_BANK_OWNED_INTERIOR_SITE") {
    const interiorCell = body.interiorCell;
    const row =
      interiorCell && typeof interiorCell.row === "number" ? interiorCell.row : Number.NaN;
    const col =
      interiorCell && typeof interiorCell.col === "number" ? interiorCell.col : Number.NaN;
    if (!Number.isInteger(row) || !Number.isInteger(col)) {
      return NextResponse.json({ error: "A valid interiorCell is required." }, { status: 400 });
    }

    const key = toInlandCellKey({ row, col });
    const inlandCells = normalizeInlandCellRecords(gameState.inland_explored_cells);
    const targetCell = inlandCells.get(key);
    if (!targetCell || !isBankSellableInlandCell(targetCell)) {
      return NextResponse.json(
        { error: "This inland tile is not available for bank sale." },
        { status: 409 },
      );
    }

    const goSalary = boardPackEconomy.passGoAmount ?? DEFAULT_BOARD_PACK_ECONOMY.passGoAmount ?? 0;
    const salePrice = getInlandBankSalePrice(targetCell, goSalary);
    if (salePrice === null) {
      return NextResponse.json(
        { error: "Unable to price this inland tile for bank sale." },
        { status: 409 },
      );
    }

    const balances = gameState.balances ?? {};
    const currentCash = balances[currentUserPlayer.id] ?? 0;
    if (currentCash < salePrice) {
      return NextResponse.json(
        { error: "Insufficient cash to buy this inland tile." },
        { status: 409 },
      );
    }

    inlandCells.set(key, {
      ...targetCell,
      ownerPlayerId: currentUserPlayer.id,
    });

    const purchasedAssetType =
      targetCell.status === "DISCOVERED_RESOURCE"
        ? targetCell.discoveredResourceType
        : targetCell.developedSiteType;
    const startVersion = currentVersion + 1;
    const finalVersion = currentVersion + 2;
    const nowIso = new Date().toISOString();
    const [updatedState] = (await fetchFromSupabaseWithService<GameStateRow[]>(
      `game_state?game_id=eq.${gameId}&version=eq.${currentVersion}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          version: finalVersion,
          balances: {
            ...balances,
            [currentUserPlayer.id]: currentCash - salePrice,
          },
          inland_explored_cells: serializeInlandCellRecords(inlandCells),
          updated_at: nowIso,
        }),
      },
    )) ?? [];
    if (!updatedState) {
      return NextResponse.json({ error: "Version mismatch." }, { status: 409 });
    }

    await emitGameEvents(
      gameId,
      startVersion,
      [
        {
          event_type: "CASH_DEBIT",
          payload: {
            player_id: currentUserPlayer.id,
            amount: salePrice,
            reason: "BANK_OWNED_INTERIOR_PURCHASE",
            source_event_type: "BANK_OWNED_INTERIOR_PURCHASED",
          },
        },
        {
          event_type: "BANK_OWNED_INTERIOR_PURCHASED",
          payload: {
            player_id: currentUserPlayer.id,
            player_name: currentUserPlayer.display_name,
            row,
            col,
            purchase_price: salePrice,
            inland_status: targetCell.status,
            resource_type: purchasedAssetType,
          },
        },
      ],
      user.id,
    );

    return NextResponse.json({ gameState: updatedState });
  }

  return null;
};
