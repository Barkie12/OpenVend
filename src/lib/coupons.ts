import { and, count, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { formatMoney } from "@/lib/money";

export type Coupon = typeof schema.coupons.$inferSelect;

const PERCENT_DENOMINATOR = 100;

export type CouponEvaluation =
  | { ok: true; coupon: Coupon; discountCents: number }
  | { ok: false; reason: string };

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

export function computeDiscountCents(coupon: Coupon, subtotalCents: number): number {
  if (coupon.type === "percent") {
    return Math.floor((subtotalCents * coupon.value) / PERCENT_DENOMINATOR);
  }
  return Math.min(coupon.value, subtotalCents);
}

export interface EvaluateCouponOptions {
  /** Buyer e-mail; enables the per-customer limit check when known. */
  email?: string;
  currency?: string;
}

export async function evaluateCoupon(
  code: string,
  productId: string,
  subtotalCents: number,
  options: EvaluateCouponOptions = {},
): Promise<CouponEvaluation> {
  const normalizedCode = normalizeCouponCode(code);
  const coupon = await getDb().query.coupons.findFirst({
    where: eq(schema.coupons.code, normalizedCode),
  });

  if (!coupon || !coupon.active) {
    return { ok: false, reason: "That coupon code is not valid." };
  }
  if (coupon.startsAt !== null && coupon.startsAt.getTime() > Date.now()) {
    return { ok: false, reason: "That coupon is not active yet." };
  }
  if (coupon.expiresAt !== null && coupon.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "That coupon has expired." };
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, reason: "That coupon has been fully redeemed." };
  }
  if (coupon.productIds !== null && !coupon.productIds.includes(productId)) {
    return { ok: false, reason: "That coupon does not apply to this product." };
  }
  if (coupon.minSubtotalCents !== null && subtotalCents < coupon.minSubtotalCents) {
    const minimumLabel = formatMoney(coupon.minSubtotalCents, options.currency ?? "USD");
    return { ok: false, reason: `That coupon requires a minimum order of ${minimumLabel}.` };
  }

  const buyerEmail = options.email?.trim().toLowerCase();
  if (coupon.maxUsesPerCustomer !== null && buyerEmail && buyerEmail.length > 0) {
    const usageRows = await getDb()
      .select({ redemptions: count() })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.couponId, coupon.id),
          eq(schema.orders.email, buyerEmail),
          eq(schema.orders.status, "delivered"),
        ),
      );
    if ((usageRows[0]?.redemptions ?? 0) >= coupon.maxUsesPerCustomer) {
      return { ok: false, reason: "You have already used this coupon the maximum number of times." };
    }
  }

  return { ok: true, coupon, discountCents: computeDiscountCents(coupon, subtotalCents) };
}
