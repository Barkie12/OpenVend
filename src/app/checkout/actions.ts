"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { evaluateCoupon, type Coupon } from "@/lib/coupons";
import { getDb, schema } from "@/lib/db";
import { handleOrderPaid } from "@/lib/delivery";
import { env } from "@/lib/env";
import { checkBlacklist, getRequestContext, verifyTurnstile } from "@/lib/fraud";
import {
  CheckoutError,
  cancelPendingOrder,
  createPendingOrder,
  type OrderRow,
} from "@/lib/orders";
import { createProviderCheckout, enabledProviderIds } from "@/lib/payments";
import { coinInfo, coinTicker, POPULAR_COIN_ORDER } from "@/lib/payments/crypto-coins";
import { createCryptoPayment, listMerchantCoins } from "@/lib/payments/nowpayments";
import { orderUrl, PaymentError } from "@/lib/payments/provider";
import { createEmbeddedStripeCheckout } from "@/lib/payments/stripe";
import { GLOBAL_MAX_QUANTITY, quantityBounds } from "@/lib/products";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getShop } from "@/lib/shop";

const MAX_QUANTITY_PER_ORDER = GLOBAL_MAX_QUANTITY;
const CHECKOUT_RATE_LIMIT = 10;
const COUPON_PREVIEW_RATE_LIMIT = 20;
const CHECKOUT_RATE_WINDOW_MS = 60_000;
const FALLBACK_RESERVATION_MS = 30 * 60 * 1000;

const checkoutSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(MAX_QUANTITY_PER_ORDER),
  email: z.string().trim().email("Enter a valid email address").max(255),
  couponCode: z.string().trim().max(64).default(""),
  provider: z.enum(["stripe", "nowpayments", "paypalff"]).nullable().default(null),
  /** Coin ticker for crypto checkouts, e.g. "btc" or "usdttrc20". */
  payCurrency: z.string().trim().toLowerCase().max(32).nullable().default(null),
  turnstileToken: z.string().nullable().default(null),
});

/** Manual transfers are confirmed by a human — hold the stock much longer than card/crypto. */
const MANUAL_PAYMENT_RESERVATION_MS = 24 * 60 * 60 * 1000;

export interface EmbeddedStripePayment {
  clientSecret: string;
  publishableKey: string;
}

export interface StartCheckoutResult {
  error: string | null;
  /** Where the buyer ends up: provider page (redirect flow) or the order page (embedded/free flow). */
  redirectUrl: string | null;
  /** Set when the payment should render in the embedded Stripe modal instead of redirecting. */
  embeddedStripe: EmbeddedStripePayment | null;
}

export interface CouponPreview {
  error: string | null;
  code: string | null;
  discountCents: number;
  totalCents: number;
}

/** Validates a coupon for the checkout page's "Apply" button; authoritative re-check happens at submit. */
export async function previewCoupon(
  variantId: string,
  quantity: number,
  code: string,
  email: string,
): Promise<CouponPreview> {
  const context = await getRequestContext();
  const rateLimitKey = `coupon:${context.ipAddress ?? "unknown"}`;
  if (
    !consumeRateLimit({ key: rateLimitKey, limit: COUPON_PREVIEW_RATE_LIMIT, windowMs: CHECKOUT_RATE_WINDOW_MS })
  ) {
    return { error: "Too many attempts — wait a minute and try again.", code: null, discountCents: 0, totalCents: 0 };
  }

  const variant = await getDb().query.productVariants.findFirst({
    where: eq(schema.productVariants.id, variantId),
    with: { product: true },
  });
  if (!variant || variant.product.visibility === "hidden") {
    return { error: "This product is not available.", code: null, discountCents: 0, totalCents: 0 };
  }

  const boundedQuantity = Math.max(1, Math.min(MAX_QUANTITY_PER_ORDER, Math.trunc(quantity)));
  const subtotalCents = variant.priceCents * boundedQuantity;
  const shop = await getShop();
  const couponEvaluation = await evaluateCoupon(code, variant.product.id, subtotalCents, {
    email,
    currency: shop?.currency ?? "USD",
  });
  if (!couponEvaluation.ok) {
    return { error: couponEvaluation.reason, code: null, discountCents: 0, totalCents: subtotalCents };
  }

  return {
    error: null,
    code: couponEvaluation.coupon.code,
    discountCents: couponEvaluation.discountCents,
    totalCents: Math.max(0, subtotalCents - couponEvaluation.discountCents),
  };
}

function checkoutFailure(message: string): StartCheckoutResult {
  return { error: message, redirectUrl: null, embeddedStripe: null };
}

export async function startCheckout(rawInput: unknown): Promise<StartCheckoutResult> {
  const parsed = checkoutSchema.safeParse(rawInput);
  if (!parsed.success) {
    return checkoutFailure(parsed.error.issues[0]?.message ?? "Invalid checkout details");
  }
  const input = parsed.data;

  const shop = await getShop();
  if (!shop) {
    return checkoutFailure("This shop is not set up yet.");
  }

  const context = await getRequestContext();
  // Two keys: IP alone is spoofable via forwarded headers when no trusted
  // proxy fronts the app, so the buyer e-mail is throttled independently.
  const ipLimitOk = consumeRateLimit({
    key: `checkout:${context.ipAddress ?? "unknown"}`,
    limit: CHECKOUT_RATE_LIMIT,
    windowMs: CHECKOUT_RATE_WINDOW_MS,
  });
  const emailLimitOk = consumeRateLimit({
    key: `checkout-email:${input.email.toLowerCase()}`,
    limit: CHECKOUT_RATE_LIMIT,
    windowMs: CHECKOUT_RATE_WINDOW_MS,
  });
  if (!ipLimitOk || !emailLimitOk) {
    return checkoutFailure("Too many checkout attempts — wait a minute and try again.");
  }

  const variant = await getDb().query.productVariants.findFirst({
    where: eq(schema.productVariants.id, input.variantId),
    with: { product: true },
  });
  if (!variant || variant.product.visibility === "hidden") {
    return checkoutFailure("This product is not available.");
  }
  const product = variant.product;

  let quantity = input.quantity;
  if (product.deliveryType === "file") {
    quantity = 1;
  } else {
    const bounds = quantityBounds(variant);
    if (quantity < bounds.min) {
      return checkoutFailure(`The minimum quantity for this option is ${bounds.min}.`);
    }
    if (quantity > bounds.max) {
      return checkoutFailure(`The maximum quantity for this option is ${bounds.max}.`);
    }
  }

  const blacklistRejection = await checkBlacklist({ email: input.email, context });
  if (blacklistRejection !== null) {
    return checkoutFailure(blacklistRejection);
  }
  const turnstileRejection = await verifyTurnstile(shop, input.turnstileToken, context.ipAddress);
  if (turnstileRejection !== null) {
    return checkoutFailure(turnstileRejection);
  }

  const subtotalCents = variant.priceCents * quantity;
  let coupon: Coupon | null = null;
  let discountCents = 0;
  if (input.couponCode.length > 0) {
    const couponEvaluation = await evaluateCoupon(input.couponCode, product.id, subtotalCents, {
      email: input.email,
      currency: shop.currency,
    });
    if (!couponEvaluation.ok) {
      return checkoutFailure(couponEvaluation.reason);
    }
    coupon = couponEvaluation.coupon;
    discountCents = couponEvaluation.discountCents;
  }
  const totalCents = Math.max(0, subtotalCents - discountCents);

  if (totalCents > 0) {
    if (input.provider === null) {
      return checkoutFailure("Choose a payment method.");
    }
    if (!enabledProviderIds(shop).includes(input.provider)) {
      return checkoutFailure("This payment method is not available.");
    }
    if (input.provider === "nowpayments" && input.payCurrency === null) {
      return checkoutFailure("Choose a cryptocurrency to pay with.");
    }
  }

  let order: OrderRow;
  try {
    order = await createPendingOrder({
      shop,
      product: {
        id: product.id,
        name: product.name,
        deliveryType: product.deliveryType,
        serviceInstructions: product.serviceInstructions,
      },
      variant: { id: variant.id, name: variant.name, priceCents: variant.priceCents },
      quantity,
      email: input.email,
      context,
      coupon,
      discountCents,
      ...(input.provider === "paypalff" ? { reservationTtlMs: MANUAL_PAYMENT_RESERVATION_MS } : {}),
    });
  } catch (orderError) {
    if (orderError instanceof CheckoutError) {
      return checkoutFailure(orderError.message);
    }
    console.error("[checkout] order creation failed", orderError);
    return checkoutFailure("Something went wrong creating your order. Try again.");
  }

  const orderPageUrl = orderUrl(env().APP_URL, order.accessToken);

  if (totalCents === 0) {
    await handleOrderPaid(order.id, "free");
    return { error: null, redirectUrl: orderPageUrl, embeddedStripe: null };
  }

  // totalCents > 0 implies provider is non-null (validated above).
  if (input.provider === null) {
    return checkoutFailure("Choose a payment method.");
  }

  const sessionInput = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    accessToken: order.accessToken,
    email: input.email,
    totalCents,
    currency: shop.currency,
    productSummary: `${quantity}× ${product.name}${variant.name === "Default" ? "" : ` (${variant.name})`}`,
    reservationExpiresAtMs: order.reservationExpiresAt?.getTime() ?? Date.now() + FALLBACK_RESERVATION_MS,
  };

  try {
    const useEmbeddedStripe = input.provider === "stripe" && shop.stripePublishableKey !== null;
    let externalId: string;
    let initialStatus = "created";
    let providerData: typeof schema.payments.$inferInsert.providerData = null;
    let checkoutOutcome: Pick<StartCheckoutResult, "redirectUrl" | "embeddedStripe">;

    if (useEmbeddedStripe && shop.stripePublishableKey !== null) {
      const embeddedSession = await createEmbeddedStripeCheckout(shop, sessionInput);
      externalId = embeddedSession.externalId;
      checkoutOutcome = {
        redirectUrl: orderPageUrl,
        embeddedStripe: {
          clientSecret: embeddedSession.clientSecret,
          publishableKey: shop.stripePublishableKey,
        },
      };
    } else if (input.provider === "nowpayments" && input.payCurrency !== null) {
      // Direct payment: the buyer pays a deposit address rendered on the order
      // page instead of being redirected to the NOWPayments-hosted invoice.
      const cryptoSession = await createCryptoPayment(shop, sessionInput, input.payCurrency);
      externalId = cryptoSession.externalId;
      initialStatus = cryptoSession.status;
      providerData = cryptoSession.instructions;
      checkoutOutcome = { redirectUrl: orderPageUrl, embeddedStripe: null };
    } else if (input.provider === "paypalff") {
      // Manual method: no external session. The order page shows the shop's
      // PayPal address; the owner confirms the transfer by hand in the admin.
      externalId = `manual-${order.id}`;
      initialStatus = "awaiting_transfer";
      checkoutOutcome = { redirectUrl: orderPageUrl, embeddedStripe: null };
    } else {
      const hostedSession = await createProviderCheckout(shop, input.provider, sessionInput);
      externalId = hostedSession.externalId;
      checkoutOutcome = { redirectUrl: hostedSession.redirectUrl, embeddedStripe: null };
    }

    const db = getDb();
    await db.insert(schema.payments).values({
      shopId: shop.id,
      orderId: order.id,
      provider: input.provider,
      externalId,
      status: initialStatus,
      amountCents: totalCents,
      currency: shop.currency,
      providerData,
    });
    await db
      .update(schema.orders)
      .set({ paymentProvider: input.provider, updatedAt: new Date() })
      .where(eq(schema.orders.id, order.id));

    return { error: null, ...checkoutOutcome };
  } catch (paymentError) {
    console.error("[checkout] payment session creation failed", paymentError);
    await cancelPendingOrder(order.id);
    if (paymentError instanceof PaymentError) {
      return checkoutFailure(paymentError.message);
    }
    return checkoutFailure("Could not start the payment. Try again or pick another payment method.");
  }
}

export interface CryptoCurrencyOption {
  code: string;
  ticker: string;
  label: string;
  network: string | null;
}

const COIN_LIST_RATE_LIMIT = 30;

/** Coins the shop accepts, popular ones first — feeds the checkout coin picker. */
export async function listCryptoCurrencies(): Promise<{
  error: string | null;
  coins: CryptoCurrencyOption[];
}> {
  const context = await getRequestContext();
  const rateLimitKey = `coins:${context.ipAddress ?? "unknown"}`;
  if (!consumeRateLimit({ key: rateLimitKey, limit: COIN_LIST_RATE_LIMIT, windowMs: CHECKOUT_RATE_WINDOW_MS })) {
    return { error: "Too many attempts — wait a minute and try again.", coins: [] };
  }

  const shop = await getShop();
  if (!shop || !enabledProviderIds(shop).includes("nowpayments")) {
    return { error: "Crypto payments are not available.", coins: [] };
  }

  try {
    const codes = await listMerchantCoins(shop);
    const popularRank = (code: string): number => {
      const rank = (POPULAR_COIN_ORDER as readonly string[]).indexOf(code);
      return rank === -1 ? POPULAR_COIN_ORDER.length : rank;
    };
    const coins = [...codes]
      .sort((codeA, codeB) => {
        const rankDelta = popularRank(codeA) - popularRank(codeB);
        return rankDelta !== 0 ? rankDelta : codeA.localeCompare(codeB);
      })
      .map((code) => {
        const info = coinInfo(code);
        return { code, ticker: coinTicker(code), label: info.label, network: info.network };
      });
    return { error: null, coins };
  } catch (coinsError) {
    console.error("[checkout] crypto coin list failed", coinsError);
    return { error: "Could not load the coin list — try again.", coins: [] };
  }
}
