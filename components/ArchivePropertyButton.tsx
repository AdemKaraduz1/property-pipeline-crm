"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ArchivePropertyButtonProps = {
  propertyId: string;
};

export function ArchivePropertyButton({
  propertyId,
}: ArchivePropertyButtonProps) {
  const router = useRouter();
  const [isArchiving, setIsArchiving] = useState(false);

  async function archiveProperty() {
    const confirmed = window.confirm(
      "Remove this property from the pipeline? The property data will be kept."
    );

    if (!confirmed) return;

    setIsArchiving(true);

    try {
      const response = await fetch(`/api/properties/${propertyId}/archive`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          archiveReason: "Removed from pipeline",
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Could not remove property from pipeline."
        );
      }

      router.push("/pipeline");
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Could not remove property from pipeline.");
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={archiveProperty}
      disabled={isArchiving}
      className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isArchiving ? "Removing..." : "Remove from Pipeline"}
    </button>
  );
}