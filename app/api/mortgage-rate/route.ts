import { NextResponse } from "next/server";

const LOW_LTV_SERIES = "OBMMIC30YFLVLE80FGE740";
const HIGH_LTV_SERIES = "OBMMIC30YFLVGT80FGE740";
const INVESTMENT_PROPERTY_PREMIUM = 0.75;

type FredObservation = {
  date: string;
  rate: number;
};

async function getLatestFredObservation(
  seriesId: string,
): Promise<FredObservation> {
  const url = new URL("https://fred.stlouisfed.org/graph/fredgraph.csv");
  url.searchParams.set("id", seriesId);
  url.searchParams.set("cosd", "2025-01-01");

  const response = await fetch(url, {
    next: {
      revalidate: 86400,
      tags: [`mortgage-rate-${seriesId}`],
    },
  });

  if (!response.ok) {
    throw new Error(`FRED rate request failed with status ${response.status}.`);
  }

  const lines = (await response.text()).trim().split(/\r?\n/);

  for (let index = lines.length - 1; index >= 1; index -= 1) {
    const [date, rawRate] = lines[index].split(",");
    const rate = Number(rawRate);

    if (date && Number.isFinite(rate)) {
      return { date, rate };
    }
  }

  throw new Error("FRED did not return a usable mortgage rate.");
}

export async function GET() {
  try {
    const [lowLtv, highLtv] = await Promise.all([
      getLatestFredObservation(LOW_LTV_SERIES),
      getLatestFredObservation(HIGH_LTV_SERIES),
    ]);

    return NextResponse.json(
      {
        success: true,
        investmentPropertyPremium: INVESTMENT_PROPERTY_PREMIUM,
        lowLtv: {
          ltv: "80% or less",
          baseRate: lowLtv.rate,
          estimatedInvestmentRate:
            lowLtv.rate + INVESTMENT_PROPERTY_PREMIUM,
          observedAt: lowLtv.date,
          seriesId: LOW_LTV_SERIES,
        },
        highLtv: {
          ltv: "More than 80%",
          baseRate: highLtv.rate,
          estimatedInvestmentRate:
            highLtv.rate + INVESTMENT_PROPERTY_PREMIUM,
          observedAt: highLtv.date,
          seriesId: HIGH_LTV_SERIES,
        },
        source: "FRED / Optimal Blue Mortgage Market Indices",
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=86400, stale-while-revalidate=3600",
        },
      },
    );
  } catch (error) {
    console.error("Could not load daily mortgage rate:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Could not load the daily mortgage rate.",
      },
      { status: 502 },
    );
  }
}
