/** Shared local-time bucketing used by the revenue and traffic dashboards. */

export type BucketUnit = "hour" | "day";

export interface PeriodWindow {
  start: Date;
  end: Date;
  bucketUnit: BucketUnit;
  /** Equal-length window right before `start`; null when not comparable (all time). */
  previousStart: Date | null;
}

const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const DASHBOARD_RANGES = ["today", "7d", "30d", "all"] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export const DASHBOARD_RANGE_LABELS: Record<DashboardRange, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

export function isDashboardRange(value: string): value is DashboardRange {
  return (DASHBOARD_RANGES as readonly string[]).includes(value);
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function resolveWindow(range: DashboardRange, fallbackStart: Date): PeriodWindow {
  const now = new Date();
  switch (range) {
    case "today": {
      const start = startOfToday();
      return { start, end: now, bucketUnit: "hour", previousStart: new Date(start.getTime() - DAY_MS) };
    }
    case "7d": {
      const start = new Date(now.getTime() - 7 * DAY_MS);
      return { start, end: now, bucketUnit: "day", previousStart: new Date(start.getTime() - 7 * DAY_MS) };
    }
    case "30d": {
      const start = new Date(now.getTime() - 30 * DAY_MS);
      return { start, end: now, bucketUnit: "day", previousStart: new Date(start.getTime() - 30 * DAY_MS) };
    }
    case "all": {
      return { start: fallbackStart, end: now, bucketUnit: "day", previousStart: null };
    }
  }
}

export function bucketLabel(bucket: Date, unit: BucketUnit): string {
  if (unit === "hour") {
    return bucket.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return bucket.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Floors a date to its local bucket start. Used for both aggregation and iteration. */
export function floorToBucket(date: Date, unit: BucketUnit): Date {
  if (unit === "hour") {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours());
  }
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Advances by one bucket using date parts, which stays aligned across DST shifts. */
export function nextBucket(bucket: Date, unit: BucketUnit): Date {
  if (unit === "hour") {
    return new Date(bucket.getFullYear(), bucket.getMonth(), bucket.getDate(), bucket.getHours() + 1);
  }
  return new Date(bucket.getFullYear(), bucket.getMonth(), bucket.getDate() + 1);
}

export interface SeriesPoint {
  label: string;
  value: number;
}

/** Zero-fills a bucketed series across the window from pre-accumulated bucket values. */
export function fillSeries(valuesByBucket: Map<number, number>, window: PeriodWindow): SeriesPoint[] {
  const series: SeriesPoint[] = [];
  for (
    let cursor = floorToBucket(window.start, window.bucketUnit);
    cursor.getTime() <= window.end.getTime();
    cursor = nextBucket(cursor, window.bucketUnit)
  ) {
    series.push({
      label: bucketLabel(cursor, window.bucketUnit),
      value: valuesByBucket.get(cursor.getTime()) ?? 0,
    });
  }
  return series;
}

export function changePercent(current: number, previous: number | null): number | null {
  if (previous === null) {
    return null;
  }
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return ((current - previous) / previous) * 100;
}
