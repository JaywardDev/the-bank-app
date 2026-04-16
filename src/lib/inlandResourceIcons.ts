import type { InlandResourceType } from "@/lib/inlandExploration";

const INLAND_RESOURCE_ICON_SRC_BY_TYPE: Partial<Record<InlandResourceType, string>> = {
  OIL: "/icons/oil-refinery.svg",
  DEEP_WELL: "/icons/water-reservoir.svg",
  COAL: "/icons/power-plant.svg",
};

export const getInlandResourceIconSrc = (resourceType: InlandResourceType | null | undefined) => {
  if (!resourceType) {
    return null;
  }
  return INLAND_RESOURCE_ICON_SRC_BY_TYPE[resourceType] ?? null;
};
