import type { Shop } from "@/lib/shop";

import { nowPaymentsProvider } from "./nowpayments";
import {
  PaymentError,
  type CheckoutSession,
  type CheckoutSessionInput,
  type HostedPaymentProviderId,
  type PaymentProvider,
  type PaymentProviderId,
} from "./provider";
import { stripeProvider } from "./stripe";

const PROVIDERS: Record<HostedPaymentProviderId, PaymentProvider> = {
  stripe: stripeProvider,
  nowpayments: nowPaymentsProvider,
};

/** Providers the shop has switched on and fully configured. */
export function enabledProviderIds(shop: Shop): PaymentProviderId[] {
  const enabled: PaymentProviderId[] = [];
  if (shop.stripeEnabled && shop.stripeSecretKeyEnc) {
    enabled.push("stripe");
  }
  if (shop.nowpaymentsEnabled && shop.nowpaymentsApiKeyEnc) {
    enabled.push("nowpayments");
  }
  if (shop.paypalffEnabled && shop.paypalEmail) {
    enabled.push("paypalff");
  }
  return enabled;
}

export async function createProviderCheckout(
  shop: Shop,
  providerId: PaymentProviderId,
  input: CheckoutSessionInput,
): Promise<CheckoutSession> {
  if (providerId === "paypalff") {
    throw new PaymentError("PayPal F&F is a manual method and has no hosted checkout");
  }
  if (!enabledProviderIds(shop).includes(providerId)) {
    throw new PaymentError("This payment method is not available");
  }
  return PROVIDERS[providerId].createCheckout(shop, input);
}
