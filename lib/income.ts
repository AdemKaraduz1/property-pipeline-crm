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
    id: "storage",
    label: "Storage",
    description: "Basement, attic, or dedicated storage unit rental",
  },
  {
    id: "pet_rent",
    label: "Pet Rent / Fees",
    description: "Recurring pet rent or pet fees",
  },
  {
    id: "application_admin_fees",
    label: "Application / Admin Fees",
    description: "Tenant application, admin, or move-in fees",
  },
  {
    id: "late_fees",
    label: "Late Fees",
    description: "Recurring late payment fees",
  },
  {
    id: "vending",
    label: "Vending / Other Machines",
    description: "Vending, ATM, or other coin-op income",
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
