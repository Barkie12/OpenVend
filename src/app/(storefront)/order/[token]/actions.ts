"use server";

import { and, desc, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestContext } from "@/lib/fraud";
import { fetchCryptoPaymentStatus } from "@/lib/payments/nowpayments";
import { applyNowPaymentsStatus } from "@/lib/payments/nowpayments-status";
import { getShop } from "@/lib/shop";

/** Minimum spacing between upstream status polls per payment. */
const SYNC_MIN_INTERVAL_MS = 10_000;
const SYNC_RATE_LIMIT = 30;
const SYNC_RATE_WINDOW_MS = 60_000;
const TERMINAL_STATUSES = new Set(["finished", "failed", "refunded", "expired"]);

/**
 * Polls NOWPayments for the payment status of a pending crypto order. IPN is
 * the primary signal; this fallback keeps orders moving when the callback URL
 * is unreachable (local development, misconfigured reverse proxies).
 */
export async function syncCryptoPaymentStatus(accessToken: string): Promise<void> {
  const context = await getRequestContext();
  // Throttled per IP and per order token; IP alone is spoofable via headers.
  const ipLimitOk = consumeRateLimit({
    key: `ordersync:${context.ipAddress ?? "unknown"}`,
    limit: SYNC_RATE_LIMIT,
    windowMs: SYNC_RATE_WINDOW_MS,
  });
  const tokenLimitOk = consumeRateLimit({
    key: `ordersync-token:${accessToken}`,
    limit: SYNC_RATE_LIMIT,
    windowMs: SYNC_RATE_WINDOW_MS,
  });
  if (!ipLimitOk || !tokenLimitOk) {
    return;
  }

  const db = getDb();
  const order = await db.query.orders.findFirst({
    where: eq(schema.orders.accessToken, accessToken),
    columns: { id: true, status: true, paymentProvider: true },
  });
  if (!order || order.status !== "pending" || order.paymentProvider !== "nowpayments") {
    return;
  }

  const payment = await db.query.payments.findFirst({
    where: and(eq(schema.payments.orderId, order.id), eq(schema.payments.provider, "nowpayments")),
    orderBy: [desc(schema.payments.createdAt)],
  });
  if (!payment || TERMINAL_STATUSES.has(payment.status)) {
    return;
  }
  if (Date.now() - payment.updatedAt.getTime() < SYNC_MIN_INTERVAL_MS) {
    return;
  }
  // Touch the row first so concurrent refreshes don't stampede the API.
  await db
    .update(schema.payments)
    .set({ updatedAt: new Date() })
    .where(eq(schema.payments.id, payment.id));

  const shop = await getShop();
  if (!shop) {
    return;
  }

  try {
    const remote = await fetchCryptoPaymentStatus(shop, payment.externalId);
    if (remote.status === payment.status) {
      return;
    }
    await db.insert(schema.paymentEvents).values({
      orderId: order.id,
      provider: "nowpayments",
      eventType: `poll:${remote.status}`,
      payload: remote as unknown as Record<string, unknown>,
    });
    await applyNowPaymentsStatus(order.id, remote.status, {
      paymentId: payment.externalId,
      actuallyPaid: remote.actuallyPaid,
      payCurrency: remote.payCurrency,
      priceAmount: remote.priceAmount,
      priceCurrency: remote.priceCurrency,
    });
  } catch (syncError) {
    console.warn("[nowpayments] status poll failed", syncError);
  }
}
