"use server";

import { copyFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { and, eq, inArray, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ACTION_OK, actionError, type ActionResult } from "@/lib/action-result";
import { getDb, schema } from "@/lib/db";
import { parsePriceToCents } from "@/lib/money";
import { GLOBAL_MAX_QUANTITY } from "@/lib/products";
import { requireAdminSession } from "@/lib/session";
import { requireShop } from "@/lib/shop";
import { slugify } from "@/lib/slug";
import { deleteStoredFile, resolveStoredPath } from "@/lib/storage";

const PRODUCTS_PATH = "/admin/products";
const MAX_SLUG_ATTEMPTS = 50;
const MAX_STOCK_LINES_PER_UPLOAD = 10_000;
const MAX_UPSELL_PRODUCTS = 8;

const createProductSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  deliveryType: z.enum(["serials", "file", "service"]),
  price: z.string().trim().min(1, "Price is required"),
});

const saveVariantSchema = z.object({
  id: z.string().nullable(),
  name: z.string().trim().min(1, "Every variant needs a name").max(120),
  price: z.string().trim().min(1, "Every variant needs a price"),
  compareAtPrice: z.string().trim(),
  minQuantity: z.string().trim(),
  maxQuantity: z.string().trim(),
});

const MAX_DESCRIPTION_TABS = 5;

const descriptionTabSchema = z.object({
  title: z.string().trim().min(1, "Every description tab needs a title").max(60),
  content: z.string().max(20_000),
});

const saveProductSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug may only contain lowercase letters, numbers and dashes")
    .max(60),
  description: z.string().max(20_000),
  descriptionTabs: z
    .array(descriptionTabSchema)
    .max(MAX_DESCRIPTION_TABS, `At most ${MAX_DESCRIPTION_TABS} extra tabs`),
  metaTitle: z.string().trim().max(70, "Meta titles should stay under 70 characters"),
  metaDescription: z.string().trim().max(200, "Meta descriptions should stay under 200 characters"),
  groupId: z.string().max(64),
  instructions: z.string().max(20_000),
  visibility: z.enum(["public", "unlisted", "hidden"]),
  upsellProductIds: z
    .array(z.string().max(64))
    .max(MAX_UPSELL_PRODUCTS, `At most ${MAX_UPSELL_PRODUCTS} upsell products`),
  variants: z.array(saveVariantSchema).min(1, "A product needs at least one variant").max(50),
});

interface ParsedVariant {
  id: string | null;
  name: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  minQuantity: number;
  maxQuantity: number | null;
}

function parseVariant(variant: z.infer<typeof saveVariantSchema>): ParsedVariant | string {
  const priceCents = parsePriceToCents(variant.price);
  if (priceCents === null) {
    return `“${variant.name}”: enter a valid price like 9.99`;
  }

  let compareAtPriceCents: number | null = null;
  if (variant.compareAtPrice.length > 0) {
    compareAtPriceCents = parsePriceToCents(variant.compareAtPrice);
    if (compareAtPriceCents === null) {
      return `“${variant.name}”: enter a valid slashed price like 19.99`;
    }
    if (compareAtPriceCents <= priceCents) {
      return `“${variant.name}”: the slashed price should be higher than the actual price`;
    }
  }

  const minQuantity = variant.minQuantity.length === 0 ? 1 : Number.parseInt(variant.minQuantity, 10);
  if (Number.isNaN(minQuantity) || minQuantity < 1 || minQuantity > GLOBAL_MAX_QUANTITY) {
    return `“${variant.name}”: min quantity must be between 1 and ${GLOBAL_MAX_QUANTITY}`;
  }
  let maxQuantity: number | null = null;
  if (variant.maxQuantity.length > 0) {
    maxQuantity = Number.parseInt(variant.maxQuantity, 10);
    if (Number.isNaN(maxQuantity) || maxQuantity < minQuantity || maxQuantity > GLOBAL_MAX_QUANTITY) {
      return `“${variant.name}”: max quantity must be between ${minQuantity} and ${GLOBAL_MAX_QUANTITY}`;
    }
  }

  return {
    id: variant.id,
    name: variant.name,
    priceCents,
    compareAtPriceCents,
    minQuantity,
    maxQuantity,
  };
}

export interface SaveProductResult extends ActionResult {
  /** Persisted variant ids aligned with the submitted variant order. */
  variantIds: string[] | null;
}

/** Single transactional save for the product editor: details, instructions, visibility and the full variant set. */
export async function saveProductFull(productId: string, rawInput: unknown): Promise<SaveProductResult> {
  await requireAdminSession();

  const parsed = saveProductSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input", variantIds: null };
  }
  const input = parsed.data;

  const parsedVariants: ParsedVariant[] = [];
  for (const variant of input.variants) {
    const parseOutcome = parseVariant(variant);
    if (typeof parseOutcome === "string") {
      return { error: parseOutcome, variantIds: null };
    }
    parsedVariants.push(parseOutcome);
  }

  const uniqueSlug = await ensureUniqueSlug(input.slug, productId);
  if (uniqueSlug !== input.slug) {
    return { error: "That slug is already used by another product", variantIds: null };
  }

  const db = getDb();
  let groupId: string | null = null;
  if (input.groupId !== "none") {
    const groupRows = await db
      .select({ id: schema.productGroups.id })
      .from(schema.productGroups)
      .where(eq(schema.productGroups.id, input.groupId))
      .limit(1);
    if (!groupRows[0]) {
      return { error: "That group no longer exists", variantIds: null };
    }
    groupId = groupRows[0].id;
  }

  // Upsells: keep only other products that still exist, preserving the picked order.
  const requestedUpsellIds = input.upsellProductIds.filter((upsellId) => upsellId !== productId);
  let upsellProductIds: string[] = [];
  if (requestedUpsellIds.length > 0) {
    const existingRows = await db
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(inArray(schema.products.id, requestedUpsellIds));
    const existingIds = new Set(existingRows.map((row) => row.id));
    upsellProductIds = requestedUpsellIds.filter((upsellId) => existingIds.has(upsellId));
  }

  try {
    const variantIds = await db.transaction(async (tx) => {
      const productRows = await tx
        .select({ id: schema.products.id, shopId: schema.products.shopId })
        .from(schema.products)
        .where(eq(schema.products.id, productId))
        .for("update");
      const product = productRows[0];
      if (!product) {
        throw new Error("Product not found");
      }

      await tx
        .update(schema.products)
        .set({
          name: input.name,
          slug: input.slug,
          description: input.description,
          descriptionTabs: input.descriptionTabs,
          metaTitle: input.metaTitle.length > 0 ? input.metaTitle : null,
          metaDescription: input.metaDescription.length > 0 ? input.metaDescription : null,
          groupId,
          upsellProductIds,
          visibility: input.visibility,
          serviceInstructions: input.instructions.trim().length > 0 ? input.instructions : null,
          updatedAt: new Date(),
        })
        .where(eq(schema.products.id, productId));

      const existingRows = await tx
        .select({ id: schema.productVariants.id })
        .from(schema.productVariants)
        .where(eq(schema.productVariants.productId, productId));
      const existingIds = new Set(existingRows.map((row) => row.id));
      const keptIds = new Set(
        parsedVariants.map((variant) => variant.id).filter((id): id is string => id !== null),
      );
      for (const keptId of keptIds) {
        if (!existingIds.has(keptId)) {
          throw new Error("One of the variants no longer exists — reload the page");
        }
      }

      const idsToDelete = [...existingIds].filter((existingId) => !keptIds.has(existingId));
      if (idsToDelete.length > 0) {
        await tx
          .delete(schema.productVariants)
          .where(
            and(
              inArray(schema.productVariants.id, idsToDelete),
              eq(schema.productVariants.productId, productId),
            ),
          );
      }

      const persistedIds: string[] = [];
      for (const [index, variant] of parsedVariants.entries()) {
        if (variant.id !== null) {
          await tx
            .update(schema.productVariants)
            .set({
              name: variant.name,
              priceCents: variant.priceCents,
              compareAtPriceCents: variant.compareAtPriceCents,
              minQuantity: variant.minQuantity,
              maxQuantity: variant.maxQuantity,
              sortOrder: index,
              updatedAt: new Date(),
            })
            .where(eq(schema.productVariants.id, variant.id));
          persistedIds.push(variant.id);
        } else {
          const [insertedVariant] = await tx
            .insert(schema.productVariants)
            .values({
              shopId: product.shopId,
              productId,
              name: variant.name,
              priceCents: variant.priceCents,
              compareAtPriceCents: variant.compareAtPriceCents,
              minQuantity: variant.minQuantity,
              maxQuantity: variant.maxQuantity,
              sortOrder: index,
            })
            .returning({ id: schema.productVariants.id });
          if (!insertedVariant) {
            throw new Error("Variant could not be created");
          }
          persistedIds.push(insertedVariant.id);
        }
      }
      return persistedIds;
    });

    revalidatePath(PRODUCTS_PATH);
    revalidatePath(`${PRODUCTS_PATH}/${productId}`);
    revalidatePath("/");
    return { error: null, variantIds };
  } catch (saveError) {
    console.error("[products] full save failed", saveError);
    const message =
      saveError instanceof Error && saveError.message.length > 0
        ? saveError.message
        : "Saving failed — try again";
    return { error: message, variantIds: null };
  }
}

async function ensureUniqueSlug(base: string, excludeProductId?: string): Promise<string | null> {
  const db = getDb();
  const cleanBase = base.length > 0 ? base : "product";
  let candidate = cleanBase;
  for (let attempt = 2; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
    const existing = await db
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(eq(schema.products.slug, candidate))
      .limit(1);
    const conflict = existing[0];
    if (!conflict || conflict.id === excludeProductId) {
      return candidate;
    }
    candidate = `${cleanBase}-${attempt}`;
  }
  return null;
}

export async function createProduct(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminSession();
  const shop = await requireShop();

  const parsed = createProductSchema.safeParse({
    name: formData.get("name"),
    deliveryType: formData.get("deliveryType"),
    price: formData.get("price"),
  });
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const priceCents = parsePriceToCents(parsed.data.price);
  if (priceCents === null) {
    return actionError("Enter a valid price like 9.99");
  }

  const slug = await ensureUniqueSlug(slugify(parsed.data.name));
  if (slug === null) {
    return actionError("Could not generate a unique slug; rename the product");
  }

  const db = getDb();
  const [createdProduct] = await db
    .insert(schema.products)
    .values({
      shopId: shop.id,
      name: parsed.data.name,
      slug,
      deliveryType: parsed.data.deliveryType,
    })
    .returning({ id: schema.products.id });
  if (!createdProduct) {
    return actionError("Product could not be created");
  }
  await db.insert(schema.productVariants).values({
    shopId: shop.id,
    productId: createdProduct.id,
    name: "Default",
    priceCents,
  });

  revalidatePath(PRODUCTS_PATH);
  redirect(`${PRODUCTS_PATH}/${createdProduct.id}`);
}

const GROUPS_PATH = "/admin/products/groups";
const MAX_GROUP_NAME_LENGTH = 60;
const MAX_BADGE_TEXT_LENGTH = 30;
const BADGE_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

interface ParsedGroupForm {
  name: string;
  imagePath: string | null;
  visibility: "public" | "hidden";
  badgeText: string | null;
  badgeColor: string | null;
  productIds: string[];
}

function parseGroupForm(formData: FormData): ParsedGroupForm | string {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1 || name.length > MAX_GROUP_NAME_LENGTH) {
    return `Group name must be 1-${MAX_GROUP_NAME_LENGTH} characters`;
  }

  const rawImagePath = String(formData.get("imagePath") ?? "").trim();
  if (rawImagePath.length > 0 && !rawImagePath.startsWith("images/")) {
    return "Invalid group image";
  }

  const rawVisibility = formData.get("visibility");
  if (rawVisibility !== "public" && rawVisibility !== "hidden") {
    return "Invalid visibility";
  }

  const badgeText = String(formData.get("badgeText") ?? "").trim();
  if (badgeText.length > MAX_BADGE_TEXT_LENGTH) {
    return `Badge text must be at most ${MAX_BADGE_TEXT_LENGTH} characters`;
  }
  const badgeColor = String(formData.get("badgeColor") ?? "").trim();
  if (badgeColor.length > 0 && !BADGE_COLOR_PATTERN.test(badgeColor)) {
    return "Badge color must be a hex value like #7c3aed";
  }

  const productIds = formData
    .getAll("productIds")
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0);

  return {
    name,
    imagePath: rawImagePath.length > 0 ? rawImagePath : null,
    visibility: rawVisibility,
    badgeText: badgeText.length > 0 ? badgeText : null,
    badgeColor: badgeText.length > 0 && badgeColor.length > 0 ? badgeColor : null,
    productIds,
  };
}

/** Creates or updates a group and reassigns product membership in one go. */
export async function saveProductGroup(
  groupId: string | null,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdminSession();
  const shop = await requireShop();

  const parsed = parseGroupForm(formData);
  if (typeof parsed === "string") {
    return actionError(parsed);
  }
  const { productIds, ...groupValues } = parsed;

  const db = getDb();
  const savedGroupId = await db.transaction(async (tx) => {
    let targetGroupId = groupId;
    if (targetGroupId === null) {
      const [insertedGroup] = await tx
        .insert(schema.productGroups)
        .values({ shopId: shop.id, ...groupValues })
        .returning({ id: schema.productGroups.id });
      if (!insertedGroup) {
        throw new Error("Group could not be created");
      }
      targetGroupId = insertedGroup.id;
    } else {
      const updatedRows = await tx
        .update(schema.productGroups)
        .set(groupValues)
        .where(eq(schema.productGroups.id, targetGroupId))
        .returning({ id: schema.productGroups.id });
      if (updatedRows.length === 0) {
        return null;
      }
    }

    // Membership: selected products join the group, unselected members leave it.
    await tx
      .update(schema.products)
      .set({ groupId: null, updatedAt: new Date() })
      .where(
        and(
          eq(schema.products.groupId, targetGroupId),
          productIds.length > 0 ? notInArray(schema.products.id, productIds) : undefined,
        ),
      );
    if (productIds.length > 0) {
      await tx
        .update(schema.products)
        .set({ groupId: targetGroupId, updatedAt: new Date() })
        .where(inArray(schema.products.id, productIds));
    }

    return targetGroupId;
  });

  if (savedGroupId === null) {
    return actionError("Group not found");
  }
  revalidatePath(PRODUCTS_PATH);
  revalidatePath(GROUPS_PATH);
  revalidatePath("/");
  return ACTION_OK;
}

export async function deleteProductGroup(groupId: string): Promise<ActionResult> {
  await requireAdminSession();
  await getDb().delete(schema.productGroups).where(eq(schema.productGroups.id, groupId));
  revalidatePath(PRODUCTS_PATH);
  revalidatePath(GROUPS_PATH);
  revalidatePath("/");
  return ACTION_OK;
}

export interface DuplicateResult extends ActionResult {
  productId: string | null;
}

/** Copies a product with variants, images and files — never stock. The copy starts hidden. */
export async function duplicateProduct(productId: string): Promise<DuplicateResult> {
  await requireAdminSession();
  const shop = await requireShop();
  const db = getDb();

  const sourceProduct = await db.query.products.findFirst({
    where: eq(schema.products.id, productId),
    with: { variants: true, files: true },
  });
  if (!sourceProduct) {
    return { error: "Product not found", productId: null };
  }

  const copyName = `${sourceProduct.name} (copy)`;
  const copySlug = await ensureUniqueSlug(slugify(copyName));
  if (copySlug === null) {
    return { error: "Could not generate a slug for the copy", productId: null };
  }

  async function copyStoredFile(relativePath: string): Promise<string> {
    const extension = path.posix.extname(relativePath);
    const directory = path.posix.dirname(relativePath);
    const copiedRelativePath = path.posix.join(directory, `${randomUUID()}${extension}`);
    await copyFile(resolveStoredPath(relativePath), resolveStoredPath(copiedRelativePath));
    return copiedRelativePath;
  }

  const copiedImages: string[] = [];
  for (const storedImage of sourceProduct.images) {
    try {
      copiedImages.push(await copyStoredFile(storedImage));
    } catch (copyError) {
      console.error("[products] image copy failed during duplicate", copyError);
    }
  }

  const [createdProduct] = await db
    .insert(schema.products)
    .values({
      shopId: shop.id,
      groupId: sourceProduct.groupId,
      name: copyName,
      slug: copySlug,
      description: sourceProduct.description,
      images: copiedImages,
      visibility: "hidden",
      deliveryType: sourceProduct.deliveryType,
      serviceInstructions: sourceProduct.serviceInstructions,
      sortOrder: sourceProduct.sortOrder,
    })
    .returning({ id: schema.products.id });
  if (!createdProduct) {
    return { error: "Duplicate could not be created", productId: null };
  }

  if (sourceProduct.variants.length > 0) {
    await db.insert(schema.productVariants).values(
      sourceProduct.variants.map((variant) => ({
        shopId: shop.id,
        productId: createdProduct.id,
        name: variant.name,
        priceCents: variant.priceCents,
        compareAtPriceCents: variant.compareAtPriceCents,
        minQuantity: variant.minQuantity,
        maxQuantity: variant.maxQuantity,
        sortOrder: variant.sortOrder,
      })),
    );
  }

  for (const productFile of sourceProduct.files) {
    try {
      const copiedFilePath = await copyStoredFile(productFile.filePath);
      await db.insert(schema.productFiles).values({
        shopId: shop.id,
        productId: createdProduct.id,
        fileName: productFile.fileName,
        filePath: copiedFilePath,
        sizeBytes: productFile.sizeBytes,
      });
    } catch (copyError) {
      console.error("[products] file copy failed during duplicate", copyError);
    }
  }

  revalidatePath(PRODUCTS_PATH);
  return { error: null, productId: createdProduct.id };
}

export async function deleteProduct(productId: string): Promise<ActionResult> {
  await requireAdminSession();
  const db = getDb();

  const product = await db.query.products.findFirst({
    where: eq(schema.products.id, productId),
    with: { files: true },
  });
  if (!product) {
    return actionError("Product not found");
  }

  for (const storedImage of product.images) {
    await deleteStoredFile(storedImage);
  }
  for (const productFile of product.files) {
    await deleteStoredFile(productFile.filePath);
  }
  await db.delete(schema.products).where(eq(schema.products.id, productId));

  revalidatePath(PRODUCTS_PATH);
  redirect(PRODUCTS_PATH);
}

export interface VariantStockSnapshot extends ActionResult {
  /** Unsold serial lines, oldest first; null when loading failed. */
  available: string[] | null;
  reservedCount: number;
  deliveredCount: number;
}

/** Loads the editable stock pool plus reserved/delivered counts for the manage-stock dialog. */
export async function getVariantStock(variantId: string): Promise<VariantStockSnapshot> {
  await requireAdminSession();
  const db = getDb();

  const variant = await db.query.productVariants.findFirst({
    where: eq(schema.productVariants.id, variantId),
  });
  if (!variant) {
    return { error: "Variant not found", available: null, reservedCount: 0, deliveredCount: 0 };
  }

  const stockRows = await db
    .select({ content: schema.stockItems.content, status: schema.stockItems.status })
    .from(schema.stockItems)
    .where(eq(schema.stockItems.variantId, variantId))
    .orderBy(schema.stockItems.createdAt);

  const available: string[] = [];
  let reservedCount = 0;
  let deliveredCount = 0;
  for (const stockRow of stockRows) {
    if (stockRow.status === "available") {
      available.push(stockRow.content);
    } else if (stockRow.status === "reserved") {
      reservedCount += 1;
    } else {
      deliveredCount += 1;
    }
  }

  return { error: null, available, reservedCount, deliveredCount };
}

export interface AppendStockResult extends ActionResult {
  added: number;
  skipped: number;
}

/** Adds new lines to the pool; lines already available for this variant are skipped. */
export async function appendVariantStock(variantId: string, stockText: string): Promise<AppendStockResult> {
  await requireAdminSession();
  const shop = await requireShop();
  const db = getDb();

  const variant = await db.query.productVariants.findFirst({
    where: eq(schema.productVariants.id, variantId),
  });
  if (!variant) {
    return { error: "Variant not found", added: 0, skipped: 0 };
  }

  const pastedLines = [
    ...new Set(
      stockText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    ),
  ];
  if (pastedLines.length === 0) {
    return { error: "Paste one serial per line", added: 0, skipped: 0 };
  }
  if (pastedLines.length > MAX_STOCK_LINES_PER_UPLOAD) {
    return { error: `At most ${MAX_STOCK_LINES_PER_UPLOAD} lines per upload`, added: 0, skipped: 0 };
  }

  const existingRows = await db
    .select({ content: schema.stockItems.content })
    .from(schema.stockItems)
    .where(and(eq(schema.stockItems.variantId, variantId), eq(schema.stockItems.status, "available")));
  const existingContents = new Set(existingRows.map((row) => row.content));

  const newLines = pastedLines.filter((line) => !existingContents.has(line));
  if (newLines.length > 0) {
    await db.insert(schema.stockItems).values(
      newLines.map((line) => ({
        shopId: shop.id,
        productId: variant.productId,
        variantId,
        content: line,
      })),
    );
  }

  revalidatePath(`${PRODUCTS_PATH}/${variant.productId}`);
  revalidatePath(PRODUCTS_PATH);
  return { error: null, added: newLines.length, skipped: pastedLines.length - newLines.length };
}

export interface SaveStockResult extends ActionResult {
  available: number;
}

/**
 * Replaces the variant's available stock pool with the given lines (SellAuth
 * "overwrite deliverables" semantics). Reserved and delivered stock are never
 * touched. An empty input clears the pool.
 */
export async function overwriteVariantStock(variantId: string, stockText: string): Promise<SaveStockResult> {
  await requireAdminSession();
  const shop = await requireShop();
  const db = getDb();

  const variant = await db.query.productVariants.findFirst({
    where: eq(schema.productVariants.id, variantId),
  });
  if (!variant) {
    return { error: "Variant not found", available: 0 };
  }

  const stockLines = [
    ...new Set(
      stockText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    ),
  ];
  if (stockLines.length > MAX_STOCK_LINES_PER_UPLOAD) {
    return { error: `At most ${MAX_STOCK_LINES_PER_UPLOAD} lines`, available: 0 };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.stockItems)
      .where(and(eq(schema.stockItems.variantId, variantId), eq(schema.stockItems.status, "available")));
    if (stockLines.length > 0) {
      await tx.insert(schema.stockItems).values(
        stockLines.map((line) => ({
          shopId: shop.id,
          productId: variant.productId,
          variantId,
          content: line,
        })),
      );
    }
  });

  revalidatePath(`${PRODUCTS_PATH}/${variant.productId}`);
  revalidatePath(PRODUCTS_PATH);
  return { error: null, available: stockLines.length };
}

const MAX_IMAGES_PER_UPLOAD = 12;

/** Attaches already-uploaded image paths (from /api/admin/uploads) to a product. */
export async function attachProductImages(productId: string, relativePaths: string[]): Promise<ActionResult> {
  await requireAdminSession();
  const db = getDb();

  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) {
    return actionError("Product not found");
  }

  const validPaths = relativePaths.filter(
    (relativePath) => typeof relativePath === "string" && relativePath.startsWith("images/"),
  );
  if (validPaths.length === 0 || validPaths.length > MAX_IMAGES_PER_UPLOAD) {
    return actionError("Invalid image upload");
  }

  await db
    .update(schema.products)
    .set({ images: [...product.images, ...validPaths], updatedAt: new Date() })
    .where(eq(schema.products.id, productId));

  revalidatePath(`${PRODUCTS_PATH}/${productId}`);
  return ACTION_OK;
}

export async function removeProductImage(productId: string, relativePath: string): Promise<ActionResult> {
  await requireAdminSession();
  const db = getDb();

  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) {
    return actionError("Product not found");
  }

  await db
    .update(schema.products)
    .set({ images: product.images.filter((storedImage) => storedImage !== relativePath), updatedAt: new Date() })
    .where(eq(schema.products.id, productId));
  await deleteStoredFile(relativePath);

  revalidatePath(`${PRODUCTS_PATH}/${productId}`);
  return ACTION_OK;
}

export interface AttachFileInput {
  relativePath: string;
  fileName: string;
  sizeBytes: number;
}

/** Attaches an already-uploaded deliverable file (from /api/admin/uploads) to a product. */
export async function attachProductFile(productId: string, upload: AttachFileInput): Promise<ActionResult> {
  await requireAdminSession();
  const shop = await requireShop();
  const db = getDb();

  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) {
    return actionError("Product not found");
  }
  if (
    !upload.relativePath.startsWith("files/") ||
    upload.fileName.trim().length === 0 ||
    upload.sizeBytes <= 0
  ) {
    return actionError("Invalid file upload");
  }

  await db.insert(schema.productFiles).values({
    shopId: shop.id,
    productId,
    fileName: upload.fileName,
    filePath: upload.relativePath,
    sizeBytes: upload.sizeBytes,
  });

  revalidatePath(`${PRODUCTS_PATH}/${productId}`);
  return ACTION_OK;
}

export async function removeProductFile(fileId: string): Promise<ActionResult> {
  await requireAdminSession();
  const db = getDb();

  const productFile = await db.query.productFiles.findFirst({ where: eq(schema.productFiles.id, fileId) });
  if (!productFile) {
    return actionError("File not found");
  }

  await db.delete(schema.productFiles).where(eq(schema.productFiles.id, fileId));
  await deleteStoredFile(productFile.filePath);

  revalidatePath(`${PRODUCTS_PATH}/${productFile.productId}`);
  return ACTION_OK;
}
