"use client";

type MetricStatus = "good" | "caution" | "bad";

const statusFill: Record<MetricStatus, string> = {
  good: "#16a34a",
  caution: "#d97706",
  bad: "#dc2626",
};

function formatCurrencyCompact(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 1000) {
    return `${sign}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  }

  return `${sign}$${Math.round(abs)}`;
}

type DscrScenario = {
  label: string;
  sublabel?: string;
  dscr: number | null;
};

type DscrStressChartProps = {
  scenarios: DscrScenario[];
  lenderMinDscr: number;
};

export function DscrStressChart({
  scenarios,
  lenderMinDscr,
}: DscrStressChartProps) {
  const width = 480;
  const height = 200;
  const paddingLeft = 34;
  const paddingRight = 12;
  const paddingTop = 22;
  const paddingBottom = 34;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const finiteValues = scenarios
    .map((scenario) => scenario.dscr)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const maxValue = Math.max(lenderMinDscr, ...finiteValues, 0.1) * 1.2;

  function yFor(value: number) {
    return paddingTop + plotHeight - (value / maxValue) * plotHeight;
  }

  function getStatus(dscr: number): MetricStatus {
    if (dscr >= lenderMinDscr + 0.1) return "good";
    if (dscr >= lenderMinDscr) return "caution";
    return "bad";
  }

  const barCount = scenarios.length;
  const barGap = 14;
  const barWidth = (plotWidth - barGap * (barCount - 1)) / barCount;
  const lenderLineY = yFor(lenderMinDscr);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label={`DSCR by scenario, compared against a ${lenderMinDscr.toFixed(2)}x lender minimum`}
    >
      <line
        x1={paddingLeft}
        y1={lenderLineY}
        x2={width - paddingRight}
        y2={lenderLineY}
        stroke="#94a3b8"
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      <text
        x={width - paddingRight}
        y={lenderLineY - 5}
        textAnchor="end"
        fontSize={9.5}
        fontWeight={600}
        fill="#475569"
      >
        {`Lender min ${lenderMinDscr.toFixed(2)}x`}
      </text>

      <line
        x1={paddingLeft}
        y1={paddingTop + plotHeight}
        x2={width - paddingRight}
        y2={paddingTop + plotHeight}
        stroke="#cbd5e1"
        strokeWidth={1}
      />

      {scenarios.map((scenario, index) => {
        const x = paddingLeft + index * (barWidth + barGap);
        const centerX = x + barWidth / 2;

        if (scenario.dscr === null || !Number.isFinite(scenario.dscr)) {
          return (
            <g key={scenario.label}>
              <text
                x={centerX}
                y={paddingTop + plotHeight / 2}
                textAnchor="middle"
                fontSize={10}
                fill="#94a3b8"
              >
                N/A
              </text>
              <text
                x={centerX}
                y={paddingTop + plotHeight + 16}
                textAnchor="middle"
                fontSize={9.5}
                fontWeight={600}
                fill="#334155"
              >
                {scenario.label}
              </text>
            </g>
          );
        }

        const value = Math.max(0, scenario.dscr);
        const barY = yFor(value);
        const barHeight = Math.max(1, paddingTop + plotHeight - barY);
        const status = getStatus(scenario.dscr);

        return (
          <g key={scenario.label}>
            <rect
              x={x}
              y={barY}
              width={barWidth}
              height={barHeight}
              rx={3}
              fill={statusFill[status]}
            />
            <text
              x={centerX}
              y={barY - 6}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill="#0f172a"
            >
              {`${scenario.dscr.toFixed(2)}x`}
            </text>
            <text
              x={centerX}
              y={paddingTop + plotHeight + 16}
              textAnchor="middle"
              fontSize={9.5}
              fontWeight={600}
              fill="#334155"
            >
              {scenario.label}
            </text>
            {scenario.sublabel && (
              <text
                x={centerX}
                y={paddingTop + plotHeight + 27}
                textAnchor="middle"
                fontSize={8}
                fill="#94a3b8"
              >
                {scenario.sublabel}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

type BridgeItem =
  | { label: string; type: "total"; value: number }
  | { label: string; type: "delta"; value: number };

type NoiCashFlowBridgeProps = {
  items: BridgeItem[];
};

export function NoiCashFlowBridge({ items }: NoiCashFlowBridgeProps) {
  const width = 560;
  const height = 220;
  const paddingLeft = 12;
  const paddingRight = 12;
  const paddingTop = 26;
  const paddingBottom = 44;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const { bars } = items.reduce<{
    runningTotal: number;
    bars: {
      label: string;
      from: number;
      to: number;
      delta: number | null;
      isTotal: boolean;
    }[];
  }>(
    (acc, item) => {
      if (item.type === "total") {
        const runningTotal = item.value;

        return {
          runningTotal,
          bars: [
            ...acc.bars,
            {
              label: item.label,
              from: 0,
              to: runningTotal,
              delta: null,
              isTotal: true,
            },
          ],
        };
      }

      const from = acc.runningTotal;
      const runningTotal = from + item.value;

      return {
        runningTotal,
        bars: [
          ...acc.bars,
          {
            label: item.label,
            from: Math.min(from, runningTotal),
            to: Math.max(from, runningTotal),
            delta: item.value,
            isTotal: false,
          },
        ],
      };
    },
    { runningTotal: 0, bars: [] },
  );

  const allValues = bars.flatMap((bar) => [bar.from, bar.to]);
  const maxValue = Math.max(...allValues, 0);
  const minValue = Math.min(...allValues, 0);
  const valueRange = Math.max(1, maxValue - minValue);
  const headroom = valueRange * 0.12;
  const scaleMax = maxValue + headroom;
  const scaleMin = minValue - headroom;
  const scaleRange = scaleMax - scaleMin;

  function yFor(value: number) {
    return paddingTop + plotHeight - ((value - scaleMin) / scaleRange) * plotHeight;
  }

  const zeroY = yFor(0);
  const barCount = bars.length;
  const barGap = 10;
  const barWidth = (plotWidth - barGap * (barCount - 1)) / barCount;
  const finalBar = bars[bars.length - 1];
  const finalIsNegative = finalBar ? finalBar.to < 0 : false;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="Bridge from gross rent to cash flow"
    >
      <line
        x1={paddingLeft}
        y1={zeroY}
        x2={width - paddingRight}
        y2={zeroY}
        stroke="#cbd5e1"
        strokeWidth={1}
      />

      {bars.map((bar, index) => {
        const x = paddingLeft + index * (barWidth + barGap);
        const centerX = x + barWidth / 2;
        const barTop = yFor(Math.max(bar.from, bar.to));
        const barBottom = yFor(Math.min(bar.from, bar.to));
        const barHeight = Math.max(2, barBottom - barTop);
        const isLast = index === bars.length - 1;
        const fill = bar.isTotal
          ? isLast && finalIsNegative
            ? statusFill.bad
            : "#1d4ed8"
          : "#94a3b8";
        const displayValue = bar.isTotal ? bar.to : bar.delta ?? 0;
        const labelPrefix = !bar.isTotal && displayValue > 0 ? "+" : "";

        return (
          <g key={bar.label}>
            <rect
              x={x}
              y={barTop}
              width={barWidth}
              height={barHeight}
              rx={3}
              fill={fill}
            />
            <text
              x={centerX}
              y={barTop - 6}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fill="#0f172a"
            >
              {`${labelPrefix}${formatCurrencyCompact(displayValue)}`}
            </text>
            <text
              x={centerX}
              y={paddingTop + plotHeight + 16}
              textAnchor="middle"
              fontSize={9}
              fontWeight={600}
              fill="#334155"
            >
              {bar.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
