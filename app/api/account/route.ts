import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const RELATED_PROPERTY_TABLES = [
  "property_units",
  "property_visits",
  "property_tags",
] as const;

export async function DELETE() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Account deletion is not configured on this server yet. Add SUPABASE_SERVICE_ROLE_KEY, then try again.",
      },
      { status: 503 },
    );
  }

  const admin = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: properties, error: propertiesError } = await admin
    .from("properties")
    .select("id")
    .eq("user_id", user.id);

  if (propertiesError) {
    return NextResponse.json(
      {
        success: false,
        message: "Could not load account properties for deletion.",
        error: propertiesError.message,
      },
      { status: 500 },
    );
  }

  const propertyIds = (properties || []).map((property) => property.id);

  if (propertyIds.length > 0) {
    for (const table of RELATED_PROPERTY_TABLES) {
      const { error } = await admin
        .from(table)
        .delete()
        .in("property_id", propertyIds);

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
  }

  const { error: propertyDeleteError } = await admin
    .from("properties")
    .delete()
    .eq("user_id", user.id);

  if (propertyDeleteError) {
    return NextResponse.json(
      {
        success: false,
        message: "Could not delete account properties.",
        error: propertyDeleteError.message,
      },
      { status: 500 },
    );
  }

  const { error: userDeleteError } = await admin.auth.admin.deleteUser(user.id);

  if (userDeleteError) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Property data was removed, but the auth account could not be deleted. Contact support to finish deletion.",
        error: userDeleteError.message,
      },
      { status: 500 },
    );
  }

  await supabase.auth.signOut();

  return NextResponse.json({
    success: true,
  });
}
