"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
  { label: "Passed", value: "passed" },
];

export function PropertyStatusUpdater({
  propertyId,
  currentStatus,
}: PropertyStatusUpdaterProps) {
    const supabase = createClient();
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus || "lead");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleStatusChange(newStatus: string) {
    setStatus(newStatus);
    setIsSaving(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("properties")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", propertyId);

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    router.refresh();
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