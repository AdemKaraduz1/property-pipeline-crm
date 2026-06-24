import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatCurrency(value: number | null) {
  if (!value) return "$0";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export default async function DashboardPage() {
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
      status,
      asking_price,
      property_units (
        projected_rent
      )
    `
    );

  if (error) {
    return (
      <AppShell>
        <p className="text-red-600">Error loading dashboard: {error.message}</p>
      </AppShell>
    );
  }

  const propertyList = properties || [];

  const activeDeals = propertyList.filter(
    (property) =>
      property.status !== "purchased" &&
      property.status !== "passed" &&
      property.status !== "rejected"
  ).length;


  const offersMade = propertyList.filter(
    (property) => property.status === "offer_made"
  ).length;


  const totalPipelineValue = propertyList.reduce(
    (sum, property) => sum + Number(property.asking_price || 0),
    0
  );

  const propertiesWithRent = propertyList.map((property) => {
    const projectedMonthlyRent = property.property_units.reduce(
      (sum, unit) => sum + Number(unit.projected_rent || 0),
      0
    );

    return {
      id: property.id,
      address: property.address,
      projectedMonthlyRent,
    };
  });

  const bestRentProperty = propertiesWithRent.sort(
    (a, b) => b.projectedMonthlyRent - a.projectedMonthlyRent
  )[0];

  return (
    <AppShell>
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-950">Dashboard</h2>
        <p className="text-slate-600">
          Track acquisition opportunities, visits, offers, and deal analysis.
        </p>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              Active Deals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-950">{activeDeals}</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              Offers Made
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-950">{offersMade}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="text-slate-950">Total Pipeline Value</CardTitle>
            <p className="text-sm text-slate-500">
              Sum of asking prices across all tracked properties.
            </p>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-slate-950">
              {formatCurrency(totalPipelineValue)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="text-slate-950">Best Projected Rent</CardTitle>
            <p className="text-sm text-slate-500">
              Property with the highest monthly projected rent.
            </p>
          </CardHeader>
          <CardContent>
            {bestRentProperty && bestRentProperty.projectedMonthlyRent > 0 ? (
              <Link
                href={`/properties/${bestRentProperty.id}`}
                className="block rounded-lg border border-slate-200 bg-slate-50 p-4 hover:bg-slate-100"
              >
                <p className="font-semibold text-slate-950">
                  {bestRentProperty.address}
                </p>
                <p className="text-3xl font-bold text-slate-950">
                  {formatCurrency(bestRentProperty.projectedMonthlyRent)}
                  <span className="text-sm font-normal text-slate-500"> / mo</span>
                </p>
              </Link>
            ) : (
              <p className="text-sm text-slate-500">
                Add unit projected rents to see your best rent opportunity.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}