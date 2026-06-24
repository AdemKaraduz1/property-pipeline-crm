import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const address = searchParams.get("address") || "";
  const city = searchParams.get("city") || "";
  const state = searchParams.get("state") || "";
  const zip = searchParams.get("zip") || "";

  const query = [address, city, state, zip]
    .filter(Boolean)
    .join(", ");

  if (!query.trim()) {
    return NextResponse.json(
      { error: "Address is required." },
      { status: 400 }
    );
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "Property Pipeline CRM local development",
    },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "Unable to geocode address." },
      { status: 500 }
    );
  }

  const data = await response.json();

  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "No coordinates found for this address." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    latitude: Number(data[0].lat),
    longitude: Number(data[0].lon),
    displayName: data[0].display_name,
  });
}