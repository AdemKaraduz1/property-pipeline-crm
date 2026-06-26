"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  status?: string | null;
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

function formatStatusLabel(value: string | null | undefined) {
  if (!value) return "Lead";

  return value
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function getColumnForStatus(status: string | null | undefined) {
  const normalizedStatus = status || "lead";

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
}: {
  column: PipelineColumnConfig;
  properties: Property[];
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[520px] min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition ${
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
            <DraggablePropertyCard key={property.id} property={property} />
          ))
        )}
      </div>
    </div>
  );
}

function DraggablePropertyCard({ property }: { property: Property }) {
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
    >
      <PropertyCard property={property} />
    </div>
  );
}

function PropertyCard({ property }: { property: Property }) {
  const price = property.asking_price ?? property.list_price ?? null;

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

      <div className="mt-3 space-y-1 text-xs">
        <p className="line-clamp-1 text-slate-600">
          {property.property_type || "No type"}
        </p>

        <p className="font-bold text-slate-950">{formatCurrency(price)}</p>
      </div>

      <div className="mt-2">
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700">
          {formatStatusLabel(property.status)}
        </span>
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
}: {
  propertiesByColumn: Record<string, Property[]>;
}) {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {PIPELINE_COLUMNS.map((column) => (
        <PipelineColumn
          key={column.id}
          column={column}
          properties={propertiesByColumn[column.id] || []}
        />
      ))}
    </div>
  );
}

function StaticPipelineGrid({ properties }: { properties: Property[] }) {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {PIPELINE_COLUMNS.map((column) => {
        const columnProperties = properties.filter((property) =>
          column.statuses.includes(property.status || "lead")
        );

        return (
          <div
            key={column.id}
            className="flex min-h-[520px] min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
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
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<Property[]>(properties);
  const [activeProperty, setActiveProperty] = useState<Property | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setItems(properties);
  }, [properties]);

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

    items.forEach((property) => {
      const column = getColumnForStatus(property.status);
      grouped[column.id].push(property);
    });

    return grouped;
  }, [items]);

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

    const oldStatus = property.status || "lead";

    if (targetColumn.statuses.includes(oldStatus)) {
      return;
    }

    const newStatus = targetColumn.targetStatus;

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === propertyId
          ? {
              ...item,
              status: newStatus,
            }
          : item
      )
    );

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

      setItems((currentItems) =>
        currentItems.map((item) =>
          item.id === propertyId
            ? {
                ...item,
                status: oldStatus,
              }
            : item
        )
      );

      alert("Could not update status. The card was moved back.");
    }
  }

  function handleDragCancel() {
    setActiveProperty(null);
  }

  if (!mounted) {
    return <StaticPipelineGrid properties={properties} />;
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <PipelineGrid propertiesByColumn={propertiesByColumn} />

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