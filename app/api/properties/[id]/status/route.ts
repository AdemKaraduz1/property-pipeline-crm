import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_STATUSES = new Set([
  "lead",
  "researching",
  "visit_scheduled",
  "visited",
  "analyzing",
  "offer_ready",
  "offer_made",
  "rejected",
  "under_contract",
  "purchased",
  "archived",
]);

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
  const body = await request.json();
  const status = body.status;

  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid status.",
      },
      { status: 400 }
    );
  }

  const isArchived = status === "archived";
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("properties")
    .update({
      status,
      updated_at: now,
      is_archived: isArchived,
      archived_at: isArchived ? now : null,
      archive_reason: isArchived ? "Status changed to Archive" : null,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Could not update property status.",
        error: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    propertyId: id,
    status,
  });
}
