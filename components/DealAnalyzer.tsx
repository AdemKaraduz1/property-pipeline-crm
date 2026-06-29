"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DealAnalyzerProps = {
  askingPrice: number | null;
  taxesAnnual: number | null;
  insuranceAnnual: number | null;
  projectedMonthlyRent: number;
  totalRehab: number;
};

type PurchaseMethod = "financed" | "cash";

type MarketRateOption = {
  estimatedInvestmentRate: number;
  observedAt: string;
};

type MarketRates = {
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
          ? "rounded-lg border border-slate-800 bg-slate-900 p-4 text-white"
          : "rounded-lg border border-slate-200 bg-slate-50 p-4"
      }
    >
      <p className={emphasis ? "text-sm text-slate-300" : "text-sm text-slate-500"}>
        {label}
      </p>
      <p
        className={
          emphasis
            ? "mt-1 text-2xl font-bold"
            : "mt-1 text-2xl font-bold text-slate-950"
        }
      >
        {value}
      </p>
      {note && (
        <p className={emphasis ? "mt-1 text-xs text-slate-300" : "mt-1 text-xs text-slate-500"}>
          {note}
        </p>
      )}
    </div>
  );
}

export function DealAnalyzer({
  askingPrice,
  taxesAnnual,
  insuranceAnnual,
  projectedMonthlyRent,
  totalRehab,
}: DealAnalyzerProps) {
  const [purchaseMethod, setPurchaseMethod] =
    useState<PurchaseMethod>("financed");
  const [purchasePrice, setPurchasePrice] = useState(askingPrice || 0);
  const [downPaymentRate, setDownPaymentRate] = useState(20);
  const [customInterestRate, setCustomInterestRate] = useState<number | null>(
    null,
  );
  const [marketRates, setMarketRates] = useState<MarketRates | null>(null);
  const [rateStatus, setRateStatus] = useState<"loading" | "current" | "fallback">(
    "loading",
  );
  const [loanTermYears, setLoanTermYears] = useState(30);
  const [loanCostsRate, setLoanCostsRate] = useState(1);
  const [vacancyRate, setVacancyRate] = useState(5);
  const [managementRate, setManagementRate] = useState(8);
  const [repairsRate, setRepairsRate] = useState(8);
  const [capexRate, setCapexRate] = useState(5);
  const [utilitiesAnnual, setUtilitiesAnnual] = useState(0);
  const [otherExpensesAnnual, setOtherExpensesAnnual] = useState(0);
  const [closingCosts, setClosingCosts] = useState(10000);
  const [targetCapRate, setTargetCapRate] = useState(8);
  const [initialOfferDiscount, setInitialOfferDiscount] = useState(10);

  useEffect(() => {
    let isActive = true;

    async function loadMarketRate() {
      try {
        const response = await fetch("/api/mortgage-rate");
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "Could not load market rate.");
        }

        if (isActive) {
          setMarketRates(result);
          setRateStatus("current");
        }
      } catch (error) {
        console.error(error);

        if (isActive) {
          setRateStatus("fallback");
        }
      }
    }

    void loadMarketRate();

    return () => {
      isActive = false;
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
    const loanCosts = isFinanced ? loanAmount * (loanCostsRate / 100) : 0;
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
      Math.max(0, closingCosts) +
      loanCosts;
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
      valueByCapRate - Math.max(0, totalRehab) - Math.max(0, closingCosts);
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
      loanCosts,
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
    loanCostsRate,
    interestRate,
    loanTermYears,
    totalRehab,
    closingCosts,
    targetCapRate,
    initialOfferDiscount,
  ]);

  const isFinanced = purchaseMethod === "financed";

  return (
    <Card className="mb-6 border-slate-200 bg-white">
      <CardHeader>
        <CardTitle className="text-xl text-slate-950">Deal Analyzer</CardTitle>
        <p className="text-sm text-slate-500">
          Compare cash and financed acquisitions using editable operating and
          loan assumptions.
        </p>
      </CardHeader>

      <CardContent className="space-y-8">
        <section>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">
            Purchase & Financing
          </h3>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            <div>
              <Label htmlFor="purchase-method">Purchase Method</Label>
              <select
                id="purchase-method"
                value={purchaseMethod}
                onChange={(event) =>
                  setPurchaseMethod(event.target.value as PurchaseMethod)
                }
                className="mt-1 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
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
                onChange={(event) => setPurchasePrice(Number(event.target.value))}
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
                    onChange={(event) => {
                      setCustomInterestRate(Number(event.target.value));
                    }}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    {rateStatus === "loading" &&
                      "Loading today’s market estimate..."}
                    {rateStatus === "current" &&
                      selectedMarketRate &&
                      `Daily market estimate as of ${selectedMarketRate.observedAt}; cached for 24 hours.`}
                    {rateStatus === "fallback" &&
                      "Using the 7.25% fallback estimate; edit as needed."}
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
                    onChange={(event) =>
                      setLoanTermYears(Number(event.target.value))
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="loan-costs">Loan Costs %</Label>
                  <Input
                    id="loan-costs"
                    type="number"
                    min="0"
                    step="0.25"
                    value={loanCostsRate}
                    onChange={(event) =>
                      setLoanCostsRate(Number(event.target.value))
                    }
                  />
                </div>
              </>
            )}

            <div>
              <Label htmlFor="closing-costs">Closing Costs</Label>
              <Input
                id="closing-costs"
                type="number"
                min="0"
                value={closingCosts}
                onChange={(event) =>
                  setClosingCosts(Number(event.target.value))
                }
              />
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">
            Operating Assumptions
          </h3>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            <div>
              <Label htmlFor="vacancy-rate">Vacancy %</Label>
              <Input
                id="vacancy-rate"
                type="number"
                value={vacancyRate}
                onChange={(event) => setVacancyRate(Number(event.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="management-rate">Management %</Label>
              <Input
                id="management-rate"
                type="number"
                value={managementRate}
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
                onChange={(event) => setRepairsRate(Number(event.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="capex-rate">CapEx Reserve %</Label>
              <Input
                id="capex-rate"
                type="number"
                value={capexRate}
                onChange={(event) => setCapexRate(Number(event.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="utilities-annual">Utilities / Year</Label>
              <Input
                id="utilities-annual"
                type="number"
                min="0"
                value={utilitiesAnnual}
                onChange={(event) =>
                  setUtilitiesAnnual(Number(event.target.value))
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
                onChange={(event) =>
                  setInitialOfferDiscount(Number(event.target.value))
                }
              />
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">
            Returns & Risk
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <section>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">
              Mortgage Details
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                label="Estimated Loan Costs"
                value={formatCurrency(results.loanCosts)}
                note={`${loanCostsRate}% of loan amount`}
              />
              <Metric
                label="Annual Cash Flow"
                value={formatCurrency(results.annualCashFlow)}
                note="NOI minus annual debt service"
              />
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">
            Income & Offer View
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              note="Cap-rate value less rehab and closing costs"
            />
            <Metric
              label="Suggested Initial Offer"
              value={formatCurrency(results.suggestedInitialOffer)}
              note={`${initialOfferDiscount}% below max purchase price`}
            />
          </div>
        </section>

        <p className="text-xs leading-relaxed text-slate-500">
          Planning estimates only. Mortgage pricing, taxes, insurance, reserves,
          and lender underwriting vary by borrower and property.
        </p>
      </CardContent>
    </Card>
  );
}
