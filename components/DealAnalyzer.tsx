"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEAL_ANALYZER_PROJECTION_EVENT,
  PROPERTY_RENT_ROLL_EVENT,
  getMonthlyMortgagePayment,
  parseDealAnalyzerSettings,
} from "@/lib/deal-analyzer";
import type {
  DealAnalyzerProjection,
  DealAnalyzerSettings,
  PropertyRentRollUpdate,
  PurchaseMethod,
} from "@/lib/deal-analyzer";

type DealAnalyzerProps = {
  propertyId: string;
  askingPrice: number | null;
  taxesAnnual: number | null;
  insuranceAnnual: number | null;
  operatingExpensesAnnual: number | null;
  projectedMonthlyRent: number;
  totalRehab: number;
  ownerPaidUtilitiesAnnual: number;
  additionalIncomeAnnual: number;
  initialSettings: DealAnalyzerSettings | null;
};

type MarketRateOption = {
  estimatedInvestmentRate: number;
  observedAt: string | null;
};

type MarketRates = {
  fallback?: boolean;
  lowLtv: MarketRateOption;
  highLtv: MarketRateOption;
  investmentPropertyPremium: number;
  source: string;
};

const dealAnalyzerStorageKey = "property-pipeline:deal-analyzer:last-used";

function getPropertyDealAnalyzerStorageKey(propertyId: string) {
  return `property-pipeline:deal-analyzer:${propertyId}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatPercent(value: number) {
  return `${(Number.isFinite(value) ? value * 100 : 0).toFixed(1)}%`;
}

function formatRatio(value: number) {
  return Number.isFinite(value) ? `${value.toFixed(2)}x` : "—";
}

function getCashOnCashStatus(
  cashOnCashReturn: number,
  cashRequired: number,
): MetricStatus | undefined {
  if (cashRequired <= 0 || !Number.isFinite(cashOnCashReturn)) return undefined;
  if (cashOnCashReturn >= 0.08) return "good";
  if (cashOnCashReturn >= 0.05) return "caution";
  return "bad";
}

function getDscrStatus(
  dscr: number,
  isFinanced: boolean,
): MetricStatus | undefined {
  if (!isFinanced || !Number.isFinite(dscr)) return undefined;
  if (dscr >= 1.25) return "good";
  if (dscr >= 1.0) return "caution";
  return "bad";
}

function getCapRateLeverageStatus(
  capRate: number,
  interestRatePercent: number,
  isFinanced: boolean,
): MetricStatus | undefined {
  if (!isFinanced || !Number.isFinite(capRate)) return undefined;
  const spread = capRate - interestRatePercent / 100;
  if (spread >= 0.005) return "good";
  if (spread >= -0.005) return "caution";
  return "bad";
}

function getFirstYearInterest(
  principal: number,
  annualRatePercent: number,
  monthlyPayment: number,
) {
  const monthlyRate = annualRatePercent / 100 / 12;
  let balance = principal;
  let interestTotal = 0;

  for (let month = 0; month < 12 && balance > 0; month += 1) {
    const interest = balance * monthlyRate;
    const principalPayment = Math.min(
      balance,
      Math.max(0, monthlyPayment - interest),
    );

    interestTotal += interest;
    balance -= principalPayment;
  }

  return interestTotal;
}

type MetricStatus = "good" | "caution" | "bad";

const metricStatusCardClass: Record<MetricStatus, string> = {
  good: "border-green-300 bg-green-50",
  caution: "border-amber-300 bg-amber-50",
  bad: "border-red-300 bg-red-50",
};

const metricStatusBadgeClass: Record<MetricStatus, string> = {
  good: "bg-green-100 text-green-800",
  caution: "bg-amber-100 text-amber-800",
  bad: "bg-red-100 text-red-800",
};

const metricStatusLabel: Record<MetricStatus, string> = {
  good: "On target",
  caution: "Borderline",
  bad: "Below target",
};

function Metric({
  label,
  value,
  note,
  emphasis = false,
  status,
}: {
  label: string;
  value: string;
  note?: string;
  emphasis?: boolean;
  status?: MetricStatus;
}) {
  return (
    <div
      className={
        emphasis
          ? "min-w-0 rounded-md border border-slate-800 bg-slate-900 p-2.5 text-white sm:rounded-lg sm:p-4"
          : status
            ? `min-w-0 rounded-md border p-2.5 sm:rounded-lg sm:p-4 ${metricStatusCardClass[status]}`
            : "min-w-0 rounded-md border border-slate-200 bg-slate-50 p-2.5 sm:rounded-lg sm:p-4"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={
            emphasis
              ? "break-words text-[11px] leading-tight text-slate-300 sm:text-sm"
              : "break-words text-[11px] leading-tight text-slate-500 sm:text-sm"
          }
        >
          {label}
        </p>
        {status && (
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide sm:text-[10px] ${metricStatusBadgeClass[status]}`}
          >
            {metricStatusLabel[status]}
          </span>
        )}
      </div>
      <p
        className={
          emphasis
            ? "mt-1 break-words text-lg font-bold sm:text-2xl"
            : "mt-1 break-words text-lg font-bold text-slate-950 sm:text-2xl"
        }
      >
        {value}
      </p>
      {note && (
        <p
          className={
            emphasis
              ? "mt-1 break-words text-[10px] leading-tight text-slate-300 sm:text-xs"
              : "mt-1 break-words text-[10px] leading-tight text-slate-500 sm:text-xs"
          }
        >
          {note}
        </p>
      )}
    </div>
  );
}

const mobileAnalysisRailClass =
  "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] sm:block sm:space-y-8 sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden";

const mobileAnalysisPanelClass =
  "w-full min-w-full max-w-full shrink-0 snap-start overflow-hidden rounded-lg border border-slate-200 bg-white p-3 text-sm sm:min-w-0 sm:max-w-none sm:border-0 sm:bg-transparent sm:p-0 [&_[data-slot=label]]:text-[10px] [&_[data-slot=label]]:leading-tight [&_[data-slot=label]]:tracking-normal sm:[&_[data-slot=label]]:text-xs sm:[&_[data-slot=label]]:tracking-wide";

const analysisGridClass =
  "grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4";

const analysisMetricGridClass =
  "grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4";

const analysisInputClass =
  "h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-base shadow-sm sm:text-sm sm:border-transparent sm:border-b-input sm:bg-transparent sm:px-0 sm:shadow-none";

const analysisSelectClass =
  "mt-1 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 shadow-sm sm:text-sm sm:shadow-none";

const analysisHintClass =
  "mt-1.5 text-xs leading-4 text-slate-500 sm:leading-normal";

export function DealAnalyzer({
  propertyId,
  askingPrice,
  taxesAnnual,
  insuranceAnnual,
  operatingExpensesAnnual,
  projectedMonthlyRent,
  totalRehab,
  ownerPaidUtilitiesAnnual,
  additionalIncomeAnnual,
  initialSettings,
}: DealAnalyzerProps) {
  const [purchaseMethod, setPurchaseMethod] =
    useState<PurchaseMethod>(initialSettings?.purchaseMethod ?? "financed");
  const [purchasePrice, setPurchasePrice] = useState(
    initialSettings?.purchasePrice ?? askingPrice ?? 0,
  );
  const [downPaymentRate, setDownPaymentRate] = useState(
    initialSettings?.downPaymentRate ?? 20,
  );
  const [customInterestRate, setCustomInterestRate] = useState<number | null>(
    initialSettings?.customInterestRate ?? null,
  );
  const [marketRates, setMarketRates] = useState<MarketRates | null>(null);
  const [rateStatus, setRateStatus] = useState<"loading" | "current" | "fallback">(
    "loading",
  );
  const [loanTermYears, setLoanTermYears] = useState(
    initialSettings?.loanTermYears ?? 30,
  );
  const [acquisitionCostsRate, setAcquisitionCostsRate] = useState(
    initialSettings?.acquisitionCostsRate ?? 3,
  );
  const [vacancyRate, setVacancyRate] = useState(
    initialSettings?.vacancyRate ?? 7,
  );
  const [managementRate, setManagementRate] = useState(
    initialSettings?.managementRate ?? 8,
  );
  const [repairsRate, setRepairsRate] = useState(
    initialSettings?.repairsRate ?? 5,
  );
  const [capexRate, setCapexRate] = useState(
    initialSettings?.capexRate ?? 5,
  );
  const customOperatingExpensesAnnual = operatingExpensesAnnual;
  const [customUtilitiesAnnual, setCustomUtilitiesAnnual] = useState<
    number | null
  >(initialSettings?.customUtilitiesAnnual ?? null);
  const [otherExpensesAnnual, setOtherExpensesAnnual] = useState(
    initialSettings?.otherExpensesAnnual ?? 0,
  );
  const [targetCapRate, setTargetCapRate] = useState(
    initialSettings?.targetCapRate ?? 8,
  );
  const [liveProjectedMonthlyRent, setLiveProjectedMonthlyRent] = useState<
    number | null
  >(null);
  const activeProjectedMonthlyRent =
    liveProjectedMonthlyRent ?? projectedMonthlyRent;
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [hasRestoredSettings, setHasRestoredSettings] = useState(false);

  const settings = useMemo<DealAnalyzerSettings>(
    () => ({
      purchaseMethod,
      purchasePrice,
      downPaymentRate,
      customInterestRate,
      loanTermYears,
      acquisitionCostsRate,
      vacancyRate,
      managementRate,
      repairsRate,
      capexRate,
      customOperatingExpensesAnnual,
      customUtilitiesAnnual,
      otherExpensesAnnual,
      targetCapRate,
    }),
    [
      acquisitionCostsRate,
      capexRate,
      customInterestRate,
      customOperatingExpensesAnnual,
      customUtilitiesAnnual,
      downPaymentRate,
      loanTermYears,
      managementRate,
      otherExpensesAnnual,
      purchaseMethod,
      purchasePrice,
      repairsRate,
      targetCapRate,
      vacancyRate,
    ],
  );
  const lastSavedSettings = useRef(JSON.stringify(settings));
  const latestSettings = useRef(settings);

  useEffect(() => {
    latestSettings.current = settings;
  }, [settings]);

  useEffect(() => {
    function handleRentRollUpdate(event: Event) {
      const detail = (event as CustomEvent<PropertyRentRollUpdate>).detail;

      if (detail?.propertyId === propertyId) {
        setLiveProjectedMonthlyRent(detail.projectedMonthlyRent);
      }
    }

    window.addEventListener(PROPERTY_RENT_ROLL_EVENT, handleRentRollUpdate);

    return () => {
      window.removeEventListener(PROPERTY_RENT_ROLL_EVENT, handleRentRollUpdate);
    };
  }, [propertyId]);

  const persistSettings = useCallback(
    async (
      settingsToSave: DealAnalyzerSettings,
      signal?: AbortSignal,
    ) => {
      const serializedSettings = JSON.stringify(settingsToSave);

      setSaveStatus("saving");

      try {
        window.localStorage.setItem(
          getPropertyDealAnalyzerStorageKey(propertyId),
          serializedSettings,
        );
        window.localStorage.setItem(
          dealAnalyzerStorageKey,
          serializedSettings,
        );
      } catch {
        // The database remains the durable fallback when storage is blocked.
      }

      try {
        const response = await fetch(
          `/api/properties/${propertyId}/deal-analyzer`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ settings: settingsToSave }),
            signal,
            keepalive: true,
          },
        );
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "Could not save deal analysis.");
        }

        lastSavedSettings.current = serializedSettings;
        setSaveStatus("saved");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error(error);
        setSaveStatus("error");
      }
    },
    [propertyId],
  );

  useEffect(() => {
    function readStoredSettings(key: string) {
      try {
        const value = window.localStorage.getItem(key);
        return value ? JSON.parse(value) : null;
      } catch {
        return null;
      }
    }

    const rawPropertySettings = readStoredSettings(
      getPropertyDealAnalyzerStorageKey(propertyId),
    );
    const propertySettings = parseDealAnalyzerSettings(rawPropertySettings);
    const lastUsedSettings = parseDealAnalyzerSettings(
      readStoredSettings(dealAnalyzerStorageKey),
    );
    const storedSettings =
      propertySettings ?? (initialSettings ? null : lastUsedSettings);

    const timeoutId = window.setTimeout(() => {
      if (storedSettings) {
        setPurchaseMethod(storedSettings.purchaseMethod);
        setDownPaymentRate(storedSettings.downPaymentRate);
        setCustomInterestRate(storedSettings.customInterestRate);
        setLoanTermYears(storedSettings.loanTermYears);
        setAcquisitionCostsRate(storedSettings.acquisitionCostsRate);
        setVacancyRate(storedSettings.vacancyRate);
        setManagementRate(storedSettings.managementRate);
        setRepairsRate(storedSettings.repairsRate);
        setCapexRate(storedSettings.capexRate);
        setTargetCapRate(storedSettings.targetCapRate);

        if (propertySettings) {
          setPurchasePrice(storedSettings.purchasePrice);
          setCustomUtilitiesAnnual(storedSettings.customUtilitiesAnnual);
          setOtherExpensesAnnual(storedSettings.otherExpensesAnnual);
        }
      }

      setHasRestoredSettings(true);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [initialSettings, operatingExpensesAnnual, propertyId]);

  useEffect(() => {
    if (!hasRestoredSettings) return;

    try {
      const serializedSettings = JSON.stringify(settings);
      window.localStorage.setItem(
        getPropertyDealAnalyzerStorageKey(propertyId),
        serializedSettings,
      );
      window.localStorage.setItem(dealAnalyzerStorageKey, serializedSettings);
    } catch {
      // Database autosave remains the durable fallback when storage is blocked.
    }
  }, [hasRestoredSettings, propertyId, settings]);

  useEffect(() => {
    if (!hasRestoredSettings) return;

    const serializedSettings = JSON.stringify(settings);
    if (serializedSettings === lastSavedSettings.current) return;

    setSaveStatus("saving");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void persistSettings(settings, controller.signal);
    }, 700);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [hasRestoredSettings, persistSettings, settings]);

  useEffect(() => {
    function flushPendingSave() {
      const pendingSettings = latestSettings.current;
      const serializedSettings = JSON.stringify(pendingSettings);

      if (serializedSettings === lastSavedSettings.current) return;

      lastSavedSettings.current = serializedSettings;
      void fetch(`/api/properties/${propertyId}/deal-analyzer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: pendingSettings }),
        keepalive: true,
      }).catch(() => {
        lastSavedSettings.current = "";
      });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") flushPendingSave();
    }

    window.addEventListener("pagehide", flushPendingSave);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", flushPendingSave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flushPendingSave();
    };
  }, [propertyId]);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);

    async function loadMarketRate() {
      try {
        const response = await fetch("/api/mortgage-rate", {
          signal: controller.signal,
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "Could not load market rate.");
        }

        if (isActive) {
          setMarketRates(result);
          setRateStatus(result.fallback ? "fallback" : "current");
        }
      } catch (error) {
        console.error(error);

        if (isActive) {
          setRateStatus("fallback");
        }
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    void loadMarketRate();

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  const selectedMarketRate = marketRates
    ? downPaymentRate >= 20
      ? marketRates.lowLtv
      : marketRates.highLtv
    : null;
  const interestRate =
    customInterestRate ??
    Number(selectedMarketRate?.estimatedInvestmentRate.toFixed(3) || 7.25);
  const hasCustomizedInterestRate = customInterestRate !== null;
  const utilitiesAnnual =
    customUtilitiesAnnual ?? ownerPaidUtilitiesAnnual;

  const results = useMemo(() => {
    const price = Math.max(0, purchasePrice);
    const annualGrossRent = activeProjectedMonthlyRent * 12;
    const vacancyLoss = annualGrossRent * (vacancyRate / 100);
    const effectiveGrossIncome = annualGrossRent - vacancyLoss;
    const managementExpense = effectiveGrossIncome * (managementRate / 100);
    const repairsExpense = annualGrossRent * (repairsRate / 100);
    const capexExpense = annualGrossRent * (capexRate / 100);
    const fixedExpenses =
      Number(taxesAnnual || 0) +
      Number(insuranceAnnual || 0) +
      Math.max(0, utilitiesAnnual) +
      Math.max(0, otherExpensesAnnual);
    const itemizedOperatingExpenses =
      managementExpense + repairsExpense + fixedExpenses;
    const operatingExpenses =
      customOperatingExpensesAnnual === null
        ? itemizedOperatingExpenses
        : Math.max(0, customOperatingExpensesAnnual);
    const noiAnnual =
      effectiveGrossIncome + additionalIncomeAnnual - operatingExpenses;
    const netCashFlowBeforeDebt = noiAnnual - capexExpense;

    const isFinanced = purchaseMethod === "financed";
    const downPayment = isFinanced ? price * (downPaymentRate / 100) : price;
    const loanAmount = isFinanced ? Math.max(0, price - downPayment) : 0;
    const acquisitionCosts = price * (acquisitionCostsRate / 100);
    const monthlyPrincipalAndInterest = isFinanced
      ? getMonthlyMortgagePayment(loanAmount, interestRate, loanTermYears)
      : 0;
    const annualDebtService = monthlyPrincipalAndInterest * 12;
    const firstYearInterest = isFinanced
      ? getFirstYearInterest(
          loanAmount,
          interestRate,
          monthlyPrincipalAndInterest,
        )
      : 0;
    const totalInterest =
      isFinanced && loanTermYears > 0
        ? monthlyPrincipalAndInterest * loanTermYears * 12 - loanAmount
        : 0;
    const cashRequired =
      downPayment +
      Math.max(0, totalRehab) +
      acquisitionCosts;
    const annualCashFlow = netCashFlowBeforeDebt - annualDebtService;
    const monthlyCashFlow = annualCashFlow / 12;
    const cashOnCashReturn =
      cashRequired > 0 ? annualCashFlow / cashRequired : 0;
    const capRate = price > 0 ? noiAnnual / price : 0;
    const dscr =
      annualDebtService > 0 ? noiAnnual / annualDebtService : Infinity;
    const valueByCapRate =
      targetCapRate > 0 ? noiAnnual / (targetCapRate / 100) : 0;
    const maxPurchasePrice =
      (valueByCapRate - Math.max(0, totalRehab)) /
      (1 + acquisitionCostsRate / 100);
    return {
      annualGrossRent,
      effectiveGrossIncome,
      vacancyLoss,
      operatingExpenses,
      capexExpense,
      additionalIncomeAnnual,
      noiAnnual,
      downPayment,
      loanAmount,
      acquisitionCosts,
      monthlyPrincipalAndInterest,
      annualDebtService,
      firstYearInterest,
      totalInterest,
      cashRequired,
      annualCashFlow,
      monthlyCashFlow,
      cashOnCashReturn,
      capRate,
      dscr,
      valueByCapRate,
      maxPurchasePrice,
    };
  }, [
    purchasePrice,
    activeProjectedMonthlyRent,
    vacancyRate,
    managementRate,
    repairsRate,
    capexRate,
    customOperatingExpensesAnnual,
    taxesAnnual,
    insuranceAnnual,
    utilitiesAnnual,
    otherExpensesAnnual,
    additionalIncomeAnnual,
    purchaseMethod,
    downPaymentRate,
    acquisitionCostsRate,
    interestRate,
    loanTermYears,
    totalRehab,
    targetCapRate,
  ]);

  const isFinanced = purchaseMethod === "financed";

  useEffect(() => {
    const projection: DealAnalyzerProjection = {
      propertyId,
      purchasePrice,
      annualGrossRent: results.annualGrossRent,
      operatingExpenses: results.operatingExpenses,
      noiAnnual: results.noiAnnual,
      capRate: results.capRate,
      annualDebtService: results.annualDebtService,
      cashFlowAfterDebt: results.noiAnnual - results.annualDebtService,
      annualCapexReserve: results.capexExpense,
      cashFlowAfterCapex: results.annualCashFlow,
      isFinanced,
      interestRate,
      loanAmount: results.loanAmount,
      loanTermYears,
      vacancyRate,
    };

    window.dispatchEvent(
      new CustomEvent(DEAL_ANALYZER_PROJECTION_EVENT, {
        detail: projection,
      }),
    );
  }, [
    interestRate,
    isFinanced,
    loanTermYears,
    propertyId,
    purchasePrice,
    results,
    vacancyRate,
  ]);

  return (
    <details
      open
      className="group mb-6 scroll-mt-24 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-8"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-sans text-base font-semibold normal-case tracking-normal text-slate-950 sm:text-lg">
            Deal Analyzer
          </h3>
          <p
            className={`text-xs ${
              saveStatus === "error" ? "text-red-600" : "text-slate-500"
            }`}
            role="status"
            aria-live="polite"
          >
            {!hasRestoredSettings && "Loading..."}
            {hasRestoredSettings && saveStatus === "idle" && "Autosave on"}
            {saveStatus === "saving" && "Saving..."}
            {saveStatus === "saved" && "Saved"}
            {saveStatus === "error" && "Could not save"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <p className="max-w-xl text-xs leading-5 text-slate-500 sm:text-sm">
            Compare cash and financed acquisitions using editable operating and
            loan assumptions.
          </p>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-base leading-none text-slate-500 transition group-open:rotate-45">
            +
          </span>
        </div>
      </summary>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <div className={mobileAnalysisRailClass}>
          <section className={mobileAnalysisPanelClass}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600 sm:mb-4 sm:text-sm">
              Purchase & Financing
            </h3>
            <div className={analysisGridClass}>
              <div>
                <Label htmlFor="purchase-method">Purchase Method</Label>
                <select
                  id="purchase-method"
                  value={purchaseMethod}
                  onChange={(event) =>
                    setPurchaseMethod(event.target.value as PurchaseMethod)
                  }
                  className={analysisSelectClass}
                >
                  <option value="financed">Mortgage</option>
                  <option value="cash">Cash Purchase</option>
                </select>
              </div>

              <div>
                <Label htmlFor="analysis-price">Purchase Price</Label>
                <Input
                  id="analysis-price"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={purchasePrice || ""}
                  className={analysisInputClass}
                  onChange={(event) =>
                    setPurchasePrice(Number(event.target.value) || 0)
                  }
                />
              </div>

              {isFinanced && (
                <>
                  <div>
                    <Label htmlFor="down-payment">Down Payment %</Label>
                    <Input
                      id="down-payment"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      list="down-payment-options"
                      value={downPaymentRate}
                      className={analysisInputClass}
                      onChange={(event) =>
                        setDownPaymentRate(Number(event.target.value))
                      }
                    />
                    <datalist id="down-payment-options">
                      <option value="15" />
                      <option value="20" />
                      <option value="25" />
                      <option value="30" />
                    </datalist>
                  </div>

                  <div>
                    <Label htmlFor="interest-rate">Interest Rate %</Label>
                    <Input
                      id="interest-rate"
                      type="number"
                      min="0"
                      step="0.125"
                      value={interestRate}
                      className={analysisInputClass}
                      onChange={(event) => {
                        setCustomInterestRate(Number(event.target.value));
                      }}
                    />
                    <p className={analysisHintClass}>
                      {rateStatus === "loading" &&
                        "Loading today’s market estimate..."}
                      {rateStatus === "current" &&
                        selectedMarketRate &&
                        `Daily market estimate as of ${selectedMarketRate.observedAt}; cached for 24 hours.`}
                      {rateStatus === "fallback" &&
                        "The live feed timed out. Using a fallback estimate; edit as needed."}
                    </p>
                    {hasCustomizedInterestRate && marketRates && (
                      <button
                        type="button"
                        onClick={() => setCustomInterestRate(null)}
                        className="mt-1.5 block text-left text-xs font-medium leading-4 text-blue-700 hover:text-blue-900"
                      >
                        Use daily market estimate
                      </button>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="loan-term">Loan Term (Years)</Label>
                    <Input
                      id="loan-term"
                      type="number"
                      min="1"
                      value={loanTermYears}
                      className={analysisInputClass}
                      onChange={(event) =>
                        setLoanTermYears(Number(event.target.value))
                      }
                    />
                  </div>
                </>
              )}

              <div>
                <Label htmlFor="acquisition-costs">Acquisition Costs %</Label>
                <Input
                  id="acquisition-costs"
                  type="number"
                  min="0"
                  step="0.25"
                  value={acquisitionCostsRate}
                  className={analysisInputClass}
                  onChange={(event) =>
                    setAcquisitionCostsRate(Number(event.target.value))
                  }
                />
                <p className={analysisHintClass}>
                  Lender and closing costs combined.
                </p>
              </div>
            </div>
          </section>

          <section className={mobileAnalysisPanelClass}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600 sm:mb-4 sm:text-sm">
              Analysis Assumptions
            </h3>
            <div className={analysisGridClass}>
              <div>
                <Label htmlFor="operating-expenses">
                  Operating Expenses / Year
                </Label>
                <Input
                  id="operating-expenses"
                  type="number"
                  min="0"
                  value={customOperatingExpensesAnnual ?? ""}
                  readOnly
                  className={`${analysisInputClass} cursor-not-allowed bg-slate-100 text-slate-600`}
                />
                <p className={analysisHintClass}>
                  Calculated from the Operating Expenses section above. CapEx
                  remains separate.
                </p>
              </div>
              <div>
                <Label htmlFor="vacancy-rate">Vacancy %</Label>
                <Input
                  id="vacancy-rate"
                  type="number"
                  value={vacancyRate}
                  className={analysisInputClass}
                  onChange={(event) =>
                    setVacancyRate(Number(event.target.value))
                  }
                />
              </div>
              <div>
                <Label htmlFor="capex-rate">CapEx Reserve %</Label>
                <Input
                  id="capex-rate"
                  type="number"
                  value={capexRate}
                  className={analysisInputClass}
                  onChange={(event) =>
                    setCapexRate(Number(event.target.value))
                  }
                />
              </div>
              <div>
                <Label htmlFor="target-cap-rate">Target Cap Rate %</Label>
                <Input
                  id="target-cap-rate"
                  type="number"
                  min="0"
                  step="0.25"
                  value={targetCapRate}
                  className={analysisInputClass}
                  onChange={(event) =>
                    setTargetCapRate(Number(event.target.value))
                  }
                />
              </div>
            </div>
          </section>

          <section className={mobileAnalysisPanelClass}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 sm:text-sm">
                Returns & Risk
              </h3>
              <p className="text-[10px] leading-tight text-slate-400 sm:text-xs">
                Targets: 8%+ cash-on-cash, 1.25x+ DSCR, cap rate above your
                interest rate. Typical investor guardrails, not guarantees.
              </p>
            </div>
            <div className={analysisMetricGridClass}>
              <Metric
                label="Monthly Cash Flow"
                value={formatCurrency(results.monthlyCashFlow)}
                note="After operating expenses, CapEx, and debt service"
                emphasis
              />
              <Metric
                label="Cash-on-Cash Return"
                value={formatPercent(results.cashOnCashReturn)}
                note={`${formatCurrency(results.cashRequired)} total cash required`}
                emphasis
                status={getCashOnCashStatus(
                  results.cashOnCashReturn,
                  results.cashRequired,
                )}
              />
              <Metric
                label="NOI"
                value={formatCurrency(results.noiAnnual)}
                note="Effective gross income minus operating expenses"
              />
              <Metric
                label="Cap Rate"
                value={formatPercent(results.capRate)}
                note={
                  isFinanced
                    ? `vs ${interestRate.toFixed(2)}% interest rate`
                    : "at purchase price"
                }
                status={getCapRateLeverageStatus(
                  results.capRate,
                  interestRate,
                  isFinanced,
                )}
              />
              <Metric
                label="DSCR"
                value={isFinanced ? formatRatio(results.dscr) : "N/A"}
                note="NOI ÷ annual debt service"
                status={getDscrStatus(results.dscr, isFinanced)}
              />
            </div>
          </section>

          {isFinanced && (
            <section className={mobileAnalysisPanelClass}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600 sm:mb-4 sm:text-sm">
                Mortgage Details
              </h3>
              <div className={analysisMetricGridClass}>
                <Metric
                  label="Down Payment"
                  value={formatCurrency(results.downPayment)}
                  note={`${downPaymentRate}% down`}
                />
                <Metric
                  label="Loan Amount"
                  value={formatCurrency(results.loanAmount)}
                  note={`${formatPercent(results.loanAmount / Math.max(1, purchasePrice))} LTV`}
                />
                <Metric
                  label="Monthly Principal & Interest"
                  value={formatCurrency(results.monthlyPrincipalAndInterest)}
                  note={`${interestRate}% fixed over ${loanTermYears} years`}
                />
                <Metric
                  label="Annual Debt Service"
                  value={formatCurrency(results.annualDebtService)}
                />
                <Metric
                  label="First-Year Interest"
                  value={formatCurrency(results.firstYearInterest)}
                  note="Estimated from the amortization schedule"
                />
                <Metric
                  label="Total Interest"
                  value={formatCurrency(results.totalInterest)}
                  note="If held for the full loan term"
                />
                <Metric
                  label="Estimated Acquisition Costs"
                  value={formatCurrency(results.acquisitionCosts)}
                  note={`${acquisitionCostsRate}% of purchase price`}
                />
                <Metric
                  label="Annual Cash Flow"
                  value={formatCurrency(results.annualCashFlow)}
                  note={`NOI minus ${formatCurrency(results.capexExpense)} CapEx reserve and annual debt service`}
                />
              </div>
            </section>
          )}

          <section className={mobileAnalysisPanelClass}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600 sm:mb-4 sm:text-sm">
              Income & Offer View
            </h3>
            <div className={analysisMetricGridClass}>
              <Metric
                label="Projected Monthly Rent"
                value={formatCurrency(activeProjectedMonthlyRent)}
              />
              <Metric
                label="Annual Gross Rent"
                value={formatCurrency(results.annualGrossRent)}
              />
              <Metric
                label="Effective Gross Income"
                value={formatCurrency(results.effectiveGrossIncome)}
                note={`${formatCurrency(results.vacancyLoss)} vacancy allowance`}
              />
              <Metric
                label="Additional Income"
                value={formatCurrency(results.additionalIncomeAnnual)}
                note="Laundry, parking, and other non-rent income"
              />
              <Metric
                label="Value by Target Cap Rate"
                value={formatCurrency(results.valueByCapRate)}
                note={`${targetCapRate}% target cap rate`}
              />
              <Metric
                label="Max Purchase Price"
                value={formatCurrency(results.maxPurchasePrice)}
                note="Cap-rate value less rehab and acquisition costs"
              />
            </div>
          </section>

          <section className={mobileAnalysisPanelClass}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600 sm:mb-4 sm:text-sm">
              Notes
            </h3>
            <p className="text-[11px] leading-relaxed text-slate-500 sm:text-xs">
              Planning estimates only. Mortgage pricing, taxes, insurance,
              reserves, and lender underwriting vary by borrower and property.
            </p>
          </section>
        </div>
      </div>
    </details>
  );
}
