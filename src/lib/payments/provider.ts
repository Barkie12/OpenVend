import type { Shop } from "@/lib/shop";

export type PaymentProviderId = "stripe" | "nowpayments" | "paypalff";

/** Providers that talk to an external API; `paypalff` is manual and has no client. */
export type HostedPaymentProviderId = Exclude<PaymentProviderId, "paypalff">;

export const PAYMENT_PROVIDER_LABELS: Record<PaymentProviderId, string> = {
  stripe: "Card (Stripe)",
  nowpayments: "Crypto (NOWPayments)",
  paypalff: "PayPal (Friends & Family)",
};

/** Raised for provider misconfiguration or upstream API failures. */
export class PaymentError extends Error {}

export interface CheckoutSessionInput {
  orderId: string;
  orderNumber: number;
  accessToken: string;
  email: string;
  totalCents: number;
  currency: string;
  /** Human line like "2× Premium Key (1 month)". */
  productSummary: string;
  /** Unix ms timestamp after which the stock reservation lapses. */
  reservationExpiresAtMs: number;
}

export interface CheckoutSession {
  redirectUrl: string;
  externalId: string;
}

export interface PaymentProvider {
  id: PaymentProviderId;
  createCheckout(shop: Shop, input: CheckoutSessionInput): Promise<CheckoutSession>;
}

export function orderUrl(appUrl: string, accessToken: string): string {
  return `${appUrl}/order/${accessToken}`;
}
