"use client";

import { useState } from "react";

type UnitCondition =
  | "Unknown"
  | "Excellent"
  | "Good"
  | "Average"
  | "Needs Work"
  | "Poor";

type Unit = {
  id: string;
  unitNumber: string;
  floor: string;
  squareFeet: string;
  rooms: string;
  bedrooms: string;
  fullBaths: string;
  halfBaths: string;
  currentRent: string;
  projectedRent: string;
  fmrRent: string;
  leaseExpiration: string;
  condition: UnitCondition;
  rehabEstimate: string;
  tenantPays: string;
  appliancesFeatures: string;
  unitNotes: string;
};

const emptyUnit: Omit<Unit, "id"> = {
  unitNumber: "",
  floor: "",
  squareFeet: "",
  rooms: "",
  bedrooms: "",
  fullBaths: "",
  halfBaths: "",
  currentRent: "",
  projectedRent: "",
  fmrRent: "",
  leaseExpiration: "",
  condition: "Unknown",
  rehabEstimate: "",
  tenantPays: "",
  appliancesFeatures: "",
  unitNotes: "",
};

export default function UnitsSection() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [isAddUnitOpen, setIsAddUnitOpen] = useState(false);
  const [formData, setFormData] = useState(emptyUnit);

  function updateField(
    field: keyof Omit<Unit, "id">,
    value: string | UnitCondition
  ) {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function closeModal() {
    setIsAddUnitOpen(false);
    setFormData(emptyUnit);
  }

  function handleAddUnit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const newUnit: Unit = {
      id: crypto.randomUUID(),
      ...formData,
    };

    setUnits((prev) => [...prev, newUnit]);
    closeModal();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Units</h2>
          <p className="mt-1 text-sm text-slate-500">
            Track rent, rehab, and condition by unit.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddUnitOpen(true)}
          className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          + Add Unit
        </button>
      </div>

      {units.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <p className="text-sm font-medium text-slate-700">
            No units added yet.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Click “+ Add Unit” to add rent, rehab, and unit details.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {units.map((unit) => (
            <div
              key={unit.id}
              className="rounded-xl border border-slate-200 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-slate-950">
                    Unit {unit.unitNumber || "Unnamed"}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {unit.bedrooms || "0"} bed / {unit.fullBaths || "0"} bath
                    {unit.squareFeet ? ` • ${unit.squareFeet} sq ft` : ""}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-950">
                    ${unit.currentRent || "0"}
                  </p>
                  <p className="text-xs text-slate-500">Current Rent</p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 text-sm md:grid-cols-4">
                <UnitDetail label="Projected Rent" value={unit.projectedRent} />
                <UnitDetail label="FMR Rent" value={unit.fmrRent} />
                <UnitDetail label="Condition" value={unit.condition} />
                <UnitDetail
                  label="Rehab Estimate"
                  value={unit.rehabEstimate}
                />
              </div>

              {unit.unitNotes && (
                <p className="mt-4 text-sm text-slate-600">{unit.unitNotes}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {isAddUnitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">
                  Add Unit
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Track rent, rehab, and condition by unit.
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="rounded-md px-2 text-2xl leading-none text-slate-400 hover:text-slate-700"
                aria-label="Close add unit modal"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleAddUnit}>
              <div className="grid gap-x-6 gap-y-5 md:grid-cols-3">
                <FormInput
                  label="Unit Number"
                  value={formData.unitNumber}
                  onChange={(value) => updateField("unitNumber", value)}
                />

                <FormInput
                  label="Floor"
                  value={formData.floor}
                  onChange={(value) => updateField("floor", value)}
                />

                <FormInput
                  label="Sq Ft"
                  value={formData.squareFeet}
                  onChange={(value) => updateField("squareFeet", value)}
                />

                <FormInput
                  label="Rooms"
                  value={formData.rooms}
                  onChange={(value) => updateField("rooms", value)}
                />

                <FormInput
                  label="Bedrooms"
                  value={formData.bedrooms}
                  onChange={(value) => updateField("bedrooms", value)}
                />

                <FormInput
                  label="Full Baths"
                  value={formData.fullBaths}
                  onChange={(value) => updateField("fullBaths", value)}
                />

                <FormInput
                  label="Half Baths"
                  value={formData.halfBaths}
                  onChange={(value) => updateField("halfBaths", value)}
                />

                <FormInput
                  label="Current Rent"
                  value={formData.currentRent}
                  onChange={(value) => updateField("currentRent", value)}
                />

                <FormInput
                  label="Projected Rent"
                  value={formData.projectedRent}
                  onChange={(value) => updateField("projectedRent", value)}
                />

                <FormInput
                  label="FMR Rent"
                  value={formData.fmrRent}
                  onChange={(value) => updateField("fmrRent", value)}
                />

                <FormInput
                  label="Lease Expiration"
                  value={formData.leaseExpiration}
                  onChange={(value) => updateField("leaseExpiration", value)}
                  placeholder="12/26"
                />

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-800">
                    Condition
                  </label>
                  <select
                    value={formData.condition}
                    onChange={(e) =>
                      updateField("condition", e.target.value as UnitCondition)
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
                  >
                    <option value="Unknown">Unknown</option>
                    <option value="Excellent">Excellent</option>
                    <option value="Good">Good</option>
                    <option value="Average">Average</option>
                    <option value="Needs Work">Needs Work</option>
                    <option value="Poor">Poor</option>
                  </select>
                </div>

                <FormInput
                  label="Rehab Estimate"
                  value={formData.rehabEstimate}
                  onChange={(value) => updateField("rehabEstimate", value)}
                />

                <div className="md:col-span-3">
                  <FormInput
                    label="Tenant Pays"
                    value={formData.tenantPays}
                    onChange={(value) => updateField("tenantPays", value)}
                    placeholder="Electric, Gas, Heat"
                  />
                </div>

                <div className="md:col-span-3">
                  <FormInput
                    label="Appliances / Features"
                    value={formData.appliancesFeatures}
                    onChange={(value) =>
                      updateField("appliancesFeatures", value)
                    }
                    placeholder="Stove, Refrigerator, Dishwasher, Hardwood Floors"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-800">
                    Unit Notes
                  </label>
                  <textarea
                    value={formData.unitNotes}
                    onChange={(e) =>
                      updateField("unitNotes", e.target.value)
                    }
                    placeholder="Kitchen needs work, bath is updated, floors need refinishing..."
                    rows={4}
                    className="w-full resize-none rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center gap-3 border-t border-slate-200 pt-5">
                <button
                  type="submit"
                  className="rounded-md bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Add Unit
                </button>

                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-800">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
      />
    </div>
  );
}

function UnitDetail({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm text-slate-900">{value || "—"}</p>
    </div>
  );
}