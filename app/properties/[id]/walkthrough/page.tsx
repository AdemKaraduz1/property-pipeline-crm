import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PropertyWalkthrough } from "@/components/PropertyWalkthrough";
import { createClient } from "@/lib/supabase/server";
import {
  WalkthroughData,
  asRecord,
  normalizeInspectionItem,
} from "@/lib/rehab";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function toCount(value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
}

function toBathroomCounts(unit: {
  baths: number | null;
  full_baths: number | null;
  half_baths: number | null;
}) {
  const totalBathrooms = Number(
    unit.baths ??
      (Number(unit.full_baths || 0) + Number(unit.half_baths || 0) * 0.5),
  );

  if (!Number.isFinite(totalBathrooms) || totalBathrooms <= 0) {
    return { fullBaths: 0, halfBaths: 0 };
  }

  return {
    fullBaths: Math.floor(totalBathrooms),
    halfBaths: totalBathrooms % 1 >= 0.5 ? 1 : 0,
  };
}

export default async function PropertyWalkthroughPage({ params }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { id } = await params;
  const [{ data: property }, { data: units }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, address, all_extracted_fields")
      .eq("id", id)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("property_units")
      .select(
        "id, unit_number, unit_label, bedrooms, beds, full_baths, half_baths, baths",
      )
      .eq("property_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!property) {
    redirect("/pipeline");
  }

  const metadata = asRecord(property.all_extracted_fields);
  const storedWalkthrough = asRecord(metadata.walkthrough);
  const storedCommon = asRecord(storedWalkthrough.common);
  const storedUnits = asRecord(storedWalkthrough.units);

  const initialData: WalkthroughData = {
    common: Object.fromEntries(
      Object.entries(storedCommon).map(([key, value]) => [
        key,
        normalizeInspectionItem(value),
      ]),
    ),
    units: Object.fromEntries(
      Object.entries(storedUnits).map(([unitId, value]) => {
        const unit = asRecord(value);
        const rooms = asRecord(unit.rooms);

        return [
          unitId,
          {
            rooms: Object.fromEntries(
              Object.entries(rooms).map(([roomId, room]) => [
                roomId,
                normalizeInspectionItem(room),
              ]),
            ),
          },
        ];
      }),
    ),
    updatedAt:
      typeof storedWalkthrough.updated_at === "string"
        ? storedWalkthrough.updated_at
        : null,
    currentStep: toCount(storedWalkthrough.current_step),
  };

  const walkthroughUnits = (units || []).map((unit) => {
    const { fullBaths, halfBaths } = toBathroomCounts(unit);

    return {
      id: unit.id,
      label: unit.unit_number || unit.unit_label || "Unit",
      bedrooms: toCount(unit.bedrooms ?? unit.beds),
      fullBaths,
      halfBaths,
    };
  });

  return (
    <AppShell>
      <div className="mb-6">
        <Link
          href={`/properties/${id}`}
          className="text-sm text-slate-600 hover:text-slate-950"
        >
          ← Back to Property
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-950">
          Property Walkthrough
        </h1>
        <p className="mt-1 text-slate-600">
          {property.address || "Untitled Property"}
        </p>
      </div>

      <PropertyWalkthrough
        propertyId={id}
        address={property.address || "Property"}
        units={walkthroughUnits}
        initialData={initialData}
      />
    </AppShell>
  );
}
