import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PropertyUnitForm } from "@/components/PropertyUnitForm";
import { DealAnalyzer } from "@/components/DealAnalyzer";
import { PropertyStatusUpdater } from "@/components/PropertyStatusUpdater";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PropertyVisitLog } from "@/components/PropertyVisitLog";
import { DeleteUnitButton } from "@/components/DeleteUnitButton";
import { PropertyEditForm } from "@/components/PropertyEditForm";
import { PropertyTags } from "@/components/PropertyTags";
import { DealScoreCard } from "@/components/DealScoreCard";
import { MobilityFmrCard } from "@/components/MobilityFmrCard";
import { ArchivePropertyButton } from "@/components/ArchivePropertyButton";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type PropertyUnit = {
  id: string;
  property_id: string;

  unit_label?: string | null;
  beds?: number | null;
  baths?: number | null;
  current_rent?: number | null;
  projected_rent?: number | null;
  fmr_rent?: number | null;
  fmr_bedroom_count?: number | null;
  base_fmr_rent?: number | null;
  mobility_fmr_rent?: number | null;
  fmr_updated_at?: string | null;
  condition?: string | null;
  rehab_estimate?: number | null;
  notes?: string | null;

  unit_number?: string | null;
  floor_number?: string | null;
  sqft?: number | null;
  rooms?: number | null;
  bedrooms?: number | null;
  full_baths?: number | null;
  half_baths?: number | null;
  master_bedroom_bath?: string | null;
  security_deposit?: number | null;
  rent?: number | null;
  lease_expiration?: string | null;
  appliances_features?: string | null;
  tenant_pays?: string | null;

  created_at?: string | null;
};

function formatCurrency(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "Not entered";

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return "Not entered";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(numberValue);
}

function formatNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return "-";

  return new Intl.NumberFormat("en-US").format(numberValue);
}

function valueOrDash(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

function getGoogleMapsUrl(property: any) {
  const addressParts = [
    property.address,
    property.city,
    property.state,
    property.zip,
  ].filter(Boolean);

  const fullAddress = addressParts.join(", ");

  if (!fullAddress) return null;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    fullAddress
  )}`;
}

function getUnitLabel(unit: PropertyUnit) {
  return unit.unit_number || unit.unit_label || "Unit";
}

function getUnitBeds(unit: PropertyUnit) {
  return unit.bedrooms ?? unit.beds ?? null;
}

function getUnitBaths(unit: PropertyUnit) {
  const fullBaths = unit.full_baths;
  const halfBaths = unit.half_baths;
  const oldBaths = unit.baths;

  if (fullBaths !== null && fullBaths !== undefined) {
    if (halfBaths !== null && halfBaths !== undefined && Number(halfBaths) > 0) {
      return `${fullBaths} full / ${halfBaths} half`;
    }

    return `${fullBaths}`;
  }

  if (oldBaths !== null && oldBaths !== undefined) {
    return String(oldBaths);
  }

  return "-";
}

function getCurrentRent(unit: PropertyUnit) {
  return unit.current_rent ?? unit.rent ?? null;
}

function getProjectedRent(unit: PropertyUnit) {
  return unit.projected_rent ?? unit.rent ?? null;
}

function getFmrUpside(unit: PropertyUnit) {
  const fmrRent = unit.fmr_rent;
  const currentRent = getCurrentRent(unit);

  if (!hasValue(fmrRent) || !hasValue(currentRent)) {
    return null;
  }

  const fmrNumber = Number(fmrRent);
  const currentRentNumber = Number(currentRent);

  if (!Number.isFinite(fmrNumber) || !Number.isFinite(currentRentNumber)) {
    return null;
  }

  return fmrNumber - currentRentNumber;
}

export default async function PropertyDetailPage({ params }: PageProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { id } = await params;

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .single();

  const { data: units, error: unitsError } = await supabase
    .from("property_units")
    .select("*")
    .eq("property_id", id)
    .order("created_at", { ascending: true });

  const { data: tags } = await supabase
    .from("property_tags")
    .select("tag")
    .eq("property_id", id);

  if (propertyError || !property) {
    return (
      <AppShell>
        <p className="text-red-600">Property not found.</p>
      </AppShell>
    );
  }

  const unitList = ((units || []) as PropertyUnit[]).sort((a, b) => {
    const aLabel = getUnitLabel(a);
    const bLabel = getUnitLabel(b);

    const aNumber = Number(aLabel);
    const bNumber = Number(bLabel);

    if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
      return aNumber - bNumber;
    }

    return aLabel.localeCompare(bLabel);
  });

  const askingPrice = property.asking_price ?? property.list_price ?? null;
  const taxesAnnual = property.taxes_annual ?? property.taxes ?? null;

  const projectedMonthlyRent = unitList.reduce(
    (sum, unit) => sum + Number(getProjectedRent(unit) || 0),
    0
  );

  const currentMonthlyRent = unitList.reduce(
    (sum, unit) => sum + Number(getCurrentRent(unit) || 0),
    0
  );

  const totalRehab = unitList.reduce(
    (sum, unit) => sum + Number(unit.rehab_estimate || 0),
    0
  );

  const totalFmrRent = unitList.reduce(
    (sum, unit) => sum + Number(unit.fmr_rent || 0),
    0
  );

  const totalFmrUpside = unitList.reduce(
    (sum, unit) => sum + Number(getFmrUpside(unit) || 0),
    0
  );

  const annualCurrentRent = currentMonthlyRent * 12;

  const estimatedExpenses =
    property.operating_expenses !== null && property.operating_expenses !== undefined
      ? Number(property.operating_expenses || 0)
      : annualCurrentRent * 0.3 + Number(taxesAnnual || 0);

  const estimatedNoi =
    property.net_operating_income !== null &&
    property.net_operating_income !== undefined
      ? Number(property.net_operating_income || 0)
      : annualCurrentRent - estimatedExpenses;

  const estimatedCapRate =
    Number(askingPrice) > 0 ? estimatedNoi / Number(askingPrice) : null;

  const tagList = (tags || []).map((tag) => tag.tag);

  const locationLine =
    property.city || property.state || property.zip
      ? `${property.city || ""}${property.city && property.state ? ", " : ""}${
          property.state || ""
        } ${property.zip || ""}`.trim()
      : property.mls_number
        ? `MLS #${property.mls_number}`
        : "";

  const hasMlsFinancials =
    hasValue(property.gross_income) ||
    hasValue(property.operating_expenses) ||
    hasValue(property.net_operating_income);

  const hasBuildingDetails =
    hasValue(property.basement) ||
    hasValue(property.roof) ||
    hasValue(property.exterior) ||
    hasValue(property.zoning) ||
    hasValue(property.parking) ||
    hasValue(property.heating) ||
    hasValue(property.cooling);

  const hasListingAgent =
    hasValue(property.listing_agent_name) ||
    hasValue(property.listing_agent_phone);

  const googleMapsUrl = getGoogleMapsUrl(property);

  return (
    <AppShell>
      <div className="mb-6">
        <Link
          href="/pipeline"
          className="text-sm text-slate-600 hover:text-slate-950"
        >
          ← Back to Pipeline
        </Link>
      </div>

      <div className="mb-8">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {property.source === "chrome_extension" && (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              Imported from MLS
            </span>
          )}

          {property.mls_number && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              MLS #{property.mls_number}
            </span>
          )}

          {property.is_mobility_area === true && (
            <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
              CHA Mobility Area
            </span>
          )}

          {property.is_archived === true && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              Archived
            </span>
          )}
        </div>

        <h2 className="text-3xl font-bold text-slate-950">
          {property.address}
        </h2>

        {locationLine && <p className="text-slate-600">{locationLine}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {property.source_url && (
            <a
              href={property.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Open original listing
            </a>
          )}

          {googleMapsUrl && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Open in Google Maps
            </a>
          )}

          {property.is_archived !== true && (
            <ArchivePropertyButton propertyId={id} />
          )}
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Asking Price</p>
          <p className="text-2xl font-bold text-slate-950">
            {formatCurrency(askingPrice)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Projected Rent</p>
          <p className="text-2xl font-bold text-slate-950">
            {formatCurrency(projectedMonthlyRent)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Current Rent</p>
          <p className="text-2xl font-bold text-slate-950">
            {formatCurrency(currentMonthlyRent)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Estimated Rehab</p>
          <p className="text-2xl font-bold text-slate-950">
            {formatCurrency(totalRehab)}
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Annual Rent</p>
          <p className="text-xl font-bold text-slate-950">
            {formatCurrency(annualCurrentRent)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Est. NOI</p>
          <p className="text-xl font-bold text-slate-950">
            {formatCurrency(estimatedNoi)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Est. Cap Rate</p>
          <p className="text-xl font-bold text-slate-950">
            {estimatedCapRate !== null
              ? `${(estimatedCapRate * 100).toFixed(2)}%`
              : "Not entered"}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Taxes</p>
          <p className="text-xl font-bold text-slate-950">
            {formatCurrency(taxesAnnual)}
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Total FMR Rent</p>
          <p className="text-2xl font-bold text-slate-950">
            {formatCurrency(totalFmrRent)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Total FMR Upside</p>
          <p className="text-2xl font-bold text-slate-950">
            {formatCurrency(totalFmrUpside)}
          </p>
        </div>
      </div>

      {hasMlsFinancials && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-4 text-lg font-semibold text-slate-950">
            MLS Financials
          </h3>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-slate-500">Gross Income</p>
              <p className="text-xl font-bold text-slate-950">
                {formatCurrency(property.gross_income)}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">Operating Expenses</p>
              <p className="text-xl font-bold text-slate-950">
                {formatCurrency(property.operating_expenses)}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">Net Operating Income</p>
              <p className="text-xl font-bold text-slate-950">
                {formatCurrency(property.net_operating_income)}
              </p>
            </div>
          </div>
        </div>
      )}

      <MobilityFmrCard
        propertyId={id}
        isMobilityArea={property.is_mobility_area}
        mobilityCheckedAt={property.mobility_checked_at}
        mobilityMatchedAddress={property.mobility_matched_address}
        mobilityNotes={property.mobility_notes}
        mobilityLat={property.mobility_lat}
        mobilityLng={property.mobility_lng}
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <PropertyStatusUpdater
            propertyId={id}
            currentStatus={property.status}
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Condition</p>
          <p className="text-xl font-bold text-slate-950">
            {property.condition || "Not entered"}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Property Type</p>
          <p className="text-xl font-bold text-slate-950">
            {property.property_type || "Not entered"}
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Year Built</p>
          <p className="text-lg font-bold text-slate-950">
            {valueOrDash(property.year_built)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Sq Ft</p>
          <p className="text-lg font-bold text-slate-950">
            {formatNumber(property.sqft)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Lot Size</p>
          <p className="text-lg font-bold text-slate-950">
            {valueOrDash(property.lot_size)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">PIN / Parcel</p>
          <p className="text-lg font-bold text-slate-950">
            {valueOrDash(property.parcel_number)}
          </p>
        </div>
      </div>

      {hasBuildingDetails && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-4 text-lg font-semibold text-slate-950">
            Building Details
          </h3>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-slate-500">Basement</p>
              <p className="font-medium text-slate-950">
                {valueOrDash(property.basement)}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">Roof</p>
              <p className="font-medium text-slate-950">
                {valueOrDash(property.roof)}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">Exterior</p>
              <p className="font-medium text-slate-950">
                {valueOrDash(property.exterior)}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">Zoning</p>
              <p className="font-medium text-slate-950">
                {valueOrDash(property.zoning)}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">Parking</p>
              <p className="font-medium text-slate-950">
                {valueOrDash(property.parking)}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">Heating</p>
              <p className="font-medium text-slate-950">
                {valueOrDash(property.heating)}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">Cooling</p>
              <p className="font-medium text-slate-950">
                {valueOrDash(property.cooling)}
              </p>
            </div>
          </div>
        </div>
      )}

      {hasListingAgent && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-4 text-lg font-semibold text-slate-950">
            Listing Agent
          </h3>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-slate-500">Agent Name</p>
              <p className="font-medium text-slate-950">
                {valueOrDash(property.listing_agent_name)}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">Agent Phone</p>
              <p className="font-medium text-slate-950">
                {valueOrDash(property.listing_agent_phone)}
              </p>
            </div>
          </div>
        </div>
      )}

      <PropertyTags propertyId={id} />

      <DealScoreCard
        askingPrice={askingPrice}
        projectedMonthlyRent={projectedMonthlyRent}
        totalRehab={totalRehab}
        condition={property.condition}
        tags={tagList}
      />

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-slate-700">Notes</p>
        <p className="whitespace-pre-wrap text-slate-700">
          {property.notes || property.description || "No notes yet."}
        </p>
      </div>

      {property.broker_remarks && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-semibold text-slate-700">
            Broker Remarks
          </p>
          <p className="whitespace-pre-wrap text-slate-700">
            {property.broker_remarks}
          </p>
        </div>
      )}

      <PropertyEditForm property={property} />

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-4 text-lg font-semibold text-slate-950">Units</h3>

        {unitsError && (
          <p className="mb-4 text-sm text-red-600">
            Error loading units: {unitsError.message}
          </p>
        )}

        {unitList.length === 0 ? (
          <p className="text-sm text-slate-500">No units added yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2">Unit</th>
                  <th className="py-2">Floor</th>
                  <th className="py-2">Sq Ft</th>
                  <th className="py-2">Rooms</th>
                  <th className="py-2">Beds</th>
                  <th className="py-2">Baths</th>
                  <th className="py-2">Current Rent</th>
                  <th className="py-2">Projected Rent</th>
                  <th className="py-2">FMR</th>
                  <th className="py-2">FMR Upside</th>
                  <th className="py-2">Lease Exp.</th>
                  <th className="py-2">Tenant Pays</th>
                  <th className="py-2">Condition</th>
                  <th className="py-2">Rehab</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>

              <tbody>
                {unitList.map((unit) => (
                  <tr key={unit.id} className="border-b border-slate-100">
                    <td className="py-3 font-medium text-slate-950">
                      {getUnitLabel(unit)}
                    </td>

                    <td className="py-3 text-slate-700">
                      {valueOrDash(unit.floor_number)}
                    </td>

                    <td className="py-3 text-slate-700">
                      {formatNumber(unit.sqft)}
                    </td>

                    <td className="py-3 text-slate-700">
                      {valueOrDash(unit.rooms)}
                    </td>

                    <td className="py-3 text-slate-700">
                      {valueOrDash(getUnitBeds(unit))}
                    </td>

                    <td className="py-3 text-slate-700">
                      {getUnitBaths(unit)}
                    </td>

                    <td className="py-3 text-slate-700">
                      {formatCurrency(getCurrentRent(unit))}
                    </td>

                    <td className="py-3 text-slate-700">
                      {formatCurrency(getProjectedRent(unit))}
                    </td>

                    <td className="py-3 text-slate-700">
                      {formatCurrency(unit.fmr_rent)}
                    </td>

                    <td className="py-3 text-slate-700">
                      {formatCurrency(getFmrUpside(unit))}
                    </td>

                    <td className="py-3 text-slate-700">
                      {valueOrDash(unit.lease_expiration)}
                    </td>

                    <td className="py-3 text-slate-700">
                      {valueOrDash(unit.tenant_pays)}
                    </td>

                    <td className="py-3 text-slate-700">
                      {unit.condition || "-"}
                    </td>

                    <td className="py-3 text-slate-700">
                      {formatCurrency(unit.rehab_estimate)}
                    </td>

                    <td className="py-3">
                      <DeleteUnitButton unitId={unit.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {unitList.some((unit) => unit.appliances_features) && (
          <div className="mt-4 rounded-lg bg-slate-50 p-4">
            <p className="mb-2 text-sm font-semibold text-slate-700">
              Appliances / Features
            </p>

            <div className="space-y-2 text-sm text-slate-700">
              {unitList
                .filter((unit) => unit.appliances_features)
                .map((unit) => (
                  <p key={`${unit.id}-features`}>
                    <span className="font-medium">
                      Unit {getUnitLabel(unit)}:
                    </span>{" "}
                    {unit.appliances_features}
                  </p>
                ))}
            </div>
          </div>
        )}
      </div>

      <PropertyVisitLog propertyId={id} />

      <DealAnalyzer
        askingPrice={askingPrice}
        taxesAnnual={taxesAnnual}
        insuranceAnnual={property.insurance_annual}
        projectedMonthlyRent={projectedMonthlyRent}
        totalRehab={totalRehab}
      />

      <PropertyUnitForm propertyId={id} />
    </AppShell>
  );
}