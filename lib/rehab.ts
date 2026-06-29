export const COMMON_REHAB_ITEMS = [
  {
    id: "exterior_masonry",
    label: "Brick / Facade",
    description: "Tuckpointing, masonry, siding, and exterior repairs",
  },
  {
    id: "roof_gutters",
    label: "Roof / Gutters",
    description: "Roofing, flashing, gutters, and downspouts",
  },
  {
    id: "landscaping_site",
    label: "Landscaping / Site",
    description: "Yard, fencing, walkways, drainage, and exterior cleanup",
  },
  {
    id: "hallways_lobby",
    label: "Hallways / Lobby",
    description: "Paint, flooring, lighting, doors, and common finishes",
  },
  {
    id: "stairs_railings",
    label: "Stairs / Railings",
    description: "Interior or exterior stairs, porches, and guardrails",
  },
  {
    id: "basement_storage",
    label: "Basement / Storage",
    description: "Common basement, laundry, storage, and moisture work",
  },
  {
    id: "building_mechanical",
    label: "Building Mechanicals",
    description: "Shared boiler, HVAC, water heater, and ventilation",
  },
  {
    id: "plumbing_electrical",
    label: "Plumbing / Electrical",
    description: "Shared supply, waste, panels, service, and common wiring",
  },
  {
    id: "security_fire",
    label: "Security / Fire Safety",
    description: "Cameras, access control, alarms, extinguishers, and signage",
  },
  {
    id: "permits_professional",
    label: "Permits / Professional",
    description: "Permits, plans, engineering, architecture, and inspections",
  },
  {
    id: "other",
    label: "Other Common Work",
    description: "Anything shared that does not fit another category",
  },
] as const;

export type InspectionItem = {
  needsRehab: boolean | null;
  estimatedCost: number;
  notes: string;
};

export type UnitWalkthrough = {
  rooms: Record<string, InspectionItem>;
};

export type WalkthroughData = {
  common: Record<string, InspectionItem>;
  units: Record<string, UnitWalkthrough>;
  updatedAt?: string | null;
  currentStep?: number;
};

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeInspectionItem(value: unknown): InspectionItem {
  const item = asRecord(value);
  const rawNeedsRehab = item.needsRehab;
  const estimatedCost = Number(item.estimatedCost);

  return {
    needsRehab:
      rawNeedsRehab === true ? true : rawNeedsRehab === false ? false : null,
    estimatedCost: Number.isFinite(estimatedCost) ? estimatedCost : 0,
    notes: typeof item.notes === "string" ? item.notes : "",
  };
}
