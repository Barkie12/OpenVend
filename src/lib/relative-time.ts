const RELATIVE_UNITS: readonly { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: "year", ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: "month", ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: "week", ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: "day", ms: 24 * 60 * 60 * 1000 },
  { unit: "hour", ms: 60 * 60 * 1000 },
  { unit: "minute", ms: 60 * 1000 },
];

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "always" });

/** "4 days ago", "2 weeks ago" — SellAuth-style relative timestamps. */
export function formatRelativeTime(date: Date, now: Date): string {
  const elapsedMs = now.getTime() - date.getTime();
  for (const { unit, ms } of RELATIVE_UNITS) {
    if (Math.abs(elapsedMs) >= ms) {
      return relativeFormatter.format(-Math.round(elapsedMs / ms), unit);
    }
  }
  return "just now";
}

/** Relative time against the current clock; kept out of component bodies for render purity. */
export function timeAgo(date: Date): string {
  return formatRelativeTime(date, new Date());
}
