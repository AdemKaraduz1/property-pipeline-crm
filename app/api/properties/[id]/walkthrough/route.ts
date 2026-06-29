import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  COMMON_REHAB_ITEMS,
  asRecord,
  normalizeInspectionItem,
} from "@/lib/rehab";

type WalkthroughRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

async function updateWalkthrough(
  request: Request,
  context: WalkthroughRouteContext,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, message: "Not authenticated." },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const body = await request.json();
  const submittedCommon = asRecord(body.common);
  const submittedUnits = asRecord(body.units);

  const [{ data: property }, { data: units, error: unitsError }] =
    await Promise.all([
      supabase
        .from("properties")
        .select("id, all_extracted_fields")
        .eq("id", id)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("property_units")
        .select("id")
        .eq("property_id", id),
    ]);

  if (!property) {
    return NextResponse.json(
      { success: false, message: "Property not found." },
      { status: 404 },
    );
  }

  if (unitsError) {
    return NextResponse.json(
      { success: false, message: "Could not load property units." },
      { status: 500 },
    );
  }

  const normalizedCommon = Object.fromEntries(
    Object.entries(submittedCommon).map(([key, value]) => [
      key,
      normalizeInspectionItem(value),
    ]),
  );
  const normalizedUnits = Object.fromEntries(
    Object.entries(submittedUnits).map(([unitId, value]) => {
      const rooms = asRecord(asRecord(value).rooms);

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
  );

  const metadata = asRecord(property.all_extracted_fields);
  const existingCommonRehab = asRecord(metadata.common_area_rehab);
  const existingCommonItems = asRecord(existingCommonRehab.items);
  const nextCommonItems = { ...existingCommonItems };

  for (const definition of COMMON_REHAB_ITEMS) {
    const inspection = normalizedCommon[definition.id];

    if (inspection?.needsRehab !== null) {
      nextCommonItems[definition.id] =
        inspection.needsRehab === true ? inspection.estimatedCost : 0;
    }
  }

  const now = new Date().toISOString();
  const { error: propertyError } = await supabase
    .from("properties")
    .update({
      all_extracted_fields: {
        ...metadata,
        common_area_rehab: {
          ...existingCommonRehab,
          items: nextCommonItems,
          inspection_notes: Object.fromEntries(
            Object.entries(normalizedCommon)
              .filter(([, item]) => item.notes)
              .map(([key, item]) => [key, item.notes]),
          ),
        },
        walkthrough: {
          common: normalizedCommon,
          units: normalizedUnits,
          completed: body.completed === true,
          current_step: Number.isFinite(Number(body.currentStep))
            ? Math.max(0, Math.round(Number(body.currentStep)))
            : 0,
          updated_at: now,
        },
      },
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (propertyError) {
    return NextResponse.json(
      { success: false, message: "Could not save walkthrough." },
      { status: 500 },
    );
  }

  for (const unit of units || []) {
    const roomEntries = Object.values(normalizedUnits[unit.id]?.rooms || {});
    const hasInspection = roomEntries.some(
      (room) =>
        room.needsRehab !== null ||
        room.estimatedCost > 0 ||
        room.notes.length > 0,
    );

    if (!hasInspection) continue;

    const rehabEstimate = roomEntries.reduce(
      (sum, room) =>
        sum + (room.needsRehab === true ? room.estimatedCost : 0),
      0,
    );

    const { error } = await supabase
      .from("property_units")
      .update({ rehab_estimate: rehabEstimate })
      .eq("id", unit.id)
      .eq("property_id", id);

    if (error) {
      return NextResponse.json(
        {
          success: false,
          message: "Walkthrough saved, but a unit rehab total could not update.",
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    success: true,
    propertyId: id,
    savedAt: now,
  });
}

export async function PATCH(
  request: Request,
  context: WalkthroughRouteContext,
) {
  try {
    return await updateWalkthrough(request, context);
  } catch (error) {
    console.error("Walkthrough save failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "The walkthrough could not be saved. Please try again.",
      },
      { status: 500 },
    );
  }
}
