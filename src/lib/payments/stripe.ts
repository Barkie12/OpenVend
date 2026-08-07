import Stripe from "stripe";

import { decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import type { Shop } from "@/lib/shop";

import {
  PaymentError,
  orderUrl,
  type CheckoutSession,
  type CheckoutSessionInput,
  type PaymentProvider,
} from "./provider";

export function stripeClient(shop: Shop): Stripe {
  if (!shop.stripeSecretKeyEnc) {
    throw new PaymentError("Stripe is not configured");
  }
  return new Stripe(decryptSecret(shop.stripeSecretKeyEnc));
}

export function stripeWebhookSecret(shop: Shop): string {
  if (!shop.stripeWebhookSecretEnc) {
    throw new PaymentError("Stripe webhook secret is not configured");
  }
  return decryptSecret(shop.stripeWebhookSecretEnc);
}

/** Stripe rejects sessions expiring in under 30 minutes; pad past the reservation TTL. */
const SESSION_EXPIRY_BUFFER_SECONDS = 5 * 60;

export const stripeProvider: PaymentProvider = {
  id: "stripe",

  async createCheckout(shop: Shop, input: CheckoutSessionInput): Promise<CheckoutSession> {
    const stripe = stripeClient(shop);
    const returnUrl = orderUrl(env().APP_URL, input.accessToken);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: input.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.totalCents,
            product_data: { name: input.productSummary },
          },
        },
      ],
      metadata: { orderId: input.orderId, orderNumber: String(input.orderNumber) },
      // Late payments after reservation expiry are handled by finalize's re-claim logic.
      expires_at: Math.floor(input.reservationExpiresAtMs / 1000) + SESSION_EXPIRY_BUFFER_SECONDS,
      success_url: returnUrl,
      cancel_url: returnUrl,
    });

    if (!session.url) {
      throw new PaymentError("Stripe did not return a checkout URL");
    }
    return { redirectUrl: session.url, externalId: session.id };
  },
};

export interface EmbeddedStripeSession {
  clientSecret: string;
  externalId: string;
}

/**
 * Embedded Checkout variant: same session, rendered in a modal on our checkout
 * page. Completion is handled client-side (`redirect_on_completion: "never"`);
 * fulfillment still comes exclusively from the webhook.
 */
export async function createEmbeddedStripeCheckout(
  shop: Shop,
  input: CheckoutSessionInput,
): Promise<EmbeddedStripeSession> {
  const stripe = stripeClient(shop);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ui_mode: "embedded_page",
    redirect_on_completion: "never",
    customer_email: input.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency.toLowerCase(),
          unit_amount: input.totalCents,
          product_data: { name: input.productSummary },
        },
      },
    ],
    metadata: { orderId: input.orderId, orderNumber: String(input.orderNumber) },
    expires_at: Math.floor(input.reservationExpiresAtMs / 1000) + SESSION_EXPIRY_BUFFER_SECONDS,
  });

  if (!session.client_secret) {
    throw new PaymentError("Stripe did not return an embedded client secret");
  }
  return { clientSecret: session.client_secret, externalId: session.id };
}
