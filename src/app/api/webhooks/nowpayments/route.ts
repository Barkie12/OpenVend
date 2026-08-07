import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { verifyNowPaymentsSignature } from "@/lib/payments/nowpayments";
import { applyNowPaymentsStatus } from "@/lib/payments/nowpayments-status";
import { getShop } from "@/lib/shop";

const ipnPayloadSchema = z.looseObject({
  payment_status: z.string(),
  order_id: z.string().nullish(),
  invoice_id: z.union([z.string(), z.number()]).nullish(),
  payment_id: z.union([z.string(), z.number()]).nullish(),
  actually_paid: z.union([z.string(), z.number()]).nullish(),
  pay_currency: z.string().nullish(),
  price_amount: z.union([z.string(), z.number()]).nullish(),
  price_currency: z.string().nullish(),
});

export async function POST(request: Request): Promise<Response> {
  const shop = await getShop();
  if (!shop || !shop.nowpaymentsIpnSecretEnc) {
    return Response.json({ error: "NOWPayments is not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-nowpayments-sig");
  if (!verifyNowPaymentsSignature(shop, rawBody, signature)) {
    console.warn("[nowpayments] IPN signature verification failed");
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const parsed = ipnPayloadSchema.safeParse(JSON.parse(rawBody));
  if (!parsed.success) {
    return Response.json({ error: "Unrecognized payload" }, { status: 400 });
  }
  const ipn = parsed.data;
  const orderId = ipn.order_id ?? null;

  await getDb().insert(schema.paymentEvents).values({
    orderId,
    provider: "nowpayments",
    eventType: ipn.payment_status,
    payload: JSON.parse(rawBody),
  });

  if (orderId === null) {
    return Response.json({ received: true });
  }

  await applyNowPaymentsStatus(orderId, ipn.payment_status, {
    paymentId: ipn.payment_id === null || ipn.payment_id === undefined ? null : String(ipn.payment_id),
    actuallyPaid: ipn.actually_paid === null || ipn.actually_paid === undefined ? null : String(ipn.actually_paid),
    payCurrency: ipn.pay_currency ?? null,
    priceAmount: ipn.price_amount === null || ipn.price_amount === undefined ? null : String(ipn.price_amount),
    priceCurrency: ipn.price_currency ?? null,
  });

  return Response.json({ received: true });
}
