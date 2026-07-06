import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const defaultPropertyUserId = process.env.DEFAULT_PROPERTY_USER_ID;

type ImportedUnit = {
  unitNumber?: unknown;
  floorNumber?: unknown;
  sqft?: unknown;
  rooms?: unknown;
  bedrooms?: unknown;
  fullBaths?: unknown;
  halfBaths?: unknown;
  masterBedroomBath?: unknown;
  securityDeposit?: unknown;
  rent?: unknown;
  leaseExpiration?: unknown;
  appliancesFeatures?: unknown;
  tenantPays?: unknown;
};

type ExistingProperty = {
  id: string;
  all_extracted_fields: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const cleaned = String(value).replace(/[$,]/g, "").trim();
  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value: unknown): number | null {
  const parsed = toNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function parseCityStateZip(address: string | null) {
  if (!address) {
    return {
      cleanAddress: null,
      city: null,
      state: null,
      zip: null,
    };
  }

  const parts = address.split(",").map((part) => part.trim());

  if (parts.length < 2) {
    return {
      cleanAddress: address,
      city: null,
      state: null,
      zip: null,
    };
  }

  const cleanAddress = parts[0] || address;
  const city = parts[1] || null;
  const stateZip = parts[2] || "";

  const stateZipMatch = stateZip.match(/^([A-Z]{2})(?:\s+(\d{5}))?$/i);

  return {
    cleanAddress,
    city,
    state: stateZipMatch?.[1]?.toUpperCase() || null,
    zip: stateZipMatch?.[2] || null,
  };
}

export async function POST(request: Request) {
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

    const payload = await request.json();

    const mlsNumber = toText(payload.mlsNumber);
    const sourceUrl = toText(payload.sourceUrl);
    const rawAddress = toText(payload.address);
    const parsedAddress = parseCityStateZip(rawAddress);

    const listPrice = toNumber(payload.listPrice);
    const taxes = toNumber(payload.taxes);
    const neighborhood = toText(payload.neighborhood);
    const extractedFields = {
      ...asRecord(payload.allExtractedFields),
      ...(neighborhood ? { neighborhood } : {}),
    };

    const propertyPayload = {
      user_id: defaultPropertyUserId,

      source: payload.source || "chrome_extension",
      source_url: sourceUrl,
      page_title: toText(payload.pageTitle),

      address: parsedAddress.cleanAddress || rawAddress,
      city: parsedAddress.city,
      state: parsedAddress.state,
      zip: parsedAddress.zip,

      // Existing app field
      asking_price: listPrice,

      // MLS/import field
      list_price: listPrice,

      beds: toNumber(payload.beds),
      baths: toNumber(payload.baths),
      sqft: toNumber(payload.sqft),
      mls_number: mlsNumber,

      property_type: toText(payload.propertyType),
      year_built: toInteger(payload.yearBuilt),
      lot_size: toText(payload.lotSize),

      // Existing app field
      taxes_annual: taxes,

      // MLS/import field
      taxes,

      hoa: toNumber(payload.hoa),
      days_on_market: toInteger(payload.daysOnMarket),
      parking: toText(payload.parking),
      heating: toText(payload.heating),
      cooling: toText(payload.cooling),
      parcel_number: toText(payload.parcelNumber),

      gross_income: toNumber(payload.grossIncome),
      operating_expenses: toNumber(payload.operatingExpenses),
      net_operating_income: toNumber(payload.netOperatingIncome),
      basement: toText(payload.basement),
      roof: toText(payload.roof),
      exterior: toText(payload.exterior),
      zoning: toText(payload.zoning),
      broker_remarks: toText(payload.brokerRemarks),
      listing_agent_name: toText(payload.listingAgentName),
      listing_agent_phone: toText(payload.listingAgentPhone),

      condition: "unknown",
      status: "lead",

      description: toText(payload.description),
      notes: toText(payload.description),

      all_extracted_fields: extractedFields,
      raw_import: toText(payload.rawImport),
    };

    let existingProperty: ExistingProperty | null = null;

    if (mlsNumber) {
      const { data, error } = await supabase
        .from("properties")
        .select("id, all_extracted_fields")
        .eq("user_id", defaultPropertyUserId)
        .eq("mls_number", mlsNumber)
        .maybeSingle();

      if (error) {
        console.error("Existing property lookup by MLS failed:", error);

        return NextResponse.json(
          {
            success: false,
            message: "Existing property lookup failed",
            error: error.message,
          },
          { status: 500 }
        );
      }

      existingProperty = data;
    }

    if (!existingProperty && sourceUrl) {
      const { data, error } = await supabase
        .from("properties")
        .select("id, all_extracted_fields")
        .eq("user_id", defaultPropertyUserId)
        .eq("source_url", sourceUrl)
        .maybeSingle();

      if (error) {
        console.error("Existing property lookup by source URL failed:", error);

        return NextResponse.json(
          {
            success: false,
            message: "Existing property lookup failed",
            error: error.message,
          },
          { status: 500 }
        );
      }

      existingProperty = data;
    }

    let property: { id: string };
    let action: "created" | "updated";

    if (existingProperty?.id) {
      const updatePayload = {
        ...propertyPayload,
        all_extracted_fields: {
          ...asRecord(existingProperty.all_extracted_fields),
          ...extractedFields,
        },
      };

      const { data, error } = await supabase
        .from("properties")
        .update(updatePayload)
        .eq("id", existingProperty.id)
        .select("id")
        .single();

      if (error) {
        console.error("Property update failed:", error);

        return NextResponse.json(
          {
            success: false,
            message: "Property update failed",
            error: error.message,
          },
          { status: 500 }
        );
      }

      property = data;
      action = "updated";
    } else {
      const { data, error } = await supabase
        .from("properties")
        .insert(propertyPayload)
        .select("id")
        .single();

      if (error) {
        console.error("Property insert failed:", error);

        return NextResponse.json(
          {
            success: false,
            message: "Property insert failed",
            error: error.message,
          },
          { status: 500 }
        );
      }

      property = data;
      action = "created";
    }

    const units: ImportedUnit[] = Array.isArray(payload.unitInformation)
      ? (payload.unitInformation as ImportedUnit[])
      : [];

    const { error: deleteUnitsError } = await supabase
      .from("property_units")
      .delete()
      .eq("property_id", property.id);

    if (deleteUnitsError) {
      console.error("Old unit delete failed:", deleteUnitsError);

      return NextResponse.json(
        {
          success: false,
          message: "Property was saved, but old unit delete failed",
          propertyId: property.id,
          error: deleteUnitsError.message,
        },
        { status: 500 }
      );
    }

    if (units.length > 0) {
      const unitRows = units.map((unit) => {
        const rent = toNumber(unit.rent);
        const bedrooms = toNumber(unit.bedrooms);
        const fullBaths = toNumber(unit.fullBaths);
        const halfBaths = toNumber(unit.halfBaths);

        return {
          property_id: property.id,

          // Existing app fields
          unit_label: toText(unit.unitNumber),
          beds: bedrooms,
          baths:
            fullBaths !== null
              ? fullBaths + (halfBaths || 0) * 0.5
              : null,
          current_rent: rent,
          projected_rent: rent,
          condition: "unknown",
          rehab_estimate: 0,

          // New MLS/import fields
          unit_number: toText(unit.unitNumber),
          floor_number: toText(unit.floorNumber),
          sqft: toNumber(unit.sqft),
          rooms: toNumber(unit.rooms),
          bedrooms,
          full_baths: fullBaths,
          half_baths: halfBaths,
          master_bedroom_bath: toText(unit.masterBedroomBath),
          security_deposit: toNumber(unit.securityDeposit),
          rent,
          lease_expiration: toText(unit.leaseExpiration),
          appliances_features: toText(unit.appliancesFeatures),
          tenant_pays: toText(unit.tenantPays),
        };
      });

      const { error: unitsError } = await supabase
        .from("property_units")
        .insert(unitRows);

      if (unitsError) {
        console.error("Unit insert failed:", unitsError);

        return NextResponse.json(
          {
            success: false,
            message: "Property was saved, but unit insert failed",
            propertyId: property.id,
            error: unitsError.message,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      action,
      propertyId: property.id,
      unitCount: units.length,
    });
  } catch (error) {
    console.error("Listing import failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Listing import failed",
      },
      { status: 500 }
    );
  }
}
