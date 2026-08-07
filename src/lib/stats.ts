import { and, asc, count, countDistinct, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { formatRelativeTime } from "@/lib/relative-time";
import {
  DAY_MS,
  changePercent,
  fillSeries,
  floorToBucket,
  resolveWindow,
  type DashboardRange,
  type PeriodWindow,
  type SeriesPoint,
} from "@/lib/time-buckets";

export {
  DASHBOARD_RANGES,
  DASHBOARD_RANGE_LABELS,
  isDashboardRange,
  type DashboardRange,
  type SeriesPoint,
} from "@/lib/time-buckets";

const LEADERBOARD_LIMIT = 5;
const LATEST_ORDERS_LIMIT = 9;
const CENTS_PER_UNIT = 100;

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  stripe: "Stripe",
  nowpayments: "NOWPayments (crypto)",
  paypalff: "PayPal (F&F)",
  free: "Free (coupon)",
  manual: "Manual",
  unknown: "Unknown",
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

export interface StatWithChange {
  current: number;
  /** Percentage change vs the previous equal-length window; null when not comparable. */
  changePercent: number | null;
}

export interface LatestOrderEntry {
  id: string;
  productName: string;
  imagePath: string | null;
  paymentMethod: string;
  totalCents: number;
  currency: string;
  paidAgo: string;
}

export interface LeaderboardEntry {
  label: string;
  sublabel: string | null;
  imagePath: string | null;
  valueCents: number | null;
  valueCount: number | null;
}

export interface DashboardData {
  revenue: StatWithChange;
  orders: StatWithChange;
  customers: StatWithChange;
  avgOrderValueCents: StatWithChange;
  revenueSeries: SeriesPoint[];
  ordersSeries: SeriesPoint[];
  latestOrders: LatestOrderEntry[];
  bestSellers: LeaderboardEntry[];
  topSpenders: LeaderboardEntry[];
  paymentMethods: LeaderboardEntry[];
  needsReviewCount: number;
}

interface PeriodTotals {
  revenueCents: number;
  orderCount: number;
  customerCount: number;
}

async function periodTotals(start: Date, end: Date): Promise<PeriodTotals> {
  const rows = await getDb()
    .select({
      revenueCents: sql<string>`coalesce(sum(${schema.orders.totalCents}), 0)`,
      orderCount: count(),
      customerCount: countDistinct(schema.orders.email),
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.status, "delivered"),
        gte(schema.orders.paidAt, start),
        lt(schema.orders.paidAt, end),
      ),
    );
  const row = rows[0];
  return {
    revenueCents: Number(row?.revenueCents ?? "0"),
    orderCount: row?.orderCount ?? 0,
    customerCount: row?.customerCount ?? 0,
  };
}

interface PaidOrderRow {
  paidAt: Date | null;
  totalCents: number;
}

/** Buckets delivered orders client-side so aggregation and axis stay provably aligned. */
function buildSeries(
  rows: PaidOrderRow[],
  window: PeriodWindow,
): { revenueSeries: SeriesPoint[]; ordersSeries: SeriesPoint[] } {
  const revenueByBucket = new Map<number, number>();
  const ordersByBucket = new Map<number, number>();
  for (const row of rows) {
    if (row.paidAt === null) {
      continue;
    }
    const bucketKey = floorToBucket(row.paidAt, window.bucketUnit).getTime();
    revenueByBucket.set(
      bucketKey,
      (revenueByBucket.get(bucketKey) ?? 0) + row.totalCents / CENTS_PER_UNIT,
    );
    ordersByBucket.set(bucketKey, (ordersByBucket.get(bucketKey) ?? 0) + 1);
  }
  return {
    revenueSeries: fillSeries(revenueByBucket, window),
    ordersSeries: fillSeries(ordersByBucket, window),
  };
}

export async function getDashboardData(range: DashboardRange): Promise<DashboardData> {
  const db = getDb();

  let fallbackStart = new Date(Date.now() - 30 * DAY_MS);
  if (range === "all") {
    // Anchor "all time" to the first sale (orders can predate the shop row,
    // e.g. imported or seeded history).
    const earliestRows = await db
      .select({ paidAt: schema.orders.paidAt })
      .from(schema.orders)
      .where(and(eq(schema.orders.status, "delivered"), isNotNull(schema.orders.paidAt)))
      .orderBy(asc(schema.orders.paidAt))
      .limit(1);
    const shopRows = await db.select({ createdAt: schema.shops.createdAt }).from(schema.shops).limit(1);
    fallbackStart = earliestRows[0]?.paidAt ?? shopRows[0]?.createdAt ?? fallbackStart;
  }
  const window = resolveWindow(range, fallbackStart);

  const deliveredInWindow = and(
    eq(schema.orders.status, "delivered"),
    gte(schema.orders.paidAt, window.start),
    lt(schema.orders.paidAt, window.end),
  );

  const [
    currentTotals,
    previousTotals,
    paidOrderRows,
    latestOrderRows,
    bestSellerRows,
    topSpenderRows,
    methodRows,
    reviewRows,
  ] = await Promise.all([
    periodTotals(window.start, window.end),
    window.previousStart === null
      ? Promise.resolve<PeriodTotals | null>(null)
      : periodTotals(window.previousStart, window.start),
    db
      .select({ paidAt: schema.orders.paidAt, totalCents: schema.orders.totalCents })
      .from(schema.orders)
      .where(deliveredInWindow),
    db.query.orders.findMany({
      where: eq(schema.orders.status, "delivered"),
      with: { items: { with: { product: true } } },
      orderBy: [desc(schema.orders.paidAt)],
      limit: LATEST_ORDERS_LIMIT,
    }),
    db
      .select({
        productName: schema.orderItems.productName,
        unitsSold: sql<string>`sum(${schema.orderItems.quantity})`,
        revenueCents: sql<string>`sum(${schema.orderItems.quantity} * ${schema.orderItems.unitPriceCents})`,
        imagePath: sql<string | null>`max(${schema.products.images}->>0)`,
      })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
      .leftJoin(schema.products, eq(schema.orderItems.productId, schema.products.id))
      .where(deliveredInWindow)
      .groupBy(schema.orderItems.productName)
      .orderBy(desc(sql`sum(${schema.orderItems.quantity} * ${schema.orderItems.unitPriceCents})`))
      .limit(LEADERBOARD_LIMIT),
    db
      .select({
        email: schema.orders.email,
        orderCount: count(),
        totalSpentCents: sql<string>`sum(${schema.orders.totalCents})`,
      })
      .from(schema.orders)
      .where(deliveredInWindow)
      .groupBy(schema.orders.email)
      .orderBy(desc(sql`sum(${schema.orders.totalCents})`))
      .limit(LEADERBOARD_LIMIT),
    db
      .select({
        method: sql<string>`coalesce(${schema.orders.paymentProvider}, 'unknown')`,
        orderCount: count(),
        revenueCents: sql<string>`sum(${schema.orders.totalCents})`,
      })
      .from(schema.orders)
      .where(deliveredInWindow)
      .groupBy(sql`coalesce(${schema.orders.paymentProvider}, 'unknown')`)
      .orderBy(desc(count()))
      .limit(LEADERBOARD_LIMIT),
    db
      .select({ reviewCount: count() })
      .from(schema.orders)
      .where(eq(schema.orders.status, "requires_review")),
  ]);

  const { revenueSeries, ordersSeries } = buildSeries(paidOrderRows, window);

  const currentAvg =
    currentTotals.orderCount === 0 ? 0 : Math.round(currentTotals.revenueCents / currentTotals.orderCount);
  const previousAvg =
    previousTotals === null || previousTotals.orderCount === 0
      ? previousTotals === null
        ? null
        : 0
      : Math.round(previousTotals.revenueCents / previousTotals.orderCount);

  return {
    revenue: {
      current: currentTotals.revenueCents,
      changePercent: changePercent(currentTotals.revenueCents, previousTotals?.revenueCents ?? null),
    },
    orders: {
      current: currentTotals.orderCount,
      changePercent: changePercent(currentTotals.orderCount, previousTotals?.orderCount ?? null),
    },
    customers: {
      current: currentTotals.customerCount,
      changePercent: changePercent(currentTotals.customerCount, previousTotals?.customerCount ?? null),
    },
    avgOrderValueCents: {
      current: currentAvg,
      changePercent: changePercent(currentAvg, previousAvg),
    },
    revenueSeries,
    ordersSeries,
    latestOrders: latestOrderRows.map((order) => {
      const firstItem = order.items[0];
      return {
        id: order.id,
        productName: firstItem?.productName ?? "—",
        imagePath: firstItem?.product?.images[0] ?? null,
        paymentMethod: order.paymentProvider ?? "unknown",
        totalCents: order.totalCents,
        currency: order.currency,
        paidAgo: formatRelativeTime(order.paidAt ?? order.createdAt, window.end),
      };
    }),
    bestSellers: bestSellerRows.map((row) => ({
      label: row.productName,
      sublabel: `${row.unitsSold} sold`,
      imagePath: row.imagePath,
      valueCents: Number(row.revenueCents),
      valueCount: null,
    })),
    topSpenders: topSpenderRows.map((row) => ({
      label: row.email,
      sublabel: `${row.orderCount} order${row.orderCount === 1 ? "" : "s"}`,
      imagePath: null,
      valueCents: Number(row.totalSpentCents),
      valueCount: null,
    })),
    paymentMethods: methodRows.map((row) => ({
      label: paymentMethodLabel(row.method),
      sublabel: `${row.orderCount} order${row.orderCount === 1 ? "" : "s"}`,
      imagePath: null,
      valueCents: Number(row.revenueCents),
      valueCount: null,
    })),
    needsReviewCount: reviewRows[0]?.reviewCount ?? 0,
  };
}
