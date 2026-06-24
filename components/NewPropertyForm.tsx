"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function NewPropertyForm() {

  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage("");

    const formData = new FormData(event.currentTarget);

    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setErrorMessage("You must be logged in to add a property.");
      setIsSaving(false);
      return;
    }

    const property = {
      user_id: user.id,
      address: String(formData.get("address") || ""),
      city: String(formData.get("city") || "Chicago"),
      state: String(formData.get("state") || "IL"),
      zip: String(formData.get("zip") || ""),
      property_type: String(formData.get("property_type") || ""),
      status: String(formData.get("status") || "lead"),
      source: String(formData.get("source") || ""),
      asking_price: Number(formData.get("asking_price")) || null,
      taxes_annual: Number(formData.get("taxes_annual")) || null,
      insurance_annual: Number(formData.get("insurance_annual")) || null,
      condition: String(formData.get("condition") || "unknown"),
      notes: String(formData.get("notes") || ""),
    };

    const { error } = await supabase.from("properties").insert(property);

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    router.push("/pipeline");
    router.refresh();
  }

  return (
    <Card className="max-w-3xl border-slate-200 bg-white">
      <CardHeader>
        <CardTitle>Add Property</CardTitle>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {errorMessage && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" name="address" placeholder="123 Main St" required />
            </div>

            <div>
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" defaultValue="Chicago" />
            </div>

            <div>
              <Label htmlFor="state">State</Label>
              <Input id="state" name="state" defaultValue="IL" />
            </div>

            <div>
              <Label htmlFor="zip">ZIP</Label>
              <Input id="zip" name="zip" placeholder="60647" />
            </div>

            <div>
              <Label htmlFor="property_type">Property Type</Label>
              <Input
                id="property_type"
                name="property_type"
                placeholder="3-flat, condo, 2-flat, mixed-use"
              />
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                defaultValue="lead"
                className="mt-1 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="lead">Lead</option>
                <option value="researching">Researching</option>
                <option value="visit_scheduled">Visit Scheduled</option>
                <option value="visited">Visited</option>
                <option value="analyzing">Analyzing</option>
                <option value="offer_ready">Offer Ready</option>
                <option value="offer_made">Offer Made</option>
                <option value="under_contract">Under Contract</option>
                <option value="purchased">Purchased</option>
                <option value="passed">Passed</option>
              </select>
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
              <Label htmlFor="source">Source</Label>
              <Input id="source" name="source" placeholder="MLS, Zillow, broker, off-market" />
            </div>

            <div>
              <Label htmlFor="asking_price">Asking Price</Label>
              <Input id="asking_price" name="asking_price" type="number" placeholder="725000" />
            </div>

            <div>
              <Label htmlFor="taxes_annual">Annual Taxes</Label>
              <Input id="taxes_annual" name="taxes_annual" type="number" placeholder="9500" />
            </div>

            <div>
              <Label htmlFor="insurance_annual">Annual Insurance Estimate</Label>
              <Input id="insurance_annual" name="insurance_annual" type="number" placeholder="2400" />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                placeholder="Initial notes, red flags, broker comments, rehab thoughts..."
              />
            </div>
          </div>

          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Property"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}