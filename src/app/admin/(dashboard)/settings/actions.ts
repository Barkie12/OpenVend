"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ACTION_OK, actionError, type ActionResult } from "@/lib/action-result";
import { encryptSecret } from "@/lib/crypto";
import { getDb, schema } from "@/lib/db";
import { deliverEmail, isEmailConfigured } from "@/lib/email";
import { requireAdminSession } from "@/lib/session";
import { SUPPORTED_CURRENCIES, requireShop } from "@/lib/shop";
import { deleteStoredFile } from "@/lib/storage";

const SETTINGS_PATH = "/admin/settings";
const MAX_PORT = 65_535;

const generalSchema = z.object({
  name: z.string().trim().min(2, "Shop name needs at least 2 characters").max(80),
  description: z.string().trim().max(500),
  currency: z.enum(SUPPORTED_CURRENCIES),
  termsOfService: z.string().max(50_000),
});

export async function updateGeneralSettings(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdminSession();
  const shop = await requireShop();

  const parsed = generalSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    currency: formData.get("currency"),
    termsOfService: formData.get("termsOfService") ?? "",
  });
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  await getDb()
    .update(schema.shops)
    .set({
      name: parsed.data.name,
      description: parsed.data.description.length > 0 ? parsed.data.description : null,
      currency: parsed.data.currency,
      termsOfService: parsed.data.termsOfService.length > 0 ? parsed.data.termsOfService : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.shops.id, shop.id));

  revalidatePath(SETTINGS_PATH);
  return ACTION_OK;
}

const analyticsSchema = z.object({
  gaMeasurementId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(G-[A-Z0-9]+)?$/, "Use a GA4 measurement id like G-XXXXXXXXXX (or leave empty)")
    .max(30),
});

export async function updateAnalyticsSettings(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdminSession();
  const shop = await requireShop();

  const parsed = analyticsSchema.safeParse({ gaMeasurementId: formData.get("gaMeasurementId") ?? "" });
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  await getDb()
    .update(schema.shops)
    .set({
      gaMeasurementId: parsed.data.gaMeasurementId.length > 0 ? parsed.data.gaMeasurementId : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.shops.id, shop.id));

  revalidatePath(SETTINGS_PATH);
  revalidatePath("/");
  return ACTION_OK;
}

/** Sets the shop logo to an already-uploaded image path (from /api/admin/uploads). */
export async function setShopLogo(relativePath: string): Promise<ActionResult> {
  await requireAdminSession();
  const shop = await requireShop();

  if (!relativePath.startsWith("images/")) {
    return actionError("Invalid image upload");
  }

  if (shop.logoPath !== null) {
    await deleteStoredFile(shop.logoPath);
  }
  await getDb()
    .update(schema.shops)
    .set({ logoPath: relativePath, updatedAt: new Date() })
    .where(eq(schema.shops.id, shop.id));

  revalidatePath(SETTINGS_PATH);
  return ACTION_OK;
}

export async function removeShopLogo(): Promise<ActionResult> {
  await requireAdminSession();
  const shop = await requireShop();
  if (shop.logoPath !== null) {
    await deleteStoredFile(shop.logoPath);
    await getDb()
      .update(schema.shops)
      .set({ logoPath: null, updatedAt: new Date() })
      .where(eq(schema.shops.id, shop.id));
  }
  revalidatePath(SETTINGS_PATH);
  return ACTION_OK;
}

function optionalSecret(formData: FormData, field: string): string | null {
  const rawValue = formData.get(field);
  if (typeof rawValue !== "string") {
    return null;
  }
  const trimmed = rawValue.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function updatePaymentSettings(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdminSession();
  const shop = await requireShop();

  const stripeEnabled = formData.get("stripeEnabled") === "on";
  const nowpaymentsEnabled = formData.get("nowpaymentsEnabled") === "on";
  const paypalffEnabled = formData.get("paypalffEnabled") === "on";
  const newStripeSecretKey = optionalSecret(formData, "stripeSecretKey");
  const newStripeWebhookSecret = optionalSecret(formData, "stripeWebhookSecret");
  const newNowpaymentsApiKey = optionalSecret(formData, "nowpaymentsApiKey");
  const newNowpaymentsIpnSecret = optionalSecret(formData, "nowpaymentsIpnSecret");

  const rawPaypalEmail = formData.get("paypalEmail");
  const paypalEmail = typeof rawPaypalEmail === "string" ? rawPaypalEmail.trim() : "";
  if (paypalEmail.length > 0 && !z.string().email().safeParse(paypalEmail).success) {
    return actionError("Enter a valid PayPal e-mail address");
  }
  if (paypalffEnabled && paypalEmail.length === 0) {
    return actionError("Add your PayPal e-mail address before enabling PayPal F&F");
  }

  const rawPublishableKey = formData.get("stripePublishableKey");
  const publishableKey = typeof rawPublishableKey === "string" ? rawPublishableKey.trim() : "";
  if (publishableKey.length > 0 && !/^pk_(test|live)_[A-Za-z0-9]+$/.test(publishableKey)) {
    return actionError("The publishable key should look like pk_test_… or pk_live_…");
  }

  const hasStripeKey = newStripeSecretKey !== null || shop.stripeSecretKeyEnc !== null;
  const hasStripeWebhookSecret = newStripeWebhookSecret !== null || shop.stripeWebhookSecretEnc !== null;
  if (stripeEnabled && (!hasStripeKey || !hasStripeWebhookSecret)) {
    return actionError("Add the Stripe secret key and webhook secret before enabling Stripe");
  }
  const hasNowpaymentsKey = newNowpaymentsApiKey !== null || shop.nowpaymentsApiKeyEnc !== null;
  const hasNowpaymentsIpnSecret =
    newNowpaymentsIpnSecret !== null || shop.nowpaymentsIpnSecretEnc !== null;
  if (nowpaymentsEnabled && (!hasNowpaymentsKey || !hasNowpaymentsIpnSecret)) {
    return actionError("Add the NOWPayments API key and IPN secret before enabling NOWPayments");
  }

  await getDb()
    .update(schema.shops)
    .set({
      stripeEnabled,
      nowpaymentsEnabled,
      paypalffEnabled,
      paypalEmail: paypalEmail.length > 0 ? paypalEmail : null,
      stripePublishableKey: publishableKey.length > 0 ? publishableKey : null,
      ...(newStripeSecretKey !== null ? { stripeSecretKeyEnc: encryptSecret(newStripeSecretKey) } : {}),
      ...(newStripeWebhookSecret !== null
        ? { stripeWebhookSecretEnc: encryptSecret(newStripeWebhookSecret) }
        : {}),
      ...(newNowpaymentsApiKey !== null
        ? { nowpaymentsApiKeyEnc: encryptSecret(newNowpaymentsApiKey) }
        : {}),
      ...(newNowpaymentsIpnSecret !== null
        ? { nowpaymentsIpnSecretEnc: encryptSecret(newNowpaymentsIpnSecret) }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.shops.id, shop.id));

  revalidatePath(SETTINGS_PATH);
  return ACTION_OK;
}

const emailSchema = z.object({
  emailProvider: z.enum(["smtp", "resend", "brevo"]),
  smtpHost: z.string().trim().max(255),
  smtpPort: z.string().trim(),
  smtpUser: z.string().trim().max(255),
  smtpFrom: z.string().trim().max(255),
});

export async function updateEmailSettings(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdminSession();
  const shop = await requireShop();

  const parsed = emailSchema.safeParse({
    emailProvider: formData.get("emailProvider") ?? "smtp",
    smtpHost: formData.get("smtpHost") ?? "",
    smtpPort: formData.get("smtpPort") ?? "",
    smtpUser: formData.get("smtpUser") ?? "",
    smtpFrom: formData.get("smtpFrom") ?? "",
  });
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  let smtpPort: number | null = null;
  if (parsed.data.smtpPort.length > 0) {
    const parsedPort = Number.parseInt(parsed.data.smtpPort, 10);
    if (Number.isNaN(parsedPort) || parsedPort < 1 || parsedPort > MAX_PORT) {
      return actionError("SMTP port must be between 1 and 65535");
    }
    smtpPort = parsedPort;
  }

  const newSmtpPassword = optionalSecret(formData, "smtpPassword");
  const newResendApiKey = optionalSecret(formData, "resendApiKey");
  const newBrevoApiKey = optionalSecret(formData, "brevoApiKey");
  const hasFrom = parsed.data.smtpFrom.length > 0;

  if (parsed.data.emailProvider === "smtp" && parsed.data.smtpHost.length > 0 && !hasFrom) {
    return actionError("Set a From address (e.g. shop@yourdomain.com)");
  }
  if (parsed.data.emailProvider === "resend") {
    if (newResendApiKey === null && shop.resendApiKeyEnc === null) {
      return actionError("Add your Resend API key (re_…)");
    }
    if (!hasFrom) {
      return actionError("Set a From address using a domain verified in Resend");
    }
  }
  if (parsed.data.emailProvider === "brevo") {
    if (newBrevoApiKey === null && shop.brevoApiKeyEnc === null) {
      return actionError("Add your Brevo API key (xkeysib-…)");
    }
    if (!hasFrom) {
      return actionError("Set a From address using a sender verified in Brevo");
    }
  }

  await getDb()
    .update(schema.shops)
    .set({
      emailProvider: parsed.data.emailProvider,
      smtpHost: parsed.data.smtpHost.length > 0 ? parsed.data.smtpHost : null,
      smtpPort,
      smtpSecure: formData.get("smtpSecure") === "on",
      smtpUser: parsed.data.smtpUser.length > 0 ? parsed.data.smtpUser : null,
      smtpFrom: hasFrom ? parsed.data.smtpFrom : null,
      ...(newSmtpPassword !== null ? { smtpPasswordEnc: encryptSecret(newSmtpPassword) } : {}),
      ...(newResendApiKey !== null ? { resendApiKeyEnc: encryptSecret(newResendApiKey) } : {}),
      ...(newBrevoApiKey !== null ? { brevoApiKeyEnc: encryptSecret(newBrevoApiKey) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.shops.id, shop.id));

  revalidatePath(SETTINGS_PATH);
  return ACTION_OK;
}

export async function sendTestEmail(): Promise<ActionResult> {
  const adminSession = await requireAdminSession();
  const shop = await requireShop();
  if (!isEmailConfigured(shop)) {
    return actionError("Save your email settings first");
  }

  try {
    await deliverEmail(shop, {
      to: adminSession.user.email,
      subject: `Test email from ${shop.name}`,
      html: `<p>Email sending is configured correctly — delivery emails will work.</p>`,
      text: "Email sending is configured correctly — delivery emails will work.",
    });
    return ACTION_OK;
  } catch (emailError) {
    console.error("[settings] test email failed", emailError);
    return actionError(
      emailError instanceof Error ? `Sending failed: ${emailError.message}` : "Sending failed",
    );
  }
}

export async function updateNotificationSettings(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdminSession();
  const shop = await requireShop();

  const rawWebhookUrl = formData.get("discordWebhookUrl");
  const webhookUrl = typeof rawWebhookUrl === "string" ? rawWebhookUrl.trim() : "";
  if (webhookUrl.length > 0 && !webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
    return actionError("That does not look like a Discord webhook URL");
  }

  await getDb()
    .update(schema.shops)
    .set({ discordWebhookUrl: webhookUrl.length > 0 ? webhookUrl : null, updatedAt: new Date() })
    .where(eq(schema.shops.id, shop.id));

  revalidatePath(SETTINGS_PATH);
  return ACTION_OK;
}

export async function sendTestDiscordNotification(): Promise<ActionResult> {
  await requireAdminSession();
  const shop = await requireShop();
  if (!shop.discordWebhookUrl) {
    return actionError("Save a Discord webhook URL first");
  }
  try {
    const webhookResponse = await fetch(shop.discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `Test notification from ${shop.name} — sale alerts will appear here.` }),
    });
    if (!webhookResponse.ok) {
      return actionError(`Discord responded with status ${webhookResponse.status}`);
    }
    return ACTION_OK;
  } catch {
    return actionError("Could not reach Discord — check the URL");
  }
}

export async function updateSecuritySettings(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdminSession();
  const shop = await requireShop();

  const rawSiteKey = formData.get("turnstileSiteKey");
  const siteKey = typeof rawSiteKey === "string" ? rawSiteKey.trim() : "";
  const newSecretKey = optionalSecret(formData, "turnstileSecretKey");

  if (siteKey.length === 0) {
    await getDb()
      .update(schema.shops)
      .set({ turnstileSiteKey: null, turnstileSecretKeyEnc: null, updatedAt: new Date() })
      .where(eq(schema.shops.id, shop.id));
    revalidatePath(SETTINGS_PATH);
    return ACTION_OK;
  }

  if (newSecretKey === null && shop.turnstileSecretKeyEnc === null) {
    return actionError("Add the Turnstile secret key as well");
  }

  await getDb()
    .update(schema.shops)
    .set({
      turnstileSiteKey: siteKey,
      ...(newSecretKey !== null ? { turnstileSecretKeyEnc: encryptSecret(newSecretKey) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.shops.id, shop.id));

  revalidatePath(SETTINGS_PATH);
  return ACTION_OK;
}
