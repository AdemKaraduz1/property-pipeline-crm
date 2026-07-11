import { asRecord } from "@/lib/rehab";

export type StabilizationUnitSettings = {
  turnoverDate: string | null;
  vacancyWeeks: number;
  relocationCost: number;
};

export type StabilizationPlanSettings = {
  planStartDate: string;
  defaultVacancyWeeks: number;
  units: Record<string, StabilizationUnitSettings>;
};

const DEFAULT_VACANCY_WEEKS = 6;

function toIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;

  const date = new Date(`${value.trim().slice(0, 10)}T00:00:00`);

  return Number.isFinite(date.getTime()) ? value.trim().slice(0, 10) : null;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function parseStabilizationPlanSettings(
  value: unknown,
): StabilizationPlanSettings {
  const record = asRecord(value);
  const planStartDate =
    toIsoDate(record.planStartDate) ?? new Date().toISOString().slice(0, 10);
  const defaultVacancyWeeks = Math.max(
    0,
    toFiniteNumber(record.defaultVacancyWeeks, DEFAULT_VACANCY_WEEKS),
  );
  const rawUnits = asRecord(record.units);
  const units: Record<string, StabilizationUnitSettings> = {};

  for (const [unitId, rawSettings] of Object.entries(rawUnits)) {
    const unitRecord = asRecord(rawSettings);

    units[unitId] = {
      turnoverDate: toIsoDate(unitRecord.turnoverDate),
      vacancyWeeks: Math.max(
        0,
        toFiniteNumber(unitRecord.vacancyWeeks, defaultVacancyWeeks),
      ),
      relocationCost: Math.max(
        0,
        toFiniteNumber(unitRecord.relocationCost, 0),
      ),
    };
  }

  return { planStartDate, defaultVacancyWeeks, units };
}

export type StabilizationUnitInput = {
  id: string;
  label: string;
  currentRent: number;
  projectedRent: number;
  rehabEstimate: number;
  turnoverDate: string;
  vacancyWeeks: number;
  relocationCost: number;
};

export type StabilizationMonthResult = {
  monthIndex: number;
  monthLabel: string;
  collectedRent: number;
  stabilizedRent: number;
  fixedOperatingExpenses: number;
  repairsExpense: number;
  managementExpense: number;
  debtService: number;
  rehabSpend: number;
  relocationSpend: number;
  noi: number;
  cashFlow: number;
  cumulativeCashFlow: number;
  dscr: number | null;
  unitsStabilized: number;
};

export type StabilizationScheduleResult = {
  months: StabilizationMonthResult[];
  totalCashBurn: number;
  monthsToStabilization: number | null;
  stabilizationMonthIndex: number | null;
  worstMonthCashFlow: number;
  worstMonthDscr: number | null;
};

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
});

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function getUnitVacancyEnd(unit: StabilizationUnitInput): Date {
  return addDays(new Date(`${unit.turnoverDate}T00:00:00`), unit.vacancyWeeks * 7);
}

function getUnitMonthlyRateAt(unit: StabilizationUnitInput, day: Date): number {
  const turnover = new Date(`${unit.turnoverDate}T00:00:00`);

  if (day < turnover) return unit.currentRent;
  if (day < getUnitVacancyEnd(unit)) return 0;
  return unit.projectedRent;
}

function getUnitMonthlyRent(
  unit: StabilizationUnitInput,
  monthStart: Date,
  monthEnd: Date,
): number {
  const totalDays = daysBetween(monthStart, monthEnd);

  if (totalDays <= 0) return 0;

  let total = 0;

  for (let dayIndex = 0; dayIndex < totalDays; dayIndex += 1) {
    total += getUnitMonthlyRateAt(unit, addDays(monthStart, dayIndex)) / totalDays;
  }

  return total;
}

export function computeStabilizationSchedule(params: {
  planStartDate: string;
  units: StabilizationUnitInput[];
  annualFixedOperatingExpenses: number;
  repairsMaintenanceRate: number;
  propertyManagementRate: number;
  annualDebtService: number;
  horizonMonthsCap?: number;
}): StabilizationScheduleResult {
  const {
    units,
    annualFixedOperatingExpenses,
    repairsMaintenanceRate,
    propertyManagementRate,
    annualDebtService,
    horizonMonthsCap = 36,
  } = params;

  const planStart = startOfMonth(new Date(`${params.planStartDate}T00:00:00`));
  const monthlyFixedOperatingExpenses = annualFixedOperatingExpenses / 12;
  const monthlyDebtService = annualDebtService / 12;
  const stabilizedRentTotal = units.reduce(
    (sum, unit) => sum + Math.max(0, unit.projectedRent),
    0,
  );

  const lastVacancyEnd = units.reduce((latest, unit) => {
    const vacancyEnd = getUnitVacancyEnd(unit);
    return vacancyEnd > latest ? vacancyEnd : latest;
  }, planStart);

  // "+3" (not "+2"): a unit only counts as stabilized once its vacancy end
  // falls at or before a month's start, so a vacancy ending mid-month can
  // push the stabilization month one later than its raw month offset. The
  // extra month keeps at least one visible month of recovery after that.
  const monthsNeeded = Math.max(
    1,
    Math.min(
      horizonMonthsCap,
      (lastVacancyEnd.getFullYear() - planStart.getFullYear()) * 12 +
        (lastVacancyEnd.getMonth() - planStart.getMonth()) +
        3,
    ),
  );

  const months: StabilizationMonthResult[] = [];
  let cumulativeCashFlow = 0;
  let stabilizationMonthIndex: number | null = null;

  for (let monthIndex = 0; monthIndex < monthsNeeded; monthIndex += 1) {
    const monthStart = addMonths(planStart, monthIndex);
    const monthEnd = addMonths(planStart, monthIndex + 1);

    const collectedRent = units.reduce(
      (sum, unit) => sum + getUnitMonthlyRent(unit, monthStart, monthEnd),
      0,
    );
    const unitsStabilized = units.filter(
      (unit) => getUnitVacancyEnd(unit) <= monthStart,
    ).length;
    const rehabSpend = units.reduce((sum, unit) => {
      const turnover = new Date(`${unit.turnoverDate}T00:00:00`);
      return turnover >= monthStart && turnover < monthEnd
        ? sum + Math.max(0, unit.rehabEstimate)
        : sum;
    }, 0);
    const relocationSpend = units.reduce((sum, unit) => {
      const turnover = new Date(`${unit.turnoverDate}T00:00:00`);
      return turnover >= monthStart && turnover < monthEnd
        ? sum + Math.max(0, unit.relocationCost)
        : sum;
    }, 0);

    const repairsExpense = collectedRent * (repairsMaintenanceRate / 100);
    const managementExpense = collectedRent * (propertyManagementRate / 100);
    const noi =
      collectedRent -
      monthlyFixedOperatingExpenses -
      repairsExpense -
      managementExpense;
    const cashFlow = noi - monthlyDebtService - rehabSpend - relocationSpend;

    cumulativeCashFlow += cashFlow;

    if (stabilizationMonthIndex === null && unitsStabilized === units.length) {
      stabilizationMonthIndex = monthIndex;
    }

    months.push({
      monthIndex,
      monthLabel: MONTH_LABEL_FORMATTER.format(monthStart),
      collectedRent,
      stabilizedRent: stabilizedRentTotal,
      fixedOperatingExpenses: monthlyFixedOperatingExpenses,
      repairsExpense,
      managementExpense,
      debtService: monthlyDebtService,
      rehabSpend,
      relocationSpend,
      noi,
      cashFlow,
      cumulativeCashFlow,
      dscr: monthlyDebtService > 0 ? noi / monthlyDebtService : null,
      unitsStabilized,
    });
  }

  const lowestCumulative = Math.min(0, ...months.map((m) => m.cumulativeCashFlow));
  const finiteDscrValues = months
    .map((m) => m.dscr)
    .filter((value): value is number => value !== null);

  return {
    months,
    totalCashBurn: -lowestCumulative,
    monthsToStabilization: stabilizationMonthIndex,
    stabilizationMonthIndex,
    worstMonthCashFlow:
      months.length > 0 ? Math.min(...months.map((m) => m.cashFlow)) : 0,
    worstMonthDscr:
      finiteDscrValues.length > 0 ? Math.min(...finiteDscrValues) : null,
  };
}
