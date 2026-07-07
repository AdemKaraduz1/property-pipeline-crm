import { AutoSaveForm } from "@/components/AutoSaveForm";
import { getMonthlyMortgagePayment } from "@/lib/deal-analyzer";
import { asRecord } from "@/lib/rehab";

type SaveUnderwritingAction = (formData: FormData) => Promise<{
  success: boolean;
  message?: string;
}>;

type DealVerdictProps = {
  action: SaveUnderwritingAction;
  annualCurrentRent: number;
  annualProjectedRent: number;
  annualDebtService: number;
  currentNoi: number;
  projectedNoi: number;
  projectedOperatingExpenses: number;
  projectedInterestRate: number;
  projectedLoanAmount: number;
  projectedLoanTermYears: number;
  projectedPurchasePrice: number;
  taxesAnnual: number | null;
  totalRehab: number;
  underwriting: unknown;
  vacancyRate: number;
  propertyId: string;
};

const REHAB_RISK_FLAGS = [
  ["roof_age", "Roof age"],
  ["masonry", "Masonry / facade"],
  ["sewer_line", "Sewer line"],
  ["electrical_service", "Electrical service"],
  ["boiler_hvac", "Boiler / HVAC"],
  ["lead_asbestos", "Lead / asbestos"],
  ["porch_code", "Porch / code"],
  ["permits", "Permits"],
] as const;

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Not entered";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }

  return `${value.toFixed(1)}%`;
}

function formatRatio(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }

  return `${value.toFixed(2)}x`;
}

function getString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function getNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function getOptionalNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function getBoolean(value: unknown) {
  return value === true;
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:text-xs">
        {label}
      </p>
      <p className="mt-1 break-words text-lg font-bold text-slate-950">
        {value}
      </p>
      {note && <p className="mt-1 text-xs leading-relaxed text-slate-500">{note}</p>}
    </div>
  );
}

function Drawer({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-slate-200 bg-slate-50/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-sm font-semibold text-slate-900 sm:px-4">
        <span className="min-w-0">
          <span className="block">{title}</span>
          <span className="mt-0.5 block text-xs font-normal leading-relaxed text-slate-500">
            {summary}
          </span>
        </span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-base leading-none text-slate-500 group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="border-t border-slate-200 px-3 py-4 sm:px-4">
        {children}
      </div>
    </details>
  );
}

export function DealVerdict({
  action,
  annualCurrentRent,
  annualProjectedRent,
  annualDebtService,
  currentNoi,
  projectedNoi,
  projectedOperatingExpenses,
  projectedInterestRate,
  projectedLoanAmount,
  projectedLoanTermYears,
  projectedPurchasePrice,
  taxesAnnual,
  totalRehab,
  underwriting,
  vacancyRate,
  propertyId,
}: DealVerdictProps) {
  const inputs = asRecord(underwriting);
  const rentConfidence = getString(inputs.rent_confidence, "unverified");
  const rentSource = getString(inputs.rent_source);
  const rentCompUrl = getString(inputs.rent_comp_url);
  const rentNotes = getString(inputs.rent_notes);
  const utilityAllowanceMonthly = getNumber(inputs.utility_allowance_monthly, 0);
  const postPurchaseTaxesAnnual = getOptionalNumber(
    inputs.post_purchase_taxes_annual,
  );
  const taxNotes = getString(inputs.tax_notes);
  const lenderMinDscr = getNumber(inputs.lender_min_dscr, 1.2);
  const loanPointsRate = getNumber(inputs.loan_points_rate, 1);
  const reserveMonths = getNumber(inputs.reserve_months, 6);
  const downsideRentHaircutRate = getNumber(inputs.downside_rent_haircut_rate, 10);
  const downsideVacancyRate = getNumber(
    inputs.downside_vacancy_rate,
    Math.max(10, vacancyRate + 3),
  );
  const rehabOverrunRate = getNumber(inputs.rehab_overrun_rate, 15);
  const legalUnitsVerified = getString(inputs.legal_units_verified, "unknown");
  const codeViolationCheck = getString(inputs.code_violation_check, "needs_check");
  const rehabNotes = getString(inputs.rehab_notes);
  const exitStrategy = getString(inputs.exit_strategy, "hold");
  const holdPeriodYears = getNumber(inputs.hold_period_years, 5);
  const exitCapRate = getNumber(inputs.exit_cap_rate, 8);
  const saleCostRate = getNumber(inputs.sale_cost_rate, 7);
  const refiLtv = getNumber(inputs.refi_ltv, 75);
  const arvEstimate = getOptionalNumber(inputs.arv_estimate);

  const utilityAllowanceAnnual = Math.max(0, utilityAllowanceMonthly) * 12;
  const adjustedProjectedRent = Math.max(
    0,
    annualProjectedRent - utilityAllowanceAnnual,
  );
  const currentTaxes = Number(taxesAnnual || 0);
  const taxDelta =
    postPurchaseTaxesAnnual === null ? 0 : postPurchaseTaxesAnnual - currentTaxes;
  const stabilizedNoiTaxAdjusted = projectedNoi - taxDelta - utilityAllowanceAnnual;
  const downsideAnnualRent =
    adjustedProjectedRent * (1 - downsideRentHaircutRate / 100);
  const downsideVacancyLoss = downsideAnnualRent * (downsideVacancyRate / 100);
  const downsideNoi =
    downsideAnnualRent -
    downsideVacancyLoss -
    projectedOperatingExpenses -
    taxDelta;
  const annualDebtServicePlusOne =
    projectedLoanAmount > 0
      ? getMonthlyMortgagePayment(
          projectedLoanAmount,
          projectedInterestRate + 1,
          projectedLoanTermYears,
        ) * 12
      : 0;
  const annualDebtServicePlusTwo =
    projectedLoanAmount > 0
      ? getMonthlyMortgagePayment(
          projectedLoanAmount,
          projectedInterestRate + 2,
          projectedLoanTermYears,
        ) * 12
      : 0;
  const baseDscr =
    annualDebtService > 0 ? stabilizedNoiTaxAdjusted / annualDebtService : null;
  const stressedDscr =
    annualDebtServicePlusOne > 0
      ? stabilizedNoiTaxAdjusted / annualDebtServicePlusOne
      : null;
  const downsideCashFlow = downsideNoi - annualDebtServicePlusTwo;
  const rehabStressTotal = totalRehab * (1 + rehabOverrunRate / 100);
  const loanPoints = projectedLoanAmount * (loanPointsRate / 100);
  const monthlyDebtService = annualDebtService / 12;
  const reserveRequirement = monthlyDebtService * reserveMonths;
  const exitValue =
    exitCapRate > 0 ? stabilizedNoiTaxAdjusted / (exitCapRate / 100) : 0;
  const saleCosts = exitValue * (saleCostRate / 100);
  const netSaleProceeds = Math.max(0, exitValue - saleCosts - projectedLoanAmount);
  const refiValue = arvEstimate ?? exitValue;
  const refiProceeds = Math.max(
    0,
    refiValue * (refiLtv / 100) - projectedLoanAmount,
  );

  const activeRiskFlags = REHAB_RISK_FLAGS.filter(([id]) =>
    getBoolean(inputs[`risk_${id}`]),
  );
  const issues: string[] = [];
  const hardStops: string[] = [];

  if (
    annualProjectedRent > annualCurrentRent * 1.15 &&
    ["unverified", "listing"].includes(rentConfidence)
  ) {
    issues.push("Projected rent needs stronger proof.");
  }

  if (postPurchaseTaxesAnnual === null) {
    issues.push("Post-sale tax exposure is not modeled.");
  }

  if (stressedDscr !== null && stressedDscr < lenderMinDscr) {
    hardStops.push("DSCR misses the stressed lender target.");
  }

  if (downsideCashFlow < 0) {
    hardStops.push("Downside scenario is cash-flow negative.");
  }

  if (legalUnitsVerified !== "yes") {
    issues.push("Legal unit count still needs verification.");
  }

  if (codeViolationCheck !== "clear") {
    issues.push("Code / permit check is not clear yet.");
  }

  if (activeRiskFlags.length >= 3) {
    issues.push("Multiple rehab risk flags are active.");
  }

  const verdict =
    hardStops.length >= 2
      ? "High risk"
      : hardStops.length > 0 || issues.length > 1
        ? "Needs diligence"
        : "Offer-ready";
  const verdictClass =
    verdict === "Offer-ready"
      ? "border-green-200 bg-green-50 text-green-800"
      : verdict === "High risk"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <section
      id="diligence"
      className="mb-6 scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-950 sm:text-lg">
            Deal Verdict
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm">
            A compact diligence layer for rent proof, tax risk, stress testing,
            rehab flags, and exit assumptions.
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${verdictClass}`}
        >
          {verdict}
        </span>
      </div>

      <AutoSaveForm
        action={action}
        draftKey={`property-pipeline:autosave:${propertyId}:underwriting-diligence`}
        statusClassName="mt-3 text-right text-xs text-slate-500"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3">
            <Metric
              label="Downside Cash Flow"
              value={formatCurrency(downsideCashFlow)}
              note="+2% rate, rent haircut, vacancy stress"
            />
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <Metric
              label="DSCR +1% Rate"
              value={formatRatio(stressedDscr)}
              note={`${formatRatio(baseDscr)} before rate stress`}
            />
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <Metric
              label="Rent Proof"
              value={
                rentConfidence === "lease"
                  ? "Lease"
                  : rentConfidence === "comp"
                    ? "Comp-backed"
                    : rentConfidence === "fmr_verified"
                      ? "FMR checked"
                      : rentConfidence === "listing"
                        ? "Listing"
                        : "Unverified"
              }
              note={rentSource || "Add source below"}
            />
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <Metric
              label="Rehab Stress"
              value={formatCurrency(rehabStressTotal)}
              note={`${formatPercent(rehabOverrunRate)} overrun on ${formatCurrency(totalRehab)}`}
            />
          </div>
        </div>

        {(issues.length > 0 || hardStops.length > 0) && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Open Items
            </p>
            <div className="flex flex-wrap gap-2">
              {[...hardStops, ...issues].map((issue) => (
                <span
                  key={issue}
                  className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs text-slate-700"
                >
                  {issue}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 space-y-3">
          <Drawer
            title="Scenario Stress"
            summary="As-is, stabilized, and downside views without crowding the main page."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md bg-white p-3">
                <Metric
                  label="As-Is NOI"
                  value={formatCurrency(currentNoi)}
                  note={`${formatCurrency(annualCurrentRent)} current annual rent`}
                />
              </div>
              <div className="rounded-md bg-white p-3">
                <Metric
                  label="Stabilized NOI"
                  value={formatCurrency(stabilizedNoiTaxAdjusted)}
                  note={`${formatCurrency(adjustedProjectedRent)} rent after utility allowance`}
                />
              </div>
              <div className="rounded-md bg-white p-3">
                <Metric
                  label="Downside NOI"
                  value={formatCurrency(downsideNoi)}
                  note={`${formatPercent(downsideVacancyRate)} vacancy, ${formatPercent(downsideRentHaircutRate)} rent haircut`}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Downside Rent Haircut %
                </span>
                <input
                  name="downside_rent_haircut_rate"
                  type="number"
                  min="0"
                  step="0.5"
                  defaultValue={downsideRentHaircutRate}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Downside Vacancy %
                </span>
                <input
                  name="downside_vacancy_rate"
                  type="number"
                  min="0"
                  step="0.5"
                  defaultValue={downsideVacancyRate}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Rehab Overrun %
                </span>
                <input
                  name="rehab_overrun_rate"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={rehabOverrunRate}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                />
              </label>
            </div>
          </Drawer>

          <Drawer
            title="Rent Proof & Voucher Fit"
            summary="Track whether projected rents are based on leases, comps, listing data, or FMR assumptions."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Rent Confidence
                </span>
                <select
                  name="rent_confidence"
                  defaultValue={rentConfidence}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                >
                  <option value="unverified">Unverified</option>
                  <option value="listing">Listing only</option>
                  <option value="lease">Lease / rent roll</option>
                  <option value="comp">Comp-backed</option>
                  <option value="fmr_verified">FMR checked</option>
                </select>
              </label>
              <label className="block lg:col-span-2">
                <span className="text-xs font-medium text-slate-700">
                  Rent Source
                </span>
                <input
                  name="rent_source"
                  defaultValue={rentSource}
                  placeholder="Lease, rent roll, Zillow comps, CHA/FMR..."
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Utility Allowance / Month
                </span>
                <input
                  name="utility_allowance_monthly"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={
                    utilityAllowanceMonthly > 0 ? utilityAllowanceMonthly : ""
                  }
                  placeholder="0"
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">
                  Rent Comp Link
                </span>
                <input
                  name="rent_comp_url"
                  defaultValue={rentCompUrl}
                  placeholder="https://..."
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">
                  Rent Notes
                </span>
                <textarea
                  name="rent_notes"
                  defaultValue={rentNotes}
                  rows={2}
                  placeholder="Which units need rent proof, rent reasonableness concerns, voucher assumptions..."
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
            </div>
          </Drawer>

          <Drawer
            title="Tax & Financing Stress"
            summary="Post-sale tax exposure, lender DSCR target, points, and reserve pressure."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Post-Sale Taxes / Year
                </span>
                <input
                  name="post_purchase_taxes_annual"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={postPurchaseTaxesAnnual ?? ""}
                  placeholder={String(currentTaxes || "")}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Min DSCR
                </span>
                <input
                  name="lender_min_dscr"
                  type="number"
                  min="0"
                  step="0.05"
                  defaultValue={lenderMinDscr}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Loan Points %
                </span>
                <input
                  name="loan_points_rate"
                  type="number"
                  min="0"
                  step="0.25"
                  defaultValue={loanPointsRate}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Reserve Months
                </span>
                <input
                  name="reserve_months"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={reserveMonths}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                />
              </label>
              <div className="rounded-md bg-white p-3">
                <Metric
                  label="Points + Reserves"
                  value={formatCurrency(loanPoints + reserveRequirement)}
                  note={`${formatCurrency(loanPoints)} points, ${formatCurrency(reserveRequirement)} reserves`}
                />
              </div>
              <label className="block sm:col-span-2 lg:col-span-5">
                <span className="text-xs font-medium text-slate-700">
                  Tax / Financing Notes
                </span>
                <textarea
                  name="tax_notes"
                  defaultValue={taxNotes}
                  rows={2}
                  placeholder="Cook County reassessment note, lender quote, borrower reserves, rate-lock assumptions..."
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
            </div>
          </Drawer>

          <Drawer
            title="Rehab, Legal & Code Risk"
            summary="A quick checklist for the things that turn pretty cap rates into expensive surprises."
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {REHAB_RISK_FLAGS.map(([riskId, label]) => (
                <label
                  key={riskId}
                  className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <input
                    name={`risk_${riskId}`}
                    type="checkbox"
                    defaultChecked={getBoolean(inputs[`risk_${riskId}`])}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Legal Unit Count
                </span>
                <select
                  name="legal_units_verified"
                  defaultValue={legalUnitsVerified}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                >
                  <option value="unknown">Unknown</option>
                  <option value="yes">Verified</option>
                  <option value="no">Issue found</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Code / Permit Check
                </span>
                <select
                  name="code_violation_check"
                  defaultValue={codeViolationCheck}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                >
                  <option value="needs_check">Needs check</option>
                  <option value="clear">Clear</option>
                  <option value="issue_found">Issue found</option>
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">
                  Rehab / Legal Notes
                </span>
                <textarea
                  name="rehab_notes"
                  defaultValue={rehabNotes}
                  rows={2}
                  placeholder="Inspection findings, contractor quote confidence, permit concerns, legal unit verification..."
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
            </div>
          </Drawer>

          <Drawer
            title="Exit & Refi View"
            summary="Keep a light exit model nearby without turning the property page into a full pro forma."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Strategy
                </span>
                <select
                  name="exit_strategy"
                  defaultValue={exitStrategy}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                >
                  <option value="hold">Hold</option>
                  <option value="refi">Refi</option>
                  <option value="sell">Sell</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Hold Years
                </span>
                <input
                  name="hold_period_years"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={holdPeriodYears}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Exit Cap %
                </span>
                <input
                  name="exit_cap_rate"
                  type="number"
                  min="0"
                  step="0.25"
                  defaultValue={exitCapRate}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Sale Costs %
                </span>
                <input
                  name="sale_cost_rate"
                  type="number"
                  min="0"
                  step="0.25"
                  defaultValue={saleCostRate}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Refi LTV %
                </span>
                <input
                  name="refi_ltv"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={refiLtv}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  ARV / Comp Value
                </span>
                <input
                  name="arv_estimate"
                  type="number"
                  min="0"
                  step="1000"
                  defaultValue={arvEstimate ?? ""}
                  placeholder={String(Math.round(exitValue || projectedPurchasePrice))}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                />
              </label>
              <div className="rounded-md bg-white p-3 lg:col-span-3">
                <Metric
                  label="Cap-Rate Exit Value"
                  value={formatCurrency(exitValue)}
                  note={`${formatPercent(exitCapRate)} exit cap on tax-adjusted stabilized NOI`}
                />
              </div>
              <div className="rounded-md bg-white p-3 lg:col-span-3">
                <Metric
                  label={
                    exitStrategy === "refi"
                      ? "Potential Refi Proceeds"
                      : "Net Sale Proceeds"
                  }
                  value={formatCurrency(
                    exitStrategy === "refi" ? refiProceeds : netSaleProceeds,
                  )}
                  note={
                    exitStrategy === "refi"
                      ? `${formatPercent(refiLtv)} LTV on ${formatCurrency(refiValue)}`
                      : `${formatPercent(saleCostRate)} sale costs after loan payoff`
                  }
                />
              </div>
            </div>
          </Drawer>
        </div>
      </AutoSaveForm>
    </section>
  );
}
