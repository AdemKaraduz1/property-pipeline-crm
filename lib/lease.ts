export const MONTH_TO_MONTH_LABEL = "Month-to-Month";

export function isMonthToMonth(
  leaseExpiration: string | null | undefined,
): boolean {
  return (
    typeof leaseExpiration === "string" &&
    leaseExpiration.trim().toLowerCase() === MONTH_TO_MONTH_LABEL.toLowerCase()
  );
}
