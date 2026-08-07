/**
 * Populates the database with a realistic mock sales history for demos and
 * dashboard development: customers, delivered/pending/review/cancelled orders
 * over the past 45 days, matching delivered stock, payments, coupon usage,
 * and placeholder product images. All rows are generated in memory and
 * bulk-inserted, so the ingest takes seconds even against a remote database.
 *
 *   npm run db:seed:demo            # ingest mock history
 *   npm run db:seed:demo -- --clean # remove previously ingested mock data
 *
 * Demo buyers all use the @demo.example domain, so cleanup is precise.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { count, eq, inArray, like, sql } from "drizzle-orm";

import { getDb, schema } from "../src/lib/db";
import { generateOrderToken } from "../src/lib/crypto";
import { resolveStoredPath } from "../src/lib/storage";

const DEMO_EMAIL_DOMAIN = "demo.example";
const HISTORY_DAYS = 45;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const INSERT_CHUNK_SIZE = 500;

// Deterministic PRNG so repeated ingests produce a similar shape.
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(1337);

function randomInt(minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(random() * (maxInclusive - minInclusive + 1));
}

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) {
    throw new Error("pick() called with an empty list");
  }
  return item;
}

function pickWeighted<T>(entries: readonly { item: T; weight: number }[]): T {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let threshold = random() * totalWeight;
  for (const entry of entries) {
    threshold -= entry.weight;
    if (threshold <= 0) {
      return entry.item;
    }
  }
  const lastEntry = entries[entries.length - 1];
  if (!lastEntry) {
    throw new Error("pickWeighted() called with an empty list");
  }
  return lastEntry.item;
}

const FIRST_NAMES = [
  "alex", "jordan", "sam", "taylor", "chris", "morgan", "casey", "jamie",
  "riley", "quinn", "drew", "sage", "finn", "noah",
] as const;
const LAST_NAMES = [
  "miller", "smith", "chen", "garcia", "kowalski", "novak", "dubois",
  "jansen", "berg", "silva", "moreau", "weber",
] as const;
const COUNTRIES = ["US", "DE", "GB", "NL", "CA", "FR", "AU", "SE"] as const;
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
] as const;

interface DemoCustomer {
  email: string;
  country: string;
  ipAddress: string;
  weight: number;
}

function buildCustomers(): DemoCustomer[] {
  const customers: DemoCustomer[] = [];
  const usedEmails = new Set<string>();
  while (customers.length < 14) {
    const email = `${pick(FIRST_NAMES)}.${pick(LAST_NAMES)}@${DEMO_EMAIL_DOMAIN}`;
    if (usedEmails.has(email)) {
      continue;
    }
    usedEmails.add(email);
    customers.push({
      email,
      country: pick(COUNTRIES),
      ipAddress: `203.0.113.${randomInt(2, 250)}`,
      // The first few customers become "whales" for the top-spenders card.
      weight: customers.length < 3 ? 5 : 1,
    });
  }
  return customers;
}

interface ImageSpec {
  title: string;
  colorFrom: string;
  colorTo: string;
}

async function storePlaceholderImage(spec: ImageSpec): Promise<string> {
  const svgContents = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${spec.colorFrom}"/>
      <stop offset="1" stop-color="${spec.colorTo}"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bg)"/>
  <text x="50%" y="52%" font-family="Arial, sans-serif" font-size="34" font-weight="bold"
        fill="rgba(255,255,255,0.92)" text-anchor="middle">${spec.title}</text>
</svg>`;
  const relativePath = path.posix.join("images", `${randomUUID()}.svg`);
  const absolutePath = resolveStoredPath(relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, svgContents, "utf8");
  return relativePath;
}

interface ProductBlueprint {
  slug: string;
  name: string;
  description: string;
  deliveryType: "serials" | "file" | "service";
  serviceInstructions: string | null;
  groupName: string | null;
  variants: { name: string; priceCents: number }[];
  image: ImageSpec;
}

const PRODUCT_BLUEPRINTS: readonly ProductBlueprint[] = [
  {
    slug: "premium-license-key",
    name: "Premium License Key",
    description: "Instant delivery of a **premium license key**.",
    deliveryType: "serials",
    serviceInstructions: "Redeem your key at example.com/redeem — contact us on Discord if anything fails.",
    groupName: "License Keys",
    variants: [
      { name: "1 Month", priceCents: 999 },
      { name: "Lifetime", priceCents: 2499 },
    ],
    image: { title: "Premium Key", colorFrom: "#7c3aed", colorTo: "#312e81" },
  },
  {
    slug: "discord-nitro-1-year",
    name: "Discord Nitro 1 Year",
    description: "A full year of Nitro, delivered as a redeem link within seconds of payment.",
    deliveryType: "serials",
    serviceInstructions: null,
    groupName: "License Keys",
    variants: [{ name: "Default", priceCents: 5499 }],
    image: { title: "Nitro 1 Year", colorFrom: "#0ea5e9", colorTo: "#1e3a8a" },
  },
  {
    slug: "starter-guide",
    name: "Starter Guide",
    description: "A practical guide to get set up in under ten minutes. Direct download after payment.",
    deliveryType: "file",
    serviceInstructions: null,
    groupName: "Guides",
    variants: [{ name: "Default", priceCents: 499 }],
    image: { title: "Starter Guide", colorFrom: "#059669", colorTo: "#064e3b" },
  },
  {
    slug: "custom-setup-service",
    name: "Custom Setup Service",
    description: "I set everything up for you within 24 hours.",
    deliveryType: "service",
    serviceInstructions: "Thanks for your order! Join our Discord and open a ticket with your order number.",
    groupName: "Services",
    variants: [{ name: "Default", priceCents: 4999 }],
    image: { title: "Setup Service", colorFrom: "#ea580c", colorTo: "#7c2d12" },
  },
];

async function ensureGroups(shopId: string): Promise<Map<string, string>> {
  const db = getDb();
  const groupIdByName = new Map<string, string>();
  const wantedNames = [
    ...new Set(
      PRODUCT_BLUEPRINTS.map((blueprint) => blueprint.groupName).filter(
        (name): name is string => name !== null,
      ),
    ),
  ];
  const existingGroups = await db.select().from(schema.productGroups);
  for (const group of existingGroups) {
    groupIdByName.set(group.name, group.id);
  }
  for (const [index, name] of wantedNames.entries()) {
    if (!groupIdByName.has(name)) {
      const [createdGroup] = await db
        .insert(schema.productGroups)
        .values({ shopId, name, sortOrder: index })
        .returning({ id: schema.productGroups.id });
      if (createdGroup) {
        groupIdByName.set(name, createdGroup.id);
        console.info(`created product group ${name}`);
      }
    }
  }
  return groupIdByName;
}

interface VariantHandle {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  priceCents: number;
  deliveryType: "serials" | "file" | "service";
  serviceInstructions: string | null;
  weight: number;
}

async function ensureCatalog(shopId: string): Promise<VariantHandle[]> {
  const db = getDb();
  const handles: VariantHandle[] = [];
  const groupIdByName = await ensureGroups(shopId);

  for (const blueprint of PRODUCT_BLUEPRINTS) {
    const blueprintGroupId =
      blueprint.groupName !== null ? (groupIdByName.get(blueprint.groupName) ?? null) : null;
    let product = await db.query.products.findFirst({
      where: eq(schema.products.slug, blueprint.slug),
      with: { variants: true, files: true },
    });

    if (product && product.groupId === null && blueprintGroupId !== null) {
      await db
        .update(schema.products)
        .set({ groupId: blueprintGroupId })
        .where(eq(schema.products.id, product.id));
      console.info(`assigned ${product.name} to group ${blueprint.groupName}`);
    }

    if (!product) {
      const [createdProduct] = await db
        .insert(schema.products)
        .values({
          shopId,
          groupId: blueprintGroupId,
          slug: blueprint.slug,
          name: blueprint.name,
          description: blueprint.description,
          deliveryType: blueprint.deliveryType,
          serviceInstructions: blueprint.serviceInstructions,
          visibility: "public",
        })
        .returning({ id: schema.products.id });
      if (!createdProduct) {
        throw new Error(`Failed to create product ${blueprint.slug}`);
      }
      await db.insert(schema.productVariants).values(
        blueprint.variants.map((variant, index) => ({
          shopId,
          productId: createdProduct.id,
          name: variant.name,
          priceCents: variant.priceCents,
          sortOrder: index,
        })),
      );
      product = await db.query.products.findFirst({
        where: eq(schema.products.id, createdProduct.id),
        with: { variants: true, files: true },
      });
      if (!product) {
        throw new Error(`Failed to reload product ${blueprint.slug}`);
      }
      console.info(`created product ${blueprint.name}`);
    }

    if (product.images.length === 0) {
      const storedImage = await storePlaceholderImage(blueprint.image);
      await db
        .update(schema.products)
        .set({ images: [storedImage] })
        .where(eq(schema.products.id, product.id));
      console.info(`added placeholder image to ${product.name}`);
    }

    if (blueprint.deliveryType === "file" && product.files.length === 0) {
      const fileContents = [
        `${blueprint.name} — demo deliverable`,
        "",
        "This file was generated by scripts/seed-demo-orders.ts so file-delivery",
        "products have something real to download in demos.",
      ].join("\n");
      const relativePath = path.posix.join("files", `${randomUUID()}.txt`);
      const absolutePath = resolveStoredPath(relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, fileContents, "utf8");
      await db.insert(schema.productFiles).values({
        shopId,
        productId: product.id,
        fileName: "starter-guide.txt",
        filePath: relativePath,
        sizeBytes: Buffer.byteLength(fileContents, "utf8"),
      });
      console.info(`added demo deliverable file to ${product.name}`);
    }

    for (const variant of product.variants) {
      handles.push({
        productId: product.id,
        productName: product.name,
        variantId: variant.id,
        variantName: variant.name,
        priceCents: variant.priceCents,
        deliveryType: product.deliveryType,
        serviceInstructions: product.serviceInstructions,
        weight: product.deliveryType === "serials" ? 4 : 1,
      });
    }
  }

  return handles;
}

type OrderInsert = typeof schema.orders.$inferInsert;
type OrderItemInsert = typeof schema.orderItems.$inferInsert;
type StockItemInsert = typeof schema.stockItems.$inferInsert;
type PaymentInsert = typeof schema.payments.$inferInsert;
type PaymentEventInsert = typeof schema.paymentEvents.$inferInsert;

interface RowCollectors {
  orders: OrderInsert[];
  orderItems: OrderItemInsert[];
  stockItems: StockItemInsert[];
  payments: PaymentInsert[];
  paymentEvents: PaymentEventInsert[];
}

type OrderStatus = "delivered" | "pending" | "requires_review" | "cancelled" | "expired" | "refunded";

interface BuildDemoOrderInput {
  shopId: string;
  currency: string;
  customer: DemoCustomer;
  variant: VariantHandle;
  quantity: number;
  status: OrderStatus;
  createdAt: Date;
  provider: "stripe" | "nowpayments" | "free";
  couponId: string | null;
  couponCode: string | null;
  discountPercent: number;
  reviewReason: string | null;
}

function buildDemoOrder(input: BuildDemoOrderInput, collectors: RowCollectors): void {
  const orderId = randomUUID();
  const orderItemId = randomUUID();
  const subtotalCents = input.variant.priceCents * input.quantity;
  const discountCents = Math.floor((subtotalCents * input.discountPercent) / 100);
  const totalCents = input.provider === "free" ? 0 : subtotalCents - discountCents;
  const isPaid =
    input.status === "delivered" || input.status === "refunded" || input.status === "requires_review";
  const paidAt = isPaid ? new Date(input.createdAt.getTime() + randomInt(1, 15) * MINUTE_MS) : null;
  const deliveredAt = input.status === "delivered" || input.status === "refunded" ? paidAt : null;

  collectors.orders.push({
    id: orderId,
    shopId: input.shopId,
    email: input.customer.email,
    status: input.status,
    subtotalCents,
    discountCents,
    totalCents,
    currency: input.currency,
    couponId: input.couponId,
    couponCode: input.couponCode,
    paymentProvider: input.provider,
    accessToken: generateOrderToken(),
    ipAddress: input.customer.ipAddress,
    country: input.customer.country,
    userAgent: pick(USER_AGENTS),
    reviewReason: input.reviewReason,
    reservationExpiresAt: input.status === "pending" ? new Date(Date.now() + 30 * MINUTE_MS) : null,
    paidAt,
    deliveredAt,
    createdAt: input.createdAt,
    updatedAt: deliveredAt ?? paidAt ?? input.createdAt,
  });

  collectors.orderItems.push({
    id: orderItemId,
    orderId,
    productId: input.variant.productId,
    variantId: input.variant.variantId,
    productName: input.variant.productName,
    variantName: input.variant.variantName,
    deliveryType: input.variant.deliveryType,
    serviceInstructions: input.variant.serviceInstructions,
    unitPriceCents: input.variant.priceCents,
    quantity: input.quantity,
  });

  // Historical serial stock is inserted as already delivered (or reserved for
  // pending orders) so order pages show real serials without touching the
  // sellable pool.
  if (input.variant.deliveryType === "serials" && (deliveredAt !== null || input.status === "pending")) {
    for (let serialIndex = 0; serialIndex < input.quantity; serialIndex += 1) {
      collectors.stockItems.push({
        shopId: input.shopId,
        productId: input.variant.productId,
        variantId: input.variant.variantId,
        content: `DEMO-${input.variant.variantName.replaceAll(" ", "").toUpperCase().slice(0, 4)}-${randomUUID().slice(0, 13).toUpperCase()}`,
        status: deliveredAt !== null ? "delivered" : "reserved",
        orderItemId,
        reservedAt: paidAt ?? input.createdAt,
        deliveredAt,
        createdAt: input.createdAt,
      });
    }
  }

  if (input.provider !== "free") {
    const paymentId = randomUUID();
    const externalId =
      input.provider === "stripe"
        ? `cs_test_${randomUUID().replaceAll("-", "").slice(0, 24)}`
        : String(randomInt(4_000_000, 9_999_999));
    const paymentStatus =
      input.status === "delivered" || input.status === "refunded"
        ? input.provider === "stripe"
          ? "paid"
          : "finished"
        : input.status === "requires_review"
          ? "partially_paid"
          : input.status === "expired"
            ? "expired"
            : input.status === "cancelled"
              ? "failed"
              : "created";

    collectors.payments.push({
      id: paymentId,
      shopId: input.shopId,
      orderId,
      provider: input.provider,
      externalId,
      status: paymentStatus,
      amountCents: totalCents,
      currency: input.currency,
      createdAt: input.createdAt,
      updatedAt: paidAt ?? input.createdAt,
    });

    if (paymentStatus !== "created") {
      collectors.paymentEvents.push({
        orderId,
        paymentId,
        provider: input.provider,
        eventType: input.provider === "stripe" ? "checkout.session.completed" : paymentStatus,
        payload: { demo: true, externalId, status: paymentStatus },
        createdAt: paidAt ?? input.createdAt,
      });
    }
  }
}

async function insertChunked<T>(rows: T[], insertChunk: (chunk: T[]) => Promise<void>): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += INSERT_CHUNK_SIZE) {
    await insertChunk(rows.slice(offset, offset + INSERT_CHUNK_SIZE));
  }
}

async function cleanDemoData(): Promise<void> {
  const db = getDb();
  const demoOrders = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(like(schema.orders.email, `%@${DEMO_EMAIL_DOMAIN}`));
  const orderIds = demoOrders.map((row) => row.id);
  if (orderIds.length === 0) {
    console.info("no demo orders to clean");
    return;
  }

  const itemRows = await db
    .select({ id: schema.orderItems.id })
    .from(schema.orderItems)
    .where(inArray(schema.orderItems.orderId, orderIds));
  const itemIds = itemRows.map((row) => row.id);
  if (itemIds.length > 0) {
    await db.delete(schema.stockItems).where(inArray(schema.stockItems.orderItemId, itemIds));
  }
  await db.delete(schema.paymentEvents).where(inArray(schema.paymentEvents.orderId, orderIds));
  await db.delete(schema.orders).where(inArray(schema.orders.id, orderIds));
  console.info(`removed ${orderIds.length} demo orders and their stock/payment records`);
}

async function main(): Promise<void> {
  const db = getDb();

  if (process.argv.includes("--clean")) {
    await cleanDemoData();
    return;
  }

  const shopRows = await db.select().from(schema.shops).limit(1);
  const shop = shopRows[0];
  if (!shop) {
    throw new Error("No shop found — run `npm run db:seed` or complete /setup first");
  }

  // Catalog assurance (products, groups, images, files) is idempotent and runs
  // even when order history already exists.
  const variants = await ensureCatalog(shop.id);

  const [existingDemo] = await db
    .select({ total: count() })
    .from(schema.orders)
    .where(like(schema.orders.email, `%@${DEMO_EMAIL_DOMAIN}`));
  if ((existingDemo?.total ?? 0) > 0) {
    console.info(
      `demo data already present (${existingDemo?.total} orders) — catalog refreshed, orders left untouched`,
    );
    return;
  }

  const customers = buildCustomers();
  const coupon = await db.query.coupons.findFirst({ where: eq(schema.coupons.code, "WELCOME10") });

  const collectors: RowCollectors = {
    orders: [],
    orderItems: [],
    stockItems: [],
    payments: [],
    paymentEvents: [],
  };

  let couponUses = 0;
  let revenueCents = 0;
  const now = new Date();

  for (let daysAgo = HISTORY_DAYS; daysAgo >= 0; daysAgo -= 1) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
    // Mild upward trend with noise; guarantee a few sales today for the "Today" range.
    const trendBoost = daysAgo < 10 ? 1 : 0;
    const dailyOrders = daysAgo === 0 ? randomInt(2, 4) : randomInt(0, 4 + trendBoost);

    for (let orderIndex = 0; orderIndex < dailyOrders; orderIndex += 1) {
      const customer = pickWeighted(customers.map((entry) => ({ item: entry, weight: entry.weight })));
      const variant = pickWeighted(variants.map((entry) => ({ item: entry, weight: entry.weight })));
      const quantity =
        variant.deliveryType === "file"
          ? 1
          : pickWeighted([
              { item: 1, weight: 6 },
              { item: 2, weight: 2 },
              { item: 3, weight: 1 },
            ]);
      const provider = pickWeighted([
        { item: "stripe" as const, weight: 9 },
        { item: "nowpayments" as const, weight: 8 },
        { item: "free" as const, weight: 1 },
      ]);
      const usesCoupon = coupon !== undefined && provider !== "free" && random() < 0.15;
      const hourOfDay = randomInt(0, daysAgo === 0 ? Math.max(0, now.getHours() - 1) : 23);
      const createdAt = new Date(dayStart.getTime() + hourOfDay * HOUR_MS + randomInt(0, 59) * MINUTE_MS);

      buildDemoOrder(
        {
          shopId: shop.id,
          currency: shop.currency,
          customer,
          variant,
          quantity,
          status: "delivered",
          createdAt,
          provider,
          couponId: usesCoupon && coupon ? coupon.id : null,
          couponCode: usesCoupon && coupon ? coupon.code : null,
          discountPercent: usesCoupon && coupon ? coupon.value : 0,
          reviewReason: null,
        },
        collectors,
      );

      if (usesCoupon) {
        couponUses += 1;
      }
      const subtotal = variant.priceCents * quantity;
      revenueCents +=
        provider === "free"
          ? 0
          : subtotal - (usesCoupon && coupon ? Math.floor((subtotal * coupon.value) / 100) : 0);
    }
  }

  const deliveredCount = collectors.orders.length;

  const specialStatuses: { status: OrderStatus; total: number; reason: string | null }[] = [
    { status: "requires_review", total: 2, reason: "Crypto underpayment: received 0.0021 BTC of 0.0024 BTC" },
    { status: "expired", total: 3, reason: null },
    { status: "cancelled", total: 2, reason: null },
    { status: "refunded", total: 1, reason: null },
    { status: "pending", total: 2, reason: null },
  ];
  for (const special of specialStatuses) {
    for (let index = 0; index < special.total; index += 1) {
      const variant = pickWeighted(variants.map((entry) => ({ item: entry, weight: entry.weight })));
      const ageMinutes = special.status === "pending" ? randomInt(2, 15) : randomInt(60, 5 * 24 * 60);
      buildDemoOrder(
        {
          shopId: shop.id,
          currency: shop.currency,
          customer: pick(customers),
          variant,
          quantity: 1,
          status: special.status,
          createdAt: new Date(Date.now() - ageMinutes * MINUTE_MS),
          provider:
            special.status === "requires_review" ? "nowpayments" : pick(["stripe", "nowpayments"] as const),
          couponId: null,
          couponCode: null,
          discountPercent: 0,
          reviewReason: special.reason,
        },
        collectors,
      );
    }
  }

  await insertChunked(collectors.orders, async (chunk) => {
    await db.insert(schema.orders).values(chunk);
  });
  await insertChunked(collectors.orderItems, async (chunk) => {
    await db.insert(schema.orderItems).values(chunk);
  });
  await insertChunked(collectors.stockItems, async (chunk) => {
    await db.insert(schema.stockItems).values(chunk);
  });
  await insertChunked(collectors.payments, async (chunk) => {
    await db.insert(schema.payments).values(chunk);
  });
  await insertChunked(collectors.paymentEvents, async (chunk) => {
    await db.insert(schema.paymentEvents).values(chunk);
  });

  if (coupon && couponUses > 0) {
    await db
      .update(schema.coupons)
      .set({ usedCount: sql`${schema.coupons.usedCount} + ${couponUses}` })
      .where(eq(schema.coupons.id, coupon.id));
  }

  console.info(
    `ingested ${deliveredCount} delivered orders (~$${(revenueCents / 100).toFixed(2)} revenue) ` +
      `plus 10 special-status orders, ${couponUses} coupon uses, ${customers.length} customers`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((seedError: unknown) => {
    console.error(seedError);
    process.exit(1);
  });
