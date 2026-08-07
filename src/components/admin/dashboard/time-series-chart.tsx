"use client";

import { useId } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export interface ChartPoint {
  label: string;
  value: number;
}

interface TimeSeriesChartProps {
  points: ChartPoint[];
  seriesLabel: string;
  /** CSS color for the line and gradient, e.g. "var(--chart-1)". */
  color: string;
  kind: "money" | "count";
  currency: string;
}

const CHART_HEIGHT_CLASS = "h-56";
const X_AXIS_MIN_TICK_GAP = 32;

export function TimeSeriesChart({ points, seriesLabel, color, kind, currency }: TimeSeriesChartProps) {
  const gradientId = useId();

  const moneyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
  const formatValue = (value: number): string =>
    kind === "money" ? moneyFormatter.format(value) : String(value);

  const chartConfig: ChartConfig = {
    value: { label: seriesLabel, color },
  };

  return (
    <ChartContainer config={chartConfig} className={`${CHART_HEIGHT_CLASS} w-full`}>
      <AreaChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeOpacity={0.15} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={X_AXIS_MIN_TICK_GAP}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          allowDecimals={kind === "money"}
          tickFormatter={formatValue}
        />
        <ChartTooltip
          cursor={{ strokeOpacity: 0.2 }}
          content={<ChartTooltipContent formatter={(value) => formatValue(Number(value))} />}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--color-value)"
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 3 }}
        />
      </AreaChart>
    </ChartContainer>
  );
}
