"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type DeleteUnitButtonProps = {
  unitId: string;
};

export function DeleteUnitButton({ unitId }: DeleteUnitButtonProps) {
    const supabase = createClient();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm("Delete this unit?");

    if (!confirmed) return;

    setIsDeleting(true);

    const { error } = await supabase
      .from("property_units")
      .delete()
      .eq("id", unitId);

    if (error) {
      alert(error.message);
      setIsDeleting(false);
      return;
    }

    router.refresh();
    setIsDeleting(false);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleDelete}
      disabled={isDeleting}
    >
      {isDeleting ? "Deleting..." : "Delete"}
    </Button>
  );
}