"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

type DeletePropertyButtonProps = {
  propertyId: string;
};

export function DeletePropertyButton({
  propertyId,
}: DeletePropertyButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function deleteProperty() {
    const confirmed = window.confirm(
      "Permanently delete this property and all of its units, visits, and tags? This cannot be undone.",
    );

    if (!confirmed) return;

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/properties/${propertyId}`, {
        method: "DELETE",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Could not delete property.");
      }

      router.push("/pipeline");
      router.refresh();
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error ? error.message : "Could not delete property.",
      );
      setIsDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={deleteProperty}
      disabled={isDeleting}
      className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Trash2 className="h-4 w-4" aria-hidden="true" />
      {isDeleting ? "Deleting..." : "Delete Property"}
    </button>
  );
}
