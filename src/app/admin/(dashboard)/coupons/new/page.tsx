import { asc } from "drizzle-orm";

import { CouponEditor } from "@/components/admin/coupons/coupon-editor";
import { getDb, schema } from "@/lib/db";
import { requireShop } from "@/lib/shop";

export default async function NewCouponPage() {
  const shop = await requireShop();
  const products = await getDb()
    .select({ id: schema.products.id, name: schema.products.name })
    .from(schema.products)
    .orderBy(asc(schema.products.name));

  return (
    <CouponEditor
      mode="create"
      couponId={null}
      currency={shop.currency}
      products={products}
      initial={{
        code: "",
        type: "percent",
        value: "",
        maxUses: "",
        maxUsesPerCustomer: "",
        minOrderValue: "",
        startsAt: "",
        expiresAt: "",
        applyToAll: true,
        productIds: [],
      }}
    />
  );
}
