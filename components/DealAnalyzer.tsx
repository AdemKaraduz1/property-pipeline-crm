"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  DealAnalyzerSettings,
  PurchaseMethod,
} from "@/lib/deal-analyzer";

type DealAnalyzerProps = {
  propertyId: string;
  askingPrice: number | null;
  taxesAnnual: number | null;
  insuranceAnnual: number | null;
  projectedMonthlyRent: number;
  totalRehab: number;
  ownerPaidUtilitiesAnnual: number;
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

function getMonthlyPayment(
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

function Metric({
  label,
  value,
  note,
  emphasis = false,
}: {
  label: string;
  value: string;
  note?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? "min-w-0 rounded-md border border-slate-800 bg-slate-900 p-2.5 text-white sm:rounded-lg sm:p-4"
          : "min-w-0 rounded-md border border-slate-200 bg-slate-50 p-2.5 sm:rounded-lg sm:p-4"
      }
    >
      <p
        className={
          emphasis
            ? "break-words text-[11px] leading-tight text-slate-300 sm:text-sm"
            : "break-words text-[11px] leading-tight text-slate-500 sm:text-sm"
        }
      >
        {label}
      </p>
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
  "flex snap-x snap-mandatory items-start gap-3 overflow-x-auto pb-2 sm:block sm:space-y-8 sm:overflow-visible sm:pb-0";

const mobileAnalysisPanelClass =
  "w-full min-w-full max-w-full shrink-0 snap-start overflow-hidden rounded-lg border border-slate-200 bg-white p-3 text-sm sm:min-w-0 sm:max-w-none sm:border-0 sm:bg-transparent sm:p-0 [&_[data-slot=label]]:text-[10px] [&_[data-slot=label]]:leading-none sm:[&_[data-slot=label]]:text-xs";

const analysisGridClass =
  "grid min-w-0 grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 lg:grid-cols-4";

const analysisMetricGridClass =
  "grid min-w-0 grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4";

const analysisInputClass =
  "h-8 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm shadow-sm sm:h-10 sm:border-transparent sm:border-b-input sm:bg-transparent sm:px-0 sm:shadow-none";

const analysisSelectClass =
  "mt-1 flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 shadow-sm sm:h-10 sm:px-3 sm:py-2 sm:shadow-none";

const analysisHintClass =
  "mt-1 text-[10px] leading-3.5 text-slate-500 sm:text-xs sm:leading-normal";

export function DealAnalyzer({
  propertyId,
  askingPrice,
  taxesAnnual,
  insuranceAnnual,
  projectedMonthlyRent,
  totalRehab,
  ownerPaidUtilitiesAnnual,
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
    initialSettings?.vacancyRate ?? 5,
  );
  const [managementRate, setManagementRate] = useState(
    initialSettings?.managementRate ?? 8,
  );
  const [repairsRate, setRepairsRate] = useState(
    initialSettings?.repairsRate ?? 8,
  );
  const [capexRate, setCapexRate] = useState(
    initialSettings?.capexRate ?? 5,
  );
  const [customUtilitiesAnnual, setCustomUtilitiesAnnual] = useState<
    number | null
  >(initialSettings?.customUtilitiesAnnual ?? null);
  const [otherExpensesAnnual, setOtherExpensesAnnual] = useState(
    initialSettings?.otherExpensesAnnual ?? 0,
  );
  const [targetCapRate, setTargetCapRate] = useState(
    initialSettings?.targetCapRate ?? 8,
  );
  const [initialOfferDiscount, setInitialOfferDiscount] = useState(
    initialSettings?.initialOfferDiscount ?? 10,
  );
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

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
      customUtilitiesAnnual,
      otherExpensesAnnual,
      targetCapRate,
      initialOfferDiscount,
    }),
    [
      acquisitionCostsRate,
      capexRate,
      customInterestRate,
      customUtilitiesAnnual,
      downPaymentRate,
      initialOfferDiscount,
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

  useEffect(() => {
    const serializedSettings = JSON.stringify(settings);
    if (serializedSettings === lastSavedSettings.current) return;

    setSaveStatus("saving");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/properties/${propertyId}/deal-analyzer`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ settings }),
            signal: controller.signal,
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
    }, 700);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [propertyId, settings]);

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
    const annualGrossRent = projectedMonthlyRent * 12;
    const vacancyLoss = annualGrossRent * (vacancyRate / 100);
    const effectiveGrossIncome = annualGrossRent - vacancyLoss;
    const managementExpense = annualGrossRent * (managementRate / 100);
    const repairsExpense = annualGrossRent * (repairsRate / 100);
    const capexExpense = annualGrossRent * (capexRate / 100);
    const fixedExpenses =
      Number(taxesAnnual || 0) +
      Number(insuranceAnnual || 0) +
      Math.max(0, utilitiesAnnual) +
      Math.max(0, otherExpensesAnnual);
    const totalExpenses =
      managementExpense + repairsExpense + capexExpense + fixedExpenses;
    const noiAnnual = effectiveGrossIncome - totalExpenses;

    const isFinanced = purchaseMethod === "financed";
    const downPayment = isFinanced ? price * (downPaymentRate / 100) : price;
    const loanAmount = isFinanced ? Math.max(0, price - downPayment) : 0;
    const acquisitionCosts = price * (acquisitionCostsRate / 100);
    const monthlyPrincipalAndInterest = isFinanced
      ? getMonthlyPayment(loanAmount, interestRate, loanTermYears)
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
    const annualCashFlow = noiAnnual - annualDebtService;
    const monthlyCashFlow = annualCashFlow / 12;
    const cashOnCashReturn =
      cashRequired > 0 ? annualCashFlow / cashRequired : 0;
    const capRate = price > 0 ? noiAnnual / price : 0;
    const dscr =
      annualDebtService > 0 ? noiAnnual / annualDebtService : Infinity;
    const debtYield = loanAmount > 0 ? noiAnnual / loanAmount : 0;
    const breakEvenOccupancy =
      annualGrossRent > 0
        ? (totalExpenses + annualDebtService) / annualGrossRent
        : 0;
    const grossRentMultiplier =
      annualGrossRent > 0 ? price / annualGrossRent : 0;
    const expenseRatio =
      effectiveGrossIncome > 0 ? totalExpenses / effectiveGrossIncome : 0;
    const valueByCapRate =
      targetCapRate > 0 ? noiAnnual / (targetCapRate / 100) : 0;
    const maxPurchasePrice =
      (valueByCapRate - Math.max(0, totalRehab)) /
      (1 + acquisitionCostsRate / 100);
    const suggestedInitialOffer =
      maxPurchasePrice * (1 - initialOfferDiscount / 100);

    return {
      annualGrossRent,
      effectiveGrossIncome,
      vacancyLoss,
      totalExpenses,
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
      debtYield,
      breakEvenOccupancy,
      grossRentMultiplier,
      expenseRatio,
      valueByCapRate,
      maxPurchasePrice,
      suggestedInitialOffer,
    };
  }, [
    purchasePrice,
    projectedMonthlyRent,
    vacancyRate,
    managementRate,
    repairsRate,
    capexRate,
    taxesAnnual,
    insuranceAnnual,
    utilitiesAnnual,
    otherExpensesAnnual,
    purchaseMethod,
    downPaymentRate,
    acquisitionCostsRate,
    interestRate,
    loanTermYears,
    totalRehab,
    targetCapRate,
    initialOfferDiscount,
  ]);

  const isFinanced = purchaseMethod === "financed";

  return (
    <Card
      size="sm"
      className="mb-6 rounded-xl border-slate-200 bg-white sm:[--card-spacing:--spacing(8)]"
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="font-sans text-base font-semibold normal-case tracking-normal text-slate-950 sm:text-lg">
            Deal Analyzer
          </CardTitle>
          <p
            className={`text-xs ${
              saveStatus === "error" ? "text-red-600" : "text-slate-500"
            }`}
            role="status"
            aria-live="polite"
          >
            {saveStatus === "saving" && "Saving..."}
            {saveStatus === "saved" && "Saved"}
            {saveStatus === "error" && "Could not save"}
          </p>
        </div>
        <p className="text-xs leading-5 text-slate-500 sm:text-sm">
          Compare cash and financed acquisitions using editable operating and
          loan assumptions.
        </p>
      </CardHeader>

      <CardContent>
        <div className={mobileAnalysisRailClass}>
          <section className={mobileAnalysisPanelClass}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600 sm:mb-4 sm:text-sm">
              Purchase & Financing
            </h3>
            <div className={analysisGridClass}>
              <div className="col-span-2 sm:col-span-1">
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
                  min="0"
                  value={purchasePrice}
                  className={analysisInputClass}
                  onChange={(event) =>
                    setPurchasePrice(Number(event.target.value))
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
                        className="mt-1 text-xs font-medium text-blue-700 hover:text-blue-900"
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
              Operating Assumptions
            </h3>
            <div className={analysisGridClass}>
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
                <Label htmlFor="management-rate">Management %</Label>
                <Input
                  id="management-rate"
                  type="number"
                  value={managementRate}
                  className={analysisInputClass}
                  onChange={(event) =>
                    setManagementRate(Number(event.target.value))
                  }
                />
              </div>
              <div>
                <Label htmlFor="repairs-rate">Repairs %</Label>
                <Input
                  id="repairs-rate"
                  type="number"
                  value={repairsRate}
                  className={analysisInputClass}
                  onChange={(event) =>
                    setRepairsRate(Number(event.target.value))
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
                <Label htmlFor="utilities-annual">Utilities / Year</Label>
                <Input
                  id="utilities-annual"
                  type="number"
                  min="0"
                  value={utilitiesAnnual}
                  className={analysisInputClass}
                  onChange={(event) =>
                    setCustomUtilitiesAnnual(Number(event.target.value))
                  }
                />
              </div>
              <div>
                <Label htmlFor="other-expenses">Other Expenses / Year</Label>
                <Input
                  id="other-expenses"
                  type="number"
                  min="0"
                  value={otherExpensesAnnual}
                  className={analysisInputClass}
                  onChange={(event) =>
                    setOtherExpensesAnnual(Number(event.target.value))
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
              <div>
                <Label htmlFor="offer-discount">Initial Offer Discount %</Label>
                <Input
                  id="offer-discount"
                  type="number"
                  min="0"
                  value={initialOfferDiscount}
                  className={analysisInputClass}
                  onChange={(event) =>
                    setInitialOfferDiscount(Number(event.target.value))
                  }
                />
              </div>
            </div>
          </section>

          <section className={mobileAnalysisPanelClass}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600 sm:mb-4 sm:text-sm">
              Returns & Risk
            </h3>
            <div className={analysisMetricGridClass}>
              <Metric
                label="Monthly Cash Flow"
                value={formatCurrency(results.monthlyCashFlow)}
                note="After operating expenses and debt service"
                emphasis
              />
              <Metric
                label="Cash-on-Cash Return"
                value={formatPercent(results.cashOnCashReturn)}
                note={`${formatCurrency(results.cashRequired)} total cash required`}
                emphasis
              />
              <Metric
                label="NOI"
                value={formatCurrency(results.noiAnnual)}
                note={`${formatPercent(results.capRate)} cap rate at purchase price`}
              />
              <Metric
                label="DSCR"
                value={isFinanced ? formatRatio(results.dscr) : "N/A"}
                note="NOI ÷ annual debt service"
              />
              <Metric
                label="Debt Yield"
                value={isFinanced ? formatPercent(results.debtYield) : "N/A"}
                note="NOI ÷ loan amount"
              />
              <Metric
                label="Break-Even Occupancy"
                value={formatPercent(results.breakEvenOccupancy)}
                note="Occupancy needed to cover expenses and debt"
              />
              <Metric
                label="Gross Rent Multiplier"
                value={formatRatio(results.grossRentMultiplier)}
                note="Purchase price ÷ annual gross rent"
              />
              <Metric
                label="Operating Expense Ratio"
                value={formatPercent(results.expenseRatio)}
                note={`${formatCurrency(results.totalExpenses)} annual operating expenses`}
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
                  note="NOI minus annual debt service"
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
                value={formatCurrency(projectedMonthlyRent)}
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
                label="Value by Target Cap Rate"
                value={formatCurrency(results.valueByCapRate)}
                note={`${targetCapRate}% target cap rate`}
              />
              <Metric
                label="Max Purchase Price"
                value={formatCurrency(results.maxPurchasePrice)}
                note="Cap-rate value less rehab and acquisition costs"
              />
              <Metric
                label="Suggested Initial Offer"
                value={formatCurrency(results.suggestedInitialOffer)}
                note={`${initialOfferDiscount}% below max purchase price`}
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
      </CardContent>
    </Card>
  );
}
