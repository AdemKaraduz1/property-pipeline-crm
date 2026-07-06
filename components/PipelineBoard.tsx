"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArrowUpDown } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

type PropertyTag = {
  id: string;
  tag: string;
};

type Property = {
  id: string;
  address: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  property_type?: string | null;
  asking_price?: number | null;
  list_price?: number | null;
  condition?: string | null;
  days_on_market?: number | null;
  status?: string | null;
  created_at?: string | null;
  all_extracted_fields?: unknown;

  // Archive fields - this covers whichever one your app/database is using
  archived?: boolean | null;
  is_archived?: boolean | null;
  archived_at?: string | null;

  property_tags?: PropertyTag[];
};

type PipelineBoardProps = {
  properties: Property[];
};

type PipelineColumnConfig = {
  id: string;
  label: string;
  statuses: string[];
  targetStatus: string;
};

type PropertyContextMenu = {
  property: Property;
  x: number;
  y: number;
};

type OpenPropertyContextMenu = (
  property: Property,
  clientX: number,
  clientY: number,
) => void;

type PipelineSort =
  | "newest"
  | "dom_desc"
  | "dom_asc"
  | "price_desc"
  | "price_asc"
  | "neighborhood"
  | "address";

const PIPELINE_SORT_STORAGE_KEY = "property-pipeline-sort";
const PIPELINE_SORT_CHANGE_EVENT = "property-pipeline-sort-change";
const PIPELINE_SORT_OPTIONS: { value: PipelineSort; label: string }[] = [
  { value: "newest", label: "Newest added" },
  { value: "dom_desc", label: "DOM: highest first" },
  { value: "dom_asc", label: "DOM: lowest first" },
  { value: "price_desc", label: "Price: highest first" },
  { value: "price_asc", label: "Price: lowest first" },
  { value: "neighborhood", label: "Neighborhood: A–Z" },
  { value: "address", label: "Address: A–Z" },
];

const PIPELINE_COLUMNS: PipelineColumnConfig[] = [
  {
    id: "lead_researching",
    label: "Lead / Researching",
    statuses: ["lead", "researching"],
    targetStatus: "lead",
  },
  {
    id: "visit_scheduled_visited",
    label: "Visit Scheduled / Visited",
    statuses: ["visit_scheduled", "visited"],
    targetStatus: "visit_scheduled",
  },
  {
    id: "analyzing",
    label: "Analyzing",
    statuses: ["analyzing"],
    targetStatus: "analyzing",
  },
  {
    id: "offer_activity",
    label: "Offer Activity",
    statuses: ["offer_ready", "offer_made", "rejected"],
    targetStatus: "offer_ready",
  },
  {
    id: "under_contract",
    label: "Under Contract",
    statuses: ["under_contract"],
    targetStatus: "under_contract",
  },
  {
    id: "purchased",
    label: "Purchased",
    statuses: ["purchased"],
    targetStatus: "purchased",
  },
];

const pipelineGridClass =
  "-mx-4 flex w-[calc(100%+2rem)] snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-4 md:mx-0 md:w-full md:px-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0 xl:grid-cols-6";

const pipelineColumnClass =
  "flex min-h-[520px] min-w-0 w-[82vw] max-w-[340px] shrink-0 snap-start flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:w-auto lg:max-w-none";

const subscribeToClient = () => () => {};

function isPipelineSort(value: string | null): value is PipelineSort {
  return PIPELINE_SORT_OPTIONS.some((option) => option.value === value);
}

function subscribeToPipelineSort(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(PIPELINE_SORT_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(PIPELINE_SORT_CHANGE_EVENT, onStoreChange);
  };
}

function getPipelineSortSnapshot(): PipelineSort {
  const savedSort = window.localStorage.getItem(PIPELINE_SORT_STORAGE_KEY);
  return isPipelineSort(savedSort) ? savedSort : "newest";
}

function getServerPipelineSortSnapshot(): PipelineSort {
  return "newest";
}

function formatCurrency(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "No price";

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return "No price";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(numberValue);
}

function normalizeStatus(status: string | null | undefined) {
  return status?.trim().toLowerCase() || "lead";
}

function formatStatusLabel(value: string | null | undefined) {
  if (!value) return "Lead";

  return value
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function getNeighborhood(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const metadata = value as Record<string, unknown>;
  const neighborhoodEntry = Object.entries(metadata).find(([key]) =>
    [
      "neighborhood",
      "neighbourhood",
      "community area",
      "community_area",
      "redfin neighborhood",
      "redfin_neighborhood",
    ].includes(key.trim().toLowerCase()),
  );
  const neighborhood = String(neighborhoodEntry?.[1] || "")
    .replace(/^neighbou?rhood\s*:\s*/i, "")
    .trim();

  return neighborhood && neighborhood.length <= 80 ? neighborhood : null;
}

function getSortableNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compareNullableNumbers(
  left: number | null,
  right: number | null,
  direction: "asc" | "desc",
) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;

  return direction === "asc" ? left - right : right - left;
}

function compareProperties(
  left: Property,
  right: Property,
  sort: PipelineSort,
) {
  let comparison = 0;

  if (sort === "newest") {
    comparison =
      new Date(right.created_at || 0).getTime() -
      new Date(left.created_at || 0).getTime();
  } else if (sort === "dom_desc" || sort === "dom_asc") {
    comparison = compareNullableNumbers(
      getSortableNumber(left.days_on_market),
      getSortableNumber(right.days_on_market),
      sort === "dom_asc" ? "asc" : "desc",
    );
  } else if (sort === "price_desc" || sort === "price_asc") {
    comparison = compareNullableNumbers(
      getSortableNumber(left.asking_price ?? left.list_price),
      getSortableNumber(right.asking_price ?? right.list_price),
      sort === "price_asc" ? "asc" : "desc",
    );
  } else if (sort === "neighborhood") {
    comparison = (getNeighborhood(left.all_extracted_fields) || "").localeCompare(
      getNeighborhood(right.all_extracted_fields) || "",
    );
  }

  if (sort === "address" || comparison === 0) {
    return (left.address || "").localeCompare(right.address || "");
  }

  return comparison;
}

function isArchivedProperty(property: Property) {
  const status = normalizeStatus(property.status);

  return (
    status === "archived" ||
    property.archived === true ||
    property.is_archived === true ||
    Boolean(property.archived_at)
  );
}

function getColumnForStatus(status: string | null | undefined) {
  const normalizedStatus = normalizeStatus(status);

  return (
    PIPELINE_COLUMNS.find((column) =>
      column.statuses.includes(normalizedStatus)
    ) || PIPELINE_COLUMNS[0]
  );
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return {
      success: false,
      message: text || "Server returned a non-JSON response.",
    };
  }
}

function PipelineColumn({
  column,
  properties,
  onOpenContextMenu,
}: {
  column: PipelineColumnConfig;
  properties: Property[];
  onOpenContextMenu: OpenPropertyContextMenu;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`${pipelineColumnClass} transition ${
        isOver ? "border-slate-400 bg-slate-50 ring-2 ring-slate-200" : ""
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="break-words font-serif text-sm font-bold uppercase leading-tight tracking-wide text-slate-800">
          {column.label}
        </h3>

        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
          {properties.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {properties.length === 0 ? (
          <div className="flex min-h-[90px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2 text-center">
            <p className="text-xs text-slate-500">No properties yet.</p>
          </div>
        ) : (
          properties.map((property) => (
            <DraggablePropertyCard
              key={property.id}
              property={property}
              onOpenContextMenu={onOpenContextMenu}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DraggablePropertyCard({
  property,
  onOpenContextMenu,
}: {
  property: Property;
  onOpenContextMenu: OpenPropertyContextMenu;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: property.id,
    });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? "opacity-40" : ""}
      {...listeners}
      {...attributes}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenContextMenu(property, event.clientX, event.clientY);
      }}
    >
      <PropertyCard property={property} />
    </div>
  );
}

function PropertyCard({ property }: { property: Property }) {
  const price = property.asking_price ?? property.list_price ?? null;
  const daysOnMarket = Number(property.days_on_market);
  const hasDaysOnMarket =
    property.days_on_market !== null &&
    property.days_on_market !== undefined &&
    Number.isFinite(daysOnMarket);
  const normalizedCondition = normalizeStatus(property.condition);
  const neighborhood = getNeighborhood(property.all_extracted_fields);

  return (
    <Link
      href={`/properties/${property.id}`}
      className="block cursor-grab rounded-lg border border-slate-300 bg-slate-50 p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-500 hover:bg-white hover:shadow-md active:cursor-grabbing"
    >
      <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-950">
        {property.address || "Untitled Property"}
      </p>

      {(property.city || property.state || property.zip) && (
        <p className="mt-1 line-clamp-1 text-xs text-slate-500">
          {[property.city, property.state, property.zip]
            .filter(Boolean)
            .join(", ")}
        </p>
      )}

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 text-xs">
        <div className="min-w-0 space-y-1">
          <p className="line-clamp-1 text-slate-600">
            {property.property_type || "No type"}
          </p>

          <p className="font-bold text-slate-950">{formatCurrency(price)}</p>
        </div>

        {hasDaysOnMarket && (
          <div
            className="rounded-md bg-white px-2 py-1 text-right shadow-sm ring-1 ring-slate-200"
            title="Days on market"
          >
            <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">
              DOM
            </p>
            <p className="font-bold text-slate-800">
              {Math.max(0, Math.trunc(daysOnMarket))}d
            </p>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {neighborhood && (
          <span
            className="max-w-full truncate rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700"
            title={`Chicago neighborhood: ${neighborhood}`}
          >
            {neighborhood}
          </span>
        )}

        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700">
          {formatStatusLabel(property.status)}
        </span>

        {normalizedCondition !== "unknown" && (
          <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {formatStatusLabel(property.condition)}
          </span>
        )}
      </div>

      {property.property_tags && property.property_tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {property.property_tags.slice(0, 2).map((tag) => (
            <span
              key={tag.id}
              className="max-w-full truncate rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] text-slate-700"
            >
              {tag.tag}
            </span>
          ))}

          {property.property_tags.length > 2 && (
            <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] text-slate-500">
              +{property.property_tags.length - 2}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

function PipelineGrid({
  propertiesByColumn,
  onOpenContextMenu,
}: {
  propertiesByColumn: Record<string, Property[]>;
  onOpenContextMenu: OpenPropertyContextMenu;
}) {
  return (
    <div
      className={pipelineGridClass}
      aria-label="Property pipeline board. Swipe horizontally to view stages."
    >
      {PIPELINE_COLUMNS.map((column) => (
        <PipelineColumn
          key={column.id}
          column={column}
          properties={propertiesByColumn[column.id] || []}
          onOpenContextMenu={onOpenContextMenu}
        />
      ))}
    </div>
  );
}

function StaticPipelineGrid({ properties }: { properties: Property[] }) {
  const activeProperties = properties.filter(
    (property) => !isArchivedProperty(property)
  );

  return (
    <div
      className={pipelineGridClass}
      aria-label="Property pipeline board. Swipe horizontally to view stages."
    >
      {PIPELINE_COLUMNS.map((column) => {
        const columnProperties = activeProperties.filter((property) =>
          column.statuses.includes(normalizeStatus(property.status))
        );

        return (
          <div
            key={column.id}
            className={pipelineColumnClass}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h3 className="break-words font-serif text-sm font-bold uppercase leading-tight tracking-wide text-slate-800">
                {column.label}
              </h3>

              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                {columnProperties.length}
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-2">
              {columnProperties.length === 0 ? (
                <div className="flex min-h-[90px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2 text-center">
                  <p className="text-xs text-slate-500">No properties yet.</p>
                </div>
              ) : (
                columnProperties.map((property) => (
                  <PropertyCard key={property.id} property={property} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PipelineBoard({ properties }: PipelineBoardProps) {
  const router = useRouter();
  const sort = useSyncExternalStore(
    subscribeToPipelineSort,
    getPipelineSortSnapshot,
    getServerPipelineSortSnapshot,
  );
  const [archivedPropertyIds, setArchivedPropertyIds] = useState<Set<string>>(
    () => new Set(),
  );
  const activeProperties = useMemo(
    () =>
      properties.filter(
        (property) =>
          !isArchivedProperty(property) &&
          !archivedPropertyIds.has(property.id),
      ),
    [archivedPropertyIds, properties],
  );

  const mounted = useSyncExternalStore(
    subscribeToClient,
    () => true,
    () => false,
  );
  const [statusOverrides, setStatusOverrides] = useState<
    Record<string, string>
  >({});
  const [activeProperty, setActiveProperty] = useState<Property | null>(null);
  const [contextMenu, setContextMenu] = useState<PropertyContextMenu | null>(
    null,
  );
  const [archivingPropertyId, setArchivingPropertyId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!contextMenu) return;

    function closeContextMenu() {
      setContextMenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeContextMenu();
    }

    window.addEventListener("click", closeContextMenu);
    window.addEventListener("blur", closeContextMenu);
    window.addEventListener("resize", closeContextMenu);
    window.addEventListener("scroll", closeContextMenu, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("blur", closeContextMenu);
      window.removeEventListener("resize", closeContextMenu);
      window.removeEventListener("scroll", closeContextMenu, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  const items = useMemo(
    () =>
      activeProperties.map((property) => {
        const overriddenStatus = statusOverrides[property.id];

        return overriddenStatus
          ? { ...property, status: overriddenStatus }
          : property;
      }),
    [activeProperties, statusOverrides],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const propertiesByColumn = useMemo(() => {
    const grouped: Record<string, Property[]> = {};

    PIPELINE_COLUMNS.forEach((column) => {
      grouped[column.id] = [];
    });

    items
      .filter((property) => !isArchivedProperty(property))
      .forEach((property) => {
        const column = getColumnForStatus(property.status);
        grouped[column.id].push(property);
      });

    PIPELINE_COLUMNS.forEach((column) => {
      grouped[column.id].sort((left, right) =>
        compareProperties(left, right, sort),
      );
    });

    return grouped;
  }, [items, sort]);

  function changeSort(nextSort: PipelineSort) {
    window.localStorage.setItem(PIPELINE_SORT_STORAGE_KEY, nextSort);
    window.dispatchEvent(new Event(PIPELINE_SORT_CHANGE_EVENT));
  }

  function handleDragStart(event: DragStartEvent) {
    const property = items.find((item) => item.id === event.active.id);
    setActiveProperty(property || null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveProperty(null);

    const propertyId = String(event.active.id);
    const targetColumnId = String(event.over?.id || "");

    if (!targetColumnId) return;

    const property = items.find((item) => item.id === propertyId);
    const targetColumn = PIPELINE_COLUMNS.find(
      (column) => column.id === targetColumnId
    );

    if (!property || !targetColumn) return;

    const oldStatus = normalizeStatus(property.status);

    if (targetColumn.statuses.includes(oldStatus)) {
      return;
    }

    const newStatus = targetColumn.targetStatus;

    setStatusOverrides((current) => ({
      ...current,
      [propertyId]: newStatus,
    }));

    try {
      const response = await fetch(`/api/properties/${propertyId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: newStatus,
        }),
      });

      const result = await parseJsonResponse(response);

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Status update failed.");
      }
    } catch (error) {
      console.error(error);

      setStatusOverrides((current) => ({
        ...current,
        [propertyId]: oldStatus,
      }));

      alert("Could not update status. The card was moved back.");
    }
  }

  function handleDragCancel() {
    setActiveProperty(null);
  }

  function openContextMenu(
    property: Property,
    clientX: number,
    clientY: number,
  ) {
    const menuWidth = 208;
    const menuHeight = 116;
    const edgePadding = 8;

    setContextMenu({
      property,
      x: Math.max(
        edgePadding,
        Math.min(clientX, window.innerWidth - menuWidth - edgePadding),
      ),
      y: Math.max(
        edgePadding,
        Math.min(clientY, window.innerHeight - menuHeight - edgePadding),
      ),
    });
  }

  async function archiveProperty(property: Property) {
    const confirmed = window.confirm(
      `Archive ${property.address || "this property"}? It will be removed from the pipeline but its data will be kept.`,
    );

    if (!confirmed) return;

    setArchivingPropertyId(property.id);

    try {
      const response = await fetch(`/api/properties/${property.id}/archive`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          archiveReason: "Archived from pipeline board context menu",
        }),
      });
      const result = await parseJsonResponse(response);

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Could not archive property.");
      }

      setArchivedPropertyIds((current) => {
        const next = new Set(current);
        next.add(property.id);
        return next;
      });
      setContextMenu(null);
      router.refresh();
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error
          ? error.message
          : "Could not archive property.",
      );
    } finally {
      setArchivingPropertyId(null);
    }
  }

  if (!mounted) {
    return <StaticPipelineGrid properties={activeProperties} />;
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="mb-3 flex justify-end">
        <label className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm sm:w-auto">
          <ArrowUpDown
            className="h-4 w-4 shrink-0 text-slate-500"
            aria-hidden="true"
          />
          <span className="text-xs font-semibold text-slate-600">Sort</span>
          <select
            value={sort}
            onChange={(event) => changeSort(event.target.value as PipelineSort)}
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none sm:w-44"
            aria-label="Sort pipeline cards"
          >
            {PIPELINE_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <PipelineGrid
        propertiesByColumn={propertiesByColumn}
        onOpenContextMenu={openContextMenu}
      />

      {contextMenu && (
        <div
          role="menu"
          aria-label={`Actions for ${contextMenu.property.address || "property"}`}
          className="fixed z-50 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <p className="truncate px-2 py-1.5 text-xs font-semibold text-slate-500">
            {contextMenu.property.address || "Untitled Property"}
          </p>
          <button
            type="button"
            role="menuitem"
            disabled={archivingPropertyId === contextMenu.property.id}
            onClick={() => void archiveProperty(contextMenu.property)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Archive className="h-4 w-4" aria-hidden="true" />
            {archivingPropertyId === contextMenu.property.id
              ? "Archiving..."
              : "Archive"}
          </button>
        </div>
      )}

      <DragOverlay>
        {activeProperty ? (
          <div className="w-[220px]">
            <PropertyCard property={activeProperty} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
