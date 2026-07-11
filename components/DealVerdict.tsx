"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { AutoSaveForm } from "@/components/AutoSaveForm";
import {
  DEAL_ANALYZER_PROJECTION_EVENT,
  PROPERTY_RENT_ROLL_EVENT,
  getMonthlyMortgagePayment,
  type DealAnalyzerProjection,
  type PropertyRentRollUpdate,
} from "@/lib/deal-analyzer";
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
  annualFixedOperatingExpenses: number;
  repairsMaintenanceRate: number;
  propertyManagementRate: number;
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
  annualOwnerPaidUtilities: number;
  inferredRecordedUnitCount: number | null;
  propertyType: string | null;
  units: VerdictUnit[];
};

type VerdictUnit = {
  id: string;
  label: string;
  currentRent: number;
  projectedRent: number;
  leaseExpiration: string | null;
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

const EXPENSE_CONFIRMATION_ITEMS = [
  ["water_sewer", "Water / sewer"],
  ["garbage", "Garbage fee"],
  ["common_electric", "Common-area electric"],
  ["snow", "Snow removal"],
  ["pest", "Pest control"],
  ["leasing_turnover", "Leasing / turnover"],
  ["legal_accounting", "Legal / accounting"],
  ["permits_inspections", "Permits / inspections"],
  ["replacement_reserves", "Replacement reserves"],
  ["management_stress", "Management stress"],
] as const;

const CRITICAL_EXPENSE_IDS = new Set([
  "water_sewer",
  "garbage",
  "replacement_reserves",
  "management_stress",
]);

const INFO_TIP_OPEN_EVENT = "property-pipeline:deal-verdict-info-open";

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

function getLoanPrincipalFromAnnualDebtService(
  annualDebtService: number,
  annualRatePercent: number,
  termYears: number,
) {
  if (annualDebtService <= 0 || termYears <= 0) return null;

  const monthlyPayment = annualDebtService / 12;
  const paymentCount = termYears * 12;
  const monthlyRate = annualRatePercent / 100 / 12;

  if (monthlyRate === 0) return monthlyPayment * paymentCount;

  const growthFactor = Math.pow(1 + monthlyRate, paymentCount);

  return (
    (monthlyPayment * (growthFactor - 1)) /
    (monthlyRate * growthFactor)
  );
}

function roundDownToThousand(value: number | null) {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;

  return Math.floor(value / 1000) * 1000;
}

function InfoTip({
  label,
  info,
  className = "absolute right-0 top-0",
}: {
  label: string;
  info: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const id = useId();
  const visible = open || hovered;

  useEffect(() => {
    function handleOpen(event: Event) {
      const detail = (event as CustomEvent<{ id: string }>).detail;

      if (detail?.id !== id) {
        setOpen(false);
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !wrapperRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    window.addEventListener(INFO_TIP_OPEN_EVENT, handleOpen);
    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener(INFO_TIP_OPEN_EVENT, handleOpen);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [id]);

  function toggleInfo(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    setOpen((currentOpen) => {
      const nextOpen = !currentOpen;

      if (nextOpen) {
        window.dispatchEvent(
          new CustomEvent(INFO_TIP_OPEN_EVENT, {
            detail: { id },
          }),
        );
      }

      return nextOpen;
    });
  }

  function showInfo() {
    setHovered(true);
    window.dispatchEvent(
      new CustomEvent(INFO_TIP_OPEN_EVENT, {
        detail: { id },
      }),
    );
  }

  return (
    <span
      ref={wrapperRef}
      onMouseEnter={showInfo}
      onMouseLeave={() => setHovered(false)}
      className={`${className} ${visible ? "z-[100]" : "z-30"}`}
    >
      <button
        type="button"
        aria-expanded={visible}
        aria-label={`${label} details`}
        onClick={toggleInfo}
        onFocus={showInfo}
        onBlur={() => setHovered(false)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition hover:border-slate-300 hover:text-slate-700 focus:border-slate-400 focus:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {visible && (
        <span
          role="tooltip"
          className="absolute right-0 top-7 z-[110] w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-3 text-left text-[11px] font-normal leading-relaxed text-slate-600 shadow-xl"
        >
          {info}
        </span>
      )}
    </span>
  );
}

function Metric({
  label,
  value,
  note,
  info,
}: {
  label: string;
  value: string;
  note?: string;
  info?: string;
}) {
  return (
    <div className="relative min-w-0 pr-8">
      {info && <InfoTip label={label} info={info} />}
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
  info,
  children,
}: {
  title: string;
  summary: string;
  info?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-slate-200 bg-slate-50/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-sm font-semibold text-slate-900 sm:px-4">
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="block">{title}</span>
            {info && (
              <InfoTip
                label={title}
                info={info}
                className="relative inline-flex shrink-0"
              />
            )}
          </span>
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

const verdictRailClass =
  "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] sm:block sm:space-y-4 sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden";

const verdictPanelClass =
  "w-full min-w-full max-w-full shrink-0 snap-start overflow-visible rounded-lg border border-slate-200 bg-white p-3 sm:min-w-0 sm:max-w-none sm:border-0 sm:bg-transparent sm:p-0";

export function DealVerdict({
  action,
  annualCurrentRent: initialAnnualCurrentRent,
  annualProjectedRent: initialAnnualProjectedRent,
  annualDebtService: initialAnnualDebtService,
  currentNoi: initialCurrentNoi,
  annualFixedOperatingExpenses,
  repairsMaintenanceRate,
  propertyManagementRate,
  projectedNoi: initialProjectedNoi,
  projectedOperatingExpenses: initialProjectedOperatingExpenses,
  projectedInterestRate: initialProjectedInterestRate,
  projectedLoanAmount: initialProjectedLoanAmount,
  projectedLoanTermYears: initialProjectedLoanTermYears,
  projectedPurchasePrice: initialProjectedPurchasePrice,
  taxesAnnual,
  totalRehab,
  underwriting,
  vacancyRate: initialVacancyRate,
  propertyId,
  annualOwnerPaidUtilities,
  inferredRecordedUnitCount,
  propertyType,
  units,
}: DealVerdictProps) {
  const [liveProjection, setLiveProjection] =
    useState<DealAnalyzerProjection | null>(null);
  const [liveRentRoll, setLiveRentRoll] =
    useState<PropertyRentRollUpdate | null>(null);
  const activeProjection =
    liveProjection?.propertyId === propertyId ? liveProjection : null;
  const activeRentRoll =
    liveRentRoll?.propertyId === propertyId ? liveRentRoll : null;
  const vacancyRate = activeProjection?.vacancyRate ?? initialVacancyRate;
  const annualCurrentRent =
    activeRentRoll?.annualCurrentRent ?? initialAnnualCurrentRent;
  const annualProjectedRent =
    activeProjection?.annualGrossRent ??
    activeRentRoll?.annualProjectedRent ??
    initialAnnualProjectedRent;
  const projectedPurchasePrice =
    activeProjection?.purchasePrice ?? initialProjectedPurchasePrice;
  const projectedOperatingExpenses =
    activeProjection?.operatingExpenses ?? initialProjectedOperatingExpenses;
  const projectedNoi = activeProjection?.noiAnnual ?? initialProjectedNoi;
  const annualDebtService =
    activeProjection?.annualDebtService ?? initialAnnualDebtService;
  const projectedInterestRate =
    activeProjection?.interestRate ?? initialProjectedInterestRate;
  const projectedLoanAmount =
    activeProjection?.loanAmount ?? initialProjectedLoanAmount;
  const projectedLoanTermYears =
    activeProjection?.loanTermYears ?? initialProjectedLoanTermYears;
  const currentNoi =
    activeRentRoll && activeRentRoll.annualCurrentRent !== initialAnnualCurrentRent
      ? annualCurrentRent -
        annualCurrentRent * (vacancyRate / 100) -
        (annualFixedOperatingExpenses +
          annualCurrentRent * (repairsMaintenanceRate / 100) +
          annualCurrentRent * (propertyManagementRate / 100))
      : initialCurrentNoi;

  useEffect(() => {
    function handleProjectionUpdate(event: Event) {
      const detail = (event as CustomEvent<DealAnalyzerProjection>).detail;

      if (detail?.propertyId === propertyId) {
        setLiveProjection(detail);
      }
    }

    function handleRentRollUpdate(event: Event) {
      const detail = (event as CustomEvent<PropertyRentRollUpdate>).detail;

      if (detail?.propertyId === propertyId) {
        setLiveRentRoll(detail);
      }
    }

    window.addEventListener(
      DEAL_ANALYZER_PROJECTION_EVENT,
      handleProjectionUpdate,
    );
    window.addEventListener(PROPERTY_RENT_ROLL_EVENT, handleRentRollUpdate);

    return () => {
      window.removeEventListener(
        DEAL_ANALYZER_PROJECTION_EVENT,
        handleProjectionUpdate,
      );
      window.removeEventListener(PROPERTY_RENT_ROLL_EVENT, handleRentRollUpdate);
    };
  }, [propertyId]);

  const inputs = asRecord(underwriting);
  const rentConfidence = getString(inputs.rent_confidence, "unverified");
  const rentSource = getString(inputs.rent_source);
  const rentCompUrl = getString(inputs.rent_comp_url);
  const rentNotes = getString(inputs.rent_notes);
  const utilityAllowanceMonthly = getNumber(inputs.utility_allowance_monthly, 0);
  const savedRecordedUnitCount = getOptionalNumber(inputs.recorded_unit_count);
  const postPurchaseTaxesAnnual = getOptionalNumber(
    inputs.post_purchase_taxes_annual,
  );
  const taxNotes = getString(inputs.tax_notes);
  const lenderMinDscr = getNumber(inputs.lender_min_dscr, 1.25);
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
  const modeledTaxesAnnual = postPurchaseTaxesAnnual ?? currentTaxes;
  const taxDelta =
    modeledTaxesAnnual - currentTaxes;
  const hasUnexpectedTaxDecrease =
    postPurchaseTaxesAnnual !== null && taxDelta < 0;
  const stabilizedNoiTaxAdjusted = projectedNoi - taxDelta - utilityAllowanceAnnual;
  const recordedUnitCount =
    savedRecordedUnitCount !== null
      ? Math.max(0, Math.floor(savedRecordedUnitCount))
      : inferredRecordedUnitCount;
  const modeledUnitCount = units.length;
  const unitCountMismatch =
    recordedUnitCount !== null &&
    modeledUnitCount > recordedUnitCount &&
    legalUnitsVerified !== "yes";
  const unsupportedUnits = unitCountMismatch
    ? units.slice(recordedUnitCount)
    : [];
  const unsupportedAnnualRent = unsupportedUnits.reduce(
    (sum, unit) => sum + Math.max(0, unit.projectedRent) * 12,
    0,
  );
  const legalUnitProjectedRent = Math.max(
    0,
    adjustedProjectedRent - unsupportedAnnualRent,
  );
  const legalUnitNoi =
    legalUnitProjectedRent * (1 - vacancyRate / 100) -
    projectedOperatingExpenses -
    taxDelta;
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
  const stabilizedCashFlow = stabilizedNoiTaxAdjusted - annualDebtService;
  const stressedDscr =
    annualDebtServicePlusOne > 0
      ? stabilizedNoiTaxAdjusted / annualDebtServicePlusOne
      : null;
  const downsideCashFlow = downsideNoi - annualDebtServicePlusTwo;
  const legalUnitDscr =
    annualDebtService > 0 ? legalUnitNoi / annualDebtService : null;
  const legalUnitCashFlow = legalUnitNoi - annualDebtService;
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
  const loanToValue =
    projectedPurchasePrice > 0 && projectedLoanAmount > 0
      ? projectedLoanAmount / projectedPurchasePrice
      : null;
  const debtSupportedPrices = [
    baseDscr !== null && lenderMinDscr > 0
      ? getLoanPrincipalFromAnnualDebtService(
          stabilizedNoiTaxAdjusted / lenderMinDscr,
          projectedInterestRate + 1,
          projectedLoanTermYears,
        )
      : null,
    getLoanPrincipalFromAnnualDebtService(
      downsideNoi,
      projectedInterestRate + 2,
      projectedLoanTermYears,
    ),
    getLoanPrincipalFromAnnualDebtService(
      stabilizedNoiTaxAdjusted,
      projectedInterestRate,
      projectedLoanTermYears,
    ),
  ]
    .filter(
      (principal): principal is number =>
        principal !== null && Number.isFinite(principal) && principal > 0,
    )
    .map((principal) =>
      loanToValue !== null && loanToValue > 0 ? principal / loanToValue : null,
    )
    .filter(
      (price): price is number =>
        price !== null && Number.isFinite(price) && price > 0,
    );
  const debtSupportedPrice =
    debtSupportedPrices.length > 0 ? Math.min(...debtSupportedPrices) : null;
  const incomeSupportedPrice =
    exitCapRate > 0
      ? Math.max(
          0,
          stabilizedNoiTaxAdjusted / (exitCapRate / 100) - rehabStressTotal,
        )
      : null;
  const suggestedGoodDealPrice = roundDownToThousand(
    Math.min(
      ...[debtSupportedPrice, incomeSupportedPrice].filter(
        (price): price is number =>
          price !== null && Number.isFinite(price) && price > 0,
      ),
    ),
  );

  const activeRiskFlags = REHAB_RISK_FLAGS.filter(([id]) =>
    getBoolean(inputs[`risk_${id}`]),
  );
  const expenseConfirmations = EXPENSE_CONFIRMATION_ITEMS.map(([id, label]) => ({
    id,
    label,
    confirmed: getBoolean(inputs[`expense_${id}_confirmed`]),
  }));
  const missingExpenseConfirmations = expenseConfirmations.filter(
    (item) => !item.confirmed,
  );
  const missingCriticalExpenseConfirmations =
    missingExpenseConfirmations.filter((item) =>
      CRITICAL_EXPENSE_IDS.has(item.id),
    );
  const projectedRentLiftRate =
    annualCurrentRent > 0
      ? ((annualProjectedRent - annualCurrentRent) / annualCurrentRent) * 100
      : 0;
  const unitsWithLargeRentIncreases = units.filter(
    (unit) =>
      unit.currentRent > 0 &&
      unit.projectedRent > unit.currentRent &&
      ((unit.projectedRent - unit.currentRent) / unit.currentRent) * 100 >= 25,
  );
  const unitsMissingLeaseTiming = units.filter(
    (unit) =>
      unit.currentRent > 0 &&
      unit.projectedRent > unit.currentRent * 1.1 &&
      !unit.leaseExpiration,
  );
  const issues: string[] = [];
  const hardStops: string[] = [];

  if (
    annualProjectedRent > annualCurrentRent * 1.15 &&
    ["unverified", "listing"].includes(rentConfidence)
  ) {
    issues.push("Projected rent needs stronger proof.");
  }

  if (projectedRentLiftRate >= 20) {
    issues.push("Projected rent growth is heavily driving the deal.");
  }

  if (unitsMissingLeaseTiming.length > 0) {
    issues.push("Lease timing is missing for rent increases.");
  }

  if (postPurchaseTaxesAnnual === null) {
    issues.push("Post-sale tax exposure is not modeled.");
  }

  if (hasUnexpectedTaxDecrease) {
    hardStops.push(
      "Post-sale taxes are modeled below current taxes, which inflates NOI.",
    );
  }

  if (unitCountMismatch) {
    hardStops.push("Modeled unit count exceeds recorded/listed unit count.");
  }

  if (stressedDscr !== null && stressedDscr < lenderMinDscr) {
    hardStops.push("DSCR misses the stressed lender target.");
  }

  if (
    unitCountMismatch &&
    legalUnitDscr !== null &&
    legalUnitDscr < lenderMinDscr
  ) {
    hardStops.push("Deal fails if unsupported unit rent is removed.");
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

  if (annualOwnerPaidUtilities === 0 && modeledUnitCount > 0) {
    issues.push("Owner-paid utilities are not modeled or confirmed.");
  }

  if (missingCriticalExpenseConfirmations.length > 0) {
    issues.push("Key operating expenses still need confirmation.");
  }

  let dealScore = 100;

  dealScore -= hardStops.length * 28;
  dealScore -= issues.length * 8;

  if (baseDscr !== null && baseDscr < lenderMinDscr) {
    dealScore -= 12;
  }

  if (stabilizedCashFlow < 0) {
    dealScore -= 18;
  }

  if (rentConfidence === "unverified") {
    dealScore -= 8;
  }

  if (projectedRentLiftRate >= 20) {
    dealScore -= 8;
  }

  if (unitsMissingLeaseTiming.length > 0) {
    dealScore -= Math.min(12, unitsMissingLeaseTiming.length * 4);
  }

  if (missingExpenseConfirmations.length > 0) {
    dealScore -= Math.min(14, missingExpenseConfirmations.length * 2);
  }

  if (activeRiskFlags.length > 0) {
    dealScore -= Math.min(16, activeRiskFlags.length * 4);
  }

  dealScore = Math.max(0, Math.min(100, Math.round(dealScore)));

  const positiveSignals: string[] = [];

  if (stabilizedCashFlow > 0) {
    positiveSignals.push("Stabilized cash flow is positive.");
  }

  if (baseDscr !== null && baseDscr >= lenderMinDscr) {
    positiveSignals.push("Base DSCR meets the lender target.");
  }

  if (stressedDscr !== null && stressedDscr >= Math.max(lenderMinDscr, 1.25)) {
    positiveSignals.push("DSCR still works after a 1% rate stress.");
  }

  if (["lease", "comp", "fmr_verified"].includes(rentConfidence)) {
    positiveSignals.push("Rent assumptions have stronger support.");
  }

  if (activeRiskFlags.length === 0) {
    positiveSignals.push("No major rehab risk flags are selected.");
  }

  const dealCall =
    hardStops.length >= 2 || dealScore < 45
      ? "Bad deal"
      : hardStops.length === 0 && issues.length <= 1 && dealScore >= 80
        ? "Good deal"
        : "Needs review";
  const dealCallSummary =
    dealCall === "Good deal"
      ? "The deal clears the main stress checks based on your current assumptions."
      : dealCall === "Bad deal"
        ? "The deal has major blockers based on your current assumptions."
        : "The deal is close enough to keep reviewing, but it is not clean yet.";
  const dealCallClass =
    dealCall === "Good deal"
      ? "border-green-200 bg-green-50 text-green-800"
      : dealCall === "Bad deal"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-amber-200 bg-amber-50 text-amber-800";
  const topDecisionReasons =
    dealCall === "Good deal"
      ? positiveSignals.slice(0, 3)
      : [...hardStops, ...issues].slice(0, 3);
  const currentPriceWorks =
    suggestedGoodDealPrice !== null &&
    projectedPurchasePrice > 0 &&
    projectedPurchasePrice <= suggestedGoodDealPrice &&
    dealCall === "Good deal";
  const suggestedPriceGap =
    suggestedGoodDealPrice !== null && projectedPurchasePrice > 0
      ? Math.max(0, projectedPurchasePrice - suggestedGoodDealPrice)
      : null;
  const nonPriceItems = issues.slice(0, 2);

  return (
    <details
      id="diligence"
      open
      className="group mb-6 scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-950 sm:text-lg">
            Deal Verdict
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm">
            A compact diligence layer for rent proof, tax risk, stress testing,
            rehab flags, and exit assumptions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${dealCallClass}`}
          >
            {dealCall}
          </span>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-base leading-none text-slate-500 transition group-open:rotate-45">
            +
          </span>
        </div>
      </summary>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <AutoSaveForm
          action={action}
          draftKey={`property-pipeline:autosave:${propertyId}:underwriting-diligence`}
          statusClassName="mt-3 text-right text-xs text-slate-500"
        >
          <div className={verdictRailClass}>
            <section className={verdictPanelClass}>
              <div className={`mb-3 rounded-lg border p-3 ${dealCallClass}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                      Deal Call
                    </p>
                    <p className="mt-1 text-2xl font-bold">{dealCall}</p>
                    <p className="mt-1 text-xs leading-relaxed">
                      {dealCallSummary}
                    </p>
                  </div>
                  <div className="rounded-full bg-white/70 px-3 py-1 text-sm font-bold">
                    {dealScore}/100
                  </div>
                </div>

                <p className="mt-2 text-[11px] leading-relaxed opacity-85">
                  Score starts at 100 and subtracts for modeled blockers,
                  weak rent proof, DSCR misses, negative stress cash flow,
                  unit-count risk, missing expense checks, and rehab/legal/code
                  risk. It is a screening score, not a guarantee.
                </p>

                {topDecisionReasons.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs leading-relaxed">
                    {topDecisionReasons.map((reason) => (
                      <li key={reason}>- {reason}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mb-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <Metric
                    label="Analyzed Price"
                    value={formatCurrency(projectedPurchasePrice)}
                    note="Current price in the Deal Analyzer"
                    info="This is the purchase price currently being tested in Deal Analyzer. Changing the analyzer purchase price updates this number and the verdict math."
                  />
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <Metric
                    label="Suggested Good-Deal Price"
                    value={
                      currentPriceWorks
                        ? "Current price works"
                        : formatCurrency(suggestedGoodDealPrice)
                    }
                    note={
                      suggestedGoodDealPrice === null
                        ? "Add more rent, debt, and expense data"
                        : suggestedPriceGap && suggestedPriceGap > 0
                          ? `${formatCurrency(suggestedPriceGap)} below analyzed price`
                          : "Based on stress DSCR, downside cash flow, and target yield"
                    }
                    info="This is the highest price the model thinks still works as a good deal based on debt coverage, downside cash flow, target yield, and stressed rehab. If it says current price works, the analyzed price is already at or below that threshold."
                  />
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <Metric
                    label="Target Basis"
                    value={
                      debtSupportedPrice !== null
                        ? "Debt + income"
                        : "Income yield"
                    }
                    note={`${formatPercent(exitCapRate)} target yield after stressed rehab`}
                    info="This tells you which constraint is driving the suggested good-deal price. Debt + income means both lender coverage and income yield are part of the limit. Income yield means the target return is the main limit."
                  />
                </div>
              </div>

              {dealCall !== "Good deal" && nonPriceItems.length > 0 && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                  <p className="font-semibold">
                    Price alone may not fully fix this deal.
                  </p>
                  <p className="mt-1">
                    Also clear: {nonPriceItems.join(" ")}
                  </p>
                </div>
              )}

              {unitCountMismatch && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-800">
                  <p className="font-semibold">Legal unit risk is active.</p>
                  <p className="mt-1">
                    {modeledUnitCount} modeled units vs.{" "}
                    {recordedUnitCount} recorded/listed units
                    {propertyType ? ` from ${propertyType}` : ""}. Until the
                    extra unit is verified, the verdict stress-tests that rent
                    at $0.
                  </p>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg bg-slate-50 p-3">
                  <Metric
                    label="Downside Cash Flow (Before CapEx)"
                    value={formatCurrency(downsideCashFlow)}
                    note="+2% rate, rent haircut, vacancy stress; excludes CapEx reserve"
                    info="This is annual cash flow after a harsher scenario: interest rate rises by 2 points, rent is reduced by your downside haircut, and vacancy is increased. It does not subtract the CapEx reserve, so the real downside cash flow is lower than this. Negative here is a major warning sign."
                  />
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <Metric
                    label="DSCR +1% Rate"
                    value={formatRatio(stressedDscr)}
                    note={`${formatRatio(baseDscr)} before rate stress`}
                    info="DSCR means net operating income divided by annual debt service. This version tests whether the deal still covers the loan if the interest rate is 1 point higher. Many lenders want roughly 1.20x or better."
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
                    info="This grades how reliable your projected rents are. Lease, comp-backed, or FMR checked rents are stronger than listing-only or unverified rents."
                  />
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <Metric
                    label="Rehab Stress"
                    value={formatCurrency(rehabStressTotal)}
                    note={`${formatPercent(rehabOverrunRate)} overrun on ${formatCurrency(totalRehab)}`}
                    info="This adds your rehab overrun percentage to the current rehab estimate. It helps show what the deal looks like if repairs come in higher than expected."
                  />
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg bg-slate-50 p-3">
                  <Metric
                    label="Rent Increase"
                    value={formatPercent(projectedRentLiftRate)}
                    note={`${formatCurrency(annualCurrentRent)} to ${formatCurrency(annualProjectedRent)}`}
                    info="This shows how much projected rent is above current rent. Big increases are not bad by themselves, but the deal score now expects proof and lease timing before calling the deal clean."
                  />
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <Metric
                    label="Recorded Units"
                    value={
                      recordedUnitCount === null
                        ? "Not set"
                        : `${recordedUnitCount}`
                    }
                    note={`${modeledUnitCount} modeled in CRM`}
                    info="This compares the unit count you modeled against the listed or public-record count. If modeled units are higher, the score warns until legal unit count is verified."
                  />
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <Metric
                    label="Expense Checks"
                    value={`${expenseConfirmations.length - missingExpenseConfirmations.length}/${expenseConfirmations.length}`}
                    note={
                      missingCriticalExpenseConfirmations.length > 0
                        ? "Critical items missing"
                        : "Confirmed checklist"
                    }
                    info="This tracks whether commonly missed operating expenses have been confirmed. Water/sewer, garbage, reserves, and management stress are treated as key checks."
                  />
                </div>
                <div
                  className={`rounded-lg p-3 ${hasUnexpectedTaxDecrease ? "border border-red-200 bg-red-50" : "bg-slate-50"}`}
                >
                  <Metric
                    label="Post-Sale Taxes"
                    value={formatCurrency(modeledTaxesAnnual)}
                    note={
                      taxDelta === 0
                        ? `Same as current taxes (${formatCurrency(currentTaxes)})`
                        : `Current ${formatCurrency(currentTaxes)}, ${taxDelta > 0 ? "+" : ""}${formatCurrency(taxDelta)}${hasUnexpectedTaxDecrease ? " (unexpected decrease)" : ""}`
                    }
                    info="This is the tax number used in the verdict stress math. If blank, the model uses current saved taxes and flags post-sale taxes as unverified. A modeled figure below current taxes is unusual after a sale and will inflate every stress metric."
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
            </section>

            <section className={verdictPanelClass}>
              <div className="space-y-3">
          <Drawer
            title="Scenario Stress"
            summary="As-is, stabilized, and downside views without crowding the main page."
            info="This section compares three versions of the deal: current/as-is income, stabilized income after your projected assumptions, and downside income after rent and vacancy stress. Use it to see whether the deal still survives when assumptions get tougher."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md bg-white p-3">
                <Metric
                  label="As-Is NOI"
                  value={formatCurrency(currentNoi)}
                  note={`${formatCurrency(annualCurrentRent)} current annual rent`}
                  info="As-is NOI uses current rent, current operating assumptions, vacancy, taxes, insurance, utilities, repairs, and management. It is the current income picture before your upside plan."
                />
              </div>
              <div className="rounded-md bg-white p-3">
                <Metric
                  label="Stabilized NOI"
                  value={formatCurrency(stabilizedNoiTaxAdjusted)}
                  note={`${formatCurrency(adjustedProjectedRent)} rent after utility allowance`}
                  info="Stabilized NOI uses your projected rent and operating assumptions, then adjusts for utility allowance and any post-purchase tax change you entered."
                />
              </div>
              <div className="rounded-md bg-white p-3">
                <Metric
                  label="Downside NOI"
                  value={formatCurrency(downsideNoi)}
                  note={`${formatPercent(downsideVacancyRate)} vacancy, ${formatPercent(downsideRentHaircutRate)} rent haircut`}
                  info="Downside NOI reduces projected rent by your rent haircut and applies the downside vacancy rate. It shows income if the rent plan is too optimistic or leasing is slower."
                />
              </div>
            </div>

            {unitCountMismatch && (
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-md border border-red-100 bg-red-50 p-3">
                  <Metric
                    label="Legal-Unit NOI"
                    value={formatCurrency(legalUnitNoi)}
                    note={`${formatCurrency(unsupportedAnnualRent)} unsupported rent removed`}
                    info="This removes projected rent from modeled units above the recorded/listed unit count, while leaving expenses in place. It approximates the deal if an extra basement/garden unit cannot be counted."
                  />
                </div>
                <div className="rounded-md border border-red-100 bg-red-50 p-3">
                  <Metric
                    label="Legal-Unit DSCR"
                    value={formatRatio(legalUnitDscr)}
                    note={`${formatRatio(baseDscr)} with all modeled units`}
                    info="This divides legal-unit-stressed NOI by annual debt service. It is useful when the deal depends on a unit that still needs legal verification."
                  />
                </div>
                <div className="rounded-md border border-red-100 bg-red-50 p-3">
                  <Metric
                    label="Legal-Unit Cash Flow"
                    value={formatCurrency(legalUnitCashFlow)}
                    note="Before CapEx reserve"
                    info="This shows annual cash flow after debt service if unsupported unit rent is removed. Negative here means legal-unit verification is a major underwriting condition."
                  />
                </div>
              </div>
            )}

            {postPurchaseTaxesAnnual !== null && taxDelta !== 0 && (
              <p className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-600">
                Stabilized NOI includes a {formatCurrency(taxDelta)} post-sale
                tax adjustment against current saved taxes.
              </p>
            )}

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

            {(unitsWithLargeRentIncreases.length > 0 ||
              unitsMissingLeaseTiming.length > 0) && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                <p className="font-semibold">Rent increase watchlist</p>
                {unitsWithLargeRentIncreases.length > 0 && (
                  <p className="mt-1">
                    Large increases:{" "}
                    {unitsWithLargeRentIncreases
                      .map((unit) => {
                        const lift =
                          ((unit.projectedRent - unit.currentRent) /
                            unit.currentRent) *
                          100;

                        return `${unit.label} ${formatCurrency(unit.currentRent)} -> ${formatCurrency(unit.projectedRent)} (${formatPercent(lift)})`;
                      })
                      .join("; ")}
                  </p>
                )}
                {unitsMissingLeaseTiming.length > 0 && (
                  <p className="mt-1">
                    Add lease expiration or turnover timing for:{" "}
                    {unitsMissingLeaseTiming
                      .map((unit) => unit.label)
                      .join(", ")}
                    .
                  </p>
                )}
                <p className="mt-1">
                  FMR or voucher ceilings are not guaranteed contract rents;
                  keep comps, utility allowance, and rent-reasonableness proof
                  attached.
                </p>
              </div>
            )}
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
                <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">
                  Current taxes: {formatCurrency(currentTaxes)}. This field is
                  the full annual dollar amount, not the change. Leave it
                  blank to keep using current taxes.
                </span>
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
              <div className="rounded-md bg-white p-3 sm:col-span-2 lg:col-span-2">
                <Metric
                  label="Tax Stress"
                  value={formatCurrency(modeledTaxesAnnual)}
                  note={
                    postPurchaseTaxesAnnual === null
                      ? `Using saved current taxes (${formatCurrency(currentTaxes)})`
                      : `${formatCurrency(currentTaxes)} current, ${taxDelta > 0 ? "+" : ""}${formatCurrency(taxDelta)} delta`
                  }
                  info="Use this to model post-sale tax exposure separately from the saved current tax bill. The verdict NOI uses this adjustment so taxes do not disappear from stress math."
                />
              </div>

              {hasUnexpectedTaxDecrease && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-800 sm:col-span-2 lg:col-span-5">
                  <p className="font-semibold">
                    Post-Sale Taxes is set below current taxes.
                  </p>
                  <p className="mt-1">
                    Post-Sale Taxes / Year is {formatCurrency(modeledTaxesAnnual)},{" "}
                    {formatCurrency(Math.abs(taxDelta))} lower than the current{" "}
                    {formatCurrency(currentTaxes)} tax bill. Cook County sales
                    are usually reassessed upward, so this is treated as a hard
                    stop rather than an assumption. If you meant &quot;no
                    change,&quot; clear this field so it falls back to current
                    taxes; otherwise confirm the lower figure (e.g. an
                    exemption or successful appeal) in the notes below.
                  </p>
                </div>
              )}
              <div className="rounded-md bg-white p-3 sm:col-span-2 lg:col-span-3">
                <Metric
                  label="Cash Cushion"
                  value={formatCurrency(loanPoints + reserveRequirement)}
                  note="Loan points plus reserve requirement; acquisition costs may still need separate lender/escrow detail"
                  info="This helps catch costs that are easy to miss at closing, like lender points and required reserves. Keep acquisition cost percent conservative if escrows, legal, title, appraisal, or inspection costs are not fully modeled."
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
                  Recorded / Listed Unit Count
                </span>
                <input
                  name="recorded_unit_count"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={recordedUnitCount ?? ""}
                  placeholder={
                    inferredRecordedUnitCount === null
                      ? "Unknown"
                      : String(inferredRecordedUnitCount)
                  }
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                />
                <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                  CRM models {modeledUnitCount} units
                  {propertyType ? `; property type says ${propertyType}` : ""}.
                </span>
              </label>
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
              {unitCountMismatch && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-800 sm:col-span-2">
                  <p className="font-semibold">
                    Ask for legal-unit documentation before relying on extra
                    rent.
                  </p>
                  <p className="mt-1">
                    Verify zoning / certificate of occupancy, permits for
                    basement work, legal bedroom and egress, separate utilities,
                    and lender/appraiser/insurance treatment.
                  </p>
                </div>
              )}
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
            title="Expense Completeness"
            summary="Confirm the operating costs that are easy to miss before trusting the score."
            info="The score now penalizes unconfirmed key expense categories because missing water/sewer, garbage, reserves, or management stress can make a deal look stronger than it is."
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {expenseConfirmations.map((item) => (
                <label
                  key={item.id}
                  className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <input
                    name={`expense_${item.id}_confirmed`}
                    type="checkbox"
                    defaultChecked={item.confirmed}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  />
                  <span>
                    <span className="block font-medium">{item.label}</span>
                    {CRITICAL_EXPENSE_IDS.has(item.id) && (
                      <span className="block text-xs text-slate-500">
                        Key score check
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-md bg-white p-3">
                <Metric
                  label="Owner-Paid Utilities"
                  value={formatCurrency(annualOwnerPaidUtilities)}
                  note="From unit owner-paid selections"
                  info="This comes from the water, gas, and electric boxes in each unit. If water/sewer is owner responsibility, make sure it is modeled or confirmed elsewhere."
                />
              </div>
              <div className="rounded-md bg-white p-3">
                <Metric
                  label="Confirmed Items"
                  value={`${expenseConfirmations.length - missingExpenseConfirmations.length}/${expenseConfirmations.length}`}
                  note={
                    missingCriticalExpenseConfirmations.length > 0
                      ? `${missingCriticalExpenseConfirmations.length} key missing`
                      : "Key checks complete"
                  }
                  info="Checked items mean you have reviewed that expense category. This does not add dollars by itself; it keeps the verdict honest about missing inputs."
                />
              </div>
              <div className="rounded-md bg-white p-3">
                <Metric
                  label="Modeled Opex"
                  value={formatCurrency(projectedOperatingExpenses)}
                  note={`${formatCurrency(annualProjectedRent)} projected rent`}
                  info="This is the operating expense number currently coming from the analyzer. If checklist items are missing, add them in operating expenses or keep them marked unconfirmed."
                />
              </div>
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
            </section>
          </div>
        </AutoSaveForm>
      </div>
    </details>
  );
}
