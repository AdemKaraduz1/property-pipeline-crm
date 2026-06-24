type DealScoreCardProps = {
  askingPrice: number | null;
  projectedMonthlyRent: number;
  totalRehab: number;
  condition: string | null;
  tags: string[];
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function getDealRating(score: number) {
  if (score >= 80) return "Strong Deal";
  if (score >= 65) return "Worth Reviewing";
  if (score >= 50) return "Needs Caution";
  return "Weak Deal";
}

export function DealScoreCard({
  askingPrice,
  projectedMonthlyRent,
  totalRehab,
  condition,
  tags,
}: DealScoreCardProps) {
  const price = Number(askingPrice || 0);
  const annualRent = projectedMonthlyRent * 12;

  let score = 50;
  const reasons: string[] = [];

  const rentToPriceRatio = price > 0 ? annualRent / price : 0;

  if (rentToPriceRatio >= 0.12) {
    score += 20;
    reasons.push("Strong rent-to-price ratio");
  } else if (rentToPriceRatio >= 0.09) {
    score += 10;
    reasons.push("Decent rent-to-price ratio");
  } else if (price > 0) {
    score -= 10;
    reasons.push("Weak rent-to-price ratio");
  }

  if (totalRehab <= 25000) {
    score += 10;
    reasons.push("Lower rehab estimate");
  } else if (totalRehab <= 75000) {
    reasons.push("Moderate rehab estimate");
  } else {
    score -= 15;
    reasons.push("High rehab estimate");
  }

  if (condition === "turnkey") {
    score += 10;
    reasons.push("Turnkey condition");
  }

  if (condition === "light_rehab") {
    score += 5;
    reasons.push("Light rehab condition");
  }

  if (condition === "heavy_rehab" || condition === "gut_rehab") {
    score -= 10;
    reasons.push("Higher condition risk");
  }

  if (tags.includes("Mobility Area")) {
    score += 10;
    reasons.push("Tagged as Mobility Area");
  }

  if (tags.includes("Strong Rent Potential")) {
    score += 10;
    reasons.push("Tagged as Strong Rent Potential");
  }

  if (tags.includes("High Rehab Risk")) {
    score -= 15;
    reasons.push("Tagged as High Rehab Risk");
  }

  if (tags.includes("Good Section 8 Candidate")) {
    score += 5;
    reasons.push("Good Section 8 candidate");
  }

  score = Math.max(0, Math.min(100, score));

  const rating = getDealRating(score);

  return (
    <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Deal Score</h3>
          <p className="text-sm text-slate-500">
            Quick scoring based on rent, price, rehab, condition, and tags.
          </p>
        </div>

        <div className="text-right">
          <p className="text-4xl font-bold text-slate-950">{score}</p>
          <p className="text-sm font-semibold text-slate-600">{rating}</p>
        </div>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Annual Rent
          </p>
          <p className="text-lg font-bold text-slate-950">
            {formatCurrency(annualRent)}
          </p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Rent / Price
          </p>
          <p className="text-lg font-bold text-slate-950">
            {price > 0 ? `${(rentToPriceRatio * 100).toFixed(1)}%` : "N/A"}
          </p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Rehab
          </p>
          <p className="text-lg font-bold text-slate-950">
            {formatCurrency(totalRehab)}
          </p>
        </div>
      </div>

      {reasons.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">
            Score Factors
          </p>

          <div className="flex flex-wrap gap-2">
            {reasons.map((reason) => (
              <span
                key={reason}
                className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs text-slate-700"
              >
                {reason}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}