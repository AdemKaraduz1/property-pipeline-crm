"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEAL_ANALYZER_PROJECTION_EVENT,
  type DealAnalyzerProjection,
} from "@/lib/deal-analyzer";
import {
  computeStabilizationSchedule,
  parseStabilizationPlanSettings,
  type StabilizationUnitInput,
  type StabilizationUnitSettings,
} from "@/lib/stabilization";
import { StabilizationCurveChart } from "@/components/DealVerdictCharts";
import { getMonthToMonthTurnoverDate, isMonthToMonth } from "@/lib/lease";

type StabilizationUnitProp = {
  id: string;
  label: string;
  currentRent: number;
  projectedRent: number;
  rehabEstimate: number;
  leaseExpiration: string | null;
};

type StabilizationPlanProps = {
  propertyId: string;
  units: StabilizationUnitProp[];
  annualFixedOperatingExpenses: number;
  repairsMaintenanceRate: number;
  propertyManagementRate: number;
  annualDebtService: number;
  savedPlan: unknown;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatRatio(value: number | null) {
  return value !== null && Number.isFinite(value) ? `${value.toFixed(2)}x` : "-";
}

function getStorageKey(propertyId: string) {
  return `property-pipeline:stabilization-plan:${propertyId}`;
}

function getDefaultTurnoverDate(
  leaseExpiration: string | null,
  planStartDate: string,
) {
  if (leaseExpiration) {
    return isMonthToMonth(leaseExpiration)
      ? getMonthToMonthTurnoverDate()
      : leaseExpiration;
  }

  return planStartDate;
}

export function StabilizationPlan({
  propertyId,
  units,
  annualFixedOperatingExpenses,
  repairsMaintenanceRate,
  propertyManagementRate,
  annualDebtService: initialAnnualDebtService,
  savedPlan,
}: StabilizationPlanProps) {
  const parsedSavedPlan = useMemo(
    () => parseStabilizationPlanSettings(savedPlan),
    [savedPlan],
  );

  const [planStartDate, setPlanStartDate] = useState(
    parsedSavedPlan.planStartDate,
  );
  const [defaultVacancyWeeks, setDefaultVacancyWeeks] = useState(
    parsedSavedPlan.defaultVacancyWeeks,
  );
  const [unitSettings, setUnitSettings] = useState<
    Record<string, StabilizationUnitSettings>
  >(() => {
    const initial: Record<string, StabilizationUnitSettings> = {};

    units.forEach((unit) => {
      const saved = parsedSavedPlan.units[unit.id];

      initial[unit.id] = {
        turnoverDate:
          saved?.turnoverDate ??
          getDefaultTurnoverDate(
            unit.leaseExpiration,
            parsedSavedPlan.planStartDate,
          ),
        vacancyWeeks: saved?.vacancyWeeks ?? parsedSavedPlan.defaultVacancyWeeks,
        relocationCost: saved?.relocationCost ?? 0,
      };
    });

    return initial;
  });

  const [liveAnnualDebtService, setLiveAnnualDebtService] = useState<
    number | null
  >(null);
  const annualDebtService = liveAnnualDebtService ?? initialAnnualDebtService;

  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [hasRestoredSettings, setHasRestoredSettings] = useState(false);

  useEffect(() => {
    function handleProjectionUpdate(event: Event) {
      const detail = (event as CustomEvent<DealAnalyzerProjection>).detail;

      if (detail?.propertyId === propertyId) {
        setLiveAnnualDebtService(detail.annualDebtService);
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

  const settings = useMemo(
    () => ({ planStartDate, defaultVacancyWeeks, units: unitSettings }),
    [planStartDate, defaultVacancyWeeks, unitSettings],
  );
  const lastSavedSettings = useRef(JSON.stringify(settings));
  const latestSettings = useRef(settings);

  useEffect(() => {
    latestSettings.current = settings;
  }, [settings]);

  const persistSettings = useCallback(
    async (settingsToSave: typeof settings, signal?: AbortSignal) => {
      const serialized = JSON.stringify(settingsToSave);

      setSaveStatus("saving");

      try {
        window.localStorage.setItem(getStorageKey(propertyId), serialized);
      } catch {
        // The database remains the durable fallback when storage is blocked.
      }

      try {
        const response = await fetch(
          `/api/properties/${propertyId}/stabilization-plan`,
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
          throw new Error(result.message || "Could not save stabilization plan.");
        }

        lastSavedSettings.current = serialized;
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
    function readStoredSettings() {
      try {
        const raw = window.localStorage.getItem(getStorageKey(propertyId));
        return raw ? parseStabilizationPlanSettings(JSON.parse(raw)) : null;
      } catch {
        return null;
      }
    }

    const restored = readStoredSettings();
    const timeoutId = window.setTimeout(() => {
      if (restored) {
        setPlanStartDate(restored.planStartDate);
        setDefaultVacancyWeeks(restored.defaultVacancyWeeks);
        setUnitSettings((current) => {
          const merged: Record<string, StabilizationUnitSettings> = {
            ...current,
          };

          units.forEach((unit) => {
            const restoredUnit = restored.units[unit.id];

            if (restoredUnit) {
              merged[unit.id] = restoredUnit;
            }
          });

          return merged;
        });
      }

      setHasRestoredSettings(true);
    }, 0);

    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  useEffect(() => {
    if (!hasRestoredSettings) return;

    const serialized = JSON.stringify(settings);

    if (serialized === lastSavedSettings.current) return;

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
      const pending = latestSettings.current;
      const serialized = JSON.stringify(pending);

      if (serialized === lastSavedSettings.current) return;

      lastSavedSettings.current = serialized;
      void fetch(`/api/properties/${propertyId}/stabilization-plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: pending }),
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

  function updateUnitField(
    unitId: string,
    field: keyof StabilizationUnitSettings,
    value: string | number,
  ) {
    setUnitSettings((current) => ({
      ...current,
      [unitId]: {
        ...current[unitId],
        [field]: value,
      },
    }));
  }

  function applyVacancyWeeksToAllUnits() {
    setUnitSettings((current) => {
      const next: Record<string, StabilizationUnitSettings> = {};

      Object.entries(current).forEach(([unitId, unitSetting]) => {
        next[unitId] = { ...unitSetting, vacancyWeeks: defaultVacancyWeeks };
      });

      return next;
    });
  }

  const scheduleInputUnits: StabilizationUnitInput[] = useMemo(
    () =>
      units.map((unit) => {
        const unitSetting = unitSettings[unit.id] ?? {
          turnoverDate: getDefaultTurnoverDate(
            unit.leaseExpiration,
            planStartDate,
          ),
          vacancyWeeks: defaultVacancyWeeks,
          relocationCost: 0,
        };

        return {
          id: unit.id,
          label: unit.label,
          currentRent: unit.currentRent,
          projectedRent: unit.projectedRent,
          rehabEstimate: unit.rehabEstimate,
          turnoverDate: unitSetting.turnoverDate ?? planStartDate,
          vacancyWeeks: unitSetting.vacancyWeeks,
          relocationCost: unitSetting.relocationCost,
        };
      }),
    [units, unitSettings, planStartDate, defaultVacancyWeeks],
  );

  const schedule = useMemo(
    () =>
      computeStabilizationSchedule({
        planStartDate,
        units: scheduleInputUnits,
        annualFixedOperatingExpenses,
        repairsMaintenanceRate,
        propertyManagementRate,
        annualDebtService,
      }),
    [
      planStartDate,
      scheduleInputUnits,
      annualFixedOperatingExpenses,
      repairsMaintenanceRate,
      propertyManagementRate,
      annualDebtService,
    ],
  );

  if (units.length === 0) {
    return null;
  }

  return (
    <details
      id="stabilization"
      className="group mb-6 scroll-mt-24 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-8"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-base font-semibold text-slate-950 sm:text-lg">
            Stabilization Plan
          </h3>
          <p
            className={`text-xs ${saveStatus === "error" ? "text-red-600" : "text-slate-500"}`}
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
            The path from in-place rents to market rent: per-unit turnover
            timing, cash burn during the transition, and when the deal
            actually stabilizes.
          </p>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-base leading-none text-slate-500 transition group-open:rotate-45">
            +
          </span>
        </div>
      </summary>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div
            className={`rounded-lg border p-3 ${
              schedule.totalCashBurn > 0
                ? "border-red-200 bg-red-50"
                : "border-green-200 bg-green-50"
            }`}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Peak Cash Needed
            </p>
            <p className="mt-1 text-xl font-bold text-slate-950">
              {formatCurrency(schedule.totalCashBurn)}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Beyond your down payment and rehab budget, at the lowest point
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Months to Stabilization
            </p>
            <p className="mt-1 text-xl font-bold text-slate-950">
              {schedule.monthsToStabilization !== null
                ? schedule.monthsToStabilization + 1
                : "-"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Until every unit is turned and at market rent
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Worst Month Cash Flow
            </p>
            <p
              className={`mt-1 text-xl font-bold ${schedule.worstMonthCashFlow < 0 ? "text-red-700" : "text-slate-950"}`}
            >
              {formatCurrency(schedule.worstMonthCashFlow)}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Single hardest month during the transition
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Worst Month DSCR
            </p>
            <p className="mt-1 text-xl font-bold text-slate-950">
              {formatRatio(schedule.worstMonthDscr)}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Debt service does not pause during turnover
            </p>
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Cumulative Cash Flow
          </p>
          <StabilizationCurveChart
            months={schedule.months.map((month) => ({
              monthLabel: month.monthLabel,
              cumulativeCashFlow: month.cumulativeCashFlow,
            }))}
            stabilizationMonthIndex={schedule.stabilizationMonthIndex}
          />
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-slate-700">
              Plan Start Date
            </span>
            <input
              type="date"
              value={planStartDate}
              onChange={(event) => setPlanStartDate(event.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-base sm:text-sm"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Usually your expected closing date
            </span>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">
              Default Vacancy / Rehab Weeks
            </span>
            <div className="mt-1 flex gap-2">
              <input
                type="number"
                min="0"
                step="1"
                value={defaultVacancyWeeks}
                onChange={(event) =>
                  setDefaultVacancyWeeks(Number(event.target.value))
                }
                className="h-9 w-full rounded-md border border-slate-300 px-2 text-base sm:text-sm"
              />
              <button
                type="button"
                onClick={applyVacancyWeeksToAllUnits}
                className="shrink-0 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Apply to all units
              </button>
            </div>
            <span className="mt-1 block text-xs text-slate-500">
              How long each unit sits at $0 rent for rehab and re-leasing
            </span>
          </label>
        </div>

        <div className="mb-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Unit</th>
                <th className="py-2 pr-3">Current Rent</th>
                <th className="py-2 pr-3">Market Rent</th>
                <th className="py-2 pr-3">Turnover Date</th>
                <th className="py-2 pr-3">Vacancy Weeks</th>
                <th className="py-2 pr-3">Relocation Cost</th>
                <th className="py-2 pr-3">Stabilizes</th>
              </tr>
            </thead>
            <tbody>
              {scheduleInputUnits.map((unit) => {
                const vacancyEndDate = new Date(
                  `${unit.turnoverDate}T00:00:00`,
                );
                vacancyEndDate.setDate(
                  vacancyEndDate.getDate() + unit.vacancyWeeks * 7,
                );

                return (
                  <tr key={unit.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-950">
                      {unit.label}
                    </td>
                    <td className="py-2 pr-3 text-slate-700">
                      {formatCurrency(unit.currentRent)}
                    </td>
                    <td className="py-2 pr-3 text-slate-700">
                      {formatCurrency(unit.projectedRent)}
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="date"
                        value={unit.turnoverDate}
                        onChange={(event) =>
                          updateUnitField(
                            unit.id,
                            "turnoverDate",
                            event.target.value,
                          )
                        }
                        className="h-8 w-full min-w-[136px] rounded-md border border-slate-300 px-2 text-xs"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={unit.vacancyWeeks}
                        onChange={(event) =>
                          updateUnitField(
                            unit.id,
                            "vacancyWeeks",
                            Number(event.target.value),
                          )
                        }
                        className="h-8 w-20 rounded-md border border-slate-300 px-2 text-xs"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={unit.relocationCost}
                        onChange={(event) =>
                          updateUnitField(
                            unit.id,
                            "relocationCost",
                            Number(event.target.value),
                          )
                        }
                        className="h-8 w-24 rounded-md border border-slate-300 px-2 text-xs"
                      />
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-600">
                      {vacancyEndDate.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <details className="rounded-lg border border-slate-200 bg-slate-50/60">
          <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-semibold text-slate-700">
            Month-by-month detail
          </summary>
          <div className="overflow-x-auto border-t border-slate-200 px-3 py-3">
            <table className="w-full min-w-[720px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-1.5 pr-3">Month</th>
                  <th className="py-1.5 pr-3">Collected Rent</th>
                  <th className="py-1.5 pr-3">Units Stabilized</th>
                  <th className="py-1.5 pr-3">Rehab / Relocation</th>
                  <th className="py-1.5 pr-3">Cash Flow</th>
                  <th className="py-1.5 pr-3">Cumulative</th>
                </tr>
              </thead>
              <tbody>
                {schedule.months.map((month) => (
                  <tr key={month.monthIndex} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3 font-medium text-slate-900">
                      {month.monthLabel}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-700">
                      {formatCurrency(month.collectedRent)}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-700">
                      {month.unitsStabilized}/{units.length}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-700">
                      {formatCurrency(month.rehabSpend + month.relocationSpend)}
                    </td>
                    <td
                      className={`py-1.5 pr-3 font-medium ${month.cashFlow < 0 ? "text-red-700" : "text-slate-900"}`}
                    >
                      {formatCurrency(month.cashFlow)}
                    </td>
                    <td
                      className={`py-1.5 pr-3 font-medium ${month.cumulativeCashFlow < 0 ? "text-red-700" : "text-slate-900"}`}
                    >
                      {formatCurrency(month.cumulativeCashFlow)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Fixed operating expenses (taxes, insurance, cleaning, lawn,
          utilities) are held constant regardless of occupancy. Repairs and
          management scale with actual collected rent, not stabilized rent.
          Rehab and relocation costs hit as one-time expenses in each
          unit&apos;s turnover month. This is a planning estimate, not a substitute for a
          contractor bid or a lease-by-lease legal review.
        </p>
      </div>
    </details>
  );
}
