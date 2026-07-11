import { NextResponse } from "next/server";
import { parseStabilizationPlanSettings } from "@/lib/stabilization";
import { asRecord } from "@/lib/rehab";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
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

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object" || !asRecord(body).settings) {
    return NextResponse.json(
      { success: false, message: "Invalid stabilization plan settings." },
      { status: 400 },
    );
  }

  const settings = parseStabilizationPlanSettings(asRecord(body).settings);
  const { id } = await context.params;
  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("all_extracted_fields")
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
      { status: 404 },
    );
  }

  const metadata = asRecord(property.all_extracted_fields);
  const { error: updateError } = await supabase
    .from("properties")
    .update({
      all_extracted_fields: {
        ...metadata,
        stabilization_plan: settings,
      },
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      {
        success: false,
        message: "Could not save stabilization plan.",
        error: updateError.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, propertyId: id });
}
