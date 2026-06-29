import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
      {
        success: false,
        message: "Not authenticated.",
      },
      { status: 401 }
    );
  }

  const { id } = await context.params;

  let archiveReason = "Removed from pipeline";

  try {
    const body = await request.json();

    if (body?.archiveReason) {
      archiveReason = String(body.archiveReason);
    }
  } catch {
    // No body is fine.
  }

  const { error } = await supabase
    .from("properties")
    .update({
      is_archived: true,
      archived_at: new Date().toISOString(),
      archive_reason: archiveReason,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Could not remove property from pipeline.",
        error: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    propertyId: id,
  });
}
