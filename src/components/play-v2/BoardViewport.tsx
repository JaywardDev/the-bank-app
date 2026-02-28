"use client";

import { useCallback, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { DEFAULT_BOARD_PACK_ECONOMY } from "@/lib/boardPacks";
import BoardSquare from "@/app/components/BoardSquare";
import BoardTrack from "@/app/components/BoardTrack";
import { getBoardPackById } from "@/lib/boardPacks";

type BoardViewportPlayer = {
  id: string;
  display_name: string;
  position: number | null;
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

type BoardViewportProps = {
  boardPackId: string | null;
  players: BoardViewportPlayer[];
  ownershipByTile: OwnershipByTile;
  currentPlayerId: string | null;
  selectedTileIndex: number | null;
  onSelectTileIndex: (tileIndex: number) => void;
};

const playerColors = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#a855f7",
  "#f59e0b",
  "#06b6d4",
];

const MIN_SCALE = 1;
const MAX_SCALE = 2.2;
const PAN_ACTIVATION_DISTANCE_PX = 8;
const SCENE_EXTENT = 1.4;

type PointerPosition = {
  x: number;
  y: number;
};

export default function BoardViewport({
  boardPackId,
  players,
  ownershipByTile,
  currentPlayerId,
  selectedTileIndex,
  onSelectTileIndex,
}: BoardViewportProps) {
  const boardPack = useMemo(() => getBoardPackById(boardPackId), [boardPackId]);
  const boardTiles = useMemo(() => boardPack?.tiles ?? [], [boardPack]);
  const boardEconomy = boardPack?.economy ?? DEFAULT_BOARD_PACK_ECONOMY;
  const [scale, setScale] = useState(MIN_SCALE);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef<Map<number, PointerPosition>>(new Map());
  const gestureRef = useRef({
    dragPointerId: null as number | null,
    dragStartX: 0,
    dragStartY: 0,
    startTranslateX: 0,
    startTranslateY: 0,
    isPanning: false,
    pinchDistance: null as number | null,
    pinchCenter: null as PointerPosition | null,
  });
  const suppressTileInteractionRef = useRef(false);

  const clampTransform = useCallback((nextScale: number, nextTranslateX: number, nextTranslateY: number) => {
    const stage = stageRef.current;
    if (!stage) {
      return { scale: nextScale, translateX: nextTranslateX, translateY: nextTranslateY };
    }

    const stageRect = stage.getBoundingClientRect();
    const clampedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
    const scaledSceneWidth = stageRect.width * SCENE_EXTENT * clampedScale;
    const scaledSceneHeight = stageRect.height * SCENE_EXTENT * clampedScale;
    const extraWidth = scaledSceneWidth - stageRect.width;
    const extraHeight = scaledSceneHeight - stageRect.height;
    const maxPanX = Math.max(0, extraWidth / 2);
    const maxPanY = Math.max(0, extraHeight / 2);

    return {
      scale: clampedScale,
      translateX: Math.max(-maxPanX, Math.min(nextTranslateX, maxPanX)),
      translateY: Math.max(-maxPanY, Math.min(nextTranslateY, maxPanY)),
    };
  }, []);

  const applyTransform = useCallback(
    (nextScale: number, nextTranslateX: number, nextTranslateY: number) => {
      const clamped = clampTransform(nextScale, nextTranslateX, nextTranslateY);
      setScale(clamped.scale);
      setTranslateX(clamped.translateX);
      setTranslateY(clamped.translateY);
      return clamped;
    },
    [clampTransform],
  );

  const scheduleTileInteractionReset = useCallback(() => {
    window.requestAnimationFrame(() => {
      suppressTileInteractionRef.current = false;
    });
  }, []);

  const getLocalPoint = useCallback((clientX: number, clientY: number) => {
    const stage = stageRef.current;
    if (!stage) {
      return { x: 0, y: 0 };
    }
    const rect = stage.getBoundingClientRect();
    return {
      x: clientX - rect.left - rect.width / 2,
      y: clientY - rect.top - rect.height / 2,
    };
  }, []);

  const zoomAroundPoint = useCallback(
    (nextScale: number, focus: PointerPosition) => {
      const ratio = nextScale / scale;
      const nextTranslateX = focus.x - (focus.x - translateX) * ratio;
      const nextTranslateY = focus.y - (focus.y - translateY) * ratio;
      return applyTransform(nextScale, nextTranslateX, nextTranslateY);
    },
    [applyTransform, scale, translateX, translateY],
  );

  const boardPlayers = useMemo(
    () =>
      players.map((player) => ({
        id: player.id,
        display_name: player.display_name,
        position: Number.isFinite(player.position) ? Number(player.position) : 0,
      })),
    [players],
  );

  const playerColorsById = useMemo(
    () =>
      players.reduce<Record<string, string>>((acc, player, index) => {
        acc[player.id] = playerColors[index % playerColors.length];
        return acc;
      }, {}),
    [players],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointersRef.current.size === 1) {
        gestureRef.current.dragPointerId = event.pointerId;
        gestureRef.current.dragStartX = event.clientX;
        gestureRef.current.dragStartY = event.clientY;
        gestureRef.current.startTranslateX = translateX;
        gestureRef.current.startTranslateY = translateY;
        gestureRef.current.isPanning = false;
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }

      if (pointersRef.current.size === 2) {
        const points = Array.from(pointersRef.current.values());
        const dx = points[0].x - points[1].x;
        const dy = points[0].y - points[1].y;
        gestureRef.current.pinchDistance = Math.hypot(dx, dy);
        gestureRef.current.pinchCenter = getLocalPoint((points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2);
        gestureRef.current.isPanning = true;
        suppressTileInteractionRef.current = true;
      }
    },
    [getLocalPoint, translateX, translateY],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(event.pointerId)) {
        return;
      }
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointersRef.current.size === 2) {
        const points = Array.from(pointersRef.current.values());
        const dx = points[0].x - points[1].x;
        const dy = points[0].y - points[1].y;
        const nextDistance = Math.hypot(dx, dy);
        const pinchDistance = gestureRef.current.pinchDistance;
        if (!pinchDistance || pinchDistance <= 0) {
          gestureRef.current.pinchDistance = nextDistance;
          return;
        }

        const distanceRatio = nextDistance / pinchDistance;
        const desiredScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * distanceRatio));
        const center = getLocalPoint((points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2);
        zoomAroundPoint(desiredScale, center);
        gestureRef.current.pinchDistance = nextDistance;
        gestureRef.current.pinchCenter = center;
        suppressTileInteractionRef.current = true;
        return;
      }

      if (gestureRef.current.dragPointerId !== event.pointerId) {
        return;
      }

      const dx = event.clientX - gestureRef.current.dragStartX;
      const dy = event.clientY - gestureRef.current.dragStartY;
      const movedDistance = Math.hypot(dx, dy);

      if (!gestureRef.current.isPanning && movedDistance >= PAN_ACTIVATION_DISTANCE_PX && scale > MIN_SCALE) {
        gestureRef.current.isPanning = true;
        suppressTileInteractionRef.current = true;
      }

      if (!gestureRef.current.isPanning || scale <= MIN_SCALE) {
        return;
      }

      applyTransform(
        scale,
        gestureRef.current.startTranslateX + dx,
        gestureRef.current.startTranslateY + dy,
      );
    },
    [applyTransform, getLocalPoint, scale, zoomAroundPoint],
  );

  const handlePointerEnd = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      pointersRef.current.delete(event.pointerId);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (pointersRef.current.size < 2) {
        gestureRef.current.pinchDistance = null;
        gestureRef.current.pinchCenter = null;
      }

      if (gestureRef.current.dragPointerId === event.pointerId) {
        const endedPan = gestureRef.current.isPanning;
        gestureRef.current.dragPointerId = null;
        gestureRef.current.isPanning = false;
        if (endedPan) {
          scheduleTileInteractionReset();
        }
      }

      if (pointersRef.current.size === 1) {
        const [activePointerId, point] = Array.from(pointersRef.current.entries())[0];
        gestureRef.current.dragPointerId = activePointerId;
        gestureRef.current.dragStartX = point.x;
        gestureRef.current.dragStartY = point.y;
        gestureRef.current.startTranslateX = translateX;
        gestureRef.current.startTranslateY = translateY;
      }
    },
    [scheduleTileInteractionReset, translateX, translateY],
  );

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const delta = -event.deltaY;
      const zoomFactor = Math.exp(delta * 0.0015);
      const desiredScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * zoomFactor));
      if (desiredScale === scale) {
        return;
      }
      const focus = getLocalPoint(event.clientX, event.clientY);
      zoomAroundPoint(desiredScale, focus);
      suppressTileInteractionRef.current = true;
      scheduleTileInteractionReset();
    },
    [getLocalPoint, scale, scheduleTileInteractionReset, zoomAroundPoint],
  );

  const handleRecenter = useCallback(() => {
    suppressTileInteractionRef.current = false;
    applyTransform(MIN_SCALE, 0, 0);
  }, [applyTransform]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={stageRef}
        className="relative h-full w-full touch-none bg-[url('/icons/board.svg')] bg-cover bg-center bg-no-repeat"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onWheel={handleWheel}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
            transformOrigin: "center center",
          }}
        >
          <div className="absolute inset-[-20%] z-0 bg-[url('/icons/board.svg')] bg-cover bg-center bg-no-repeat" />
          <div className="absolute inset-0 z-10 flex items-center justify-center p-1">
            <div className="relative h-full w-[70%] max-h-full max-w-[70vw]">
              <BoardSquare variant="viewport">
                <BoardTrack
                  density="compact"
                  tileFace="map"
                  tiles={boardTiles}
                  economy={boardEconomy}
                  players={boardPlayers}
                  ownershipByTile={ownershipByTile}
                  playerColorsById={playerColorsById}
                  currentPlayerId={currentPlayerId}
                  selectedTileIndex={selectedTileIndex}
                  onTileClick={(tileIndex) => {
                    if (suppressTileInteractionRef.current) {
                      return;
                    }
                    onSelectTileIndex(tileIndex);
                  }}
                />
              </BoardSquare>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRecenter}
          className="absolute right-2 top-2 z-20 rounded-full border border-white/20 bg-black/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-lg transition hover:bg-black/80"
        >
          Recenter
        </button>
      </div>
    </div>
  );
}
