"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, ClipboardCheck } from "lucide-react";
import {
  COMMON_REHAB_ITEMS,
  InspectionItem,
  WalkthroughData,
  normalizeInspectionItem,
} from "@/lib/rehab";

type WalkthroughUnit = {
  id: string;
  label: string;
  bedrooms: number;
  fullBaths: number;
  halfBaths: number;
};

type PropertyWalkthroughProps = {
  propertyId: string;
  address: string;
  units: WalkthroughUnit[];
  initialData: WalkthroughData;
};

type WalkthroughStep = {
  key: string;
  scope: "common" | "unit";
  itemId: string;
  label: string;
  description: string;
  unitId?: string;
  unitLabel?: string;
};

type WalkthroughSection = {
  key: string;
  label: string;
  stepIndex: number;
};

function buildRoomSteps(unit: WalkthroughUnit): WalkthroughStep[] {
  const rooms: Array<{ id: string; label: string }> = [
    { id: "entry_hall", label: "Entry / Hall" },
    { id: "living_room", label: "Living Room" },
    { id: "dining_room", label: "Dining Room" },
    { id: "kitchen", label: "Kitchen" },
  ];

  for (let index = 1; index <= unit.bedrooms; index += 1) {
    rooms.push({ id: `bedroom_${index}`, label: `Bedroom ${index}` });
  }

  for (let index = 1; index <= unit.fullBaths; index += 1) {
    rooms.push({ id: `bathroom_${index}`, label: `Bathroom ${index}` });
  }

  for (let index = 1; index <= unit.halfBaths; index += 1) {
    rooms.push({ id: `half_bath_${index}`, label: `Half Bath ${index}` });
  }

  rooms.push({ id: "other", label: "Other / Final Unit Notes" });

  return rooms.map((room) => ({
    key: `unit:${unit.id}:${room.id}`,
    scope: "unit",
    itemId: room.id,
    label: room.label,
    description: `Inspect ${room.label.toLowerCase()} condition, finishes, fixtures, and needed work.`,
    unitId: unit.id,
    unitLabel: unit.label,
  }));
}

export function PropertyWalkthrough({
  propertyId,
  address,
  units,
  initialData,
}: PropertyWalkthroughProps) {
  const router = useRouter();
  const [walkthrough, setWalkthrough] = useState<WalkthroughData>(initialData);
  const [currentStepIndex, setCurrentStepIndex] = useState(
    initialData.currentStep || 0,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const steps = useMemo<WalkthroughStep[]>(
    () => [
      ...COMMON_REHAB_ITEMS.map((item) => ({
        key: `common:${item.id}`,
        scope: "common" as const,
        itemId: item.id,
        label: item.label,
        description: item.description,
      })),
      ...units.flatMap(buildRoomSteps),
    ],
    [units],
  );

  const sections = useMemo<WalkthroughSection[]>(
    () => [
      {
        key: "common",
        label: "Outside & Common Areas",
        stepIndex: 0,
      },
      ...units.map((unit, unitIndex) => ({
        key: `unit:${unit.id}`,
        label: `Unit ${unit.label}`,
        stepIndex: COMMON_REHAB_ITEMS.length
          + units
              .slice(0, unitIndex)
              .reduce(
                (stepCount, previousUnit) =>
                  stepCount + buildRoomSteps(previousUnit).length,
                0,
              ),
      })),
    ],
    [units],
  );

  const currentStep = steps[currentStepIndex];
  const currentSectionKey =
    currentStep?.scope === "unit" && currentStep.unitId
      ? `unit:${currentStep.unitId}`
      : "common";

  function getItem(step: WalkthroughStep) {
    if (step.scope === "common") {
      return normalizeInspectionItem(walkthrough.common[step.itemId]);
    }

    return normalizeInspectionItem(
      walkthrough.units[step.unitId || ""]?.rooms[step.itemId],
    );
  }

  function updateItem(
    step: WalkthroughStep,
    update: Partial<InspectionItem>,
  ) {
    setWalkthrough((current) => {
      const existing =
        step.scope === "common"
          ? normalizeInspectionItem(current.common[step.itemId])
          : normalizeInspectionItem(
              current.units[step.unitId || ""]?.rooms[step.itemId],
            );
      const nextItem = { ...existing, ...update };

      if (step.scope === "common") {
        return {
          ...current,
          common: {
            ...current.common,
            [step.itemId]: nextItem,
          },
        };
      }

      const unitId = step.unitId || "";

      return {
        ...current,
        units: {
          ...current.units,
          [unitId]: {
            rooms: {
              ...current.units[unitId]?.rooms,
              [step.itemId]: nextItem,
            },
          },
        },
      };
    });
  }

  async function saveWalkthrough({
    exit = false,
    finished = false,
    nextStep = currentStepIndex,
  }: {
    exit?: boolean;
    finished?: boolean;
    nextStep?: number;
  } = {}) {
    setIsSaving(true);
    setSaveMessage("Saving walkthrough...");

    try {
      const response = await fetch(`/api/properties/${propertyId}/walkthrough`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...walkthrough,
          completed: finished,
          currentStep: nextStep,
        }),
      });
      const responseText = await response.text();
      let result: { success?: boolean; message?: string } | null = null;

      if (responseText) {
        try {
          result = JSON.parse(responseText) as {
            success?: boolean;
            message?: string;
          };
        } catch {
          // A proxy or framework error page is not useful to show in full.
        }
      }

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message ||
            `Could not save walkthrough (server returned ${response.status}).`,
        );
      }

      setSaveMessage("Progress saved.");

      if (exit || finished) {
        router.push(`/properties/${propertyId}`);
        router.refresh();
      }
      return true;
    } catch (error) {
      console.error(error);
      setSaveMessage(
        error instanceof Error ? error.message : "Could not save walkthrough.",
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function moveNext() {
    if (currentStepIndex >= steps.length - 1) {
      await saveWalkthrough({ finished: true });
      return;
    }

    const nextStep = Math.min(currentStepIndex + 1, steps.length - 1);
    const saved = await saveWalkthrough({ nextStep });

    if (saved) {
      setCurrentStepIndex(nextStep);
    }
  }

  if (!currentStep) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-center">
        <ClipboardCheck className="mx-auto h-8 w-8 text-slate-500" />
        <h2 className="mt-3 text-xl font-bold text-slate-950">
          No walkthrough checkpoints available
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Add a unit or return to the property page.
        </p>
      </div>
    );
  }

  const currentItem = getItem(currentStep);
  const answeredCount = steps.filter(
    (step) => getItem(step).needsRehab !== null,
  ).length;
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-slate-700">
            Step {currentStepIndex + 1} of {steps.length}
          </span>
          <span className="text-slate-500">{answeredCount} inspected</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-slate-900 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <label
            htmlFor="walkthrough-section"
            className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            Jump to section
          </label>
          <select
            id="walkthrough-section"
            value={currentSectionKey}
            onChange={(event) => {
              const section = sections.find(
                (option) => option.key === event.target.value,
              );

              if (section) {
                setCurrentStepIndex(section.stepIndex);
                setSaveMessage("");
              }
            }}
            disabled={isSaving}
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-60"
          >
            {sections.map((section) => (
              <option key={section.key} value={section.key}>
                {section.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {currentStep.scope === "common"
            ? `Outside & Common Areas · ${address}`
            : `Unit ${currentStep.unitLabel}`}
        </p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">
          {currentStep.label}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {currentStep.description}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() =>
              updateItem(currentStep, {
                needsRehab: false,
                estimatedCost: 0,
              })
            }
            className={`rounded-xl border px-4 py-4 text-sm font-semibold transition ${
              currentItem.needsRehab === false
                ? "border-green-500 bg-green-50 text-green-800 ring-2 ring-green-100"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Check className="mx-auto mb-1 h-5 w-5" />
            No Rehab Needed
          </button>
          <button
            type="button"
            onClick={() => updateItem(currentStep, { needsRehab: true })}
            className={`rounded-xl border px-4 py-4 text-sm font-semibold transition ${
              currentItem.needsRehab === true
                ? "border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-100"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Needs Rehab
          </button>
        </div>

        {currentItem.needsRehab === true && (
          <div className="mt-5">
            <label
              htmlFor="walkthrough-cost"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Estimated Rehab Cost
            </label>
            <input
              id="walkthrough-cost"
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              value={currentItem.estimatedCost || ""}
              onChange={(event) =>
                updateItem(currentStep, {
                  estimatedCost: Number(event.target.value) || 0,
                })
              }
              placeholder="$0"
              className="h-12 w-full rounded-lg border border-slate-300 px-3 text-base text-slate-950 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
        )}

        <div className="mt-5">
          <label
            htmlFor="walkthrough-notes"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Notes
          </label>
          <textarea
            id="walkthrough-notes"
            rows={5}
            value={currentItem.notes}
            onChange={(event) =>
              updateItem(currentStep, { notes: event.target.value })
            }
            placeholder="What did you see? Missing brick, damaged flooring, old fixtures, moisture, scope ideas..."
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base text-slate-950 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
        </div>

        {saveMessage && (
          <p className="mt-3 text-sm text-slate-500">{saveMessage}</p>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() =>
              setCurrentStepIndex((index) => Math.max(0, index - 1))
            }
            disabled={currentStepIndex === 0 || isSaving}
            className="inline-flex h-11 items-center gap-1 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          <button
            type="button"
            onClick={moveNext}
            disabled={isSaving}
            className="inline-flex h-11 items-center gap-1 rounded-lg bg-slate-950 px-5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {isSaving
              ? "Saving..."
              : currentStepIndex === steps.length - 1
                ? "Finish Walkthrough"
                : "Save & Next"}
            {!isSaving && currentStepIndex < steps.length - 1 && (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => saveWalkthrough({ exit: true })}
        disabled={isSaving}
        className="mt-4 w-full rounded-lg px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
      >
        Save Progress & Exit
      </button>
    </div>
  );
}
