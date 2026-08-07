import { eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { schema } from "@/lib/db";

export const ORDER_STATUS_FILTERS = [
  "all",
  "delivered",
  "pending",
  "requires_review",
  "refunded",
  "cancelled",
  "expired",
] as const;
export type OrderStatusFilter = (typeof ORDER_STATUS_FILTERS)[number];

export function isOrderStatusFilter(value: string): value is OrderStatusFilter {
  return (ORDER_STATUS_FILTERS as readonly string[]).includes(value);
}

/** Builds the WHERE conditions shared by the orders page and the CSV export. */
export function buildOrderConditions(statusFilter: OrderStatusFilter, search: string): SQL[] {
  const conditions: SQL[] = [];

  if (statusFilter !== "all") {
    conditions.push(eq(schema.orders.status, statusFilter));
  }

  const trimmedSearch = search.trim();
  if (trimmedSearch.length > 0) {
    const likePattern = `%${trimmedSearch}%`;
    const searchConditions: SQL[] = [
      ilike(schema.orders.email, likePattern),
      sql`exists (select 1 from ${schema.orderItems} where ${schema.orderItems.orderId} = ${schema.orders.id} and ${schema.orderItems.productName} ilike ${likePattern})`,
    ];
    const numericSearch = Number.parseInt(trimmedSearch.replace(/^#/, ""), 10);
    if (Number.isInteger(numericSearch) && numericSearch > 0) {
      searchConditions.push(eq(schema.orders.orderNumber, numericSearch));
    }
    const combined = or(...searchConditions);
    if (combined) {
      conditions.push(combined);
    }
  }

  return conditions;
}
