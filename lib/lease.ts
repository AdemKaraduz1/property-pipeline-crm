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

// Month-to-month leases can end on 30 days' notice, so turnover planning
// defaults to a conservative 2-month runway from today rather than the
// deal's plan start date.
export function getMonthToMonthTurnoverDate(referenceDate = new Date()): string {
  const turnover = new Date(referenceDate);
  turnover.setMonth(turnover.getMonth() + 2);
  return turnover.toISOString().slice(0, 10);
}
