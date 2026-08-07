"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { ACTION_OK, actionError, type ActionResult } from "@/lib/action-result";
import { getDb, schema } from "@/lib/db";
import { handleOrderPaid, resendDeliveryEmail } from "@/lib/delivery";
import { cancelPendingOrder } from "@/lib/orders";
import { requireAdminSession } from "@/lib/session";

const ORDERS_PATH = "/admin/orders";

function revalidateOrder(orderId: string): void {
  revalidatePath(ORDERS_PATH);
  revalidatePath(`${ORDERS_PATH}/${orderId}`);
  revalidatePath("/admin");
}

export async function resendOrderDelivery(orderId: string): Promise<ActionResult> {
  await requireAdminSession();
  const failureMessage = await resendDeliveryEmail(orderId);
  return failureMessage === null ? ACTION_OK : actionError(failureMessage);
}

export async function cancelOrder(orderId: string): Promise<ActionResult> {
  await requireAdminSession();
  const wasCancelled = await cancelPendingOrder(orderId, "cancelled", ["pending", "requires_review"]);
  if (!wasCancelled) {
    return actionError("Only unpaid or under-review orders can be cancelled");
  }
  revalidateOrder(orderId);
  return ACTION_OK;
}

/**
 * Manual payment confirmation (PayPal F&F and friends): the admin verified the
 * money arrived, so deliver the pending order. Expired orders are allowed too —
 * a late manual transfer re-claims stock and falls back to review if it's gone.
 */
export async function markOrderPaid(orderId: string): Promise<ActionResult> {
  await requireAdminSession();
  const orderRows = await getDb()
    .select({ status: schema.orders.status, paymentProvider: schema.orders.paymentProvider })
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .limit(1);
  const orderRow = orderRows[0];
  if (!orderRow) {
    return actionError("Order not found");
  }
  if (orderRow.status !== "pending" && orderRow.status !== "expired") {
    return actionError("Only pending or expired orders can be marked as paid");
  }

  const outcome = await handleOrderPaid(orderId, orderRow.paymentProvider ?? "manual");
  revalidateOrder(orderId);
  if (outcome === "requires_review") {
    return actionError("Stock ran out in the meantime — the order was flagged for review instead.");
  }
  if (outcome !== "delivered") {
    return actionError("The order could not be delivered — check its payment history.");
  }

  await getDb()
    .update(schema.payments)
    .set({ status: "confirmed_manually", updatedAt: new Date() })
    .where(eq(schema.payments.orderId, orderId));
  return ACTION_OK;
}

/** Admin override for `requires_review` orders: deliver despite the flag. */
export async function approveReviewedOrder(orderId: string): Promise<ActionResult> {
  await requireAdminSession();
  const orderRows = await getDb()
    .select({ status: schema.orders.status, paymentProvider: schema.orders.paymentProvider })
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .limit(1);
  const orderRow = orderRows[0];
  if (!orderRow) {
    return actionError("Order not found");
  }
  if (orderRow.status !== "requires_review") {
    return actionError("Only orders under review can be approved");
  }
  const outcome = await handleOrderPaid(orderId, orderRow.paymentProvider ?? "manual", {
    allowReviewOverride: true,
  });
  revalidateOrder(orderId);
  if (outcome === "requires_review") {
    return actionError("Still not deliverable — the stock pool is empty. Add stock and retry.");
  }
  return ACTION_OK;
}

export async function markOrderRefunded(orderId: string): Promise<ActionResult> {
  await requireAdminSession();
  // Only delivered orders can be refunded: refunding a pending/review order
  // would strand its reserved stock — those states go through cancel instead.
  const updatedRows = await getDb()
    .update(schema.orders)
    .set({ status: "refunded", updatedAt: new Date() })
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.status, "delivered")))
    .returning({ id: schema.orders.id });
  if (updatedRows.length === 0) {
    return actionError("Only delivered orders can be marked refunded");
  }
  revalidateOrder(orderId);
  return ACTION_OK;
}
