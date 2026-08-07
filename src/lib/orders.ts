import { and, eq, inArray, lt, sql } from "drizzle-orm";

import { generateOrderToken } from "@/lib/crypto";
import { getDb, schema, type Database } from "@/lib/db";
import type { Coupon } from "@/lib/coupons";
import type { RequestContext } from "@/lib/fraud";
import type { Shop } from "@/lib/shop";

export const RESERVATION_TTL_MINUTES = 30;
const RESERVATION_TTL_MS = RESERVATION_TTL_MINUTES * 60 * 1000;

/** Buyer-facing checkout failures (safe to render). */
export class CheckoutError extends Error {}

export type OrderRow = typeof schema.orders.$inferSelect;
export type OrderItemRow = typeof schema.orderItems.$inferSelect;

type TransactionClient = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface NewOrderInput {
  shop: Shop;
  product: {
    id: string;
    name: string;
    deliveryType: OrderItemRow["deliveryType"];
    serviceInstructions: string | null;
  };
  variant: { id: string; name: string; priceCents: number };
  quantity: number;
  email: string;
  context: RequestContext;
  coupon: Coupon | null;
  discountCents: number;
  /** Overrides the default 30-minute stock reservation (e.g. manual payment methods). */
  reservationTtlMs?: number;
}

export async function createPendingOrder(input: NewOrderInput): Promise<OrderRow> {
  const subtotalCents = input.variant.priceCents * input.quantity;
  const totalCents = Math.max(0, subtotalCents - input.discountCents);
  const reservationTtlMs = input.reservationTtlMs ?? RESERVATION_TTL_MS;
  const db = getDb();

  return db.transaction(async (tx) => {
    let reservedStockIds: string[] = [];
    if (input.product.deliveryType === "serials") {
      const availableRows = await tx
        .select({ id: schema.stockItems.id })
        .from(schema.stockItems)
        .where(
          and(
            eq(schema.stockItems.variantId, input.variant.id),
            eq(schema.stockItems.status, "available"),
          ),
        )
        .limit(input.quantity)
        .for("update", { skipLocked: true });
      if (availableRows.length < input.quantity) {
        throw new CheckoutError("Not enough stock available right now — try a smaller quantity.");
      }
      reservedStockIds = availableRows.map((row) => row.id);
    }

    const [order] = await tx
      .insert(schema.orders)
      .values({
        shopId: input.shop.id,
        email: input.email,
        status: "pending",
        subtotalCents,
        discountCents: input.discountCents,
        totalCents,
        currency: input.shop.currency,
        couponId: input.coupon?.id ?? null,
        couponCode: input.coupon?.code ?? null,
        accessToken: generateOrderToken(),
        ipAddress: input.context.ipAddress,
        country: input.context.country,
        userAgent: input.context.userAgent,
        reservationExpiresAt: new Date(Date.now() + reservationTtlMs),
      })
      .returning();
    if (!order) {
      throw new CheckoutError("Order could not be created.");
    }

    const [orderItem] = await tx
      .insert(schema.orderItems)
      .values({
        orderId: order.id,
        productId: input.product.id,
        variantId: input.variant.id,
        productName: input.product.name,
        variantName: input.variant.name,
        deliveryType: input.product.deliveryType,
        serviceInstructions: input.product.serviceInstructions,
        unitPriceCents: input.variant.priceCents,
        quantity: input.quantity,
      })
      .returning({ id: schema.orderItems.id });
    if (!orderItem) {
      throw new CheckoutError("Order could not be created.");
    }

    if (reservedStockIds.length > 0) {
      await tx
        .update(schema.stockItems)
        .set({ status: "reserved", orderItemId: orderItem.id, reservedAt: new Date() })
        .where(inArray(schema.stockItems.id, reservedStockIds));
    }

    return order;
  });
}

async function releaseReservedStockForOrders(tx: TransactionClient, orderIds: string[]): Promise<void> {
  if (orderIds.length === 0) {
    return;
  }
  const itemRows = await tx
    .select({ id: schema.orderItems.id })
    .from(schema.orderItems)
    .where(inArray(schema.orderItems.orderId, orderIds));
  const itemIds = itemRows.map((row) => row.id);
  if (itemIds.length === 0) {
    return;
  }
  await tx
    .update(schema.stockItems)
    .set({ status: "available", orderItemId: null, reservedAt: null })
    .where(and(inArray(schema.stockItems.orderItemId, itemIds), eq(schema.stockItems.status, "reserved")));
}

/** Cancels an unpaid (or under-review) order and frees its reserved stock. */
export async function cancelPendingOrder(
  orderId: string,
  finalStatus: "cancelled" | "expired" = "cancelled",
  cancellableStatuses: readonly OrderRow["status"][] = ["pending"],
): Promise<boolean> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const cancelledRows = await tx
      .update(schema.orders)
      .set({ status: finalStatus, updatedAt: new Date() })
      .where(and(eq(schema.orders.id, orderId), inArray(schema.orders.status, [...cancellableStatuses])))
      .returning({ id: schema.orders.id });
    if (cancelledRows.length === 0) {
      return false;
    }
    await releaseReservedStockForOrders(tx, [orderId]);
    return true;
  });
}

/** Expires pending orders whose reservation window lapsed; returns how many were expired. */
export async function releaseExpiredReservations(): Promise<number> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const expiredRows = await tx
      .update(schema.orders)
      .set({ status: "expired", updatedAt: new Date() })
      .where(and(eq(schema.orders.status, "pending"), lt(schema.orders.reservationExpiresAt, new Date())))
      .returning({ id: schema.orders.id });
    await releaseReservedStockForOrders(
      tx,
      expiredRows.map((row) => row.id),
    );
    return expiredRows.length;
  });
}

export type FinalizeOutcome = "delivered" | "already_finalized" | "requires_review" | "not_found";

export interface FinalizeResult {
  outcome: FinalizeOutcome;
  order: OrderRow | null;
}

const FINAL_STATES: readonly OrderRow["status"][] = ["delivered", "refunded", "requires_review"];

export interface FinalizeOptions {
  /** Admin override: deliver an order that sits in `requires_review`. */
  allowReviewOverride?: boolean;
}

/**
 * Marks an order as paid and assigns its stock. Idempotent: repeated webhook
 * deliveries settle on the first outcome. Late payments (after reservation
 * expiry) try to re-claim stock and fall back to `requires_review` when the
 * pool ran dry in the meantime.
 */
export async function finalizeOrderPaid(
  orderId: string,
  providerId: string | null,
  options: FinalizeOptions = {},
): Promise<FinalizeResult> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId)).for("update");
    if (!order) {
      return { outcome: "not_found", order: null };
    }
    const isReviewOverride = options.allowReviewOverride === true && order.status === "requires_review";
    if (FINAL_STATES.includes(order.status) && !isReviewOverride) {
      return { outcome: "already_finalized", order };
    }

    const orderItemRows = await tx
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, order.id));

    for (const orderItem of orderItemRows) {
      if (orderItem.deliveryType !== "serials") {
        continue;
      }
      const reservedRows = await tx
        .select({ id: schema.stockItems.id })
        .from(schema.stockItems)
        .where(
          and(eq(schema.stockItems.orderItemId, orderItem.id), eq(schema.stockItems.status, "reserved")),
        )
        .for("update");
      const missingCount = orderItem.quantity - reservedRows.length;

      if (missingCount > 0) {
        if (orderItem.variantId === null) {
          return flagForReview(tx, order, "Product was deleted before payment confirmation.");
        }
        const claimableRows = await tx
          .select({ id: schema.stockItems.id })
          .from(schema.stockItems)
          .where(
            and(
              eq(schema.stockItems.variantId, orderItem.variantId),
              eq(schema.stockItems.status, "available"),
            ),
          )
          .limit(missingCount)
          .for("update", { skipLocked: true });
        if (claimableRows.length < missingCount) {
          return flagForReview(
            tx,
            order,
            "Payment confirmed after the stock reservation expired and the pool ran dry.",
          );
        }
        await tx
          .update(schema.stockItems)
          .set({ status: "reserved", orderItemId: orderItem.id, reservedAt: new Date() })
          .where(inArray(schema.stockItems.id, claimableRows.map((row) => row.id)));
      }
    }

    const orderItemIds = orderItemRows.map((row) => row.id);
    if (orderItemIds.length > 0) {
      await tx
        .update(schema.stockItems)
        .set({ status: "delivered", deliveredAt: new Date() })
        .where(
          and(inArray(schema.stockItems.orderItemId, orderItemIds), eq(schema.stockItems.status, "reserved")),
        );
    }

    const now = new Date();
    const [updatedOrder] = await tx
      .update(schema.orders)
      .set({
        status: "delivered",
        paidAt: order.paidAt ?? now,
        deliveredAt: now,
        paymentProvider: providerId ?? order.paymentProvider,
        reservationExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(schema.orders.id, order.id))
      .returning();

    if (order.couponId !== null) {
      await tx
        .update(schema.coupons)
        .set({ usedCount: sql`${schema.coupons.usedCount} + 1` })
        .where(eq(schema.coupons.id, order.couponId));
    }

    return { outcome: "delivered", order: updatedOrder ?? order };
  });
}

async function flagForReview(
  tx: TransactionClient,
  order: OrderRow,
  reason: string,
): Promise<FinalizeResult> {
  const now = new Date();
  const [updatedOrder] = await tx
    .update(schema.orders)
    .set({ status: "requires_review", reviewReason: reason, paidAt: order.paidAt ?? now, updatedAt: now })
    .where(eq(schema.orders.id, order.id))
    .returning();
  return { outcome: "requires_review", order: updatedOrder ?? order };
}

/** Flags an order for manual review (e.g. crypto underpayment). */
export async function markOrderRequiresReview(orderId: string, reason: string): Promise<void> {
  await getDb()
    .update(schema.orders)
    .set({ status: "requires_review", reviewReason: reason, updatedAt: new Date() })
    .where(eq(schema.orders.id, orderId));
}

export interface OrderItemDeliverableFile {
  id: string;
  fileName: string;
  sizeBytes: number;
}

export interface OrderItemWithDeliverables extends OrderItemRow {
  /** Serial contents; only populated once the order is delivered. */
  serials: string[];
  /** Download entries for `file` delivery items. */
  files: OrderItemDeliverableFile[];
}

export interface OrderWithDeliverables extends OrderRow {
  items: OrderItemWithDeliverables[];
}

export async function getOrderByAccessToken(accessToken: string): Promise<OrderWithDeliverables | null> {
  const db = getDb();
  const order = await db.query.orders.findFirst({
    where: eq(schema.orders.accessToken, accessToken),
    with: { items: { with: { stockItems: true } } },
  });
  if (!order) {
    return null;
  }

  // Attached files are deliverables for every delivery type, not just `file` products.
  const fileProductIds = order.items
    .map((item) => item.productId)
    .filter((productId): productId is string => productId !== null);
  const productFileRows =
    fileProductIds.length > 0
      ? await db
          .select()
          .from(schema.productFiles)
          .where(inArray(schema.productFiles.productId, fileProductIds))
      : [];

  const isDelivered = order.status === "delivered" || order.status === "refunded";
  const items: OrderItemWithDeliverables[] = order.items.map((item) => ({
    ...item,
    serials: isDelivered
      ? item.stockItems
          .filter((stockItem) => stockItem.status === "delivered")
          .map((stockItem) => stockItem.content)
      : [],
    files: isDelivered
      ? productFileRows
          .filter((fileRow) => fileRow.productId === item.productId)
          .map((fileRow) => ({ id: fileRow.id, fileName: fileRow.fileName, sizeBytes: fileRow.sizeBytes }))
      : [],
  }));

  return { ...order, items };
}
