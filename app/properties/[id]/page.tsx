import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PropertyUnitForm } from "@/components/PropertyUnitForm";
import { AddUnitModal } from "@/components/AddUnitModal";
import { EditPropertyModal } from "@/components/EditPropertyModal";
import { DealAnalyzer } from "@/components/DealAnalyzer";
import { PropertyStatusUpdater } from "@/components/PropertyStatusUpdater";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PropertyVisitLog } from "@/components/PropertyVisitLog";
import { DeleteUnitButton } from "@/components/DeleteUnitButton";
import { PropertyEditForm } from "@/components/PropertyEditForm";
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

  water_included?: boolean | null;
  electricity_included?: boolean | null;
  gas_included?: boolean | null;

  created_at?: string | null;
};

const WATER_MONTHLY_PER_UNIT = 60;
const ELECTRICITY_MONTHLY_PER_UNIT = 115;
const GAS_MONTHLY_PER_UNIT = 115;

function formatCurrency(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Not entered";
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return "Not entered";
  }

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

function parseMoneyInput(value: FormDataEntryValue | null) {
  const rawValue = String(value ?? "")
    .replace(/[$,]/g, "")
    .trim();

  if (!rawValue) return null;

  const numberValue = Number(rawValue);

  if (!Number.isFinite(numberValue)) return null;

  return numberValue;
}

function parseTextInput(value: FormDataEntryValue | null) {
  const rawValue = String(value ?? "").trim();
  return rawValue || null;
}

function parseDateInput(value: FormDataEntryValue | null) {
  const rawValue = String(value ?? "").trim();
  return rawValue || null;
}

function formatDateInput(value: string | null | undefined) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function getDefaultInsuranceAnnual(unitCount: number) {
  if (unitCount === 2) return 2500;
  if (unitCount === 3) return 3000;
  if (unitCount === 4) return 3500;

  return null;
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
    fullAddress,
  )}`;
}

function getCookCountyTaxUrl(parcelNumber: unknown) {
  if (!parcelNumber) return null;

  const pin = String(parcelNumber).replace(/\D/g, "");

  if (pin.length !== 14) return null;

  return `https://cookcountypropertyinfo.com/cookviewerpinresults.aspx?pin=${pin}`;
}

function formatCookCountyPin(parcelNumber: unknown) {
  if (!parcelNumber) return "-";

  const pin = String(parcelNumber).replace(/\D/g, "");

  if (pin.length !== 14) {
    return String(parcelNumber);
  }

  return `${pin.slice(0, 2)}-${pin.slice(2, 4)}-${pin.slice(
    4,
    7,
  )}-${pin.slice(7, 10)}-${pin.slice(10)}`;
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
    if (
      halfBaths !== null &&
      halfBaths !== undefined &&
      Number(halfBaths) > 0
    ) {
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

function getAnnualUtilityCost(unit: PropertyUnit) {
  let monthlyCost = 0;

  if (unit.water_included === true) monthlyCost += WATER_MONTHLY_PER_UNIT;
  if (unit.electricity_included === true) {
    monthlyCost += ELECTRICITY_MONTHLY_PER_UNIT;
  }
  if (unit.gas_included === true) monthlyCost += GAS_MONTHLY_PER_UNIT;

  return monthlyCost * 12;
}

const inlineInputClass =
  "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-950 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

const smallInlineInputClass =
  "w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-950 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

export default async function PropertyDetailPage({ params }: PageProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { id } = await params;

  async function updateBuildingFinancials(formData: FormData) {
    "use server";

    const updateSupabase = await createClient();

    const updatedTaxesAnnual = parseMoneyInput(formData.get("taxes_annual"));
    const updatedInsuranceAnnual = parseMoneyInput(
      formData.get("insurance_annual"),
    );

    await updateSupabase
      .from("properties")
      .update({
        taxes_annual: updatedTaxesAnnual,
        insurance_annual: updatedInsuranceAnnual,
      })
      .eq("id", id);

    revalidatePath(`/properties/${id}`);
    revalidatePath("/pipeline");
  }

  async function updateUnitInline(formData: FormData) {
    "use server";

    const updateSupabase = await createClient();
    const unitId = String(formData.get("unit_id") ?? "").trim();

    if (!unitId) return;

    const updatedUnitNumber = parseTextInput(formData.get("unit_number"));
    const updatedCurrentRent = parseMoneyInput(formData.get("current_rent"));
    const updatedBeds = parseMoneyInput(formData.get("bedrooms"));
    const updatedFullBaths = parseMoneyInput(formData.get("full_baths"));

    await updateSupabase
      .from("property_units")
      .update({
        unit_number: updatedUnitNumber,
        unit_label: updatedUnitNumber,
        floor_number: parseTextInput(formData.get("floor_number")),
        sqft: parseMoneyInput(formData.get("sqft")),
        rooms: parseMoneyInput(formData.get("rooms")),
        bedrooms: updatedBeds,
        beds: updatedBeds,
        full_baths: updatedFullBaths,
        baths: updatedFullBaths,
        half_baths: parseMoneyInput(formData.get("half_baths")),
        current_rent: updatedCurrentRent,
        rent: updatedCurrentRent,
        projected_rent: parseMoneyInput(formData.get("projected_rent")),
        fmr_rent: parseMoneyInput(formData.get("fmr_rent")),
        lease_expiration: parseDateInput(formData.get("lease_expiration")),
        tenant_pays: parseTextInput(formData.get("tenant_pays")),
        condition: parseTextInput(formData.get("condition")),
        rehab_estimate: parseMoneyInput(formData.get("rehab_estimate")),
        water_included: formData.has("water_included"),
        electricity_included: formData.has("electricity_included"),
        gas_included: formData.has("gas_included"),
      })
      .eq("id", unitId)
      .eq("property_id", id);

    revalidatePath(`/properties/${id}`);
    revalidatePath("/pipeline");
  }

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
  const unitCount = unitList.length;
  const defaultInsuranceAnnual = getDefaultInsuranceAnnual(unitCount);
  const insuranceAnnual = hasValue(property.insurance_annual)
    ? property.insurance_annual
    : defaultInsuranceAnnual;

  const projectedMonthlyRent = unitList.reduce(
    (sum, unit) => sum + Number(getProjectedRent(unit) || 0),
    0,
  );

  const currentMonthlyRent = unitList.reduce(
    (sum, unit) => sum + Number(getCurrentRent(unit) || 0),
    0,
  );

  const totalRehab = unitList.reduce(
    (sum, unit) => sum + Number(unit.rehab_estimate || 0),
    0,
  );

  const totalFmrRent = unitList.reduce(
    (sum, unit) => sum + Number(unit.fmr_rent || 0),
    0,
  );

  const totalFmrUpside = unitList.reduce(
    (sum, unit) => sum + Number(getFmrUpside(unit) || 0),
    0,
  );

  const annualUtilities = unitList.reduce(
    (sum, unit) => sum + getAnnualUtilityCost(unit),
    0,
  );

  const annualCurrentRent = currentMonthlyRent * 12;

  const estimatedExpenses =
    property.operating_expenses !== null &&
    property.operating_expenses !== undefined
      ? Number(property.operating_expenses || 0)
      : annualCurrentRent * 0.3 +
        Number(taxesAnnual || 0) +
        Number(insuranceAnnual || 0) +
        Number(annualUtilities || 0);

  const estimatedNoi =
    property.net_operating_income !== null &&
    property.net_operating_income !== undefined
      ? Number(property.net_operating_income || 0)
      : annualCurrentRent - estimatedExpenses;

  const estimatedCapRate =
    Number(askingPrice) > 0 ? estimatedNoi / Number(askingPrice) : null;

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
    hasValue(property.year_built) ||
    hasValue(property.sqft) ||
    hasValue(property.lot_size) ||
    hasValue(property.parcel_number) ||
    hasValue(property.basement) ||
    hasValue(property.roof) ||
    hasValue(property.exterior) ||
    hasValue(property.zoning) ||
    hasValue(property.parking) ||
    hasValue(property.heating) ||
    hasValue(property.property_type) ||
    hasValue(property.cooling) ||
    hasValue(taxesAnnual) ||
    hasValue(insuranceAnnual) ||
    annualUtilities > 0 ||
    unitCount > 0;

  const hasListingAgent =
    hasValue(property.listing_agent_name) ||
    hasValue(property.listing_agent_phone);

  const googleMapsUrl = getGoogleMapsUrl(property);
  const cookCountyTaxUrl = getCookCountyTaxUrl(property.parcel_number);

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

          <EditPropertyModal>
            <PropertyEditForm property={property} />
          </EditPropertyModal>

          {property.is_archived !== true && (
            <ArchivePropertyButton propertyId={id} />
          )}

          <div className="relative -top-3 min-w-[220px] max-w-xs">
            <PropertyStatusUpdater
              propertyId={id}
              currentStatus={property.status}
            />
          </div>
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

      {hasBuildingDetails && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">
                Building Details
              </h3>
            </div>

            <EditPropertyModal>
              <PropertyEditForm property={property} />
            </EditPropertyModal>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm text-slate-500">Year Built</p>
              <p className="font-medium text-slate-950">
                {valueOrDash(property.year_built)}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">Property Type</p>
              <p className="font-medium text-slate-950">
                {valueOrDash(property.property_type)}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">Sq Ft</p>
              <p className="font-medium text-slate-950">
                {formatNumber(property.sqft)}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">Lot Size</p>
              <p className="font-medium text-slate-950">
                {valueOrDash(property.lot_size)}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">PIN / Parcel</p>

              {cookCountyTaxUrl ? (
                <a
                  href={cookCountyTaxUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Open Cook County property tax page"
                  className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
                >
                  {formatCookCountyPin(property.parcel_number)}
                </a>
              ) : (
                <p className="font-medium text-slate-950">
                  {valueOrDash(property.parcel_number)}
                </p>
              )}
            </div>

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

          <div className="mt-6 border-t border-slate-200 pt-5">
            <form
              action={updateBuildingFinancials}
              className="flex flex-wrap items-end gap-4"
            >
              <div className="min-w-[180px] flex-1">
                <label
                  htmlFor="taxes_annual"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Annual Taxes
                </label>
                <input
                  id="taxes_annual"
                  name="taxes_annual"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={
                    hasValue(taxesAnnual) ? Number(taxesAnnual) : ""
                  }
                  placeholder="Annual taxes"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>

              <div className="min-w-[180px] flex-1">
                <label
                  htmlFor="insurance_annual"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Annual Insurance
                </label>
                <input
                  id="insurance_annual"
                  name="insurance_annual"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={
                    hasValue(insuranceAnnual) ? Number(insuranceAnnual) : ""
                  }
                  placeholder="Annual insurance"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>

              <div className="min-w-[160px] pb-2">
                <p className="text-sm text-slate-500">Annual Utilities</p>
                <p className="text-lg font-bold text-slate-950">
                  {formatCurrency(annualUtilities)}
                </p>
              </div>

              <button
                type="submit"
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Save
              </button>
            </form>
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

      <DealAnalyzer
        askingPrice={askingPrice}
        taxesAnnual={taxesAnnual}
        insuranceAnnual={insuranceAnnual}
        projectedMonthlyRent={projectedMonthlyRent}
        totalRehab={totalRehab}
      />

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

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Units</h3>
            <p className="text-sm text-slate-500">
              Edit rent, rehab, condition, and owner-paid utilities by unit.
            </p>
          </div>

          <AddUnitModal>
            <PropertyUnitForm propertyId={id} />
          </AddUnitModal>
        </div>

        {unitsError && (
          <p className="mb-4 text-sm text-red-600">
            Error loading units: {unitsError.message}
          </p>
        )}

        {unitList.length === 0 ? (
          <p className="text-sm text-slate-500">No units added yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1800px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-2">Unit</th>
                  <th className="py-2 pr-2">Floor</th>
                  <th className="py-2 pr-2">Sq Ft</th>
                  <th className="py-2 pr-2">Rooms</th>
                  <th className="py-2 pr-2">Beds</th>
                  <th className="py-2 pr-2">Full</th>
                  <th className="py-2 pr-2">Half</th>
                  <th className="py-2 pr-2">Current Rent</th>
                  <th className="py-2 pr-2">Projected Rent</th>
                  <th className="py-2 pr-2">FMR</th>
                  <th className="py-2 pr-2">Lease Exp.</th>
                  <th className="py-2 pr-2">Condition</th>
                  <th className="py-2 pr-2">Rehab</th>
                  <th className="py-2 pr-2 text-center">W</th>
                  <th className="py-2 pr-2 text-center">E</th>
                  <th className="py-2 pr-2 text-center">G</th>
                  <th className="py-2 pr-2">Utilities/Yr</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>

              <tbody>
                {unitList.map((unit) => {
                  const formId = `unit-inline-form-${unit.id}`;
                  const unitAnnualUtilities = getAnnualUtilityCost(unit);

                  return (
                    <tr key={unit.id} className="border-b border-slate-100">
                      <td className="py-3 pr-2">
                        <input
                          form={formId}
                          name="unit_number"
                          defaultValue={getUnitLabel(unit)}
                          className={smallInlineInputClass}
                          aria-label="Unit number"
                        />
                      </td>

                      <td className="py-3 pr-2">
                        <input
                          form={formId}
                          name="floor_number"
                          defaultValue={unit.floor_number || ""}
                          className={smallInlineInputClass}
                          aria-label="Floor number"
                        />
                      </td>

                      <td className="py-3 pr-2">
                        <input
                          form={formId}
                          name="sqft"
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={
                            hasValue(unit.sqft) ? Number(unit.sqft) : ""
                          }
                          className={smallInlineInputClass}
                          aria-label="Sq Ft"
                        />
                      </td>

                      <td className="py-3 pr-2">
                        <input
                          form={formId}
                          name="rooms"
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={
                            hasValue(unit.rooms) ? Number(unit.rooms) : ""
                          }
                          className={smallInlineInputClass}
                          aria-label="Rooms"
                        />
                      </td>

                      <td className="py-3 pr-2">
                        <input
                          form={formId}
                          name="bedrooms"
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={
                            hasValue(getUnitBeds(unit))
                              ? Number(getUnitBeds(unit))
                              : ""
                          }
                          className={smallInlineInputClass}
                          aria-label="Bedrooms"
                        />
                      </td>

                      <td className="py-3 pr-2">
                        <input
                          form={formId}
                          name="full_baths"
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={
                            hasValue(unit.full_baths)
                              ? Number(unit.full_baths)
                              : ""
                          }
                          className={smallInlineInputClass}
                          aria-label="Full baths"
                        />
                      </td>

                      <td className="py-3 pr-2">
                        <input
                          form={formId}
                          name="half_baths"
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={
                            hasValue(unit.half_baths)
                              ? Number(unit.half_baths)
                              : ""
                          }
                          className={smallInlineInputClass}
                          aria-label="Half baths"
                        />
                      </td>

                      <td className="py-3 pr-2">
                        <input
                          form={formId}
                          name="current_rent"
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={
                            hasValue(getCurrentRent(unit))
                              ? Number(getCurrentRent(unit))
                              : ""
                          }
                          className={inlineInputClass}
                          aria-label="Current rent"
                        />
                      </td>

                      <td className="py-3 pr-2">
                        <input
                          form={formId}
                          name="projected_rent"
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={
                            hasValue(getProjectedRent(unit))
                              ? Number(getProjectedRent(unit))
                              : ""
                          }
                          className={inlineInputClass}
                          aria-label="Projected rent"
                        />
                      </td>

                      <td className="py-3 pr-2">
                        <input
                          form={formId}
                          name="fmr_rent"
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={
                            hasValue(unit.fmr_rent) ? Number(unit.fmr_rent) : ""
                          }
                          className={inlineInputClass}
                          aria-label="FMR rent"
                        />
                      </td>

                      <td className="py-3 pr-2">
                        <input
                          form={formId}
                          name="lease_expiration"
                          type="date"
                          defaultValue={formatDateInput(unit.lease_expiration)}
                          className={inlineInputClass}
                          aria-label="Lease expiration"
                        />
                      </td>

        

                      <td className="py-3 pr-2">
                        <input
                          form={formId}
                          name="condition"
                          defaultValue={unit.condition || ""}
                          className={inlineInputClass}
                          aria-label="Condition"
                        />
                      </td>

                      <td className="py-3 pr-2">
                        <input
                          form={formId}
                          name="rehab_estimate"
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={
                            hasValue(unit.rehab_estimate)
                              ? Number(unit.rehab_estimate)
                              : ""
                          }
                          className={inlineInputClass}
                          aria-label="Rehab estimate"
                        />
                      </td>

                      <td className="py-3 pr-2 text-center">
                        <input
                          form={formId}
                          name="water_included"
                          type="checkbox"
                          defaultChecked={unit.water_included === true}
                          className="h-4 w-4 rounded border-slate-300"
                          aria-label="Owner pays water"
                        />
                      </td>

                      <td className="py-3 pr-2 text-center">
                        <input
                          form={formId}
                          name="electricity_included"
                          type="checkbox"
                          defaultChecked={unit.electricity_included === true}
                          className="h-4 w-4 rounded border-slate-300"
                          aria-label="Owner pays electricity"
                        />
                      </td>

                      <td className="py-3 pr-2 text-center">
                        <input
                          form={formId}
                          name="gas_included"
                          type="checkbox"
                          defaultChecked={unit.gas_included === true}
                          className="h-4 w-4 rounded border-slate-300"
                          aria-label="Owner pays gas"
                        />
                      </td>

                      <td className="py-3 pr-2 font-medium text-slate-700">
                        {formatCurrency(unitAnnualUtilities)}
                      </td>

                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <form id={formId} action={updateUnitInline}>
                            <input
                              type="hidden"
                              name="unit_id"
                              value={unit.id}
                            />
                            <button
                              type="submit"
                              className="rounded-md bg-slate-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                            >
                              Save
                            </button>
                          </form>

                          <DeleteUnitButton unitId={unit.id} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MobilityFmrCard
        propertyId={id}
        isMobilityArea={property.is_mobility_area}
        mobilityCheckedAt={property.mobility_checked_at}
        mobilityMatchedAddress={property.mobility_matched_address}
        mobilityNotes={property.mobility_notes}
        mobilityLat={property.mobility_lat}
        mobilityLng={property.mobility_lng}
      />

      <PropertyVisitLog propertyId={id} />
    </AppShell>
  );
}
