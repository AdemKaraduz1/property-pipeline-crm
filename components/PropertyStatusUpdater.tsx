"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";

type PropertyStatusUpdaterProps = {
  propertyId: string;
  currentStatus: string | null;
};

const statuses = [
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
  { label: "Archive", value: "archived" },
];

export function PropertyStatusUpdater({
  propertyId,
  currentStatus,
}: PropertyStatusUpdaterProps) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus || "lead");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleStatusChange(newStatus: string) {
    const previousStatus = status;

    setStatus(newStatus);
    setIsSaving(true);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/properties/${propertyId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Could not update status.");
      }

      router.refresh();
    } catch (error) {
      setStatus(previousStatus);
      setErrorMessage(
        error instanceof Error ? error.message : "Could not update status.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <Label htmlFor="status">Pipeline Status</Label>

      <select
        id="status"
        value={status}
        onChange={(event) => handleStatusChange(event.target.value)}
        className="mt-1 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
      >
        {statuses.map((statusOption) => (
          <option key={statusOption.value} value={statusOption.value}>
            {statusOption.label}
          </option>
        ))}
      </select>

      {isSaving && <p className="mt-1 text-xs text-slate-500">Saving...</p>}

      {errorMessage && (
        <p className="mt-1 text-xs text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}
