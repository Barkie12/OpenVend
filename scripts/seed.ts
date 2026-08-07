/**
 * Seeds demo data for local development: a shop, an owner account, products
 * with stock, and a coupon. Safe to re-run — existing data is never duplicated.
 *
 *   npm run db:seed
 *
 * Demo owner login: admin@example.com / demo-password-123
 */
import "dotenv/config";
import { count } from "drizzle-orm";

import { getAuth } from "../src/lib/auth";
import { getDb, schema } from "../src/lib/db";

const DEMO_OWNER_EMAIL = "admin@example.com";
const DEMO_OWNER_PASSWORD = "demo-password-123";
const SERIAL_STOCK_COUNT = 25;

async function main(): Promise<void> {
  const db = getDb();

  const [shopCountRow] = await db.select({ total: count() }).from(schema.shops);
  let shopId: string;
  if ((shopCountRow?.total ?? 0) > 0) {
    const existingShops = await db.select({ id: schema.shops.id }).from(schema.shops).limit(1);
    const existingShop = existingShops[0];
    if (!existingShop) {
      throw new Error("Shop count > 0 but no row found");
    }
    shopId = existingShop.id;
    console.info("shop already exists — skipping");
  } else {
    const [createdShop] = await db
      .insert(schema.shops)
      .values({
        name: "Demo Shop",
        description: "Digital goods with instant delivery — powered by OpenVend.",
        currency: "USD",
      })
      .returning({ id: schema.shops.id });
    if (!createdShop) {
      throw new Error("Failed to create shop");
    }
    shopId = createdShop.id;
    console.info("created demo shop");
  }

  const [userCountRow] = await db.select({ total: count() }).from(schema.user);
  if ((userCountRow?.total ?? 0) === 0) {
    await getAuth().api.signUpEmail({
      body: { name: "Demo Admin", email: DEMO_OWNER_EMAIL, password: DEMO_OWNER_PASSWORD },
    });
    console.info(`created owner account ${DEMO_OWNER_EMAIL} / ${DEMO_OWNER_PASSWORD}`);
  } else {
    console.info("owner account already exists — skipping");
  }

  const [productCountRow] = await db.select({ total: count() }).from(schema.products);
  if ((productCountRow?.total ?? 0) > 0) {
    console.info("products already exist — skipping");
    return;
  }

  const [licenseProduct] = await db
    .insert(schema.products)
    .values({
      shopId,
      name: "Premium License Key",
      slug: "premium-license-key",
      description:
        "Instant delivery of a **premium license key**.\n\n- Activates immediately\n- No account required\n- Support via Discord",
      deliveryType: "serials",
      visibility: "public",
    })
    .returning({ id: schema.products.id });
  if (!licenseProduct) {
    throw new Error("Failed to create demo product");
  }

  const [monthlyVariant, lifetimeVariant] = await db
    .insert(schema.productVariants)
    .values([
      { shopId, productId: licenseProduct.id, name: "1 Month", priceCents: 999, sortOrder: 0 },
      { shopId, productId: licenseProduct.id, name: "Lifetime", priceCents: 2499, sortOrder: 1 },
    ])
    .returning({ id: schema.productVariants.id });
  if (!monthlyVariant || !lifetimeVariant) {
    throw new Error("Failed to create demo variants");
  }

  const stockValues = [];
  for (let index = 0; index < SERIAL_STOCK_COUNT; index += 1) {
    stockValues.push({
      shopId,
      productId: licenseProduct.id,
      variantId: monthlyVariant.id,
      content: `DEMO-1M-${String(index + 1).padStart(4, "0")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    });
    stockValues.push({
      shopId,
      productId: licenseProduct.id,
      variantId: lifetimeVariant.id,
      content: `DEMO-LT-${String(index + 1).padStart(4, "0")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    });
  }
  await db.insert(schema.stockItems).values(stockValues);

  const [serviceProduct] = await db
    .insert(schema.products)
    .values({
      shopId,
      name: "Custom Setup Service",
      slug: "custom-setup-service",
      description: "I set everything up for you within 24 hours. You receive instructions right after payment.",
      deliveryType: "service",
      serviceInstructions:
        "Thanks for your order! Join our Discord (discord.gg/example) and open a ticket with your order number.",
      visibility: "public",
    })
    .returning({ id: schema.products.id });
  if (!serviceProduct) {
    throw new Error("Failed to create demo service product");
  }
  await db.insert(schema.productVariants).values({
    shopId,
    productId: serviceProduct.id,
    name: "Default",
    priceCents: 4999,
  });

  await db.insert(schema.coupons).values({
    shopId,
    code: "WELCOME10",
    type: "percent",
    value: 10,
    maxUses: 100,
  });

  console.info("seeded demo products, stock and the WELCOME10 coupon");
}

main()
  .then(() => process.exit(0))
  .catch((seedError: unknown) => {
    console.error(seedError);
    process.exit(1);
  });
