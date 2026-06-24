import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PropertyUnitForm } from "@/components/PropertyUnitForm";
import { DealAnalyzer } from "@/components/DealAnalyzer";
import { PropertyStatusUpdater } from "@/components/PropertyStatusUpdater";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PropertyVisitLog } from "@/components/PropertyVisitLog";
import { DeleteUnitButton } from "@/components/DeleteUnitButton";
import { PropertyEditForm } from "@/components/PropertyEditForm";
import { PropertyTags } from "@/components/PropertyTags";
import { DealScoreCard } from "@/components/DealScoreCard";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type PropertyUnit = {
  id: string;
  unit_label: string | null;
  beds: number;
  baths: number | null;
  current_rent: number | null;
  projected_rent: number | null;
  fmr_rent: number | null;
  condition: string | null;
  rehab_estimate: number | null;
  notes: string | null;
};

function formatCurrency(value: number | null) {
  if (!value) return "Not entered";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export default async function PropertyDetailPage({ params }: PageProps) {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }


  const { id } = await params;

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .single();

  const { data: units, error: unitsError } = await supabase
    .from("property_units")
    .select("*")
    .eq("property_id", id)
    .order("created_at", { ascending: true });

  const { data: tags } = await supabase
    .from("property_tags")
    .select("tag")
    .eq("property_id", id);

  if (propertyError || !property) {
    return (
      <AppShell>
        <p className="text-red-600">Property not found.</p>
      </AppShell>
    );
  }

  const unitList = (units || []) as PropertyUnit[];

  const projectedMonthlyRent = unitList.reduce(
    (sum, unit) => sum + Number(unit.projected_rent || 0),
    0
  );

  const currentMonthlyRent = unitList.reduce(
    (sum, unit) => sum + Number(unit.current_rent || 0),
    0
  );

  const totalRehab = unitList.reduce(
    (sum, unit) => sum + Number(unit.rehab_estimate || 0),
    0
  );

  const tagList = (tags || []).map((tag) => tag.tag);

  return (
    <AppShell>
      <div className="mb-6">
        <Link
          href="/pipeline"
          className="text-sm text-slate-600 hover:text-slate-950"
        >
          ← Back to Pipeline
        </Link>
      </div>

      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-950">
          {property.address}
        </h2>
        <p className="text-slate-600">
          {property.city}, {property.state} {property.zip}
        </p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Asking Price</p>
          <p className="text-2xl font-bold text-slate-950">
            {formatCurrency(property.asking_price)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Projected Rent</p>
          <p className="text-2xl font-bold text-slate-950">
            {formatCurrency(projectedMonthlyRent)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Current Rent</p>
          <p className="text-2xl font-bold text-slate-950">
            {formatCurrency(currentMonthlyRent)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Estimated Rehab</p>
          <p className="text-2xl font-bold text-slate-950">
            {formatCurrency(totalRehab)}
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <PropertyStatusUpdater
            propertyId={id}
            currentStatus={property.status}
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Condition</p>
          <p className="text-xl font-bold text-slate-950">
            {property.condition}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Property Type</p>
          <p className="text-xl font-bold text-slate-950">
            {property.property_type || "Not entered"}
          </p>
        </div>
      </div>

      <PropertyTags propertyId={id} />

      <DealScoreCard
        askingPrice={property.asking_price}
        projectedMonthlyRent={projectedMonthlyRent}
        totalRehab={totalRehab}
        condition={property.condition}
        tags={tagList}
      />


      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-slate-700">Notes</p>
        <p className="whitespace-pre-wrap text-slate-700">
          {property.notes || "No notes yet."}
        </p>
      </div>

      <PropertyEditForm property={property} />


      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-4 text-lg font-semibold text-slate-950">Units</h3>

        {unitsError && (
          <p className="mb-4 text-sm text-red-600">
            Error loading units: {unitsError.message}
          </p>
        )}

        {unitList.length === 0 ? (
          <p className="text-sm text-slate-500">No units added yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2">Unit</th>
                  <th className="py-2">Beds</th>
                  <th className="py-2">Baths</th>
                  <th className="py-2">Current Rent</th>
                  <th className="py-2">Projected Rent</th>
                  <th className="py-2">FMR</th>
                  <th className="py-2">Condition</th>
                  <th className="py-2">Rehab</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>

              <tbody>
                {unitList.map((unit) => (
                  <tr key={unit.id} className="border-b border-slate-100">
                    <td className="py-3 font-medium text-slate-950">
                      {unit.unit_label || "Unit"}
                    </td>
                    <td className="py-3 text-slate-700">{unit.beds}</td>
                    <td className="py-3 text-slate-700">
                      {unit.baths || "-"}
                    </td>
                    <td className="py-3 text-slate-700">
                      {formatCurrency(unit.current_rent)}
                    </td>
                    <td className="py-3 text-slate-700">
                      {formatCurrency(unit.projected_rent)}
                    </td>
                    <td className="py-3 text-slate-700">
                      {formatCurrency(unit.fmr_rent)}
                    </td>
                    <td className="py-3 text-slate-700">{unit.condition}</td>
                    <td className="py-3 text-slate-700">
                      {formatCurrency(unit.rehab_estimate)}
                    </td>
                    <td className="py-3">
                      <DeleteUnitButton unitId={unit.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    <PropertyVisitLog propertyId={id} />

      <DealAnalyzer
        askingPrice={property.asking_price}
        taxesAnnual={property.taxes_annual}
        insuranceAnnual={property.insurance_annual}
        projectedMonthlyRent={projectedMonthlyRent}
        totalRehab={totalRehab}
      />

      <PropertyUnitForm propertyId={id} />
    </AppShell>
  );
}