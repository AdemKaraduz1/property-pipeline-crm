export const ADDITIONAL_INCOME_ITEMS = [
  {
    id: "laundry",
    label: "Laundry",
    description: "Coin-op or card-based laundry machines",
  },
  {
    id: "parking_garage",
    label: "Parking / Garage",
    description: "Reserved parking spots, garage spaces, or covered parking",
  },
  {
    id: "other",
    label: "Other Income",
    description: "Anything else not listed above",
  },
] as const;

export function getAdditionalIncomeTotal(
  items: Record<string, unknown>,
): number {
  return ADDITIONAL_INCOME_ITEMS.reduce((sum, item) => {
    const value = Number(items[item.id]);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}
