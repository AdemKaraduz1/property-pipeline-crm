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
import { DeleteUnitButton } from "@/components/DeleteUnitButton";
import { PropertyEditForm } from "@/components/PropertyEditForm";
import { MobilityFmrCard } from "@/components/MobilityFmrCard";
import { ArchivePropertyButton } from "@/components/ArchivePropertyButton";
import { DeletePropertyButton } from "@/components/DeletePropertyButton";
import { COMMON_REHAB_ITEMS, asRecord } from "@/lib/rehab";

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

function toFiniteNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
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

function getGoogleMapsUrl(property: {
  address?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
}) {
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
  if (hasValue(unit.baths)) return unit.baths;

  const fullBaths = hasValue(unit.full_baths) ? Number(unit.full_baths) : 0;
  const halfBaths = hasValue(unit.half_baths) ? Number(unit.half_baths) : 0;
  const bathrooms = fullBaths + halfBaths * 0.5;

  return bathrooms > 0 ? bathrooms : null;
}

function getCurrentRent(unit: PropertyUnit) {
  return unit.current_rent ?? unit.rent ?? null;
}

function getProjectedRent(unit: PropertyUnit) {
  return unit.projected_rent ?? unit.rent ?? null;
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

const dateInlineInputClass =
  "w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-950 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

const mobileFieldClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-950 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

const sectionCardClass =
  "mb-6 scroll-mt-24 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6";

const sectionTitleClass = "text-lg font-semibold text-slate-950";

const sectionDescriptionClass = "text-sm leading-relaxed text-slate-500";

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

  async function updateAllUnits(formData: FormData) {
    "use server";

    const updateSupabase = await createClient();
    const unitIds = formData
      .getAll("unit_id")
      .map((value) => String(value).trim())
      .filter(Boolean);

    for (const unitId of unitIds) {
      const field = (name: string) => formData.get(`${unitId}__${name}`);
      const updatedUnitNumber = parseTextInput(field("unit_number"));
      const updatedCurrentRent = parseMoneyInput(field("current_rent"));
      const updatedBeds = parseMoneyInput(field("bedrooms"));
      const updatedBathrooms = parseMoneyInput(field("bathrooms"));

      await updateSupabase
        .from("property_units")
        .update({
          unit_number: updatedUnitNumber,
          unit_label: updatedUnitNumber,
          floor_number: parseTextInput(field("floor_number")),
          sqft: parseMoneyInput(field("sqft")),
          bedrooms: updatedBeds,
          beds: updatedBeds,
          baths: updatedBathrooms,
          full_baths: updatedBathrooms,
          half_baths: null,
          current_rent: updatedCurrentRent,
          rent: updatedCurrentRent,
          projected_rent: parseMoneyInput(field("projected_rent")),
          fmr_rent: parseMoneyInput(field("fmr_rent")),
          lease_expiration: parseDateInput(field("lease_expiration")),
          rehab_estimate: parseMoneyInput(field("rehab_estimate")),
          water_included: formData.has(`${unitId}__water_included`),
          electricity_included: formData.has(
            `${unitId}__electricity_included`,
          ),
          gas_included: formData.has(`${unitId}__gas_included`),
        })
        .eq("id", unitId)
        .eq("property_id", id);
    }

    revalidatePath(`/properties/${id}`);
    revalidatePath("/pipeline");
  }

  async function updateCommonAreaRehab(formData: FormData) {
    "use server";

    const updateSupabase = await createClient();
    const {
      data: { user: updateUser },
    } = await updateSupabase.auth.getUser();

    if (!updateUser) return;

    const { data: currentProperty } = await updateSupabase
      .from("properties")
      .select("all_extracted_fields")
      .eq("id", id)
      .eq("user_id", updateUser.id)
      .single();

    if (!currentProperty) return;

    const currentMetadata = asRecord(currentProperty.all_extracted_fields);
    const items = Object.fromEntries(
      COMMON_REHAB_ITEMS.map((item) => [
        item.id,
        parseMoneyInput(formData.get(`common_rehab_${item.id}`)) || 0,
      ]),
    );

    await updateSupabase
      .from("properties")
      .update({
        all_extracted_fields: {
          ...currentMetadata,
          common_area_rehab: {
            items,
            contingency_percent:
              parseMoneyInput(formData.get("common_rehab_contingency")) || 0,
            notes: parseTextInput(formData.get("common_rehab_notes")),
          },
        },
      })
      .eq("id", id)
      .eq("user_id", updateUser.id);

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

  const propertyMetadata = asRecord(property.all_extracted_fields);
  const hasWalkthroughProgress = Boolean(
    asRecord(propertyMetadata.walkthrough).updated_at,
  );
  const commonRehab = asRecord(propertyMetadata.common_area_rehab);
  const commonRehabItems = asRecord(commonRehab.items);
  const commonRehabContingency = toFiniteNumber(
    commonRehab.contingency_percent,
    10,
  );
  const commonRehabNotes =
    typeof commonRehab.notes === "string" ? commonRehab.notes : "";
  const commonRehabSubtotal = COMMON_REHAB_ITEMS.reduce(
    (sum, item) => sum + toFiniteNumber(commonRehabItems[item.id]),
    0,
  );
  const commonRehabTotal =
    commonRehabSubtotal * (1 + commonRehabContingency / 100);
  const unitRehabTotal = unitList.reduce(
    (sum, unit) => sum + Number(unit.rehab_estimate || 0),
    0,
  );
  const totalRehab = unitRehabTotal + commonRehabTotal;

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
      <div className="mb-4">
        <Link
          href="/pipeline"
          className="inline-flex text-sm font-medium text-slate-600 hover:text-slate-950"
        >
          ← Back to Pipeline
        </Link>
      </div>

      <section
        id="overview"
        className="mb-6 scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
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

              <h2 className="break-words text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                {property.address || "Untitled Property"}
              </h2>

              {locationLine && (
                <p className="mt-1 text-sm text-slate-600 sm:text-base">
                  {locationLine}
                </p>
              )}
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <PropertyStatusUpdater
                propertyId={id}
                currentStatus={
                  property.is_archived === true || property.archived_at
                    ? "archived"
                    : property.status
                }
              />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Link
              href={`/properties/${id}/walkthrough`}
              className="col-span-2 inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-slate-800 sm:col-span-1"
            >
              {hasWalkthroughProgress
                ? "Resume Walkthrough"
                : "Start Walkthrough"}
            </Link>

            {property.source_url && (
              <a
                href={property.source_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Listing
              </a>
            )}

            {googleMapsUrl && (
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Map
              </a>
            )}

            <EditPropertyModal>
              <PropertyEditForm property={property} />
            </EditPropertyModal>

            {property.is_archived !== true && (
              <ArchivePropertyButton propertyId={id} />
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 bg-slate-50/70 px-5 py-3 sm:px-6">
          <DeletePropertyButton propertyId={id} />
        </div>
      </section>

      <nav
        aria-label="Property sections"
        className="-mx-4 mb-6 overflow-x-auto px-4 md:mx-0 md:px-0"
      >
        <div className="flex min-w-max gap-2">
          {[
            ["#overview", "Overview"],
            ["#building", "Building"],
            ["#analysis", "Analysis"],
            ["#units", `Units (${unitCount})`],
            ["#rehab", "Rehab"],
            ["#programs", "Programs"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-slate-400 hover:text-slate-950"
            >
              {label}
            </a>
          ))}
        </div>
      </nav>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <p className="text-xs font-medium text-slate-500 sm:text-sm">
            Asking Price
          </p>
          <p className="mt-1 break-words text-lg font-bold text-slate-950 sm:text-2xl">
            {formatCurrency(askingPrice)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <p className="text-xs font-medium text-slate-500 sm:text-sm">
            Annual Rent
          </p>
          <p className="mt-1 break-words text-lg font-bold text-slate-950 sm:text-xl">
            {formatCurrency(annualCurrentRent)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <p className="text-xs font-medium text-slate-500 sm:text-sm">
            Est. NOI
          </p>
          <p className="mt-1 break-words text-lg font-bold text-slate-950 sm:text-xl">
            {formatCurrency(estimatedNoi)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <p className="text-xs font-medium text-slate-500 sm:text-sm">
            Est. Cap Rate
          </p>
          <p className="mt-1 break-words text-lg font-bold text-slate-950 sm:text-xl">
            {estimatedCapRate !== null
              ? `${(estimatedCapRate * 100).toFixed(2)}%`
              : "Not entered"}
          </p>
        </div>
      </div>

      {hasMlsFinancials && (
        <div className={sectionCardClass}>
          <h3 className={`${sectionTitleClass} mb-4`}>MLS Financials</h3>

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
        <div id="building" className={sectionCardClass}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className={sectionTitleClass}>Building Details</h3>
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
        <div className={sectionCardClass}>
          <h3 className={`${sectionTitleClass} mb-4`}>Listing Agent</h3>

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

      <div id="analysis" className="scroll-mt-24">
        <DealAnalyzer
          askingPrice={askingPrice}
          taxesAnnual={taxesAnnual}
          insuranceAnnual={insuranceAnnual}
          projectedMonthlyRent={projectedMonthlyRent}
          totalRehab={totalRehab}
          ownerPaidUtilitiesAnnual={annualUtilities}
        />
      </div>

      {property.broker_remarks && (
        <div className={sectionCardClass}>
          <p className="mb-2 text-sm font-semibold text-slate-700">
            Broker Remarks
          </p>
          <p className="whitespace-pre-wrap text-slate-700">
            {property.broker_remarks}
          </p>
        </div>
      )}

      <div id="units" className={sectionCardClass}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className={sectionTitleClass}>Units</h3>
            <p className={sectionDescriptionClass}>
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
          <div>
            <div className="space-y-4 md:hidden">
              {unitList.map((unit) => {
                const formId = "mobile-units-form";
                const unitAnnualUtilities = getAnnualUtilityCost(unit);

                return (
                  <div
                    key={unit.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Unit
                        </p>
                        <p className="text-lg font-semibold text-slate-950">
                          {getUnitLabel(unit)}
                        </p>
                      </div>

                      <DeleteUnitButton unitId={unit.id} />
                    </div>

                    <input
                      form={formId}
                      type="hidden"
                      name="unit_id"
                      value={unit.id}
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Unit
                        </span>
                        <input
                          form={formId}
                          name={`${unit.id}__unit_number`}
                          defaultValue={getUnitLabel(unit)}
                          className={mobileFieldClass}
                          aria-label="Unit number"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Floor
                        </span>
                        <input
                          form={formId}
                          name={`${unit.id}__floor_number`}
                          defaultValue={unit.floor_number || ""}
                          className={mobileFieldClass}
                          aria-label="Floor number"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Sq Ft
                        </span>
                        <input
                          form={formId}
                          name={`${unit.id}__sqft`}
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={
                            hasValue(unit.sqft) ? Number(unit.sqft) : ""
                          }
                          className={mobileFieldClass}
                          aria-label="Sq Ft"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Beds
                        </span>
                        <input
                          form={formId}
                          name={`${unit.id}__bedrooms`}
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={
                            hasValue(getUnitBeds(unit))
                              ? Number(getUnitBeds(unit))
                              : ""
                          }
                          className={mobileFieldClass}
                          aria-label="Bedrooms"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Bathrooms
                        </span>
                        <input
                          form={formId}
                          name={`${unit.id}__bathrooms`}
                          type="number"
                          min="0"
                          step="0.5"
                          defaultValue={
                            hasValue(getUnitBaths(unit))
                              ? Number(getUnitBaths(unit))
                              : ""
                          }
                          className={mobileFieldClass}
                          aria-label="Bathrooms"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Current
                        </span>
                        <input
                          form={formId}
                          name={`${unit.id}__current_rent`}
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={
                            hasValue(getCurrentRent(unit))
                              ? Number(getCurrentRent(unit))
                              : ""
                          }
                          className={mobileFieldClass}
                          aria-label="Current rent"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Projected
                        </span>
                        <input
                          form={formId}
                          name={`${unit.id}__projected_rent`}
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={
                            hasValue(getProjectedRent(unit))
                              ? Number(getProjectedRent(unit))
                              : ""
                          }
                          className={mobileFieldClass}
                          aria-label="Projected rent"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                          FMR
                        </span>
                        <input
                          form={formId}
                          name={`${unit.id}__fmr_rent`}
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={
                            hasValue(unit.fmr_rent) ? Number(unit.fmr_rent) : ""
                          }
                          className={mobileFieldClass}
                          aria-label="FMR rent"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Lease Exp.
                        </span>
                        <input
                          form={formId}
                          name={`${unit.id}__lease_expiration`}
                          type="date"
                          defaultValue={formatDateInput(unit.lease_expiration)}
                          className={mobileFieldClass}
                          aria-label="Lease expiration"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Rehab
                        </span>
                        <input
                          form={formId}
                          name={`${unit.id}__rehab_estimate`}
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={
                            hasValue(unit.rehab_estimate)
                              ? Number(unit.rehab_estimate)
                              : ""
                          }
                          className={mobileFieldClass}
                          aria-label="Rehab estimate"
                        />
                      </label>
                    </div>

                    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Owner Pays
                      </p>
                      <div className="grid grid-cols-3 gap-2 text-sm text-slate-700">
                        <label className="flex items-center gap-2">
                          <input
                            form={formId}
                            name={`${unit.id}__water_included`}
                            type="checkbox"
                            defaultChecked={unit.water_included === true}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          Water
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            form={formId}
                            name={`${unit.id}__electricity_included`}
                            type="checkbox"
                            defaultChecked={unit.electricity_included === true}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          Electric
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            form={formId}
                            name={`${unit.id}__gas_included`}
                            type="checkbox"
                            defaultChecked={unit.gas_included === true}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          Gas
                        </label>
                      </div>
                      <p className="mt-3 text-sm font-medium text-slate-700">
                        Utilities / year: {formatCurrency(unitAnnualUtilities)}
                      </p>
                    </div>
                  </div>
                );
              })}

              <form
                id="mobile-units-form"
                action={updateAllUnits}
                className="sticky bottom-16 z-10 mt-4"
              >
                <button
                  type="submit"
                  className="min-h-11 w-full rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
                >
                  Save All Units
                </button>
              </form>
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2 pr-1.5">Unit</th>
                    <th className="py-2 pr-1.5">Floor</th>
                    <th className="py-2 pr-1.5">Sq Ft</th>
                    <th className="py-2 pr-1.5">Beds</th>
                    <th className="py-2 pr-1.5">Bathrooms</th>
                    <th className="py-2 pr-1.5">Current</th>
                    <th className="py-2 pr-1.5">Projected</th>
                    <th className="py-2 pr-1.5">FMR</th>
                    <th className="py-2 pr-1.5">Lease Exp.</th>
                    <th className="py-2 pr-1.5">Rehab</th>
                    <th className="py-2 pr-1.5 text-center" title="Water">
                      W
                    </th>
                    <th
                      className="py-2 pr-1.5 text-center"
                      title="Electricity"
                    >
                      E
                    </th>
                    <th className="py-2 pr-1.5 text-center" title="Gas">
                      G
                    </th>
                    <th className="py-2 pr-1.5">Util./Yr</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {unitList.map((unit) => {
                    const formId = "desktop-units-form";
                    const unitAnnualUtilities = getAnnualUtilityCost(unit);

                    return (
                      <tr key={unit.id} className="border-b border-slate-100">
                        <td className="py-3 pr-2">
                          <input
                            form={formId}
                            name={`${unit.id}__unit_number`}
                            defaultValue={getUnitLabel(unit)}
                            className={smallInlineInputClass}
                            aria-label="Unit number"
                          />
                        </td>

                        <td className="py-3 pr-2">
                          <input
                            form={formId}
                            name={`${unit.id}__floor_number`}
                            defaultValue={unit.floor_number || ""}
                            className={smallInlineInputClass}
                            aria-label="Floor number"
                          />
                        </td>

                        <td className="py-3 pr-2">
                          <input
                            form={formId}
                            name={`${unit.id}__sqft`}
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
                            name={`${unit.id}__bedrooms`}
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
                            name={`${unit.id}__bathrooms`}
                            type="number"
                            min="0"
                            step="0.5"
                            defaultValue={
                              hasValue(getUnitBaths(unit))
                                ? Number(getUnitBaths(unit))
                                : ""
                            }
                            className={smallInlineInputClass}
                            aria-label="Bathrooms"
                          />
                        </td>

                        <td className="py-3 pr-2">
                          <input
                            form={formId}
                            name={`${unit.id}__current_rent`}
                            type="number"
                            min="0"
                            step="1"
                            defaultValue={
                              hasValue(getCurrentRent(unit))
                                ? Number(getCurrentRent(unit))
                                : ""
                            }
                            className={smallInlineInputClass}
                            aria-label="Current rent"
                          />
                        </td>

                        <td className="py-3 pr-2">
                          <input
                            form={formId}
                            name={`${unit.id}__projected_rent`}
                            type="number"
                            min="0"
                            step="1"
                            defaultValue={
                              hasValue(getProjectedRent(unit))
                                ? Number(getProjectedRent(unit))
                                : ""
                            }
                            className={smallInlineInputClass}
                            aria-label="Projected rent"
                          />
                        </td>

                        <td className="py-3 pr-2">
                          <input
                            form={formId}
                            name={`${unit.id}__fmr_rent`}
                            type="number"
                            min="0"
                            step="1"
                            defaultValue={
                              hasValue(unit.fmr_rent)
                                ? Number(unit.fmr_rent)
                                : ""
                            }
                            className={smallInlineInputClass}
                            aria-label="FMR rent"
                          />
                        </td>

                        <td className="py-3 pr-2">
                          <input
                            form={formId}
                            name={`${unit.id}__lease_expiration`}
                            type="date"
                            defaultValue={formatDateInput(
                              unit.lease_expiration,
                            )}
                            className={dateInlineInputClass}
                            aria-label="Lease expiration"
                          />
                        </td>

                        <td className="py-3 pr-2">
                          <input
                            form={formId}
                            name={`${unit.id}__rehab_estimate`}
                            type="number"
                            min="0"
                            step="1"
                            defaultValue={
                              hasValue(unit.rehab_estimate)
                                ? Number(unit.rehab_estimate)
                                : ""
                            }
                            className={smallInlineInputClass}
                            aria-label="Rehab estimate"
                          />
                        </td>

                        <td className="py-3 pr-2 text-center">
                          <input
                            form={formId}
                            name={`${unit.id}__water_included`}
                            type="checkbox"
                            defaultChecked={unit.water_included === true}
                            className="h-4 w-4 rounded border-slate-300"
                            aria-label="Owner pays water"
                          />
                        </td>

                        <td className="py-3 pr-2 text-center">
                          <input
                            form={formId}
                            name={`${unit.id}__electricity_included`}
                            type="checkbox"
                            defaultChecked={
                              unit.electricity_included === true
                            }
                            className="h-4 w-4 rounded border-slate-300"
                            aria-label="Owner pays electricity"
                          />
                        </td>

                        <td className="py-3 pr-2 text-center">
                          <input
                            form={formId}
                            name={`${unit.id}__gas_included`}
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
                            <input
                              form={formId}
                              type="hidden"
                              name="unit_id"
                              value={unit.id}
                            />

                            <DeleteUnitButton unitId={unit.id} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <form
                id="desktop-units-form"
                action={updateAllUnits}
                className="sticky left-0 mt-4 flex w-full justify-end"
              >
                <button
                  type="submit"
                  className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Save All Units
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      <div id="rehab" className={sectionCardClass}>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className={sectionTitleClass}>Common Area Rehab</h3>
            <p className={sectionDescriptionClass}>
              Optional building-wide work outside of individual units.
            </p>
          </div>

          <div className="rounded-lg bg-slate-100 px-4 py-2 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Common Rehab Total
            </p>
            <p className="text-xl font-bold text-slate-950">
              {formatCurrency(commonRehabTotal)}
            </p>
          </div>
        </div>

        <form action={updateCommonAreaRehab}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {COMMON_REHAB_ITEMS.map((item) => {
              const storedCost = toFiniteNumber(commonRehabItems[item.id]);

              return (
                <div
                  key={item.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                >
                  <label
                    htmlFor={`common_rehab_${item.id}`}
                    className="block text-sm font-semibold text-slate-800"
                  >
                    {item.label}
                  </label>
                  <p className="mb-2 min-h-8 text-xs leading-4 text-slate-500">
                    {item.description}
                  </p>
                  <input
                    id={`common_rehab_${item.id}`}
                    name={`common_rehab_${item.id}`}
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={storedCost > 0 ? storedCost : ""}
                    placeholder="$0"
                    className={inlineInputClass}
                  />
                </div>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[200px_1fr]">
            <div>
              <label
                htmlFor="common_rehab_contingency"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Contingency %
              </label>
              <input
                id="common_rehab_contingency"
                name="common_rehab_contingency"
                type="number"
                min="0"
                step="1"
                defaultValue={commonRehabContingency}
                className={inlineInputClass}
              />
            </div>

            <div>
              <label
                htmlFor="common_rehab_notes"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Common Rehab Notes
              </label>
              <textarea
                id="common_rehab_notes"
                name="common_rehab_notes"
                defaultValue={commonRehabNotes}
                rows={3}
                placeholder="Scope details, contractor notes, priorities, or work that may not be needed..."
                className={inlineInputClass}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              Unit rehab: {formatCurrency(unitRehabTotal)} · Combined rehab:{" "}
              {formatCurrency(totalRehab)}
            </p>
            <button
              type="submit"
              className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Save Common Area Rehab
            </button>
          </div>
        </form>
      </div>

      <div id="programs" className="scroll-mt-24">
        <MobilityFmrCard
          propertyId={id}
          isMobilityArea={property.is_mobility_area}
          mobilityCheckedAt={property.mobility_checked_at}
          mobilityMatchedAddress={property.mobility_matched_address}
          mobilityNotes={property.mobility_notes}
          mobilityLat={property.mobility_lat}
          mobilityLng={property.mobility_lng}
        />
      </div>

    </AppShell>
  );
}
