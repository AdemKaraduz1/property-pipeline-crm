"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type PropertyTag = {
  id: string;
  tag: string;
};

type Property = {
  id: string;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  property_type: string | null;
  status: string | null;
  condition: string | null;
  asking_price: number | null;
  latitude: number | null;
  longitude: number | null;
  property_tags: PropertyTag[];
};

const PropertyMap = dynamic(
  () => import("@/components/PropertyMap").then((mod) => mod.PropertyMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[650px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
        Loading map...
      </div>
    ),
  }
);

const statuses = [
  { label: "All Statuses", value: "all" },
  { label: "Lead", value: "lead" },
  { label: "Researching", value: "researching" },
  { label: "Visit Scheduled", value: "visit_scheduled" },
  { label: "Visited", value: "visited" },
  { label: "Analyzing", value: "analyzing" },
  { label: "Offer Ready", value: "offer_ready" },
  { label: "Offer Made", value: "offer_made" },
  { label: "Rejected", value: "rejected" },
  { label: "Under Contract", value: "under_contract" },
  { label: "Purchased", value: "purchased" },
  { label: "Passed", value: "passed" },
];

const conditions = [
  { label: "All Conditions", value: "all" },
  { label: "Unknown", value: "unknown" },
  { label: "Turnkey", value: "turnkey" },
  { label: "Light Rehab", value: "light_rehab" },
  { label: "Medium Rehab", value: "medium_rehab" },
  { label: "Heavy Rehab", value: "heavy_rehab" },
  { label: "Gut Rehab", value: "gut_rehab" },
];

export function MapClient({ properties }: { properties: Property[] }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [conditionFilter, setConditionFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [mappedOnly, setMappedOnly] = useState(true);

  const allTags = useMemo(() => {
    const tags = properties.flatMap((property) =>
      (property.property_tags || []).map((tag) => tag.tag)
    );

    return Array.from(new Set(tags)).sort();
  }, [properties]);

  const filteredProperties = useMemo(() => {
    return properties.filter((property) => {
      const hasCoordinates = Boolean(property.latitude && property.longitude);

      if (mappedOnly && !hasCoordinates) return false;

      if (statusFilter !== "all" && property.status !== statusFilter) {
        return false;
      }

      if (
        conditionFilter !== "all" &&
        property.condition !== conditionFilter
      ) {
        return false;
      }

      if (tagFilter !== "all") {
        const hasTag = (property.property_tags || []).some(
          (tag) => tag.tag === tagFilter
        );

        if (!hasTag) return false;
      }

      return true;
    });
  }, [properties, statusFilter, conditionFilter, tagFilter, mappedOnly]);

  const mappedCount = properties.filter(
    (property) => property.latitude && property.longitude
  ).length;

  function clearFilters() {
    setStatusFilter("all");
    setConditionFilter("all");
    setTagFilter("all");
    setMappedOnly(true);
  }

  return (
    <div>
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-600">
              Showing{" "}
              <span className="font-semibold">{filteredProperties.length}</span>{" "}
              filtered properties.
            </p>
            <p className="text-xs text-slate-500">
              {mappedCount} mapped out of {properties.length} total properties.
            </p>
          </div>

          <Button type="button" variant="outline" onClick={clearFilters}>
            Clear Filters
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {statuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Condition
            </label>
            <select
              value={conditionFilter}
              onChange={(event) => setConditionFilter(event.target.value)}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {conditions.map((condition) => (
                <option key={condition.value} value={condition.value}>
                  {condition.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tag
            </label>
            <select
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">All Tags</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex h-10 items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={mappedOnly}
                onChange={(event) => setMappedOnly(event.target.checked)}
              />
              Mapped only
            </label>
          </div>
        </div>
      </div>

      <PropertyMap properties={filteredProperties} />
    </div>
  );
}