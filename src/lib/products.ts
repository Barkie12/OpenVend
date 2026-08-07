import { and, asc, count, eq, ilike, inArray, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";

export type Product = typeof schema.products.$inferSelect;
export type ProductVariant = typeof schema.productVariants.$inferSelect;
export type ProductFile = typeof schema.productFiles.$inferSelect;
export type ProductGroup = typeof schema.productGroups.$inferSelect;
export type ProductVisibility = Product["visibility"];
export type DeliveryType = Product["deliveryType"];

/** Hard per-order ceiling regardless of variant configuration. */
export const GLOBAL_MAX_QUANTITY = 25;

export interface VariantWithStock extends ProductVariant {
  availableStock: number;
}

export interface ProductWithDetails extends Product {
  variants: VariantWithStock[];
  files: ProductFile[];
  group: ProductGroup | null;
}

/** Available (unsold, unreserved) stock per variant id. */
export async function getAvailableStockByVariant(variantIds: readonly string[]): Promise<Map<string, number>> {
  if (variantIds.length === 0) {
    return new Map();
  }
  const stockRows = await getDb()
    .select({ variantId: schema.stockItems.variantId, available: count() })
    .from(schema.stockItems)
    .where(
      and(
        inArray(schema.stockItems.variantId, [...variantIds]),
        eq(schema.stockItems.status, "available"),
      ),
    )
    .groupBy(schema.stockItems.variantId);

  const availableByVariant = new Map<string, number>();
  for (const row of stockRows) {
    // The inArray filter excludes null variant ids (orphaned history rows).
    if (row.variantId !== null) {
      availableByVariant.set(row.variantId, row.available);
    }
  }
  return availableByVariant;
}

type ProductQueryResult = Product & {
  variants: ProductVariant[];
  files: ProductFile[];
  group: ProductGroup | null;
};

async function attachStockCounts(productRows: ProductQueryResult[]): Promise<ProductWithDetails[]> {
  const variantIds = productRows.flatMap((product) => product.variants.map((variant) => variant.id));
  const stockByVariant = await getAvailableStockByVariant(variantIds);
  return productRows.map((product) => ({
    ...product,
    variants: product.variants.map((variant) => ({
      ...variant,
      availableStock: stockByVariant.get(variant.id) ?? 0,
    })),
  }));
}

function productQueryWith() {
  return {
    variants: { orderBy: [asc(schema.productVariants.sortOrder), asc(schema.productVariants.createdAt)] },
    files: { orderBy: [asc(schema.productFiles.createdAt)] },
    group: true as const,
  };
}

export interface ListProductsOptions {
  publicOnly?: boolean;
  search?: string;
}

export async function listProductsWithDetails(options?: ListProductsOptions): Promise<ProductWithDetails[]> {
  const conditions: SQL[] = [];
  if (options?.publicOnly === true) {
    conditions.push(eq(schema.products.visibility, "public"));
  }
  const search = options?.search?.trim();
  if (search && search.length > 0) {
    conditions.push(ilike(schema.products.name, `%${search}%`));
  }

  const productRows = await getDb().query.products.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: productQueryWith(),
    orderBy: [asc(schema.products.sortOrder), asc(schema.products.createdAt)],
  });
  return attachStockCounts(productRows);
}

export async function getProductWithDetails(productId: string): Promise<ProductWithDetails | null> {
  const productRow = await getDb().query.products.findFirst({
    where: eq(schema.products.id, productId),
    with: productQueryWith(),
  });
  if (!productRow) {
    return null;
  }
  const [withStock] = await attachStockCounts([productRow]);
  return withStock ?? null;
}

export async function getProductBySlug(slug: string): Promise<ProductWithDetails | null> {
  const productRow = await getDb().query.products.findFirst({
    where: eq(schema.products.slug, slug),
    with: productQueryWith(),
  });
  if (!productRow) {
    return null;
  }
  const [withStock] = await attachStockCounts([productRow]);
  return withStock ?? null;
}

/** Public products by id, in the given order — used for upsell suggestions. */
export async function listPublicProductsByIds(productIds: readonly string[]): Promise<ProductWithDetails[]> {
  if (productIds.length === 0) {
    return [];
  }
  const productRows = await getDb().query.products.findMany({
    where: and(inArray(schema.products.id, [...productIds]), eq(schema.products.visibility, "public")),
    with: productQueryWith(),
  });
  const withStock = await attachStockCounts(productRows);
  const orderIndex = new Map(productIds.map((productId, index) => [productId, index]));
  return withStock.sort(
    (productA, productB) => (orderIndex.get(productA.id) ?? 0) - (orderIndex.get(productB.id) ?? 0),
  );
}

export async function listProductGroups(): Promise<ProductGroup[]> {
  return getDb()
    .select()
    .from(schema.productGroups)
    .orderBy(asc(schema.productGroups.sortOrder), asc(schema.productGroups.name));
}

export interface QuantityBounds {
  min: number;
  max: number;
}

/** Effective order-quantity bounds for a variant, respecting the global ceiling. */
export function quantityBounds(variant: Pick<ProductVariant, "minQuantity" | "maxQuantity">): QuantityBounds {
  const min = Math.max(1, Math.min(variant.minQuantity, GLOBAL_MAX_QUANTITY));
  const max = Math.min(variant.maxQuantity ?? GLOBAL_MAX_QUANTITY, GLOBAL_MAX_QUANTITY);
  return { min, max: Math.max(min, max) };
}

/** True when the variant can currently be purchased in the requested quantity. */
export function hasPurchasableStock(
  deliveryType: DeliveryType,
  availableStock: number,
  quantity: number,
): boolean {
  if (deliveryType === "serials") {
    return availableStock >= quantity;
  }
  return true;
}

/** Total purchasable stock across variants; null means unlimited (file/service products). */
export function productAvailableTotal(product: ProductWithDetails): number | null {
  if (product.deliveryType !== "serials") {
    return null;
  }
  return product.variants.reduce((sum, variant) => sum + variant.availableStock, 0);
}
