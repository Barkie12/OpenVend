import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ImageGallery } from "@/components/storefront/image-gallery";
import { Markdown } from "@/components/storefront/markdown";
import { ProductCard } from "@/components/storefront/product-card";
import { PurchasePanel } from "@/components/storefront/purchase-panel";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { env } from "@/lib/env";
import {
  getProductBySlug,
  listPublicProductsByIds,
  productAvailableTotal,
  type ProductWithDetails,
} from "@/lib/products";
import { requireShop, type Shop } from "@/lib/shop";
import { imageUrl } from "@/lib/image-url";

const DESCRIPTION_PREVIEW_LENGTH = 160;
const CENTS_PER_UNIT = 100;

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const [shop, product] = await Promise.all([requireShop(), getProductBySlug(slug)]);
  if (!product || product.visibility === "hidden") {
    return { title: "Not found" };
  }
  const firstImage = product.images[0];
  const title = product.metaTitle ?? `${product.name} - ${shop.name}`;
  const description =
    product.metaDescription ?? (product.description.slice(0, DESCRIPTION_PREVIEW_LENGTH) || undefined);
  return {
    title,
    description,
    alternates: { canonical: `/p/${product.slug}` },
    openGraph: {
      title,
      description,
      type: "website",
      ...(firstImage ? { images: [imageUrl(firstImage)] } : {}),
    },
  };
}

/** schema.org Product markup for rich search results. */
function productJsonLd(product: ProductWithDetails, shop: Shop): string {
  const appUrl = env().APP_URL;
  const prices = product.variants.map((variant) => variant.priceCents / CENTS_PER_UNIT);
  const availableTotal = productAvailableTotal(product);
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.metaDescription ?? product.description.slice(0, DESCRIPTION_PREVIEW_LENGTH),
    ...(product.images[0] ? { image: `${appUrl}${imageUrl(product.images[0])}` } : {}),
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: shop.currency,
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: product.variants.length,
      availability:
        availableTotal === null || availableTotal > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      url: `${appUrl}/p/${product.slug}`,
    },
  });
  // `</script>` inside product text must not break out of the JSON-LD block.
  return jsonLd.replaceAll("<", "\\u003c");
}

export default async function ProductPage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const [shop, product] = await Promise.all([requireShop(), getProductBySlug(slug)]);
  if (!product || product.visibility === "hidden") {
    notFound();
  }

  const availableTotal = productAvailableTotal(product);
  const upsellProducts = await listPublicProductsByIds(product.upsellProductIds);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
            {availableTotal !== null ? (
              <Badge variant={availableTotal > 0 ? "secondary" : "destructive"}>
                {availableTotal > 0 ? `${availableTotal} in stock` : "Out of stock"}
              </Badge>
            ) : null}
          </div>
        </div>

        <ImageGallery images={product.images} productName={product.name} />

        {product.descriptionTabs.length > 0 ? (
          <Tabs defaultValue="tab-main">
            <TabsList>
              <TabsTrigger value="tab-main">Description</TabsTrigger>
              {product.descriptionTabs.map((tab, index) => (
                <TabsTrigger key={`trigger-${index}`} value={`tab-${index}`}>
                  {tab.title}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="tab-main" className="mt-4">
              {product.description.length > 0 ? (
                <Markdown content={product.description} />
              ) : (
                <p className="text-muted-foreground">No description provided.</p>
              )}
            </TabsContent>
            {product.descriptionTabs.map((tab, index) => (
              <TabsContent key={`content-${index}`} value={`tab-${index}`} className="mt-4">
                <Markdown content={tab.content} />
              </TabsContent>
            ))}
          </Tabs>
        ) : product.description.length > 0 ? (
          <Markdown content={product.description} />
        ) : (
          <p className="text-muted-foreground">No description provided.</p>
        )}

        {upsellProducts.length > 0 ? (
          <section className="space-y-4 border-t pt-6">
            <h2 className="text-lg font-semibold tracking-tight">You might also like</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {upsellProducts.map((upsellProduct) => (
                <ProductCard key={upsellProduct.id} product={upsellProduct} currency={shop.currency} />
              ))}
            </div>
          </section>
        ) : null}

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: productJsonLd(product, shop) }}
        />
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <PurchasePanel
          deliveryType={product.deliveryType}
          currency={shop.currency}
          variants={product.variants.map((variant) => ({
            id: variant.id,
            name: variant.name,
            priceCents: variant.priceCents,
            compareAtPriceCents: variant.compareAtPriceCents,
            minQuantity: variant.minQuantity,
            maxQuantity: variant.maxQuantity,
            availableStock: variant.availableStock,
          }))}
        />
      </div>
    </div>
  );
}
