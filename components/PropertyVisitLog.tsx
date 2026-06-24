"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type PropertyVisitLogProps = {
  propertyId: string;
};

type Visit = {
  id: string;
  visit_date: string;
  visit_type: string | null;
  notes: string | null;
  red_flags: string | null;
  estimated_rehab_total: number | null;
};

function formatCurrency(value: number | null) {
  if (!value) return "Not entered";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export function PropertyVisitLog({ propertyId }: PropertyVisitLogProps) {

    const supabase = createClient();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadVisits() {
    setIsLoading(true);

    const { data, error } = await supabase
      .from("property_visits")
      .select("*")
      .eq("property_id", propertyId)
      .order("visit_date", { ascending: false });

    if (error) {
      setErrorMessage(error.message);
      setIsLoading(false);
      return;
    }

    setVisits((data || []) as Visit[]);
    setIsLoading(false);
  }

  useEffect(() => {
    loadVisits();
  }, [propertyId]);

    async function handleDeleteVisit(visitId: string) {
      const confirmed = window.confirm("Delete this visit?");

      if (!confirmed) return;

      const { error } = await supabase
        .from("property_visits")
        .delete()
        .eq("id", visitId);

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      await loadVisits();
    }


  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    setIsSaving(true);
    setErrorMessage("");

    const visit = {
      property_id: propertyId,
      visit_date: String(formData.get("visit_date") || ""),
      visit_type: String(formData.get("visit_type") || ""),
      notes: String(formData.get("notes") || ""),
      red_flags: String(formData.get("red_flags") || ""),
      estimated_rehab_total:
        Number(formData.get("estimated_rehab_total")) || null,
    };

    const { error } = await supabase.from("property_visits").insert(visit);

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    form.reset();
    await loadVisits();
    setIsSaving(false);
  }

  return (
    <Card className="mb-6 border-slate-200 bg-white">
      <CardHeader>
        <CardTitle className="text-xl text-slate-950">Visit Log</CardTitle>
        <p className="text-sm text-slate-500">
          Track showings, walkthrough notes, red flags, and rehab estimates.
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {errorMessage && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4"
        >
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="visit_date">Visit Date</Label>
              <Input id="visit_date" name="visit_date" type="date" required />
            </div>

            <div>
              <Label htmlFor="visit_type">Visit Type</Label>
              <Input
                id="visit_type"
                name="visit_type"
                placeholder="Showing, drive-by, inspection"
              />
            </div>

            <div>
              <Label htmlFor="estimated_rehab_total">Rehab Estimate</Label>
              <Input
                id="estimated_rehab_total"
                name="estimated_rehab_total"
                type="number"
                placeholder="75000"
              />
            </div>

            <div className="md:col-span-3">
              <Label htmlFor="red_flags">Red Flags</Label>
              <Textarea
                id="red_flags"
                name="red_flags"
                placeholder="Roof, foundation, water, electrical, tenant issues..."
              />
            </div>

            <div className="md:col-span-3">
              <Label htmlFor="notes">Visit Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                placeholder="What did you notice? What needs follow-up?"
              />
            </div>
          </div>

          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving Visit..." : "Add Visit"}
          </Button>
        </form>

        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
            Previous Visits
          </h3>

          {isLoading ? (
            <p className="text-sm text-slate-500">Loading visits...</p>
          ) : visits.length === 0 ? (
            <p className="text-sm text-slate-500">No visits logged yet.</p>
          ) : (
            <div className="space-y-3">
              {visits.map((visit) => (
                <div
                  key={visit.id}
                  className="rounded-lg border border-slate-200 bg-white p-4"
                >
                  <div className="mb-2 flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {visit.visit_type || "Visit"}
                      </p>
                      <p className="text-sm text-slate-500">
                        {visit.visit_date}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-slate-500">Rehab Estimate</p>
                      <p className="font-semibold text-slate-950">
                        {formatCurrency(visit.estimated_rehab_total)}
                      </p>
                    </div>
                  </div>

                  {visit.red_flags && (
                    <div className="mb-2 rounded-md bg-red-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                        Red Flags
                      </p>
                      <p className="whitespace-pre-wrap text-sm text-red-700">
                        {visit.red_flags}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => handleDeleteVisit(visit.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  )}

                  {visit.notes && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Notes
                      </p>
                      <p className="whitespace-pre-wrap text-sm text-slate-700">
                        {visit.notes}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}