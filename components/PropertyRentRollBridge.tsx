"use client";

import { useEffect, useRef } from "react";
import {
  PROPERTY_RENT_ROLL_EVENT,
  type PropertyRentRollUpdate,
} from "@/lib/deal-analyzer";

type RentRollUnit = {
  id: string;
  currentRent: number;
  projectedRent: number;
};

type PropertyRentRollBridgeProps = {
  propertyId: string;
  units: RentRollUnit[];
  fallbackAnnualCurrentRent: number;
};

function toMoney(value: string | null | undefined) {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function PropertyRentRollBridge({
  propertyId,
  units,
  fallbackAnnualCurrentRent,
}: PropertyRentRollBridgeProps) {
  const unitRentRef = useRef(
    new Map(
      units.map((unit) => [
        unit.id,
        {
          currentRent: unit.currentRent,
          projectedRent: unit.projectedRent,
        },
      ]),
    ),
  );

  useEffect(() => {
    unitRentRef.current = new Map(
      units.map((unit) => [
        unit.id,
        {
          currentRent: unit.currentRent,
          projectedRent: unit.projectedRent,
        },
      ]),
    );
  }, [units]);

  useEffect(() => {
    function publishRentRoll() {
      const rents = Array.from(unitRentRef.current.values());
      const currentMonthlyRent = rents.reduce(
        (sum, unit) => sum + unit.currentRent,
        0,
      );
      const projectedMonthlyRent = rents.reduce(
        (sum, unit) => sum + unit.projectedRent,
        0,
      );
      const annualCurrentRent =
        currentMonthlyRent > 0
          ? currentMonthlyRent * 12
          : fallbackAnnualCurrentRent;
      const annualProjectedRent =
        projectedMonthlyRent > 0
          ? projectedMonthlyRent * 12
          : annualCurrentRent;
      const update: PropertyRentRollUpdate = {
        propertyId,
        currentMonthlyRent,
        projectedMonthlyRent,
        annualCurrentRent,
        annualProjectedRent,
      };

      window.dispatchEvent(
        new CustomEvent(PROPERTY_RENT_ROLL_EVENT, { detail: update }),
      );
    }

    function handleRentInput(event: Event) {
      const target = event.target;

      if (!(target instanceof HTMLInputElement)) return;

      const match = target.name.match(
        /^(.+)__(current_rent|projected_rent)$/,
      );

      if (!match) return;

      const [, unitId, field] = match;
      const existing = unitRentRef.current.get(unitId) || {
        currentRent: 0,
        projectedRent: 0,
      };

      unitRentRef.current.set(unitId, {
        ...existing,
        [field === "current_rent" ? "currentRent" : "projectedRent"]: toMoney(
          target.value,
        ),
      });

      publishRentRoll();
    }

    document.addEventListener("input", handleRentInput);
    document.addEventListener("change", handleRentInput);
    publishRentRoll();

    return () => {
      document.removeEventListener("input", handleRentInput);
      document.removeEventListener("change", handleRentInput);
    };
  }, [fallbackAnnualCurrentRent, propertyId]);

  return null;
}
