import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { CouponEditor } from "@/components/admin/coupons/coupon-editor";
import { getDb, schema } from "@/lib/db";
import { requireShop } from "@/lib/shop";

const CENTS_PER_UNIT = 100;

/** Formats a date as a `datetime-local` input value in server-local wall time. */
function toDateTimeLocalValue(date: Date | null): string {
  if (date === null) {
    return "";
  }
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default async function EditCouponPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shop = await requireShop();
  const db = getDb();

  const [coupon, products] = await Promise.all([
    db.query.coupons.findFirst({ where: eq(schema.coupons.id, id) }),
    db
      .select({ id: schema.products.id, name: schema.products.name })
      .from(schema.products)
      .orderBy(asc(schema.products.name)),
  ]);
  if (!coupon) {
    notFound();
  }

  return (
    <CouponEditor
      mode="edit"
      couponId={coupon.id}
      currency={shop.currency}
      products={products}
      initial={{
        code: coupon.code,
        type: coupon.type,
        value:
          coupon.type === "percent"
            ? String(coupon.value)
            : (coupon.value / CENTS_PER_UNIT).toFixed(2),
        maxUses: coupon.maxUses === null ? "" : String(coupon.maxUses),
        maxUsesPerCustomer: coupon.maxUsesPerCustomer === null ? "" : String(coupon.maxUsesPerCustomer),
        minOrderValue:
          coupon.minSubtotalCents === null ? "" : (coupon.minSubtotalCents / CENTS_PER_UNIT).toFixed(2),
        startsAt: toDateTimeLocalValue(coupon.startsAt),
        expiresAt: toDateTimeLocalValue(coupon.expiresAt),
        applyToAll: coupon.productIds === null,
        productIds: coupon.productIds ?? [],
      }}
    />
  );
}
