import { createHash } from "node:crypto";

import { and, count, countDistinct, desc, eq, gte, lt, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { env } from "@/lib/env";
import type { RequestContext } from "@/lib/fraud";
import {
  DAY_MS,
  changePercent,
  fillSeries,
  floorToBucket,
  resolveWindow,
  type DashboardRange,
  type SeriesPoint,
} from "@/lib/time-buckets";

const LIVE_WINDOW_MS = 5 * 60 * 1000;
const BREAKDOWN_LIMIT = 6;
const MAX_PATH_LENGTH = 200;
const MAX_UTM_LENGTH = 100;

const BOT_UA_PATTERN = /bot|crawler|spider|crawling|preview|headless|lighthouse|monitor|curl|wget/i;

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

export function parseBrowser(userAgent: string): string {
  if (/edg\//i.test(userAgent)) return "Edge";
  if (/opr\/|opera/i.test(userAgent)) return "Opera";
  if (/firefox\//i.test(userAgent)) return "Firefox";
  if (/chrome\/|crios\//i.test(userAgent)) return "Chrome";
  if (/safari\//i.test(userAgent)) return "Safari";
  return "Other";
}

export function parseOs(userAgent: string): string {
  if (/windows/i.test(userAgent)) return "Windows";
  if (/android/i.test(userAgent)) return "Android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "iOS";
  if (/mac os/i.test(userAgent)) return "macOS";
  if (/linux/i.test(userAgent)) return "Linux";
  return "Other";
}

function parseDevice(userAgent: string): string {
  if (/ipad|tablet/i.test(userAgent)) return "Tablet";
  if (/mobi|iphone|android.*mobile/i.test(userAgent)) return "Mobile";
  return "Desktop";
}

/** Plausible-style anonymous visitor id: rotates daily, never stores the raw IP. */
function visitorHash(context: RequestContext): string {
  const today = new Date().toISOString().slice(0, 10);
  return createHash("sha256")
    .update(`${env().APP_SECRET}:${context.ipAddress ?? "unknown"}:${context.userAgent ?? ""}:${today}`)
    .digest("hex")
    .slice(0, 32);
}

function referrerHost(referrer: string | null, appUrl: string): string | null {
  if (!referrer) {
    return null;
  }
  try {
    const referrerUrl = new URL(referrer);
    const ownHost = new URL(appUrl).host;
    return referrerUrl.host === ownHost ? null : referrerUrl.host;
  } catch {
    return null;
  }
}

export interface PageViewInput {
  path: string;
  sessionId: string;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  context: RequestContext;
}

function cleanUtm(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim().slice(0, MAX_UTM_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

/** Records a storefront pageview; silently ignores bots and non-trackable paths. */
export async function recordPageView(input: PageViewInput): Promise<void> {
  const userAgent = input.context.userAgent ?? "";
  if (BOT_UA_PATTERN.test(userAgent)) {
    return;
  }
  if (!input.path.startsWith("/") || input.path.startsWith("/order") || input.path.startsWith("/admin")) {
    return;
  }

  const shopRows = await getDb().select({ id: schema.shops.id }).from(schema.shops).limit(1);
  const shop = shopRows[0];
  if (!shop) {
    return;
  }

  await getDb().insert(schema.pageViews).values({
    shopId: shop.id,
    path: input.path.slice(0, MAX_PATH_LENGTH),
    visitorId: visitorHash(input.context),
    sessionId: input.sessionId.slice(0, 64),
    referrerHost: referrerHost(input.referrer, env().APP_URL),
    utmSource: cleanUtm(input.utmSource),
    utmMedium: cleanUtm(input.utmMedium),
    utmCampaign: cleanUtm(input.utmCampaign),
    country: input.context.country,
    browser: parseBrowser(userAgent),
    os: parseOs(userAgent),
    device: parseDevice(userAgent),
  });
}

export async function getLiveVisitorCount(): Promise<number> {
  const since = new Date(Date.now() - LIVE_WINDOW_MS);
  const rows = await getDb()
    .select({ liveSessions: countDistinct(schema.pageViews.sessionId) })
    .from(schema.pageViews)
    .where(gte(schema.pageViews.createdAt, since));
  return rows[0]?.liveSessions ?? 0;
}

const RETENTION_DAYS = 180;

/** Prunes pageviews older than the retention window; called from the startup loop. */
export async function prunePageViews(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS);
  await getDb().delete(schema.pageViews).where(lt(schema.pageViews.createdAt, cutoff));
}

// ---------------------------------------------------------------------------
// Dashboard queries
// ---------------------------------------------------------------------------

export interface TrafficStat {
  current: number;
  changePercent: number | null;
}

export interface BreakdownEntry {
  label: string;
  hits: number;
  sharePercent: number;
}

export interface TrafficData {
  pageviews: TrafficStat;
  visitors: TrafficStat;
  visits: TrafficStat;
  /** Percentage of sessions with a single pageview. */
  bounceRatePercent: TrafficStat;
  avgSessionSeconds: TrafficStat;
  /** Delivered orders per session, as a percentage. */
  conversionRatePercent: TrafficStat;
  pageviewsSeries: SeriesPoint[];
  sessionsSeries: SeriesPoint[];
  topPages: BreakdownEntry[];
  topSources: BreakdownEntry[];
  topBrowsers: BreakdownEntry[];
  topCountries: BreakdownEntry[];
  utmCampaigns: BreakdownEntry[];
}

interface TrafficTotals {
  pageviews: number;
  visitors: number;
  visits: number;
  bounceRatePercent: number;
  avgSessionSeconds: number;
  conversionRatePercent: number;
}

async function trafficTotals(start: Date, end: Date): Promise<TrafficTotals> {
  const db = getDb();
  const inWindow = and(gte(schema.pageViews.createdAt, start), lt(schema.pageViews.createdAt, end));

  const [countsRows, sessionRows, orderRows] = await Promise.all([
    db
      .select({
        pageviews: count(),
        visitors: countDistinct(schema.pageViews.visitorId),
        visits: countDistinct(schema.pageViews.sessionId),
      })
      .from(schema.pageViews)
      .where(inWindow),
    db
      .select({
        views: count(),
        durationSeconds: sql<string>`extract(epoch from (max(${schema.pageViews.createdAt}) - min(${schema.pageViews.createdAt})))`,
      })
      .from(schema.pageViews)
      .where(inWindow)
      .groupBy(schema.pageViews.sessionId),
    db
      .select({ deliveredOrders: count() })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.status, "delivered"),
          gte(schema.orders.paidAt, start),
          lt(schema.orders.paidAt, end),
        ),
      ),
  ]);

  const counts = countsRows[0] ?? { pageviews: 0, visitors: 0, visits: 0 };
  const sessionCount = sessionRows.length;
  const bouncedSessions = sessionRows.filter((session) => session.views === 1).length;
  const totalDurationSeconds = sessionRows.reduce(
    (sum, session) => sum + Number(session.durationSeconds ?? "0"),
    0,
  );
  const deliveredOrders = orderRows[0]?.deliveredOrders ?? 0;

  return {
    pageviews: counts.pageviews,
    visitors: counts.visitors,
    visits: counts.visits,
    bounceRatePercent: sessionCount === 0 ? 0 : (bouncedSessions / sessionCount) * 100,
    avgSessionSeconds: sessionCount === 0 ? 0 : totalDurationSeconds / sessionCount,
    conversionRatePercent: counts.visits === 0 ? 0 : (deliveredOrders / counts.visits) * 100,
  };
}

async function breakdown(
  start: Date,
  end: Date,
  dimension: "path" | "referrerHost" | "browser" | "country" | "utmCampaign",
): Promise<BreakdownEntry[]> {
  const column = schema.pageViews[dimension];
  const rows = await getDb()
    .select({ label: column, hits: count() })
    .from(schema.pageViews)
    .where(
      and(
        gte(schema.pageViews.createdAt, start),
        lt(schema.pageViews.createdAt, end),
        sql`${column} is not null`,
      ),
    )
    .groupBy(column)
    .orderBy(desc(count()))
    .limit(BREAKDOWN_LIMIT);

  const totalHits = rows.reduce((sum, row) => sum + row.hits, 0);
  return rows
    .filter((row): row is { label: string; hits: number } => row.label !== null)
    .map((row) => ({
      label: row.label,
      hits: row.hits,
      sharePercent: totalHits === 0 ? 0 : (row.hits / totalHits) * 100,
    }));
}

export async function getTrafficData(range: DashboardRange): Promise<TrafficData> {
  const db = getDb();

  let fallbackStart = new Date(Date.now() - 30 * DAY_MS);
  if (range === "all") {
    const earliestRows = await db
      .select({ createdAt: schema.pageViews.createdAt })
      .from(schema.pageViews)
      .orderBy(schema.pageViews.createdAt)
      .limit(1);
    fallbackStart = earliestRows[0]?.createdAt ?? fallbackStart;
  }
  const window = resolveWindow(range, fallbackStart);

  const [currentTotals, previousTotals, viewRows, pagesBreakdown, sourcesBreakdown, browsersBreakdown, countriesBreakdown, utmBreakdown] =
    await Promise.all([
      trafficTotals(window.start, window.end),
      window.previousStart === null
        ? Promise.resolve<TrafficTotals | null>(null)
        : trafficTotals(window.previousStart, window.start),
      db
        .select({ createdAt: schema.pageViews.createdAt, sessionId: schema.pageViews.sessionId })
        .from(schema.pageViews)
        .where(and(gte(schema.pageViews.createdAt, window.start), lt(schema.pageViews.createdAt, window.end))),
      breakdown(window.start, window.end, "path"),
      breakdown(window.start, window.end, "referrerHost"),
      breakdown(window.start, window.end, "browser"),
      breakdown(window.start, window.end, "country"),
      breakdown(window.start, window.end, "utmCampaign"),
    ]);

  const pageviewsByBucket = new Map<number, number>();
  const sessionsByBucket = new Map<number, Set<string>>();
  for (const viewRow of viewRows) {
    const bucketKey = floorToBucket(viewRow.createdAt, window.bucketUnit).getTime();
    pageviewsByBucket.set(bucketKey, (pageviewsByBucket.get(bucketKey) ?? 0) + 1);
    const bucketSessions = sessionsByBucket.get(bucketKey) ?? new Set<string>();
    bucketSessions.add(viewRow.sessionId);
    sessionsByBucket.set(bucketKey, bucketSessions);
  }
  const sessionCountsByBucket = new Map<number, number>(
    [...sessionsByBucket.entries()].map(([bucketKey, sessions]) => [bucketKey, sessions.size]),
  );

  function stat(selector: (totals: TrafficTotals) => number): TrafficStat {
    return {
      current: selector(currentTotals),
      changePercent: changePercent(
        selector(currentTotals),
        previousTotals === null ? null : selector(previousTotals),
      ),
    };
  }

  return {
    pageviews: stat((totals) => totals.pageviews),
    visitors: stat((totals) => totals.visitors),
    visits: stat((totals) => totals.visits),
    bounceRatePercent: stat((totals) => totals.bounceRatePercent),
    avgSessionSeconds: stat((totals) => totals.avgSessionSeconds),
    conversionRatePercent: stat((totals) => totals.conversionRatePercent),
    pageviewsSeries: fillSeries(pageviewsByBucket, window),
    sessionsSeries: fillSeries(sessionCountsByBucket, window),
    topPages: pagesBreakdown,
    topSources: sourcesBreakdown,
    topBrowsers: browsersBreakdown,
    topCountries: countriesBreakdown,
    utmCampaigns: utmBreakdown,
  };
}
