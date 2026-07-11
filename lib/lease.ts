export const MONTH_TO_MONTH_LABEL = "Month-to-Month";

const MONTH_TO_MONTH_ALIASES = new Set([
  "month-to-month",
  "month to month",
  "mtm",
  "m/m",
]);

export function isMonthToMonth(
  leaseExpiration: string | null | undefined,
): boolean {
  if (typeof leaseExpiration !== "string") return false;

  return MONTH_TO_MONTH_ALIASES.has(leaseExpiration.trim().toLowerCase());
}
