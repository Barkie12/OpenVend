import { createHmac } from "node:crypto";

import { decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import type { Shop } from "@/lib/shop";

import {
  PaymentError,
  orderUrl,
  type CheckoutSession,
  type CheckoutSessionInput,
  type PaymentProvider,
} from "./provider";

const NOWPAYMENTS_API_BASE = "https://api.nowpayments.io/v1";
const CENTS_PER_UNIT = 100;
const MERCHANT_COINS_CACHE_MS = 10 * 60 * 1000;

interface NowPaymentsInvoiceResponse {
  id?: string | number;
  invoice_url?: string;
  message?: string;
}

function nowPaymentsApiKey(shop: Shop): string {
  if (!shop.nowpaymentsApiKeyEnc) {
    throw new PaymentError("NOWPayments is not configured");
  }
  return decryptSecret(shop.nowpaymentsApiKeyEnc);
}

/** Coins the merchant account accepts, cached briefly to keep checkout snappy. */
let merchantCoinsCache: { fetchedAtMs: number; coins: string[] } | null = null;

export async function listMerchantCoins(shop: Shop): Promise<string[]> {
  if (merchantCoinsCache && Date.now() - merchantCoinsCache.fetchedAtMs < MERCHANT_COINS_CACHE_MS) {
    return merchantCoinsCache.coins;
  }
  const response = await fetch(`${NOWPAYMENTS_API_BASE}/merchant/coins`, {
    headers: { "x-api-key": nowPaymentsApiKey(shop) },
  });
  const payload = (await response.json()) as { selectedCurrencies?: string[]; message?: string };
  if (!response.ok || !Array.isArray(payload.selectedCurrencies)) {
    throw new PaymentError(
      `NOWPayments coin list failed: ${payload.message ?? `status ${response.status}`}`,
    );
  }
  const coins = payload.selectedCurrencies.map((coin) => coin.toLowerCase());
  merchantCoinsCache = { fetchedAtMs: Date.now(), coins };
  return coins;
}

export interface CryptoPaymentSession {
  externalId: string;
  status: string;
  instructions: {
    payAddress: string;
    payAmount: string;
    payCurrency: string;
    network: string | null;
    payinExtraId: string | null;
    expiresAt: string | null;
  };
}

interface NowPaymentsPaymentResponse {
  payment_id?: string | number;
  payment_status?: string;
  pay_address?: string;
  pay_amount?: string | number;
  pay_currency?: string;
  network?: string;
  payin_extra_id?: string | number | null;
  expiration_estimate_date?: string;
  valid_until?: string;
  message?: string;
  code?: string;
}

/** Turns NOWPayments error responses into buyer-friendly messages where possible. */
function paymentCreationError(payload: NowPaymentsPaymentResponse, httpStatus: number): PaymentError {
  const upstream = payload.message ?? `status ${httpStatus}`;
  if (/small|minimal|minimum/i.test(upstream)) {
    return new PaymentError(
      "The order total is below the minimum for this coin — pick a different cryptocurrency.",
    );
  }
  return new PaymentError(`NOWPayments payment creation failed: ${upstream}`);
}

/**
 * Creates a direct payment (`POST /v1/payment`): NOWPayments returns a deposit
 * address and exact amount that we render on the buyer's order page, instead
 * of redirecting to their hosted invoice.
 */
export async function createCryptoPayment(
  shop: Shop,
  input: CheckoutSessionInput,
  payCurrency: string,
): Promise<CryptoPaymentSession> {
  const apiKey = nowPaymentsApiKey(shop);

  const paymentResponse = await fetch(`${NOWPAYMENTS_API_BASE}/payment`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      price_amount: input.totalCents / CENTS_PER_UNIT,
      price_currency: input.currency.toLowerCase(),
      pay_currency: payCurrency.toLowerCase(),
      order_id: input.orderId,
      order_description: input.productSummary,
      ipn_callback_url: `${env().APP_URL}/api/webhooks/nowpayments`,
    }),
  });

  const payment = (await paymentResponse.json()) as NowPaymentsPaymentResponse;
  if (
    !paymentResponse.ok ||
    payment.payment_id === undefined ||
    !payment.pay_address ||
    payment.pay_amount === undefined ||
    !payment.pay_currency
  ) {
    throw paymentCreationError(payment, paymentResponse.status);
  }

  return {
    externalId: String(payment.payment_id),
    status: payment.payment_status ?? "waiting",
    instructions: {
      payAddress: payment.pay_address,
      payAmount: String(payment.pay_amount),
      payCurrency: payment.pay_currency.toLowerCase(),
      network: payment.network ?? null,
      payinExtraId:
        payment.payin_extra_id === null || payment.payin_extra_id === undefined
          ? null
          : String(payment.payin_extra_id),
      expiresAt: payment.expiration_estimate_date ?? payment.valid_until ?? null,
    },
  };
}

export interface CryptoPaymentStatus {
  status: string;
  actuallyPaid: string | null;
  payCurrency: string | null;
  priceAmount: string | null;
  priceCurrency: string | null;
}

/** Polls a payment's status (`GET /v1/payment/{id}`) — the fallback when IPN can't reach us. */
export async function fetchCryptoPaymentStatus(
  shop: Shop,
  paymentId: string,
): Promise<CryptoPaymentStatus> {
  const response = await fetch(`${NOWPAYMENTS_API_BASE}/payment/${encodeURIComponent(paymentId)}`, {
    headers: { "x-api-key": nowPaymentsApiKey(shop) },
  });
  const payload = (await response.json()) as {
    payment_status?: string;
    actually_paid?: string | number;
    pay_currency?: string;
    price_amount?: string | number;
    price_currency?: string;
    message?: string;
  };
  if (!response.ok || !payload.payment_status) {
    throw new PaymentError(
      `NOWPayments status lookup failed: ${payload.message ?? `status ${response.status}`}`,
    );
  }
  return {
    status: payload.payment_status,
    actuallyPaid: payload.actually_paid === undefined ? null : String(payload.actually_paid),
    payCurrency: payload.pay_currency ?? null,
    priceAmount: payload.price_amount === undefined ? null : String(payload.price_amount),
    priceCurrency: payload.price_currency ?? null,
  };
}

export const nowPaymentsProvider: PaymentProvider = {
  id: "nowpayments",

  async createCheckout(shop: Shop, input: CheckoutSessionInput): Promise<CheckoutSession> {
    const apiKey = nowPaymentsApiKey(shop);
    const returnUrl = orderUrl(env().APP_URL, input.accessToken);

    const invoiceResponse = await fetch(`${NOWPAYMENTS_API_BASE}/invoice`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: input.totalCents / CENTS_PER_UNIT,
        price_currency: input.currency.toLowerCase(),
        order_id: input.orderId,
        order_description: input.productSummary,
        ipn_callback_url: `${env().APP_URL}/api/webhooks/nowpayments`,
        success_url: returnUrl,
        cancel_url: returnUrl,
      }),
    });

    const invoice = (await invoiceResponse.json()) as NowPaymentsInvoiceResponse;
    if (!invoiceResponse.ok || !invoice.invoice_url || invoice.id === undefined) {
      const upstreamMessage = invoice.message ?? `status ${invoiceResponse.status}`;
      throw new PaymentError(`NOWPayments invoice creation failed: ${upstreamMessage}`);
    }

    return { redirectUrl: invoice.invoice_url, externalId: String(invoice.id) };
  },
};

/** Recursively sorts object keys — NOWPayments signs `JSON.stringify` of the key-sorted payload. */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([keyA], [keyB]) => (keyA < keyB ? -1 : keyA > keyB ? 1 : 0))
      .map(([key, nested]) => [key, sortKeysDeep(nested)] as const);
    return Object.fromEntries(sortedEntries);
  }
  return value;
}

/** Verifies the `x-nowpayments-sig` IPN header (HMAC-SHA512 over the key-sorted body). */
export function verifyNowPaymentsSignature(
  shop: Shop,
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!shop.nowpaymentsIpnSecretEnc || signatureHeader === null) {
    return false;
  }
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return false;
  }
  const ipnSecret = decryptSecret(shop.nowpaymentsIpnSecretEnc);
  const expectedSignature = createHmac("sha512", ipnSecret)
    .update(JSON.stringify(sortKeysDeep(parsedBody)))
    .digest("hex");
  return safeEqual(expectedSignature, signatureHeader);
}
