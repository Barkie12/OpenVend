import { and, desc, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { handleOrderPaid } from "@/lib/delivery";
import { cancelPendingOrder, markOrderRequiresReview } from "@/lib/orders";

const CENTS_PER_UNIT = 100;

export interface NowPaymentsStatusMeta {
  /** NOWPayments payment id; must match the payment we created for the order. */
  paymentId?: string | null;
  actuallyPaid?: string | null;
  payCurrency?: string | null;
  priceAmount?: string | null;
  priceCurrency?: string | null;
}

/**
 * Applies a NOWPayments payment status to the order — shared by the IPN
 * webhook and the order-page polling fallback, so both paths transition orders
 * identically (delivery, manual review on underpayment, cancellation).
 *
 * Beyond the HMAC signature (verified by the caller), this binds the event to
 * the payment record we created and cross-checks the charged amount before
 * anything is delivered.
 */
export async function applyNowPaymentsStatus(
  orderId: string,
  paymentStatus: string,
  meta: NowPaymentsStatusMeta = {},
): Promise<void> {
  const db = getDb();
  const paymentRows = await db
    .select()
    .from(schema.payments)
    .where(and(eq(schema.payments.provider, "nowpayments"), eq(schema.payments.orderId, orderId)))
    .orderBy(desc(schema.payments.createdAt))
    .limit(1);
  const payment = paymentRows[0];
  if (!payment) {
    console.warn(`[nowpayments] no payment record for order ${orderId} — ignoring status update`);
    return;
  }
  if (meta.paymentId && payment.externalId !== meta.paymentId) {
    console.warn(
      `[nowpayments] payment ${meta.paymentId} is not bound to order ${orderId} — ignoring status update`,
    );
    return;
  }

  await db
    .update(schema.payments)
    .set({ status: paymentStatus, updatedAt: new Date() })
    .where(eq(schema.payments.id, payment.id));

  switch (paymentStatus) {
    case "finished": {
      // The price the payment was quoted at must match what the order charges.
      const quotedCents =
        meta.priceAmount === null || meta.priceAmount === undefined
          ? null
          : Math.round(Number.parseFloat(meta.priceAmount) * CENTS_PER_UNIT);
      const amountMatches = quotedCents === null || quotedCents === payment.amountCents;
      const currencyMatches =
        !meta.priceCurrency || meta.priceCurrency.toLowerCase() === payment.currency.toLowerCase();
      if (!amountMatches || !currencyMatches) {
        await markOrderRequiresReview(
          orderId,
          `Crypto amount mismatch: payment quoted ${meta.priceAmount ?? "?"} ${(meta.priceCurrency ?? "?").toUpperCase()}, ` +
            `expected ${payment.amountCents / CENTS_PER_UNIT} ${payment.currency.toUpperCase()}.`,
        );
        console.warn(`[nowpayments] order ${orderId} flagged for review: amount mismatch`);
        break;
      }
      const outcome = await handleOrderPaid(orderId, "nowpayments");
      console.info(`[nowpayments] order ${orderId} finalize outcome: ${outcome}`);
      break;
    }
    case "partially_paid": {
      const paidAmount = meta.actuallyPaid ?? "an unknown amount";
      const payCurrency = meta.payCurrency ?? "";
      await markOrderRequiresReview(
        orderId,
        `Crypto underpayment: received ${paidAmount} ${payCurrency.toUpperCase()}`.trim() +
          ` of ${meta.priceAmount ?? "?"} ${(meta.priceCurrency ?? "").toUpperCase()}`.trimEnd(),
      );
      break;
    }
    case "failed":
    case "refunded": {
      await cancelPendingOrder(orderId, "cancelled");
      break;
    }
    case "expired": {
      await cancelPendingOrder(orderId, "expired");
      break;
    }
    default:
      break;
  }
}
