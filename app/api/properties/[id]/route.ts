import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const RELATED_PROPERTY_TABLES = [
  "property_units",
  "property_visits",
  "property_tags",
] as const;

export async function DELETE(
  _request: Request,
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
      {
        success: false,
        message: "Not authenticated.",
      },
      { status: 401 },
    );
  }

  const { id } = await context.params;

  const { data: property, error: propertyLookupError } = await supabase
    .from("properties")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (propertyLookupError) {
    return NextResponse.json(
      {
        success: false,
        message: "Could not verify property ownership.",
        error: propertyLookupError.message,
      },
      { status: 500 },
    );
  }

  if (!property) {
    return NextResponse.json(
      {
        success: false,
        message: "Property not found.",
      },
      { status: 404 },
    );
  }

  for (const table of RELATED_PROPERTY_TABLES) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("property_id", id);

    if (error) {
      return NextResponse.json(
        {
          success: false,
          message: `Could not delete related ${table.replaceAll("_", " ")}.`,
          error: error.message,
        },
        { status: 500 },
      );
    }
  }

  const { error: propertyDeleteError } = await supabase
    .from("properties")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (propertyDeleteError) {
    return NextResponse.json(
      {
        success: false,
        message: "Could not delete property.",
        error: propertyDeleteError.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    propertyId: id,
  });
}
