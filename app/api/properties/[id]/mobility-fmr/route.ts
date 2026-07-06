import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateChicagoFmr } from "@/lib/fmr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CHA_INSTANT_APP_ID = "5ce5a99dad2e4579b2095e514ad64294";
const CHA_SECONDARY_APP_ID = "cea7851188664bbe89b990dc355b6f80";

type ArcgisLayerCandidate = {
  url: string;
  label: string;
};

function cleanUrl(value: string) {
  return value.replace(/\/$/, "");
}

function formatAddress(property: Record<string, unknown>) {
  const streetAddress = String(property.address || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!streetAddress) return "";

  const city = property.city || "Chicago";
  const state = property.state || "IL";
  const zip = property.zip || "";

  return [streetAddress, city, state, zip].filter(Boolean).join(", ");
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const numberValue = Number(String(value).replace(/[$,]/g, ""));

  return Number.isFinite(numberValue) ? numberValue : null;
}

function getBedroomCount(unit: Record<string, unknown>) {
  const bedroomValue = unit.bedrooms ?? unit.beds ?? unit.fmr_bedroom_count;
  const bedrooms = toNumber(bedroomValue);

  if (bedrooms === null) return null;

  return Math.max(0, Math.round(bedrooms));
}

async function getJson(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${url}`);
  }

  return response.json();
}

async function geocodeAddress(address: string) {
  const cleanedAddress = address
    .replace(/\s+/g, " ")
    .replace(/,\s*,/g, ",")
    .trim();

  console.log("Geocoding address:", cleanedAddress);

  // 1. Try Census geocoder first
  try {
    const censusUrl = new URL(
      "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
    );

    censusUrl.searchParams.set("address", cleanedAddress);
    censusUrl.searchParams.set("benchmark", "Public_AR_Current");
    censusUrl.searchParams.set("format", "json");

    const censusData = await getJson(censusUrl.toString());
    const censusMatch = censusData?.result?.addressMatches?.[0];

    if (censusMatch?.coordinates) {
      return {
        lat: censusMatch.coordinates.y,
        lng: censusMatch.coordinates.x,
        matchedAddress: censusMatch.matchedAddress || cleanedAddress,
        geocoder: "census",
      };
    }
  } catch (error) {
    console.warn("Census geocoder failed:", error);
  }

  // 2. Fallback to ArcGIS World Geocoder
  try {
    const arcgisUrl = new URL(
      "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates"
    );

    arcgisUrl.searchParams.set("f", "json");
    arcgisUrl.searchParams.set("SingleLine", cleanedAddress);
    arcgisUrl.searchParams.set("outFields", "Match_addr,Addr_type");
    arcgisUrl.searchParams.set("maxLocations", "1");
    arcgisUrl.searchParams.set("countryCode", "USA");

    const arcgisData = await getJson(arcgisUrl.toString());
    const arcgisMatch = arcgisData?.candidates?.[0];

    if (arcgisMatch?.location) {
      return {
        lat: arcgisMatch.location.y,
        lng: arcgisMatch.location.x,
        matchedAddress: arcgisMatch.address || cleanedAddress,
        geocoder: "arcgis",
      };
    }
  } catch (error) {
    console.warn("ArcGIS geocoder failed:", error);
  }

  throw new Error(`Could not geocode address: ${cleanedAddress}`);
}

function collectLayerCandidatesFromObject(
  value: unknown,
  candidates: ArcgisLayerCandidate[] = [],
  parentLabel = ""
) {
  if (!value) return candidates;

  if (Array.isArray(value)) {
    value.forEach((item) =>
      collectLayerCandidatesFromObject(item, candidates, parentLabel)
    );

    return candidates;
  }

  if (typeof value !== "object") return candidates;

  const objectValue = value as Record<string, unknown>;
  const layerDefinition =
    objectValue.layerDefinition &&
    typeof objectValue.layerDefinition === "object"
      ? (objectValue.layerDefinition as Record<string, unknown>)
      : {};
  const popupInfo =
    objectValue.popupInfo && typeof objectValue.popupInfo === "object"
      ? (objectValue.popupInfo as Record<string, unknown>)
      : {};

  const label = [
    parentLabel,
    objectValue.title,
    objectValue.name,
    objectValue.id,
    layerDefinition.name,
    popupInfo.title,
  ]
    .filter(Boolean)
    .join(" ");

  if (typeof objectValue.url === "string") {
    const baseUrl = cleanUrl(objectValue.url);

    const looksLikeLayer = /\/(FeatureServer|MapServer)\/\d+$/i.test(baseUrl);
    const looksLikeService = /\/(FeatureServer|MapServer)$/i.test(baseUrl);

    if (looksLikeLayer) {
      candidates.push({
        url: baseUrl,
        label,
      });
    } else if (looksLikeService && typeof objectValue.layerId === "number") {
      candidates.push({
        url: `${baseUrl}/${objectValue.layerId}`,
        label,
      });
    }
  }

  Object.values(objectValue).forEach((childValue) =>
    collectLayerCandidatesFromObject(childValue, candidates, label)
  );

  return candidates;
}

function collectPossibleWebMapIds(value: unknown, ids = new Set<string>()) {
  if (!value) return ids;

  if (typeof value === "string") {
    if (/^[a-f0-9]{32}$/i.test(value)) {
      ids.add(value);
    }

    return ids;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectPossibleWebMapIds(item, ids));
    return ids;
  }

  if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
      const keyLooksRelevant =
        /webmap|web_map|web map|mapid|map_id|itemid|item_id/i.test(key);

      if (keyLooksRelevant) {
        collectPossibleWebMapIds(child, ids);
      } else if (typeof child === "object") {
        collectPossibleWebMapIds(child, ids);
      }
    });
  }

  return ids;
}

async function getArcgisItemData(itemId: string) {
  const url = `https://thecha.maps.arcgis.com/sharing/rest/content/items/${itemId}/data?f=json`;
  return getJson(url);
}

async function getMobilityLayerCandidates() {
  const candidates: ArcgisLayerCandidate[] = [];
  const appIds = [CHA_INSTANT_APP_ID, CHA_SECONDARY_APP_ID];

  for (const appId of appIds) {
    try {
      const appData = await getArcgisItemData(appId);

      candidates.push(...collectLayerCandidatesFromObject(appData));

      const possibleWebMapIds = [...collectPossibleWebMapIds(appData)].filter(
        (id) => !appIds.includes(id)
      );

      for (const webMapId of possibleWebMapIds) {
        try {
          const webMapData = await getArcgisItemData(webMapId);
          candidates.push(...collectLayerCandidatesFromObject(webMapData));
        } catch {
          // Ignore inaccessible candidate web maps.
        }
      }
    } catch {
      // Ignore one failed app item and try the next.
    }
  }

  const uniqueCandidates = new Map<string, ArcgisLayerCandidate>();

  candidates.forEach((candidate) => {
    if (!uniqueCandidates.has(candidate.url)) {
      uniqueCandidates.set(candidate.url, candidate);
    }
  });

  const allCandidates = [...uniqueCandidates.values()];

  const mobilityCandidates = allCandidates.filter((candidate) =>
    /mobility|opportunity|exception|payment|voucher/i.test(
      `${candidate.label} ${candidate.url}`
    )
  );

  return mobilityCandidates.length > 0 ? mobilityCandidates : allCandidates;
}

async function queryMobilityLayer(
  candidate: ArcgisLayerCandidate,
  lng: number,
  lat: number
) {
  const url = new URL(`${candidate.url}/query`);

  url.searchParams.set("f", "json");
  url.searchParams.set("where", "1=1");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("geometryType", "esriGeometryPoint");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outFields", "*");
  url.searchParams.set(
    "geometry",
    JSON.stringify({
      x: lng,
      y: lat,
      spatialReference: {
        wkid: 4326,
      },
    })
  );

  const data = await getJson(url.toString());

  return {
    candidate,
    features: data?.features || [],
  };
}

async function checkChaMobilityArea(lng: number, lat: number) {
  const candidates = await getMobilityLayerCandidates();

  if (candidates.length === 0) {
    throw new Error("Could not find any CHA ArcGIS layers to check.");
  }

  console.log(
    "CHA mobility layer candidates:",
    candidates.map((candidate) => ({
      label: candidate.label,
      url: candidate.url,
    }))
  );

  for (const candidate of candidates) {
    try {
      const result = await queryMobilityLayer(candidate, lng, lat);

      if (result.features.length > 0) {
        const attributes = result.features[0]?.attributes || {};

        console.log("Matched CHA layer attributes:", {
          layerLabel: candidate.label,
          layerUrl: candidate.url,
          attributes,
        });

        const attributeText = Object.entries(attributes)
          .map(([key, value]) => `${key}: ${value}`)
          .join(" ")
          .toLowerCase();

        const explicitlyNotMobility =
          attributeText.includes("not mobility") ||
          attributeText.includes("non mobility") ||
          attributeText.includes("non-mobility") ||
          attributeText.includes("mobility: no") ||
          attributeText.includes("mobility_area: no") ||
          attributeText.includes("mobilityarea: no") ||
          attributeText.includes("false");

        const explicitlyMobility =
          attributeText.includes("mobility area") ||
          attributeText.includes("mobility: yes") ||
          attributeText.includes("mobility_area: yes") ||
          attributeText.includes("mobilityarea: yes") ||
          attributeText.includes("eligible") ||
          attributeText.includes("true");

        if (explicitlyNotMobility) {
          return {
            isMobilityArea: false,
            layerUrl: candidate.url,
            layerLabel: candidate.label,
            attributes,
          };
        }

        if (explicitlyMobility) {
          return {
            isMobilityArea: true,
            layerUrl: candidate.url,
            layerLabel: candidate.label,
            attributes,
          };
        }

        // Safety rule:
        // If the layer only returns a generic community polygon and does not clearly say
        // the property is mobility-eligible, do not automatically mark it as mobility.
        return {
          isMobilityArea: false,
          layerUrl: candidate.url,
          layerLabel: candidate.label,
          attributes,
        };
      }
    } catch (error) {
      console.warn("CHA layer query failed:", candidate.url, error);
    }
  }

  return {
    isMobilityArea: false,
    layerUrl: candidates[0]?.url || null,
    layerLabel: candidates[0]?.label || null,
    attributes: null,
  };
}

export async function POST(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing Supabase environment variables.",
        },
        { status: 500 }
      );
    }

    const { id } = await context.params;

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("*")
      .eq("id", id)
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

    const fullAddress = formatAddress(property);

    if (!fullAddress) {
      return NextResponse.json(
        {
          success: false,
          message: "Property does not have an address to check.",
        },
        { status: 400 }
      );
    }

    const geocoded = await geocodeAddress(fullAddress);
    const mobilityResult = await checkChaMobilityArea(
      geocoded.lng,
      geocoded.lat
    );

    const now = new Date().toISOString();

    const unitUpdates = (units || []).map((unit) => {
      const bedrooms = getBedroomCount(unit);
      const { baseFmrRent, mobilityFmrRent, appliedFmrRent } =
        calculateChicagoFmr(bedrooms, mobilityResult.isMobilityArea);

      return {
        id: unit.id,
        fmr_bedroom_count: bedrooms,
        base_fmr_rent: baseFmrRent,
        mobility_fmr_rent: mobilityFmrRent,
        fmr_rent: appliedFmrRent,
        fmr_updated_at: now,
      };
    });

    const { error: propertyUpdateError } = await supabase
      .from("properties")
      .update({
        is_mobility_area: mobilityResult.isMobilityArea,
        mobility_checked_at: now,
        mobility_check_method: `auto_arcgis_census_geocoder_${
          geocoded.geocoder || "unknown"
        }`,
        mobility_notes: mobilityResult.isMobilityArea
          ? `Matched CHA Mobility Area layer: ${mobilityResult.layerLabel || ""}`
          : `No CHA Mobility Area match found. Checked layer: ${
              mobilityResult.layerLabel || ""
            }`,
        mobility_lat: geocoded.lat,
        mobility_lng: geocoded.lng,
        mobility_matched_address: geocoded.matchedAddress,
      })
      .eq("id", id);

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

    if (unitUpdates.length > 0) {
      for (const unitUpdate of unitUpdates) {
        const { id: unitId, ...updatePayload } = unitUpdate;

        const { error: unitUpdateError } = await supabase
          .from("property_units")
          .update(updatePayload)
          .eq("id", unitId);

        if (unitUpdateError) {
          console.error("Could not update unit FMR values:", {
            unitId,
            updatePayload,
            error: unitUpdateError,
          });

          return NextResponse.json(
            {
              success: false,
              message: "Could not update unit FMR values.",
              unitId,
              error: unitUpdateError.message,
              details: unitUpdateError.details,
              hint: unitUpdateError.hint,
              code: unitUpdateError.code,
            },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      propertyId: id,
      isMobilityArea: mobilityResult.isMobilityArea,
      matchedAddress: geocoded.matchedAddress,
      lat: geocoded.lat,
      lng: geocoded.lng,
      geocoder: geocoded.geocoder,
      method: "auto_arcgis_census_geocoder",
      layerUrl: mobilityResult.layerUrl,
      layerLabel: mobilityResult.layerLabel,
      units: unitUpdates,
    });
  } catch (error) {
    console.error("Mobility/FMR check failed:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Mobility/FMR check failed.",
      },
      { status: 500 }
    );
  }
}
