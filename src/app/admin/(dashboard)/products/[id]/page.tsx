import { asc } from "drizzle-orm";
import { ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductEditor, type EditorState } from "@/components/admin/products/product-editor";
import { ProductFilesCard } from "@/components/admin/products/product-files-card";
import { ProductImagesCard } from "@/components/admin/products/product-images-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDb, schema } from "@/lib/db";
import { centsToPriceInput } from "@/lib/money";
import { getProductWithDetails, listProductGroups } from "@/lib/products";
import { requireShop } from "@/lib/shop";

export default async function ProductEditPage({ params }: PageProps<"/admin/products/[id]">) {
  const { id } = await params;
  const [shop, product, groups, allProducts] = await Promise.all([
    requireShop(),
    getProductWithDetails(id),
    listProductGroups(),
    getDb()
      .select({ id: schema.products.id, name: schema.products.name })
      .from(schema.products)
      .orderBy(asc(schema.products.name)),
  ]);
  if (!product) {
    notFound();
  }

  const initialState: EditorState = {
    name: product.name,
    slug: product.slug,
    groupId: product.groupId ?? "none",
    description: product.description,
    descriptionTabs: product.descriptionTabs.map((tab, index) => ({
      key: `tab-${index}`,
      title: tab.title,
      content: tab.content,
    })),
    metaTitle: product.metaTitle ?? "",
    metaDescription: product.metaDescription ?? "",
    instructions: product.serviceInstructions ?? "",
    visibility: product.visibility,
    upsellProductIds: product.upsellProductIds,
    variants: product.variants.map((variant) => ({
      key: variant.id,
      id: variant.id,
      name: variant.name,
      price: centsToPriceInput(variant.priceCents),
      compareAtPrice:
        variant.compareAtPriceCents === null ? "" : centsToPriceInput(variant.compareAtPriceCents),
      minQuantity: String(variant.minQuantity),
      maxQuantity: variant.maxQuantity === null ? "" : String(variant.maxQuantity),
    })),
  };

  const stockByVariantId: Record<string, number> = {};
  for (const variant of product.variants) {
    stockByVariantId[variant.id] = variant.availableStock;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Edit Product</h1>
          <p className="text-sm text-muted-foreground">Edit the product details below.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{product.deliveryType}</Badge>
          <Button asChild variant="outline" size="sm">
            <Link href={`/p/${product.slug}`} target="_blank">
              <ExternalLink className="size-4" />
              View
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/products">
              <X className="size-4" />
              Cancel
            </Link>
          </Button>
        </div>
      </div>

      <ProductEditor
        productId={product.id}
        productName={product.name}
        deliveryType={product.deliveryType}
        currency={shop.currency}
        groups={groups.map((group) => ({ id: group.id, name: group.name }))}
        upsellOptions={allProducts.filter((candidate) => candidate.id !== product.id)}
        initial={initialState}
        stockByVariantId={stockByVariantId}
        imagesCard={<ProductImagesCard productId={product.id} images={product.images} />}
        filesCard={
          <ProductFilesCard
            productId={product.id}
            deliveryType={product.deliveryType}
            files={product.files.map((productFile) => ({
              id: productFile.id,
              fileName: productFile.fileName,
              sizeBytes: productFile.sizeBytes,
            }))}
          />
        }
      />
    </div>
  );
}
