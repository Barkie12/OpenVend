import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AnalyticsTracker } from "@/components/storefront/analytics-tracker";
import { CheckoutClient } from "@/components/storefront/checkout-client";
import { getDb } from "@/lib/db";
import { schema } from "@/lib/db";
import { enabledProviderIds } from "@/lib/payments";
import { getAvailableStockByVariant, quantityBounds } from "@/lib/products";
import { getShop } from "@/lib/shop";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false },
};

export default async function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  const resolvedSearchParams = await searchParams;
  const variantId = typeof resolvedSearchParams.variant === "string" ? resolvedSearchParams.variant : null;
  const quantityParam =
    typeof resolvedSearchParams.qty === "string" ? Number.parseInt(resolvedSearchParams.qty, 10) : 1;

  if (variantId === null) {
    redirect("/");
  }

  const shop = await getShop();
  if (!shop) {
    redirect("/setup");
  }

  const variant = await getDb().query.productVariants.findFirst({
    where: eq(schema.productVariants.id, variantId),
    with: { product: true },
  });
  if (!variant || variant.product.visibility === "hidden") {
    redirect("/");
  }
  const product = variant.product;

  const bounds = quantityBounds(variant);
  const requestedQuantity = Number.isInteger(quantityParam) && quantityParam > 0 ? quantityParam : bounds.min;
  const quantity =
    product.deliveryType === "file"
      ? 1
      : Math.max(bounds.min, Math.min(bounds.max, requestedQuantity));

  if (product.deliveryType === "serials") {
    const stockByVariant = await getAvailableStockByVariant([variant.id]);
    if ((stockByVariant.get(variant.id) ?? 0) < quantity) {
      redirect(`/p/${product.slug}`);
    }
  }

  return (
    <>
      <AnalyticsTracker />
      <CheckoutClient
        shopName={shop.name}
        shopLogoPath={shop.logoPath}
        productName={product.name}
        productSlug={product.slug}
        productThumbnail={product.images[0] ?? null}
        variantId={variant.id}
        variantName={variant.name}
        unitPriceCents={variant.priceCents}
        quantity={quantity}
        currency={shop.currency}
        enabledProviders={enabledProviderIds(shop)}
        turnstileSiteKey={shop.turnstileSiteKey}
        hasTerms={shop.termsOfService !== null && shop.termsOfService.length > 0}
      />
    </>
  );
}
