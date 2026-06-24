"use client";

import { useMemo, useState } from "react";
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function DealAnalyzer({
  askingPrice,
  taxesAnnual,
  insuranceAnnual,
  projectedMonthlyRent,
  totalRehab,
}: DealAnalyzerProps) {
  const [vacancyRate, setVacancyRate] = useState(5);
  const [managementRate, setManagementRate] = useState(8);
  const [repairsRate, setRepairsRate] = useState(8);
  const [capexRate, setCapexRate] = useState(5);
  const [utilitiesAnnual, setUtilitiesAnnual] = useState(0);
  const [otherExpensesAnnual, setOtherExpensesAnnual] = useState(0);
  const [closingCosts, setClosingCosts] = useState(10000);
  const [targetCapRate, setTargetCapRate] = useState(8);
  const [initialOfferDiscount, setInitialOfferDiscount] = useState(10);

  const results = useMemo(() => {
    const annualGrossRent = projectedMonthlyRent * 12;

    const effectiveGrossIncome =
      annualGrossRent * (1 - vacancyRate / 100);

    const managementExpense = annualGrossRent * (managementRate / 100);
    const repairsExpense = annualGrossRent * (repairsRate / 100);
    const capexExpense = annualGrossRent * (capexRate / 100);

    const fixedExpenses =
      Number(taxesAnnual || 0) +
      Number(insuranceAnnual || 0) +
      Number(utilitiesAnnual || 0) +
      Number(otherExpensesAnnual || 0);

    const totalExpenses =
      managementExpense + repairsExpense + capexExpense + fixedExpenses;

    const noiAnnual = effectiveGrossIncome - totalExpenses;

    const valueByCapRate =
      targetCapRate > 0 ? noiAnnual / (targetCapRate / 100) : 0;

    const maxPurchasePrice =
      valueByCapRate - Number(totalRehab || 0) - Number(closingCosts || 0);

    const suggestedInitialOffer =
      maxPurchasePrice * (1 - initialOfferDiscount / 100);

    const spreadToAsk = maxPurchasePrice - Number(askingPrice || 0);

    const actualCapRateAtAsk =
      askingPrice && askingPrice > 0 ? noiAnnual / askingPrice : 0;

    return {
      annualGrossRent,
      effectiveGrossIncome,
      managementExpense,
      repairsExpense,
      capexExpense,
      fixedExpenses,
      totalExpenses,
      noiAnnual,
      valueByCapRate,
      maxPurchasePrice,
      suggestedInitialOffer,
      spreadToAsk,
      actualCapRateAtAsk,
    };
  }, [
    projectedMonthlyRent,
    vacancyRate,
    managementRate,
    repairsRate,
    capexRate,
    taxesAnnual,
    insuranceAnnual,
    utilitiesAnnual,
    otherExpensesAnnual,
    totalRehab,
    closingCosts,
    targetCapRate,
    initialOfferDiscount,
    askingPrice,
  ]);

  return (
    <Card className="mb-6 border-slate-200 bg-white">
      <CardHeader>
        <CardTitle className="text-xl text-slate-950">Deal Analyzer</CardTitle>
        <p className="text-sm text-slate-500">
          Estimate NOI, max offer, and suggested initial offer based on your assumptions.
        </p>
      </CardHeader>

      <CardContent>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">
              Assumptions
            </h3>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Vacancy %</Label>
                <Input
                  type="number"
                  value={vacancyRate}
                  onChange={(e) => setVacancyRate(Number(e.target.value))}
                />
              </div>

              <div>
                <Label>Management %</Label>
                <Input
                  type="number"
                  value={managementRate}
                  onChange={(e) => setManagementRate(Number(e.target.value))}
                />
              </div>

              <div>
                <Label>Repairs %</Label>
                <Input
                  type="number"
                  value={repairsRate}
                  onChange={(e) => setRepairsRate(Number(e.target.value))}
                />
              </div>

              <div>
                <Label>CapEx Reserve %</Label>
                <Input
                  type="number"
                  value={capexRate}
                  onChange={(e) => setCapexRate(Number(e.target.value))}
                />
              </div>

              <div>
                <Label>Utilities / Year</Label>
                <Input
                  type="number"
                  value={utilitiesAnnual}
                  onChange={(e) => setUtilitiesAnnual(Number(e.target.value))}
                />
              </div>

              <div>
                <Label>Other Expenses / Year</Label>
                <Input
                  type="number"
                  value={otherExpensesAnnual}
                  onChange={(e) => setOtherExpensesAnnual(Number(e.target.value))}
                />
              </div>

              <div>
                <Label>Closing Costs</Label>
                <Input
                  type="number"
                  value={closingCosts}
                  onChange={(e) => setClosingCosts(Number(e.target.value))}
                />
              </div>

              <div>
                <Label>Target Cap Rate %</Label>
                <Input
                  type="number"
                  value={targetCapRate}
                  onChange={(e) => setTargetCapRate(Number(e.target.value))}
                />
              </div>

              <div>
                <Label>Initial Offer Discount %</Label>
                <Input
                  type="number"
                  value={initialOfferDiscount}
                  onChange={(e) => setInitialOfferDiscount(Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">
              Results
            </h3>

            <div className="grid gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Projected Monthly Rent</p>
                <p className="text-2xl font-bold text-slate-950">
                  {formatCurrency(projectedMonthlyRent)}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Annual Gross Rent</p>
                <p className="text-2xl font-bold text-slate-950">
                  {formatCurrency(results.annualGrossRent)}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">NOI</p>
                <p className="text-2xl font-bold text-slate-950">
                  {formatCurrency(results.noiAnnual)}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Value by Target Cap Rate</p>
                <p className="text-2xl font-bold text-slate-950">
                  {formatCurrency(results.valueByCapRate)}
                </p>
                <p className="text-xs text-slate-500">
                  Target cap rate: {formatPercent(targetCapRate / 100)}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-900 p-4 text-white">
                <p className="text-sm text-slate-300">Max Purchase Price</p>
                <p className="text-3xl font-bold">
                  {formatCurrency(results.maxPurchasePrice)}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-sm text-slate-500">Suggested Initial Offer</p>
                <p className="text-2xl font-bold text-slate-950">
                  {formatCurrency(results.suggestedInitialOffer)}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-sm text-slate-500">Cap Rate at Asking Price</p>
                <p className="text-2xl font-bold text-slate-950">
                  {formatPercent(results.actualCapRateAtAsk)}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-sm text-slate-500">Spread to Asking Price</p>
                <p className="text-2xl font-bold text-slate-950">
                  {formatCurrency(results.spreadToAsk)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}