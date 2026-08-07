/**
 * Applies the generated migrations to an in-memory Postgres (PGlite) and runs a
 * smoke test over the core tables. Lets contributors validate schema changes
 * without a running database: `npx tsx scripts/verify-db.ts`
 */
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "../src/lib/db/schema";

async function main(): Promise<void> {
  const pglite = new PGlite();
  const db = drizzle({ client: pglite, schema, casing: "snake_case" });

  await migrate(db, { migrationsFolder: "./drizzle" });
  console.info("migrations applied");

  const [shop] = await db
    .insert(schema.shops)
    .values({ name: "Smoke Test Shop", currency: "USD" })
    .returning();
  if (!shop) {
    throw new Error("shop insert returned no row");
  }

  const [product] = await db
    .insert(schema.products)
    .values({
      shopId: shop.id,
      name: "Test Keys",
      slug: "test-keys",
      deliveryType: "serials",
    })
    .returning();
  if (!product) {
    throw new Error("product insert returned no row");
  }

  const [variant] = await db
    .insert(schema.productVariants)
    .values({ shopId: shop.id, productId: product.id, name: "1 month", priceCents: 999 })
    .returning();
  if (!variant) {
    throw new Error("variant insert returned no row");
  }

  await db.insert(schema.stockItems).values([
    { shopId: shop.id, productId: product.id, variantId: variant.id, content: "KEY-AAAA-0001" },
    { shopId: shop.id, productId: product.id, variantId: variant.id, content: "KEY-AAAA-0002" },
  ]);

  const [order] = await db
    .insert(schema.orders)
    .values({
      shopId: shop.id,
      email: "buyer@example.com",
      subtotalCents: 999,
      totalCents: 999,
      currency: "USD",
      accessToken: "smoke-test-token",
    })
    .returning();
  if (!order) {
    throw new Error("order insert returned no row");
  }
  console.info(`order number sequence starts at ${order.orderNumber}`);

  await db.insert(schema.orderItems).values({
    orderId: order.id,
    productId: product.id,
    variantId: variant.id,
    productName: product.name,
    variantName: variant.name,
    deliveryType: "serials",
    unitPriceCents: 999,
    quantity: 1,
  });

  const productWithVariants = await db.query.products.findFirst({
    where: eq(schema.products.id, product.id),
    with: { variants: { with: { stockItems: true } } },
  });
  const stockCount = productWithVariants?.variants[0]?.stockItems.length ?? 0;
  if (stockCount !== 2) {
    throw new Error(`expected 2 stock items via relations, got ${stockCount}`);
  }

  const orderWithItems = await db.query.orders.findFirst({
    where: eq(schema.orders.id, order.id),
    with: { items: true },
  });
  if (orderWithItems?.items.length !== 1) {
    throw new Error("expected 1 order item via relations");
  }

  await pglite.close();
  console.info("schema smoke test passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
