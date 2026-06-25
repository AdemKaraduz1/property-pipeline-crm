import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const defaultPropertyUserId = process.env.DEFAULT_PROPERTY_USER_ID;

function toText(value: string | null): string | null {
  if (!value) return null;

  const text = value.trim();
  return text.length > 0 ? text : null;
}

export async function GET(request: Request) {
  try {
    if (!supabaseUrl || !supabaseServiceRoleKey || !defaultPropertyUserId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Missing Supabase environment variables or DEFAULT_PROPERTY_USER_ID.",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { searchParams } = new URL(request.url);

    const mlsNumber = toText(searchParams.get("mlsNumber"));
    const sourceUrl = toText(searchParams.get("sourceUrl"));

    if (!mlsNumber && !sourceUrl) {
      return NextResponse.json({
        success: true,
        exists: false,
      });
    }

    if (mlsNumber) {
      const { data, error } = await supabase
        .from("properties")
        .select("id, address, mls_number, source_url")
        .eq("user_id", defaultPropertyUserId)
        .eq("mls_number", mlsNumber)
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          {
            success: false,
            message: "Existing property lookup by MLS failed.",
            error: error.message,
          },
          { status: 500 }
        );
      }

      if (data) {
        return NextResponse.json({
          success: true,
          exists: true,
          matchType: "mls_number",
          propertyId: data.id,
          property: data,
        });
      }
    }

    if (sourceUrl) {
      const { data, error } = await supabase
        .from("properties")
        .select("id, address, mls_number, source_url")
        .eq("user_id", defaultPropertyUserId)
        .eq("source_url", sourceUrl)
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          {
            success: false,
            message: "Existing property lookup by source URL failed.",
            error: error.message,
          },
          { status: 500 }
        );
      }

      if (data) {
        return NextResponse.json({
          success: true,
          exists: true,
          matchType: "source_url",
          propertyId: data.id,
          property: data,
        });
      }
    }

    return NextResponse.json({
      success: true,
      exists: false,
    });
  } catch (error) {
    console.error("Existing property check failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Existing property check failed.",
      },
      { status: 500 }
    );
  }
}