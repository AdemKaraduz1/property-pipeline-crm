const FMR_2026_CHICAGO: Record<number, number> = {
  0: 1480,
  1: 1581,
  2: 1781,
  3: 2294,
  4: 2653,
};

function normalizeBedroomCount(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const bedrooms = Number(value);

  if (!Number.isFinite(bedrooms)) return null;

  return Math.max(0, Math.round(bedrooms));
}

export function calculateChicagoFmr(
  bedroomValue: unknown,
  isMobilityArea: boolean,
) {
  const bedrooms = normalizeBedroomCount(bedroomValue);
  let baseFmrRent: number | null = null;

  if (bedrooms !== null) {
    baseFmrRent =
      bedrooms <= 4
        ? (FMR_2026_CHICAGO[bedrooms] ?? null)
        : Math.round(
            FMR_2026_CHICAGO[4] * (1 + 0.15 * (bedrooms - 4)),
          );
  }

  const mobilityFmrRent =
    baseFmrRent === null ? null : Math.round(baseFmrRent * 1.5);

  return {
    bedrooms,
    baseFmrRent,
    mobilityFmrRent,
    appliedFmrRent: isMobilityArea ? mobilityFmrRent : baseFmrRent,
  };
}
