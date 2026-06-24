import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const stages = [
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

type PropertyTag = {
  id: string;
  tag: string;
};

type Property = {
  id: string;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  property_type: string | null;
  status: string | null;
  asking_price: number | null;
  condition: string | null;
  property_tags: PropertyTag[];
};

function formatCurrency(value: number | null) {
  if (!value) return "No price";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatStatusLabel(value: string | null) {
  if (!value) return "lead";

  return value
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export default async function PipelinePage() {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

  const { data: properties, error } = await supabase
    .from("properties")
    .select(
      `
      id,
      address,
      city,
      state,
      zip,
      property_type,
      status,
      asking_price,
      condition,
      property_tags (
        id,
        tag
      )
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <AppShell>
        <p className="text-red-600">Error loading properties: {error.message}</p>
      </AppShell>
    );
  }

  const propertyList = (properties || []) as Property[];

  return (
    <AppShell>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-950">Pipeline</h2>
          <p className="text-slate-600">
            Track every property from lead to offer to purchase.
          </p>
        </div>

        <Link
          href="/properties/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Add Property
        </Link>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 md:grid md:grid-cols-3 xl:grid-cols-5">
        {stages.map((stage) => {
          const stageProperties = propertyList.filter(
            (property) => property.status === stage.value
          );

          return (
            <Card key={stage.value} className="min-h-48 min-w-[280px] border-slate-200 bg-white md:min-w-0">
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-slate-800">
                  {stage.label}{" "}
                  <span className="text-slate-400">
                    ({stageProperties.length})
                  </span>
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                {stageProperties.length === 0 ? (
                  <p className="text-sm text-slate-500">No properties yet.</p>
                ) : (
                  stageProperties.map((property) => (
                    <Link
                      key={property.id}
                      href={`/properties/${property.id}`}
                      className="block rounded-lg border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100"
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-950">
                            {property.address}
                          </p>
                          <p className="text-xs text-slate-500">
                            {property.city}, {property.state} {property.zip}
                          </p>
                        </div>
                      </div>

                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="text-slate-600">
                          {property.property_type || "No type"}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {formatCurrency(property.asking_price)}
                        </span>
                      </div>

                      <div className="mb-2 text-xs text-slate-500">
                        Condition:{" "}
                        <span className="font-medium text-slate-700">
                          {formatStatusLabel(property.condition)}
                        </span>
                      </div>

                      {property.property_tags &&
                        property.property_tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {property.property_tags.slice(0, 4).map((tag) => (
                              <span
                                key={tag.id}
                                className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700"
                              >
                                {tag.tag}
                              </span>
                            ))}

                            {property.property_tags.length > 4 && (
                              <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-500">
                                +{property.property_tags.length - 4}
                              </span>
                            )}
                          </div>
                        )}
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}