/**
 * Integration test of the order lifecycle against the configured database.
 * Fully self-contained: creates a throwaway product (serials + an attached
 * downloadable file + instructions), verifies reservation, delivery, file and
 * instruction deliverables, idempotency, expiry and cancellation, then removes
 * everything it created.
 *
 *   npx tsx scripts/verify-order-flow.ts
 */
import "dotenv/config";
import { and, count, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "../src/lib/db";
import {
  cancelPendingOrder,
  createPendingOrder,
  finalizeOrderPaid,
  getOrderByAccessToken,
  releaseExpiredReservations,
} from "../src/lib/orders";

const TEST_EMAIL = "order-flow-test@example.com";
const TEST_SLUG = "verify-order-flow-product";
const STOCK_LINES = 5;

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.info(`ok - ${message}`);
}

async function availableStock(variantId: string): Promise<number> {
  const rows = await getDb()
    .select({ total: count() })
    .from(schema.stockItems)
    .where(and(eq(schema.stockItems.variantId, variantId), eq(schema.stockItems.status, "available")));
  return rows[0]?.total ?? 0;
}

async function cleanup(productId: string | null): Promise<void> {
  const db = getDb();
  const testOrders = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(eq(schema.orders.email, TEST_EMAIL));
  const orderIds = testOrders.map((row) => row.id);
  if (orderIds.length > 0) {
    const itemRows = await db
      .select({ id: schema.orderItems.id })
      .from(schema.orderItems)
      .where(inArray(schema.orderItems.orderId, orderIds));
    const itemIds = itemRows.map((row) => row.id);
    if (itemIds.length > 0) {
      await db.delete(schema.stockItems).where(inArray(schema.stockItems.orderItemId, itemIds));
    }
    await db.delete(schema.orders).where(inArray(schema.orders.id, orderIds));
  }
  if (productId !== null) {
    await db.delete(schema.products).where(eq(schema.products.id, productId));
  }
}

async function main(): Promise<void> {
  const db = getDb();

  const shopRows = await db.select().from(schema.shops).limit(1);
  const shop = shopRows[0];
  if (!shop) {
    throw new Error("No shop found — complete /setup first");
  }

  // Remove leftovers from a previous crashed run.
  const leftoverProduct = await db.query.products.findFirst({
    where: eq(schema.products.slug, TEST_SLUG),
  });
  await cleanup(leftoverProduct?.id ?? null);

  const [product] = await db
    .insert(schema.products)
    .values({
      shopId: shop.id,
      name: "Verify Order Flow Product",
      slug: TEST_SLUG,
      deliveryType: "serials",
      visibility: "hidden",
      serviceInstructions: "Redeem at example.com/redeem",
    })
    .returning();
  if (!product) {
    throw new Error("Failed to create test product");
  }

  try {
    const [variant] = await db
      .insert(schema.productVariants)
      .values({ shopId: shop.id, productId: product.id, name: "Test", priceCents: 1234 })
      .returning();
    if (!variant) {
      throw new Error("Failed to create test variant");
    }

    await db.insert(schema.stockItems).values(
      Array.from({ length: STOCK_LINES }, (_, index) => ({
        shopId: shop.id,
        productId: product.id,
        variantId: variant.id,
        content: `VERIFY-${String(index + 1).padStart(4, "0")}`,
      })),
    );

    // Downloadable file attached to a SERIALS product — deliverables are composable.
    await db.insert(schema.productFiles).values({
      shopId: shop.id,
      productId: product.id,
      fileName: "loader.txt",
      filePath: "files/verify-order-flow-placeholder.txt",
      sizeBytes: 42,
    });

    const requestContext = { ipAddress: "203.0.113.7", country: "US", userAgent: "verify-script" };
    const orderInput = {
      shop,
      product: {
        id: product.id,
        name: product.name,
        deliveryType: product.deliveryType,
        serviceInstructions: product.serviceInstructions,
      },
      variant: { id: variant.id, name: variant.name, priceCents: variant.priceCents },
      email: TEST_EMAIL,
      context: requestContext,
      coupon: null,
      discountCents: 0,
    };

    // 1. Reservation locks stock.
    const paidOrder = await createPendingOrder({ ...orderInput, quantity: 2 });
    assertCondition(paidOrder.status === "pending", "order created as pending");
    assertCondition((await availableStock(variant.id)) === STOCK_LINES - 2, "reservation locked 2 items");

    // 2. Finalize delivers serials, the attached file, and instructions.
    const finalizeResult = await finalizeOrderPaid(paidOrder.id, "test-provider");
    assertCondition(finalizeResult.outcome === "delivered", "finalize outcome is delivered");
    const deliveredOrder = await getOrderByAccessToken(paidOrder.accessToken);
    const deliveredItem = deliveredOrder?.items[0];
    assertCondition(deliveredItem?.serials.length === 2, "2 serials delivered");
    assertCondition(
      deliveredItem?.files.length === 1 && deliveredItem.files[0]?.fileName === "loader.txt",
      "attached file delivered with a serials product",
    );
    assertCondition(
      deliveredItem?.serviceInstructions === "Redeem at example.com/redeem",
      "instructions snapshot delivered",
    );

    // 3. Repeated webhook delivery is idempotent.
    const repeatResult = await finalizeOrderPaid(paidOrder.id, "test-provider");
    assertCondition(repeatResult.outcome === "already_finalized", "second finalize is a no-op");

    // 4. Expired reservations release stock.
    const expiringOrder = await createPendingOrder({ ...orderInput, quantity: 1 });
    await db
      .update(schema.orders)
      .set({ reservationExpiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.orders.id, expiringOrder.id));
    const expiredCount = await releaseExpiredReservations();
    assertCondition(expiredCount >= 1, "cleanup expired at least one order");
    assertCondition((await availableStock(variant.id)) === STOCK_LINES - 2, "expired order returned stock");

    // 5. Cancellation releases stock.
    const cancelledOrder = await createPendingOrder({ ...orderInput, quantity: 1 });
    assertCondition(await cancelPendingOrder(cancelledOrder.id), "pending order cancelled");
    assertCondition((await availableStock(variant.id)) === STOCK_LINES - 2, "cancelled order returned stock");

    console.info("\norder flow verification passed");
  } finally {
    await cleanup(product.id);
    console.info("test data removed");
  }
}

main()
  .then(() => process.exit(0))
  .catch((verificationError: unknown) => {
    console.error(verificationError);
    process.exit(1);
  });
