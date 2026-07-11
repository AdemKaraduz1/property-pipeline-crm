"use client";

import { useState } from "react";
import { isMonthToMonth } from "@/lib/lease";

type UnitLeaseExpirationFieldProps = {
  formId: string;
  unitId: string;
  leaseExpiration: string | null | undefined;
  inputClassName: string;
  wrapCheckboxInLabel?: boolean;
};

function formatDateValue(value: string | null | undefined) {
  if (!value || isMonthToMonth(value)) return "";
  return String(value).slice(0, 10);
}

export function UnitLeaseExpirationField({
  formId,
  unitId,
  leaseExpiration,
  inputClassName,
  wrapCheckboxInLabel = true,
}: UnitLeaseExpirationFieldProps) {
  const [isMtm, setIsMtm] = useState(() => isMonthToMonth(leaseExpiration));
  const [dateValue, setDateValue] = useState(() =>
    formatDateValue(leaseExpiration),
  );

  const CheckboxWrapper = wrapCheckboxInLabel ? "label" : "span";

  return (
    <>
      <input
        form={formId}
        name={`${unitId}__lease_expiration`}
        type="date"
        value={dateValue}
        onChange={(event) => setDateValue(event.target.value)}
        disabled={isMtm}
        className={inputClassName}
        aria-label="Lease expiration"
      />
      <CheckboxWrapper className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-600">
        <input
          form={formId}
          name={`${unitId}__lease_mtm`}
          type="checkbox"
          checked={isMtm}
          onChange={(event) => {
            const checked = event.target.checked;
            setIsMtm(checked);
            if (checked) setDateValue("");
          }}
          className="h-3.5 w-3.5 rounded border-slate-300"
          aria-label="Month-to-month lease"
        />
        Month-to-month
      </CheckboxWrapper>
    </>
  );
}
