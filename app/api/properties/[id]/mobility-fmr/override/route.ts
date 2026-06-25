import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const FMR_2026_CHICAGO: Record<number, number> = {
  0: 1480,
  1: 1581,
  2: 1781,
  3: 2294,
  4: 2653,
};

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const numberValue = Number(String(value).replace(/[$,]/g, ""));

  return Number.isFinite(numberValue) ? numberValue : null;
}

function getBedroomCount(unit: any) {
  const bedroomValue = unit.bedrooms ?? unit.beds ?? unit.fmr_bedroom_count;
  const bedrooms = toNumber(bedroomValue);

  if (bedrooms === null) return null;

  return Math.max(0, Math.round(bedrooms));
}

function getBaseFmrRent(bedrooms: number | null) {
  if (bedrooms === null) return null;

  if (bedrooms <= 4) {
    return FMR_2026_CHICAGO[bedrooms] ?? null;
  }

  const fourBedroomFmr = FMR_2026_CHICAGO[4];

  return Math.round(fourBedroomFmr * (1 + 0.15 * (bedrooms - 4)));
}

function getMobilityFmrRent(baseFmrRent: number | null) {
  if (baseFmrRent === null) return null;

  return Math.round(baseFmrRent * 1.5);
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, message: "Not authenticated." },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const body = await request.json();

  const isMobilityArea = body?.isMobilityArea;

  if (typeof isMobilityArea !== "boolean") {
    return NextResponse.json(
      { success: false, message: "isMobilityArea must be true or false." },
      { status: 400 }
    );
  }

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("id, user_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (propertyError || !property) {
    return NextResponse.json(
      {
        success: false,
        message: "Property not found.",
        error: propertyError?.message,
      },
      { status: 404 }
    );
  }

  const { data: units, error: unitsError } = await supabase
    .from("property_units")
    .select("*")
    .eq("property_id", id)
    .order("created_at", { ascending: true });

  if (unitsError) {
    return NextResponse.json(
      {
        success: false,
        message: "Could not load units.",
        error: unitsError.message,
      },
      { status: 500 }
    );
  }

  const now = new Date().toISOString();

  const { error: propertyUpdateError } = await supabase
    .from("properties")
    .update({
      is_mobility_area: isMobilityArea,
      mobility_checked_at: now,
      mobility_check_method: "manual_override",
      mobility_notes: isMobilityArea
        ? "Manually marked as CHA mobility area."
        : "Manually marked as not in a CHA mobility area.",
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (propertyUpdateError) {
    return NextResponse.json(
      {
        success: false,
        message: "Could not update property mobility status.",
        error: propertyUpdateError.message,
      },
      { status: 500 }
    );
  }

  const unitUpdates = (units || []).map((unit) => {
    const bedrooms = getBedroomCount(unit);
    const baseFmrRent = getBaseFmrRent(bedrooms);
    const mobilityFmrRent = getMobilityFmrRent(baseFmrRent);
    const appliedFmrRent = isMobilityArea ? mobilityFmrRent : baseFmrRent;

    return {
      id: unit.id,
      fmr_bedroom_count: bedrooms,
      base_fmr_rent: baseFmrRent,
      mobility_fmr_rent: mobilityFmrRent,
      fmr_rent: appliedFmrRent,
      fmr_updated_at: now,
    };
  });

  for (const unitUpdate of unitUpdates) {
    const { id: unitId, ...updatePayload } = unitUpdate;

    const { error: unitUpdateError } = await supabase
      .from("property_units")
      .update(updatePayload)
      .eq("id", unitId);

    if (unitUpdateError) {
      return NextResponse.json(
        {
          success: false,
          message: "Could not update unit FMR values.",
          unitId,
          error: unitUpdateError.message,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    success: true,
    propertyId: id,
    isMobilityArea,
    units: unitUpdates,
  });
}