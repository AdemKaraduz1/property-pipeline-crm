"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type PropertyUnitFormProps = {
  propertyId: string;
};

export function PropertyUnitForm({ propertyId }: PropertyUnitFormProps) {
    const supabase = createClient();
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    setIsSaving(true);
    setErrorMessage("");

    const unit = {
      property_id: propertyId,
      unit_label: String(formData.get("unit_label") || ""),
      beds: Number(formData.get("beds")) || 0,
      baths: Number(formData.get("baths")) || null,
      current_rent: Number(formData.get("current_rent")) || null,
      projected_rent: Number(formData.get("projected_rent")) || null,
      fmr_rent: Number(formData.get("fmr_rent")) || null,
      condition: String(formData.get("condition") || "unknown"),
      rehab_estimate: Number(formData.get("rehab_estimate")) || 0,
      notes: String(formData.get("notes") || ""),
    };

    const { error } = await supabase.from("property_units").insert(unit);

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    form.reset();
    router.refresh();
    setIsSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-950">Add Unit</h3>
        <p className="text-sm text-slate-500">
          Track rent, rehab, and condition by unit.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor="unit_label">Unit Label</Label>
          <Input id="unit_label" name="unit_label" placeholder="Unit 1" />
        </div>

        <div>
          <Label htmlFor="beds">Beds</Label>
          <Input id="beds" name="beds" type="number" placeholder="3" required />
        </div>

        <div>
          <Label htmlFor="baths">Baths</Label>
          <Input id="baths" name="baths" type="number" step="0.5" placeholder="1" />
        </div>

        <div>
          <Label htmlFor="current_rent">Current Rent</Label>
          <Input id="current_rent" name="current_rent" type="number" placeholder="1800" />
        </div>

        <div>
          <Label htmlFor="projected_rent">Projected Rent</Label>
          <Input id="projected_rent" name="projected_rent" type="number" placeholder="2400" />
        </div>

        <div>
          <Label htmlFor="fmr_rent">FMR Rent</Label>
          <Input id="fmr_rent" name="fmr_rent" type="number" placeholder="2500" />
        </div>

        <div>
          <Label htmlFor="condition">Condition</Label>
          <select
            id="condition"
            name="condition"
            defaultValue="unknown"
            className="mt-1 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="unknown">Unknown</option>
            <option value="turnkey">Turnkey</option>
            <option value="light_rehab">Light Rehab</option>
            <option value="medium_rehab">Medium Rehab</option>
            <option value="heavy_rehab">Heavy Rehab</option>
            <option value="gut_rehab">Gut Rehab</option>
          </select>
        </div>

        <div>
          <Label htmlFor="rehab_estimate">Rehab Estimate</Label>
          <Input id="rehab_estimate" name="rehab_estimate" type="number" placeholder="25000" />
        </div>

        <div className="md:col-span-3">
          <Label htmlFor="notes">Unit Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            placeholder="Kitchen needs work, bath is updated, floors need refinishing..."
          />
        </div>
      </div>

      <Button type="submit" disabled={isSaving}>
        {isSaving ? "Saving Unit..." : "Add Unit"}
      </Button>
    </form>
  );
}