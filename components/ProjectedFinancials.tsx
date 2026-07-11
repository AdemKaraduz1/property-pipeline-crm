"use client";

import { useEffect, useState } from "react";
import {
  DEAL_ANALYZER_PROJECTION_EVENT,
  type DealAnalyzerProjection,
} from "@/lib/deal-analyzer";

type ProjectedFinancialsProps = {
  propertyId: string;
  annualProjectedRent: number;
  projectedOperatingExpenses: number;
  projectedNoi: number;
  purchasePrice: number;
  annualDebtService: number;
  isFinanced: boolean;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function ProjectedFinancials({
  propertyId,
  annualProjectedRent,
  projectedOperatingExpenses,
  projectedNoi,
  purchasePrice,
  annualDebtService,
  isFinanced,
}: ProjectedFinancialsProps) {
  const initialProjection: DealAnalyzerProjection = {
    propertyId,
    purchasePrice,
    annualGrossRent: annualProjectedRent,
    operatingExpenses: projectedOperatingExpenses,
    noiAnnual: projectedNoi,
    capRate: purchasePrice > 0 ? projectedNoi / purchasePrice : 0,
    annualDebtService,
    cashFlowAfterDebt: projectedNoi - annualDebtService,
    isFinanced,
    interestRate: 0,
    loanAmount: 0,
    loanTermYears: 0,
    vacancyRate: 0,
  };
  const [liveProjection, setLiveProjection] =
    useState<DealAnalyzerProjection | null>(null);
  const projection =
    liveProjection?.propertyId === propertyId
      ? liveProjection
      : initialProjection;

  useEffect(() => {
    function handleProjectionUpdate(event: Event) {
      const detail = (event as CustomEvent<DealAnalyzerProjection>).detail;

      if (detail?.propertyId === propertyId) {
        setLiveProjection(detail);
      }
    }

    window.addEventListener(
      DEAL_ANALYZER_PROJECTION_EVENT,
      handleProjectionUpdate,
    );

    return () => {
      window.removeEventListener(
        DEAL_ANALYZER_PROJECTION_EVENT,
        handleProjectionUpdate,
      );
    };
  }, [propertyId]);

  return (
    <details
      open
      className="group mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">
            Projected Financials
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Uses the live Deal Analyzer purchase price, projected rents, and
            saved itemized operating expenses.
          </p>
        </div>

        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-base leading-none text-slate-500 transition group-open:rotate-45">
          +
        </span>
      </summary>

      <div
        className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        data-testid="projected-financials"
      >
        <div>
          <p className="text-sm text-slate-500">Projected Purchase Price</p>
          <p
            className="text-xl font-bold text-slate-950"
            data-testid="projected-purchase-price"
          >
            {formatCurrency(projection.purchasePrice)}
          </p>
        </div>

        <div>
          <p className="text-sm text-slate-500">Projected Annual Rent</p>
          <p className="text-xl font-bold text-slate-950">
            {formatCurrency(projection.annualGrossRent)}
          </p>
        </div>

        <div>
          <p className="text-sm text-slate-500">
            Projected Operating Expenses
          </p>
          <p className="text-xl font-bold text-slate-950">
            {formatCurrency(projection.operatingExpenses)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Itemized expenses; vacancy is reflected separately in NOI
          </p>
        </div>

        <div>
          <p className="text-sm text-slate-500">Projected NOI</p>
          <p className="text-xl font-bold text-slate-950">
            {formatCurrency(projection.noiAnnual)}
          </p>
        </div>

        <div>
          <p className="text-sm text-slate-500">Projected Cap Rate</p>
          <p
            className="text-xl font-bold text-slate-950"
            data-testid="projected-cap-rate"
          >
            {projection.purchasePrice > 0
              ? `${(projection.capRate * 100).toFixed(2)}%`
              : "Not entered"}
          </p>
        </div>

        <div>
          <p className="text-sm text-slate-500">
            Cash Flow Before CapEx Reserve
          </p>
          <p
            className="text-xl font-bold text-slate-950"
            data-testid="projected-cash-flow-after-debt"
          >
            {formatCurrency(projection.cashFlowAfterDebt)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {projection.isFinanced
              ? `NOI minus ${formatCurrency(projection.annualDebtService)} annual mortgage payments; see Return Summary for cash flow after CapEx reserve`
              : "Cash purchase—no mortgage debt service"}
          </p>
        </div>
      </div>
    </details>
  );
}
