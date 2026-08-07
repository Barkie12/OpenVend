import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Auth tables (shapes required by better-auth's drizzle adapter + twoFactor plugin)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  twoFactorEnabled: boolean().notNull().default(false),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text().primaryKey(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  token: text().notNull().unique(),
  ipAddress: text(),
  userAgent: text(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text().primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: timestamp({ withTimezone: true }),
  refreshTokenExpiresAt: timestamp({ withTimezone: true }),
  scope: text(),
  password: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const twoFactor = pgTable("two_factor", {
  id: text().primaryKey(),
  secret: text().notNull(),
  backupCodes: text().notNull(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

export const shops = pgTable("shops", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text().notNull(),
  description: text(),
  logoPath: text(),
  currency: text().notNull().default("USD"),
  termsOfService: text(),
  discordWebhookUrl: text(),
  /** Optional GA4 measurement id (G-XXXXXXX); injects gtag on the storefront. */
  gaMeasurementId: text(),
  turnstileSiteKey: text(),
  turnstileSecretKeyEnc: text(),
  /** Delivery email provider: smtp | resend | brevo. */
  emailProvider: text().notNull().default("smtp"),
  smtpHost: text(),
  smtpPort: integer(),
  smtpSecure: boolean().notNull().default(true),
  smtpUser: text(),
  smtpPasswordEnc: text(),
  /** From address used by every email provider, e.g. `Shop <shop@domain.com>`. */
  smtpFrom: text(),
  resendApiKeyEnc: text(),
  brevoApiKeyEnc: text(),
  stripeEnabled: boolean().notNull().default(false),
  stripeSecretKeyEnc: text(),
  stripeWebhookSecretEnc: text(),
  /** Public key (pk_…); enables the embedded checkout modal instead of the redirect. */
  stripePublishableKey: text(),
    nowpaymentsEnabled: boolean().notNull().default(false),
    nowpaymentsApiKeyEnc: text(),
    nowpaymentsIpnSecretEnc: text(),
    /** Manual PayPal Friends & Family: buyers send to this address, owner approves by hand. */
    paypalffEnabled: boolean().notNull().default(false),
    paypalEmail: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const productVisibilityEnum = pgEnum("product_visibility", ["public", "unlisted", "hidden"]);
export const deliveryTypeEnum = pgEnum("delivery_type", ["serials", "file", "service"]);

/** Storefront sections like "Warthunder" / "Dayz" — SellAuth-style groups. */
export const productGroups = pgTable("product_groups", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  shopId: text()
    .notNull()
    .references(() => shops.id, { onDelete: "cascade" }),
  name: text().notNull(),
  imagePath: text(),
  /** Hidden groups don't render as storefront sections; their products fall back to ungrouped. */
  visibility: productVisibilityEnum().notNull().default("public"),
  /** Optional promo badge rendered next to the section title, e.g. "NEW" or "-20%". */
  badgeText: text(),
  /** Hex color like `#7c3aed`; falls back to the theme accent when null. */
  badgeColor: text(),
  sortOrder: integer().notNull().default(0),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable(
  "products",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    shopId: text()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    groupId: text().references(() => productGroups.id, { onDelete: "set null" }),
    name: text().notNull(),
    slug: text().notNull(),
    description: text().notNull().default(""),
    /** Extra buyer-visible content tabs rendered next to the description (SellAuth-style). */
    descriptionTabs: jsonb().$type<{ title: string; content: string }[]>().notNull().default([]),
    /** SEO overrides; page falls back to name / description excerpt when null. */
    metaTitle: text(),
    metaDescription: text(),
    images: jsonb().$type<string[]>().notNull().default([]),
    /** Products suggested to the buyer on this product's page (SellAuth-style upsells). */
    upsellProductIds: jsonb().$type<string[]>().notNull().default([]),
    visibility: productVisibilityEnum().notNull().default("public"),
    deliveryType: deliveryTypeEnum().notNull(),
    /** Shown to the buyer after payment, for every delivery type. */
    serviceInstructions: text(),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("products_slug_idx").on(table.slug)],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    shopId: text()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    productId: text()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text().notNull(),
    priceCents: integer().notNull(),
    /** Strikethrough "was" price; null hides it. */
    compareAtPriceCents: integer(),
    minQuantity: integer().notNull().default(1),
    /** Per-order cap; null falls back to the global checkout limit. */
    maxQuantity: integer(),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("product_variants_product_idx").on(table.productId)],
);

/** Files attached to `file`-delivery products; every buyer receives all of them. */
export const productFiles = pgTable(
  "product_files",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    shopId: text()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    productId: text()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    fileName: text().notNull(),
    filePath: text().notNull(),
    sizeBytes: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("product_files_product_idx").on(table.productId)],
);

// ---------------------------------------------------------------------------
// Stock (consumable serial lines for `serials`-delivery products)
// ---------------------------------------------------------------------------

export const stockStatusEnum = pgEnum("stock_status", ["available", "reserved", "delivered"]);

export const stockItems = pgTable(
  "stock_items",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    shopId: text()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    productId: text()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Nullable so deleting a variant preserves already-delivered stock history. */
    variantId: text().references(() => productVariants.id, { onDelete: "set null" }),
    content: text().notNull(),
    status: stockStatusEnum().notNull().default("available"),
    orderItemId: text().references(() => orderItems.id, { onDelete: "set null" }),
    reservedAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("stock_items_variant_status_idx").on(table.variantId, table.status),
    index("stock_items_order_item_idx").on(table.orderItemId),
  ],
);

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "paid",
  "delivered",
  "requires_review",
  "cancelled",
  "expired",
  "refunded",
]);

export const orders = pgTable(
  "orders",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    shopId: text()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    orderNumber: integer().notNull().generatedAlwaysAsIdentity({ startWith: 1000 }),
    email: text().notNull(),
    status: orderStatusEnum().notNull().default("pending"),
    subtotalCents: integer().notNull(),
    discountCents: integer().notNull().default(0),
    totalCents: integer().notNull(),
    currency: text().notNull(),
    couponId: text().references(() => coupons.id, { onDelete: "set null" }),
    couponCode: text(),
    paymentProvider: text(),
    accessToken: text().notNull(),
    ipAddress: text(),
    country: text(),
    userAgent: text(),
    reviewReason: text(),
    reservationExpiresAt: timestamp({ withTimezone: true }),
    paidAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("orders_access_token_idx").on(table.accessToken),
    uniqueIndex("orders_number_idx").on(table.orderNumber),
    index("orders_status_expiry_idx").on(table.status, table.reservationExpiresAt),
    index("orders_created_idx").on(table.createdAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text().references(() => products.id, { onDelete: "set null" }),
    variantId: text().references(() => productVariants.id, { onDelete: "set null" }),
    productName: text().notNull(),
    variantName: text().notNull(),
    deliveryType: deliveryTypeEnum().notNull(),
    serviceInstructions: text(),
    unitPriceCents: integer().notNull(),
    quantity: integer().notNull(),
  },
  (table) => [index("order_items_order_idx").on(table.orderId)],
);

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/** On-site crypto payment instructions returned by the provider (NOWPayments). */
export interface CryptoPaymentInstructions {
  payAddress: string;
  /** Exact amount owed, as a decimal string in `payCurrency` units. */
  payAmount: string;
  payCurrency: string;
  network: string | null;
  /** Memo / destination tag some chains require alongside the address. */
  payinExtraId: string | null;
  /** ISO timestamp after which the quoted rate lapses. */
  expiresAt: string | null;
}

export const payments = pgTable(
  "payments",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    shopId: text()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    orderId: text()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text().notNull(),
    externalId: text().notNull(),
    status: text().notNull(),
    amountCents: integer().notNull(),
    currency: text().notNull(),
    /** Provider-specific payload, e.g. crypto payment instructions for on-site display. */
    providerData: jsonb().$type<CryptoPaymentInstructions>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("payments_order_idx").on(table.orderId),
    index("payments_external_idx").on(table.provider, table.externalId),
  ],
);

/** Raw webhook payloads kept for auditing and debugging payment issues. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text(),
    paymentId: text(),
    provider: text().notNull(),
    eventType: text().notNull(),
    payload: jsonb().$type<unknown>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("payment_events_order_idx").on(table.orderId)],
);

// ---------------------------------------------------------------------------
// Coupons and fraud rules
// ---------------------------------------------------------------------------

export const couponTypeEnum = pgEnum("coupon_type", ["percent", "fixed"]);

export const coupons = pgTable(
  "coupons",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    shopId: text()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    code: text().notNull(),
    type: couponTypeEnum().notNull(),
    /** Percentage points for `percent` (1-100), cents for `fixed`. */
    value: integer().notNull(),
    maxUses: integer(),
    /** Redemptions allowed per buyer e-mail; null means unlimited. */
    maxUsesPerCustomer: integer(),
    usedCount: integer().notNull().default(0),
    startsAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
    /** Order subtotal required before the coupon applies; null means none. */
    minSubtotalCents: integer(),
    /** Restrict to specific product ids; null means the whole shop. */
    productIds: jsonb().$type<string[]>(),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("coupons_code_idx").on(table.code)],
);

/**
 * First-party storefront analytics. Visitor ids are daily-rotating hashes
 * (never raw IPs), session ids come from the browser's sessionStorage.
 */
export const pageViews = pgTable(
  "page_views",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    shopId: text()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    path: text().notNull(),
    visitorId: text().notNull(),
    sessionId: text().notNull(),
    referrerHost: text(),
    utmSource: text(),
    utmMedium: text(),
    utmCampaign: text(),
    country: text(),
    browser: text(),
    os: text(),
    device: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("page_views_created_idx").on(table.createdAt),
    index("page_views_session_idx").on(table.sessionId),
  ],
);

export const blacklistTypeEnum = pgEnum("blacklist_type", ["email", "ip", "country"]);

export const blacklistRules = pgTable(
  "blacklist_rules",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    shopId: text()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    type: blacklistTypeEnum().notNull(),
    value: text().notNull(),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("blacklist_rules_type_value_idx").on(table.type, table.value)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const productGroupsRelations = relations(productGroups, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  group: one(productGroups, { fields: [products.groupId], references: [productGroups.id] }),
  variants: many(productVariants),
  files: many(productFiles),
}));

export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
  stockItems: many(stockItems),
}));

export const productFilesRelations = relations(productFiles, ({ one }) => ({
  product: one(products, { fields: [productFiles.productId], references: [products.id] }),
}));

export const stockItemsRelations = relations(stockItems, ({ one }) => ({
  variant: one(productVariants, { fields: [stockItems.variantId], references: [productVariants.id] }),
  orderItem: one(orderItems, { fields: [stockItems.orderItemId], references: [orderItems.id] }),
}));

export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
  payments: many(payments),
}));

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
  stockItems: many(stockItems),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
}));
