"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ACTION_OK, actionError, type ActionResult } from "@/lib/action-result";
import { getDb, schema } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";
import { requireShop } from "@/lib/shop";

const BLACKLIST_PATH = "/admin/blacklist";
const COUNTRY_CODE_LENGTH = 2;

const ruleSchema = z.object({
  type: z.enum(["email", "ip", "country"]),
  value: z.string().trim().min(1, "Value is required").max(255),
  note: z.string().trim().max(500),
});

export async function addBlacklistRule(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminSession();
  const shop = await requireShop();

  const parsed = ruleSchema.safeParse({
    type: formData.get("type"),
    value: formData.get("value"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  let ruleValue = parsed.data.value;
  if (parsed.data.type === "country") {
    ruleValue = ruleValue.toUpperCase();
    if (ruleValue.length !== COUNTRY_CODE_LENGTH) {
      return actionError("Use a 2-letter country code like US or DE");
    }
  } else {
    ruleValue = ruleValue.toLowerCase();
  }

  await getDb().insert(schema.blacklistRules).values({
    shopId: shop.id,
    type: parsed.data.type,
    value: ruleValue,
    note: parsed.data.note.length > 0 ? parsed.data.note : null,
  });

  revalidatePath(BLACKLIST_PATH);
  return ACTION_OK;
}

export async function deleteBlacklistRule(ruleId: string): Promise<ActionResult> {
  await requireAdminSession();
  await getDb().delete(schema.blacklistRules).where(eq(schema.blacklistRules.id, ruleId));
  revalidatePath(BLACKLIST_PATH);
  return ACTION_OK;
}
