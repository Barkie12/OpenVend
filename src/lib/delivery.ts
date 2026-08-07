import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { sendDiscordSaleNotification } from "@/lib/discord";
import { sendOrderDeliveredEmail } from "@/lib/email";
import {
  finalizeOrderPaid,
  getOrderByAccessToken,
  type FinalizeOptions,
  type FinalizeOutcome,
} from "@/lib/orders";
import { getShop } from "@/lib/shop";

/**
 * Called when a payment provider confirms payment: assigns stock, then sends
 * the delivery email and Discord notification. Notification failures are
 * logged but never fail the webhook — the order page always has the goods.
 */
export async function handleOrderPaid(
  orderId: string,
  providerId: string,
  options: FinalizeOptions = {},
): Promise<FinalizeOutcome> {
  const finalizeResult = await finalizeOrderPaid(orderId, providerId, options);
  if (finalizeResult.order === null || finalizeResult.outcome === "not_found") {
    return finalizeResult.outcome;
  }
  if (finalizeResult.outcome === "already_finalized") {
    return finalizeResult.outcome;
  }

  const shop = await getShop();
  const fullOrder = await getOrderByAccessToken(finalizeResult.order.accessToken);
  if (!shop || !fullOrder) {
    return finalizeResult.outcome;
  }

  const needsReview = finalizeResult.outcome === "requires_review";
  const notificationResults = await Promise.allSettled([
    needsReview ? Promise.resolve() : sendOrderDeliveredEmail(shop, fullOrder),
    sendDiscordSaleNotification(shop, fullOrder, needsReview),
  ]);
  for (const notificationResult of notificationResults) {
    if (notificationResult.status === "rejected") {
      console.error("[delivery] notification failed", notificationResult.reason);
    }
  }

  return finalizeResult.outcome;
}

/** Re-sends the delivery email for an already-delivered order (admin action). */
export async function resendDeliveryEmail(orderId: string): Promise<string | null> {
  const shop = await getShop();
  if (!shop) {
    return "Shop is not set up";
  }
  const orderRows = await getDb()
    .select({ accessToken: schema.orders.accessToken, status: schema.orders.status })
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .limit(1);
  const orderRow = orderRows[0];
  if (!orderRow) {
    return "Order not found";
  }
  if (orderRow.status !== "delivered" && orderRow.status !== "refunded") {
    return "Only delivered orders can be re-sent";
  }
  const fullOrder = await getOrderByAccessToken(orderRow.accessToken);
  if (!fullOrder) {
    return "Order not found";
  }
  try {
    await sendOrderDeliveredEmail(shop, fullOrder);
    return null;
  } catch (emailError) {
    console.error("[delivery] resend failed", emailError);
    return "Sending failed — check the SMTP settings";
  }
}
