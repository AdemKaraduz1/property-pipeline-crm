import { AppShell } from "@/components/AppShell";
import { MapClient } from "@/components/MapClient";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function MapPage() {
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
      condition,
      asking_price,
      latitude,
      longitude,
      property_tags (
        id,
        tag
      )
    `
    )
    .order("created_at", { ascending: false });

  const propertyList = properties || [];

  return (
    <AppShell>
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-950">Map</h2>
        <p className="text-slate-600">
          View and filter your acquisition pipeline by location.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Error loading map properties: {error.message}
        </div>
      )}

      <MapClient properties={propertyList} />
    </AppShell>
  );
}