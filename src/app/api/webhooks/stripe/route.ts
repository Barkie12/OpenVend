import type Stripe from "stripe";
import { and, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { handleOrderPaid } from "@/lib/delivery";
import { cancelPendingOrder, markOrderRequiresReview } from "@/lib/orders";
import { stripeClient, stripeWebhookSecret } from "@/lib/payments/stripe";
import { getShop } from "@/lib/shop";

async function recordEvent(orderId: string | null, eventType: string, payload: unknown): Promise<void> {
  await getDb().insert(schema.paymentEvents).values({
    orderId,
    provider: "stripe",
    eventType,
    payload,
  });
}

async function updatePaymentStatus(sessionId: string, status: string): Promise<void> {
  await getDb()
    .update(schema.payments)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(schema.payments.provider, "stripe"), eq(schema.payments.externalId, sessionId)));
}

export async function POST(request: Request): Promise<Response> {
  const shop = await getShop();
  if (!shop || !shop.stripeSecretKeyEnc || !shop.stripeWebhookSecretEnc) {
    return Response.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing signature" }, { status: 400 });
  }
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripeClient(shop).webhooks.constructEventAsync(
      rawBody,
      signature,
      stripeWebhookSecret(shop),
    );
  } catch (verificationError) {
    console.warn("[stripe] webhook signature verification failed", verificationError);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      const orderId = session.metadata?.orderId ?? null;
      await recordEvent(orderId, event.type, event.data.object);
      if (orderId === null) {
        break;
      }
      await updatePaymentStatus(session.id, session.payment_status);
      if (session.payment_status !== "paid") {
        break;
      }

      // Defense in depth: the session must be the one we created for this
      // order, and the captured amount must match what the order charged.
      const paymentRows = await getDb()
        .select()
        .from(schema.payments)
        .where(and(eq(schema.payments.provider, "stripe"), eq(schema.payments.externalId, session.id)))
        .limit(1);
      const payment = paymentRows[0];
      if (!payment || payment.orderId !== orderId) {
        console.warn(
          `[stripe] session ${session.id} is not bound to order ${orderId} — ignoring finalize`,
        );
        break;
      }
      const amountMatches = session.amount_total === payment.amountCents;
      const currencyMatches =
        (session.currency ?? "").toLowerCase() === payment.currency.toLowerCase();
      if (!amountMatches || !currencyMatches) {
        await markOrderRequiresReview(
          orderId,
          `Stripe amount mismatch: captured ${session.amount_total ?? "?"} ${(session.currency ?? "?").toUpperCase()}, ` +
            `expected ${payment.amountCents} ${payment.currency.toUpperCase()}.`,
        );
        console.warn(`[stripe] order ${orderId} flagged for review: amount mismatch`);
        break;
      }

      const outcome = await handleOrderPaid(orderId, "stripe");
      console.info(`[stripe] order ${orderId} finalize outcome: ${outcome}`);
      break;
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const session = event.data.object;
      const orderId = session.metadata?.orderId ?? null;
      await recordEvent(orderId, event.type, event.data.object);
      if (orderId !== null) {
        await updatePaymentStatus(session.id, "expired");
        await cancelPendingOrder(orderId, "expired");
      }
      break;
    }
    default: {
      await recordEvent(null, event.type, { id: event.id });
      break;
    }
  }

  return Response.json({ received: true });
}
