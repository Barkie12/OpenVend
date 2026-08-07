import type { MetadataRoute } from "next";

import { env } from "@/lib/env";
import { listProductsWithDetails } from "@/lib/products";
import { getShop } from "@/lib/shop";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const appUrl = env().APP_URL;
  const shop = await getShop();
  if (!shop) {
    return [];
  }
  const products = await listProductsWithDetails({ publicOnly: true });

  const entries: MetadataRoute.Sitemap = [
    { url: appUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
  ];
  if (shop.termsOfService) {
    entries.push({ url: `${appUrl}/terms`, changeFrequency: "monthly", priority: 0.3 });
  }
  for (const product of products) {
    entries.push({
      url: `${appUrl}/p/${product.slug}`,
      lastModified: product.updatedAt,
      changeFrequency: "daily",
      priority: 0.8,
    });
  }
  return entries;
}
