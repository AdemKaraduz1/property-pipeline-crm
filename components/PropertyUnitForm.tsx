"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { calculateChicagoFmr } from "@/lib/fmr";
import { MONTH_TO_MONTH_LABEL } from "@/lib/lease";

type PropertyUnitFormProps = {
  propertyId: string;
  isMobilityArea: boolean;
};

function toNumber(value: FormDataEntryValue | null) {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function toText(value: FormDataEntryValue | null) {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();

  return text.length > 0 ? text : null;
}

export function PropertyUnitForm({
  propertyId,
  isMobilityArea,
}: PropertyUnitFormProps) {
  const supabase = createClient();
  const router = useRouter();

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isMonthToMonthLease, setIsMonthToMonthLease] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    setIsSaving(true);
    setErrorMessage("");

    const currentRent = toNumber(formData.get("rent"));
    const projectedRent = toNumber(formData.get("projected_rent"));
    const bathrooms = toNumber(formData.get("bathrooms"));
    const bedrooms = toNumber(formData.get("bedrooms"));
    const {
      bedrooms: fmrBedroomCount,
      baseFmrRent,
      mobilityFmrRent,
      appliedFmrRent,
    } = calculateChicagoFmr(bedrooms, isMobilityArea);

    const unit = {
      property_id: propertyId,

      // New cleaned unit fields
      unit_number: toText(formData.get("unit_number")),
      floor_number: toText(formData.get("floor_number")),
      sqft: toNumber(formData.get("sqft")),
      rooms: toNumber(formData.get("rooms")),
      bedrooms,
      baths: bathrooms,
      full_baths: bathrooms,
      half_baths: null,
      rent: currentRent,
      lease_expiration: formData.get("lease_mtm")
        ? MONTH_TO_MONTH_LABEL
        : toText(formData.get("lease_expiration")),
      appliances_features: toText(formData.get("appliances_features")),
      tenant_pays: toText(formData.get("tenant_pays")),

      // Keep these because your analyzer still uses them
      current_rent: currentRent,
      projected_rent: projectedRent,
      fmr_bedroom_count: fmrBedroomCount,
      base_fmr_rent: baseFmrRent,
      mobility_fmr_rent: mobilityFmrRent,
      fmr_rent: appliedFmrRent,
      fmr_updated_at: new Date().toISOString(),
      condition: toText(formData.get("condition")) || "unknown",
      rehab_estimate: toNumber(formData.get("rehab_estimate")) || 0,
      notes: toText(formData.get("notes")),
    };

    const { error } = await supabase.from("property_units").insert(unit);

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    form.reset();
    setIsMonthToMonthLease(false);
    router.refresh();
    setIsSaving(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
    >
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
          <Label htmlFor="unit_number">Unit Number</Label>
          <Input id="unit_number" name="unit_number" placeholder="1" />
        </div>

        <div>
          <Label htmlFor="floor_number">Floor</Label>
          <Input id="floor_number" name="floor_number" placeholder="1" />
        </div>

        <div>
          <Label htmlFor="sqft">Sq Ft</Label>
          <Input id="sqft" name="sqft" type="number" placeholder="1400" />
        </div>

        <div>
          <Label htmlFor="rooms">Rooms</Label>
          <Input id="rooms" name="rooms" type="number" placeholder="6" />
        </div>

        <div>
          <Label htmlFor="bedrooms">Bedrooms</Label>
          <Input
            id="bedrooms"
            name="bedrooms"
            type="number"
            placeholder="3"
            required
          />
        </div>

        <div>
          <Label htmlFor="bathrooms">Bathrooms</Label>
          <Input
            id="bathrooms"
            name="bathrooms"
            type="number"
            step="0.5"
            placeholder="1.5"
          />
        </div>

        <div>
          <Label htmlFor="rent">Current Rent</Label>
          <Input id="rent" name="rent" type="number" placeholder="1800" />
        </div>

        <div>
          <Label htmlFor="projected_rent">Projected Rent</Label>
          <Input
            id="projected_rent"
            name="projected_rent"
            type="number"
            placeholder="2400"
          />
        </div>

        <div>
          <Label>Applied FMR</Label>
          <p className="mt-1 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
            Calculated automatically from the bedroom count when saved.
          </p>
        </div>

        <div>
          <Label htmlFor="lease_expiration">Lease Expiration</Label>
          <Input
            id="lease_expiration"
            name="lease_expiration"
            placeholder="12/26"
            disabled={isMonthToMonthLease}
          />
          <label className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600">
            <input
              name="lease_mtm"
              type="checkbox"
              checked={isMonthToMonthLease}
              onChange={(event) =>
                setIsMonthToMonthLease(event.target.checked)
              }
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
            Month-to-month
          </label>
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
          <Input
            id="rehab_estimate"
            name="rehab_estimate"
            type="number"
            placeholder="25000"
          />
        </div>

        <div className="md:col-span-3">
          <Label htmlFor="tenant_pays">Tenant Pays</Label>
          <Input
            id="tenant_pays"
            name="tenant_pays"
            placeholder="Electric, Gas, Heat"
          />
        </div>

        <div className="md:col-span-3">
          <Label htmlFor="appliances_features">Appliances / Features</Label>
          <Input
            id="appliances_features"
            name="appliances_features"
            placeholder="Stove, Refrigerator, Dishwasher, Hardwood Floors"
          />
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

      <Button type="submit" disabled={isSaving} className="w-full sm:w-auto">
        {isSaving ? "Saving Unit..." : "Add Unit"}
      </Button>
    </form>
  );
}
