"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ACTION_OK, actionError, type ActionResult } from "@/lib/action-result";
import { normalizeCouponCode } from "@/lib/coupons";
import { getDb, schema } from "@/lib/db";
import { parsePriceToCents } from "@/lib/money";
import { requireAdminSession } from "@/lib/session";
import { requireShop } from "@/lib/shop";

const COUPONS_PATH = "/admin/coupons";
const MAX_PERCENT = 100;

const couponFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Code needs at least 2 characters")
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "Use only letters, numbers, dashes and underscores"),
  type: z.enum(["percent", "fixed"]),
  value: z.string().trim().min(1, "Discount value is required"),
  maxUses: z.string().trim(),
  maxUsesPerCustomer: z.string().trim(),
  minOrderValue: z.string().trim(),
  startsAt: z.string().trim(),
  expiresAt: z.string().trim(),
  applyToAll: z.string(),
});

interface ParsedCouponForm {
  code: string;
  type: "percent" | "fixed";
  value: number;
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  minSubtotalCents: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  productIds: string[] | null;
}

function parseOptionalCount(raw: string, label: string): number | null | string {
  if (raw.length === 0) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return `${label} must be a positive number`;
  }
  return parsed;
}

function parseOptionalDate(raw: string, label: string): Date | null | string {
  if (raw.length === 0) {
    return null;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return `Invalid ${label}`;
  }
  return parsed;
}

/** Parses and validates the coupon editor form; returns an error message string on failure. */
function parseCouponForm(formData: FormData): ParsedCouponForm | string {
  const parsed = couponFormSchema.safeParse({
    code: formData.get("code"),
    type: formData.get("type"),
    value: formData.get("value"),
    maxUses: formData.get("maxUses") ?? "",
    maxUsesPerCustomer: formData.get("maxUsesPerCustomer") ?? "",
    minOrderValue: formData.get("minOrderValue") ?? "",
    startsAt: formData.get("startsAt") ?? "",
    expiresAt: formData.get("expiresAt") ?? "",
    applyToAll: formData.get("applyToAll") ?? "",
  });
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid input";
  }

  let discountValue: number;
  if (parsed.data.type === "percent") {
    const percentValue = Number.parseInt(parsed.data.value, 10);
    if (Number.isNaN(percentValue) || percentValue < 1 || percentValue > MAX_PERCENT) {
      return "Percentage must be between 1 and 100";
    }
    discountValue = percentValue;
  } else {
    const fixedCents = parsePriceToCents(parsed.data.value);
    if (fixedCents === null || fixedCents === 0) {
      return "Enter a fixed amount like 5.00";
    }
    discountValue = fixedCents;
  }

  const maxUses = parseOptionalCount(parsed.data.maxUses, "Use limit");
  if (typeof maxUses === "string") {
    return maxUses;
  }
  const maxUsesPerCustomer = parseOptionalCount(parsed.data.maxUsesPerCustomer, "Per-customer limit");
  if (typeof maxUsesPerCustomer === "string") {
    return maxUsesPerCustomer;
  }

  let minSubtotalCents: number | null = null;
  if (parsed.data.minOrderValue.length > 0) {
    minSubtotalCents = parsePriceToCents(parsed.data.minOrderValue);
    if (minSubtotalCents === null) {
      return "Enter a minimum order value like 25.00";
    }
  }

  const startsAt = parseOptionalDate(parsed.data.startsAt, "start date");
  if (typeof startsAt === "string") {
    return startsAt;
  }
  const expiresAt = parseOptionalDate(parsed.data.expiresAt, "end date");
  if (typeof expiresAt === "string") {
    return expiresAt;
  }
  if (startsAt !== null && expiresAt !== null && startsAt.getTime() >= expiresAt.getTime()) {
    return "The end date must be after the start date";
  }

  const scopedProductIds = formData
    .getAll("productIds")
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  const applyToAll = parsed.data.applyToAll === "on";
  if (!applyToAll && scopedProductIds.length === 0) {
    return "Select at least one product, or apply the coupon to all products";
  }

  return {
    code: normalizeCouponCode(parsed.data.code),
    type: parsed.data.type,
    value: discountValue,
    maxUses,
    maxUsesPerCustomer,
    minSubtotalCents,
    startsAt,
    expiresAt,
    productIds: applyToAll ? null : scopedProductIds,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "23505";
}

export async function createCoupon(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminSession();
  const shop = await requireShop();

  const parsed = parseCouponForm(formData);
  if (typeof parsed === "string") {
    return actionError(parsed);
  }

  try {
    await getDb().insert(schema.coupons).values({ shopId: shop.id, ...parsed });
  } catch (insertError) {
    if (isUniqueViolation(insertError)) {
      return actionError("A coupon with that code already exists");
    }
    throw insertError;
  }

  revalidatePath(COUPONS_PATH);
  return ACTION_OK;
}

export async function updateCoupon(
  couponId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdminSession();

  const parsed = parseCouponForm(formData);
  if (typeof parsed === "string") {
    return actionError(parsed);
  }

  try {
    const updatedRows = await getDb()
      .update(schema.coupons)
      .set(parsed)
      .where(eq(schema.coupons.id, couponId))
      .returning({ id: schema.coupons.id });
    if (updatedRows.length === 0) {
      return actionError("Coupon not found");
    }
  } catch (updateError) {
    if (isUniqueViolation(updateError)) {
      return actionError("A coupon with that code already exists");
    }
    throw updateError;
  }

  revalidatePath(COUPONS_PATH);
  revalidatePath(`${COUPONS_PATH}/${couponId}`);
  return ACTION_OK;
}

export async function setCouponActive(couponId: string, active: boolean): Promise<ActionResult> {
  await requireAdminSession();
  await getDb().update(schema.coupons).set({ active }).where(eq(schema.coupons.id, couponId));
  revalidatePath(COUPONS_PATH);
  return ACTION_OK;
}

export async function deleteCoupon(couponId: string): Promise<ActionResult> {
  await requireAdminSession();
  await getDb().delete(schema.coupons).where(eq(schema.coupons.id, couponId));
  revalidatePath(COUPONS_PATH);
  return ACTION_OK;
}
