"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getAuth } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { SUPPORTED_CURRENCIES, getSetupState, isSetupComplete } from "@/lib/shop";

const setupSchema = z.object({
  shopName: z.string().trim().min(2, "Shop name needs at least 2 characters").max(80),
  currency: z.enum(SUPPORTED_CURRENCIES),
  adminName: z.string().trim().min(1, "Your name is required").max(80),
  adminEmail: z.string().trim().email("Enter a valid email address"),
  adminPassword: z.string().min(10, "Password needs at least 10 characters").max(128),
});

export interface SetupFormState {
  error: string | null;
}

export async function completeSetup(_previous: SetupFormState, formData: FormData): Promise<SetupFormState> {
  const parsed = setupSchema.safeParse({
    shopName: formData.get("shopName"),
    currency: formData.get("currency"),
    adminName: formData.get("adminName"),
    adminEmail: formData.get("adminEmail"),
    adminPassword: formData.get("adminPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const setupState = await getSetupState();
  if (isSetupComplete(setupState)) {
    return { error: "This shop is already set up. Sign in instead." };
  }

  if (!setupState.hasShop) {
    await getDb().insert(schema.shops).values({
      name: parsed.data.shopName,
      currency: parsed.data.currency,
    });
  }

  if (!setupState.hasOwner) {
    try {
      await getAuth().api.signUpEmail({
        body: {
          name: parsed.data.adminName,
          email: parsed.data.adminEmail,
          password: parsed.data.adminPassword,
        },
      });
    } catch (error) {
      console.error("[setup] owner account creation failed", error);
      return { error: "Could not create the owner account. Check the values and try again." };
    }
  }

  redirect("/admin/login?setup=complete");
}
