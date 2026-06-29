"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type PropertyEditFormProps = {
  property: {
    id: string;
    address: string;
    city: string | null;
    state: string | null;
    zip: string | null;
    property_type: string | null;
    source: string | null;
    asking_price: number | null;
    taxes_annual: number | null;
    insurance_annual: number | null;
    condition: string | null;
    notes: string | null;
    latitude: number | null;
    longitude: number | null;
  };
};

function numberOrNull(value: FormDataEntryValue | null) {
  if (!value) return null;

  const stringValue = String(value);

  if (stringValue.trim() === "") return null;

  return Number(stringValue);
}

export function PropertyEditForm({ property }: PropertyEditFormProps) {
  const supabase = createClient();
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [latitude, setLatitude] = useState(
    property.latitude ? String(property.latitude) : ""
  );

  const [longitude, setLongitude] = useState(
    property.longitude ? String(property.longitude) : ""
  );

  const [isGeocoding, setIsGeocoding] = useState(false);

  async function handleFindCoordinates() {
    setIsGeocoding(true);
    setErrorMessage("");
    setSuccessMessage("");

    const addressInput = document.getElementById("address") as HTMLInputElement;
    const cityInput = document.getElementById("city") as HTMLInputElement;
    const stateInput = document.getElementById("state") as HTMLInputElement;
    const zipInput = document.getElementById("zip") as HTMLInputElement;

    const params = new URLSearchParams({
      address: addressInput?.value || "",
      city: cityInput?.value || "",
      state: stateInput?.value || "",
      zip: zipInput?.value || "",
    });

    const response = await fetch(`/api/geocode?${params.toString()}`);
    const result = await response.json();

    if (!response.ok) {
      setErrorMessage(result.error || "Unable to find coordinates.");
      setIsGeocoding(false);
      return;
    }

    setLatitude(String(result.latitude));
    setLongitude(String(result.longitude));
    setSuccessMessage("Coordinates found. Click Save Changes to store them.");
    setIsGeocoding(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const updates = {
      address: String(formData.get("address") || ""),
      city: String(formData.get("city") || ""),
      state: String(formData.get("state") || ""),
      zip: String(formData.get("zip") || ""),
      property_type: String(formData.get("property_type") || ""),
      source: String(formData.get("source") || ""),
      asking_price: numberOrNull(formData.get("asking_price")),
      taxes_annual: numberOrNull(formData.get("taxes_annual")),
      insurance_annual: numberOrNull(formData.get("insurance_annual")),
      condition: String(formData.get("condition") || "unknown"),
      notes: String(formData.get("notes") || ""),
      updated_at: new Date().toISOString(),
      latitude: numberOrNull(formData.get("latitude")),
      longitude: numberOrNull(formData.get("longitude")),
    };

    const { error } = await supabase
      .from("properties")
      .update(updates)
      .eq("id", property.id);

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    setSuccessMessage("Property updated.");
    setIsSaving(false);
    router.refresh();
  }

  return (
    <Card className="mb-6 rounded-xl border-slate-200 bg-white">
      <CardHeader>
        <CardTitle className="font-sans text-lg font-semibold normal-case tracking-normal text-slate-950">
          Edit Property
        </CardTitle>
        <p className="text-sm text-slate-500">
          Update the core property details for this deal.
        </p>
      </CardHeader>

      <CardContent>
        {errorMessage && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            {successMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                name="address"
                defaultValue={property.address}
                required
              />
            </div>

            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                name="city"
                defaultValue={property.city || "Chicago"}
              />
            </div>

            <div>
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                name="state"
                defaultValue={property.state || "IL"}
              />
            </div>

            <div>
              <Label htmlFor="zip">ZIP</Label>
              <Input id="zip" name="zip" defaultValue={property.zip || ""} />
            </div>

            <div>
              <Label htmlFor="latitude">Latitude</Label>
              <Input
                id="latitude"
                name="latitude"
                type="number"
                step="any"
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                placeholder="41.8781"
              />
            </div>

            <div>
              <Label htmlFor="longitude">Longitude</Label>
              <Input
                id="longitude"
                name="longitude"
                type="number"
                step="any"
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                placeholder="-87.6298"
              />
            </div>

            <div className="md:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleFindCoordinates}
                disabled={isGeocoding}
              >
                {isGeocoding
                  ? "Finding Coordinates..."
                  : "Find Coordinates from Address"}
              </Button>
            </div>

            <div>
              <Label htmlFor="property_type">Property Type</Label>
              <Input
                id="property_type"
                name="property_type"
                defaultValue={property.property_type || ""}
                placeholder="3-flat, 2-flat, condo, mixed-use"
              />
            </div>

            <div>
              <Label htmlFor="source">Source</Label>
              <Input
                id="source"
                name="source"
                defaultValue={property.source || ""}
                placeholder="MLS, Zillow, broker, off-market"
              />
            </div>

            <div>
              <Label htmlFor="condition">Condition</Label>
              <select
                id="condition"
                name="condition"
                defaultValue={property.condition || "unknown"}
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
              <Label htmlFor="asking_price">Asking Price</Label>
              <Input
                id="asking_price"
                name="asking_price"
                type="number"
                defaultValue={property.asking_price || ""}
              />
            </div>

            <div>
              <Label htmlFor="taxes_annual">Annual Taxes</Label>
              <Input
                id="taxes_annual"
                name="taxes_annual"
                type="number"
                defaultValue={property.taxes_annual || ""}
              />
            </div>

            <div>
              <Label htmlFor="insurance_annual">Annual Insurance</Label>
              <Input
                id="insurance_annual"
                name="insurance_annual"
                type="number"
                defaultValue={property.insurance_annual || ""}
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                defaultValue={property.notes || ""}
                placeholder="Deal notes, seller info, rehab thoughts, broker comments..."
              />
            </div>
          </div>

          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
