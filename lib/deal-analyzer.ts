import { asRecord } from "@/lib/rehab";

export type PurchaseMethod = "financed" | "cash";

export const DEAL_ANALYZER_PROJECTION_EVENT =
  "property-pipeline:deal-analyzer-projection";
export const PROPERTY_RENT_ROLL_EVENT =
  "property-pipeline:property-rent-roll";

export type DealAnalyzerProjection = {
  propertyId: string;
  purchasePrice: number;
  annualGrossRent: number;
  operatingExpenses: number;
  noiAnnual: number;
  capRate: number;
  annualDebtService: number;
  cashFlowAfterDebt: number;
  annualCapexReserve: number;
  cashFlowAfterCapex: number;
  isFinanced: boolean;
  interestRate: number;
  loanAmount: number;
  loanTermYears: number;
  vacancyRate: number;
};

export type PropertyRentRollUpdate = {
  propertyId: string;
  currentMonthlyRent: number;
  projectedMonthlyRent: number;
  annualCurrentRent: number;
  annualProjectedRent: number;
};

export type DealAnalyzerSettings = {
  purchaseMethod: PurchaseMethod;
  purchasePrice: number;
  downPaymentRate: number;
  customInterestRate: number | null;
  loanTermYears: number;
  acquisitionCostsRate: number;
  vacancyRate: number;
  managementRate: number;
  repairsRate: number;
  capexRate: number;
  customOperatingExpensesAnnual: number | null;
  customUtilitiesAnnual: number | null;
  otherExpensesAnnual: number;
  targetCapRate: number;
};

export function getMonthlyMortgagePayment(
  principal: number,
  annualRatePercent: number,
  termYears: number,
) {
  if (principal <= 0 || termYears <= 0) return 0;

  const paymentCount = termYears * 12;
  const monthlyRate = annualRatePercent / 100 / 12;

  if (monthlyRate === 0) return principal / paymentCount;

  return (
    (principal *
      monthlyRate *
      Math.pow(1 + monthlyRate, paymentCount)) /
    (Math.pow(1 + monthlyRate, paymentCount) - 1)
  );
}

export function getLoanPrincipalFromAnnualDebtService(
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

const NUMBER_KEYS = [
  "purchasePrice",
  "downPaymentRate",
  "loanTermYears",
  "acquisitionCostsRate",
  "vacancyRate",
  "managementRate",
  "repairsRate",
  "capexRate",
  "otherExpensesAnnual",
  "targetCapRate",
] as const;

const NULLABLE_NUMBER_KEYS = [
  "customInterestRate",
  "customOperatingExpensesAnnual",
  "customUtilitiesAnnual",
] as const;

export function parseDealAnalyzerSettings(
  value: unknown,
): DealAnalyzerSettings | null {
  const settings = asRecord(value);
  const purchaseMethod = settings.purchaseMethod;

  if (purchaseMethod !== "financed" && purchaseMethod !== "cash") {
    return null;
  }

  for (const key of NUMBER_KEYS) {
    if (
      typeof settings[key] !== "number" ||
      !Number.isFinite(settings[key])
    ) {
      return null;
    }
  }

  for (const key of NULLABLE_NUMBER_KEYS) {
    if (key === "customOperatingExpensesAnnual" && settings[key] === undefined) {
      settings[key] = null;
    }

    if (
      settings[key] !== null &&
      (typeof settings[key] !== "number" ||
        !Number.isFinite(settings[key]))
    ) {
      return null;
    }
  }

  return settings as DealAnalyzerSettings;
}
