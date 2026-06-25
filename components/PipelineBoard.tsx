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

const PIPELINE_COLUMNS = [
  { id: "lead", label: "Lead" },
  { id: "researching", label: "Researching" },
  { id: "visit_scheduled", label: "Visit Scheduled" },
  { id: "visited", label: "Visited" },
  { id: "analyzing", label: "Analyzing" },
  { id: "offer_ready", label: "Offer Ready" },
  { id: "offer_made", label: "Offer Made" },
  { id: "rejected", label: "Rejected" },
  { id: "under_contract", label: "Under Contract" },
  { id: "purchased", label: "Purchased" },
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
  if (!value) return "Unknown";

  return value
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
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
  column: {
    id: string;
    label: string;
  };
  properties: Property[];
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[260px] rounded-sm border border-slate-200 bg-white p-6 shadow-sm transition ${
        isOver ? "border-slate-400 bg-slate-50" : ""
      }`}
    >
      <h3 className="mb-8 font-serif text-lg font-bold uppercase tracking-wide text-slate-800">
        {column.label}{" "}
        <span className="text-slate-400">({properties.length})</span>
      </h3>

      {properties.length === 0 ? (
        <p className="text-slate-500">No properties yet.</p>
      ) : (
        <div className="space-y-4">
          {properties.map((property) => (
            <DraggablePropertyCard key={property.id} property={property} />
          ))}
        </div>
      )}
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
      className="block cursor-grab rounded-xl border border-slate-300 bg-slate-50 p-4 shadow-sm transition hover:border-slate-500 hover:bg-white active:cursor-grabbing"
    >
      <p className="mb-1 text-base font-semibold text-slate-950">
        {property.address || "Untitled Property"}
      </p>

      {(property.city || property.state || property.zip) && (
        <p className="mb-3 text-sm text-slate-500">
          {[property.city, property.state, property.zip]
            .filter(Boolean)
            .join(", ")}
        </p>
      )}

      <div className="flex items-start justify-between gap-3 text-sm">
        <p className="text-slate-600">
          {property.property_type || "No type"}
        </p>

        <p className="font-bold text-slate-950">{formatCurrency(price)}</p>
      </div>

      <p className="mt-3 text-sm text-slate-600">
        Condition:{" "}
        <span className="font-medium text-slate-800">
          {formatStatusLabel(property.condition)}
        </span>
      </p>

      {property.property_tags && property.property_tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {property.property_tags.slice(0, 4).map((tag) => (
            <span
              key={tag.id}
              className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700"
            >
              {tag.tag}
            </span>
          ))}

          {property.property_tags.length > 4 && (
            <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-500">
              +{property.property_tags.length - 4}
            </span>
          )}
        </div>
      )}
    </Link>
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

  const propertiesByStatus = useMemo(() => {
    const grouped: Record<string, Property[]> = {};

    PIPELINE_COLUMNS.forEach((column) => {
      grouped[column.id] = [];
    });

    items.forEach((property) => {
      const status = property.status || "lead";

      if (!grouped[status]) {
        grouped.lead.push(property);
        return;
      }

      grouped[status].push(property);
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
    const newStatus = String(event.over?.id || "");

    if (!newStatus) return;

    const property = items.find((item) => item.id === propertyId);

    if (!property) return;

    const oldStatus = property.status || "lead";

    if (oldStatus === newStatus) return;

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
    return (
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
        {PIPELINE_COLUMNS.map((column) => {
          const columnProperties = properties.filter(
            (property) => (property.status || "lead") === column.id
          );

          return (
            <div
              key={column.id}
              className="min-h-[260px] rounded-sm border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h3 className="mb-8 font-serif text-lg font-bold uppercase tracking-wide text-slate-800">
                {column.label}{" "}
                <span className="text-slate-400">
                  ({columnProperties.length})
                </span>
              </h3>

              {columnProperties.length === 0 ? (
                <p className="text-slate-500">No properties yet.</p>
              ) : (
                <div className="space-y-4">
                  {columnProperties.map((property) => (
                    <PropertyCard key={property.id} property={property} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
        {PIPELINE_COLUMNS.map((column) => (
          <PipelineColumn
            key={column.id}
            column={column}
            properties={propertiesByStatus[column.id] || []}
          />
        ))}
      </div>

      <DragOverlay>
        {activeProperty ? (
          <div className="w-[260px]">
            <PropertyCard property={activeProperty} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}