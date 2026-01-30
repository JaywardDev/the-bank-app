import type { BoardTile } from "@/lib/boardPacks";

export const PROPERTY_GROUP_COLORS: Record<string, string> = {
  brown: "#9a6b3f",
  "light-blue": "#7dd3fc",
  pink: "#f9a8d4",
  orange: "#fb923c",
  red: "#f87171",
  yellow: "#facc15",
  green: "#4ade80",
  "dark-blue": "#2563eb",
};

const MUTED_PROPERTY_GROUP_TINT_CLASSES: Record<string, string> = {
  brown: "bg-amber-200/30",
  "light-blue": "bg-sky-200/30",
  pink: "bg-pink-200/30",
  orange: "bg-orange-200/30",
  red: "bg-red-200/30",
  yellow: "bg-yellow-200/30",
  green: "bg-emerald-200/30",
  "dark-blue": "bg-blue-200/30",
};

const DEFAULT_PROPERTY_BAND_COLOR = "#e5e7eb";

export const getTileBandColor = (tile?: BoardTile | null) =>
  tile?.colorGroup
    ? PROPERTY_GROUP_COLORS[tile.colorGroup] ?? DEFAULT_PROPERTY_BAND_COLOR
    : DEFAULT_PROPERTY_BAND_COLOR;

export const getMutedGroupTintClass = (tile?: BoardTile | null) =>
  tile?.type === "PROPERTY" && tile.colorGroup
    ? MUTED_PROPERTY_GROUP_TINT_CLASSES[tile.colorGroup] ?? "bg-neutral-200/30"
    : "";
