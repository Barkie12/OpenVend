import nodemailer from "nodemailer";

import { decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import type { OrderWithDeliverables } from "@/lib/orders";
import { orderUrl } from "@/lib/payments/provider";
import type { Shop } from "@/lib/shop";

const DEFAULT_SMTP_PORT = 587;
const RESEND_API_URL = "https://api.resend.com/emails";
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export const EMAIL_PROVIDERS = ["smtp", "resend", "brevo"] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

export function shopEmailProvider(shop: Shop): EmailProvider {
  return EMAIL_PROVIDERS.includes(shop.emailProvider as EmailProvider)
    ? (shop.emailProvider as EmailProvider)
    : "smtp";
}

export function isEmailConfigured(shop: Shop): boolean {
  if (shop.smtpFrom === null) {
    return false;
  }
  switch (shopEmailProvider(shop)) {
    case "smtp":
      return shop.smtpHost !== null;
    case "resend":
      return shop.resendApiKeyEnc !== null;
    case "brevo":
      return shop.brevoApiKeyEnc !== null;
  }
}

interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Splits `Name <email@x>` into its parts; plain addresses pass through. */
function parseFromAddress(from: string): { name: string | null; email: string } {
  const match = /^(.*)<([^<>]+)>\s*$/.exec(from);
  const namePart = match?.[1]?.trim().replace(/^"|"$/g, "") ?? "";
  const emailPart = match?.[2]?.trim();
  if (emailPart) {
    return { name: namePart.length > 0 ? namePart : null, email: emailPart };
  }
  return { name: null, email: from.trim() };
}

async function extractApiError(response: Response, provider: string): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string") {
      return `${provider}: ${payload.message}`;
    }
  } catch {
    // Non-JSON error body; fall through to the status line.
  }
  return `${provider} responded with status ${response.status}`;
}

async function sendViaSmtp(shop: Shop, email: OutgoingEmail, from: string): Promise<void> {
  if (!shop.smtpHost) {
    throw new Error("SMTP host is not configured");
  }
  const transport = nodemailer.createTransport({
    host: shop.smtpHost,
    port: shop.smtpPort ?? DEFAULT_SMTP_PORT,
    secure: shop.smtpSecure,
    auth:
      shop.smtpUser && shop.smtpPasswordEnc
        ? { user: shop.smtpUser, pass: decryptSecret(shop.smtpPasswordEnc) }
        : undefined,
  });
  await transport.sendMail({ from, to: email.to, subject: email.subject, html: email.html, text: email.text });
}

async function sendViaResend(shop: Shop, email: OutgoingEmail, from: string): Promise<void> {
  if (!shop.resendApiKeyEnc) {
    throw new Error("Resend API key is not configured");
  }
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${decryptSecret(shop.resendApiKeyEnc)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });
  if (!response.ok) {
    throw new Error(await extractApiError(response, "Resend"));
  }
}

async function sendViaBrevo(shop: Shop, email: OutgoingEmail, from: string): Promise<void> {
  if (!shop.brevoApiKeyEnc) {
    throw new Error("Brevo API key is not configured");
  }
  const sender = parseFromAddress(from);
  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "api-key": decryptSecret(shop.brevoApiKeyEnc),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: sender.name ? { name: sender.name, email: sender.email } : { email: sender.email },
      to: [{ email: email.to }],
      subject: email.subject,
      htmlContent: email.html,
      textContent: email.text,
    }),
  });
  if (!response.ok) {
    throw new Error(await extractApiError(response, "Brevo"));
  }
}

/** Sends through the shop's configured provider; throws with a readable message on failure. */
export async function deliverEmail(shop: Shop, email: OutgoingEmail): Promise<void> {
  if (!shop.smtpFrom) {
    throw new Error("Set a From address first");
  }
  const from = shop.smtpFrom;
  switch (shopEmailProvider(shop)) {
    case "smtp":
      await sendViaSmtp(shop, email, from);
      return;
    case "resend":
      await sendViaResend(shop, email, from);
      return;
    case "brevo":
      await sendViaBrevo(shop, email, from);
      return;
  }
}

function escapeHtml(raw: string): string {
  return raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderDeliverablesHtml(order: OrderWithDeliverables, orderLink: string): string {
  const sections = order.items.map((item) => {
    const heading = `<p style="margin:16px 0 4px;font-weight:600">${escapeHtml(item.productName)}${
      item.variantName === "Default" ? "" : ` — ${escapeHtml(item.variantName)}`
    } × ${item.quantity}</p>`;

    const blocks: string[] = [];
    if (item.serials.length > 0) {
      const serialLines = item.serials.map((serial) => escapeHtml(serial)).join("<br/>");
      blocks.push(
        `<div style="background:#111;color:#e5e5e5;border-radius:6px;padding:12px;font-family:monospace;font-size:13px">${serialLines}</div>`,
      );
    }
    if (item.files.length > 0) {
      const fileNames = item.files.map((deliverableFile) => escapeHtml(deliverableFile.fileName)).join(", ");
      blocks.push(
        `<p style="margin:4px 0">Download ${fileNames} from your <a href="${orderLink}">order page</a>.</p>`,
      );
    }
    if (item.serviceInstructions) {
      blocks.push(
        `<p style="margin:8px 0 4px;white-space:pre-line;color:#404040">${escapeHtml(item.serviceInstructions)}</p>`,
      );
    }
    if (blocks.length === 0) {
      blocks.push(`<p style="margin:4px 0">The seller will contact you shortly.</p>`);
    }

    return `${heading}${blocks.join("")}`;
  });
  return sections.join("");
}

function renderOrderEmailHtml(shop: Shop, order: OrderWithDeliverables): string {
  const orderLink = orderUrl(env().APP_URL, order.accessToken);
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#171717">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
      <h1 style="margin:0 0 8px;font-size:20px">${escapeHtml(shop.name)}</h1>
      <p style="margin:0 0 16px;color:#525252">Order #${order.orderNumber} — ${formatMoney(
        order.totalCents,
        order.currency,
      )}</p>
      <p style="margin:0 0 8px">Thanks for your purchase! Your items are below.</p>
      ${renderDeliverablesHtml(order, orderLink)}
      <p style="margin:24px 0 0">
        <a href="${orderLink}" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px">View your order</a>
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#a3a3a3">Keep this email — the link above is your receipt and delivery page.</p>
    </div>
  </body>
</html>`;
}

function renderOrderEmailText(shop: Shop, order: OrderWithDeliverables): string {
  const orderLink = orderUrl(env().APP_URL, order.accessToken);
  const lines: string[] = [
    `${shop.name} — order #${order.orderNumber}`,
    `Total: ${formatMoney(order.totalCents, order.currency)}`,
    "",
  ];
  for (const item of order.items) {
    lines.push(`${item.productName}${item.variantName === "Default" ? "" : ` — ${item.variantName}`} × ${item.quantity}`);
    if (item.serials.length > 0) {
      lines.push(...item.serials);
    }
    if (item.files.length > 0) {
      lines.push(`Download: ${orderLink}`);
    }
    if (item.serviceInstructions) {
      lines.push(item.serviceInstructions);
    }
    lines.push("");
  }
  lines.push(`Your order page: ${orderLink}`);
  return lines.join("\n");
}

/** Sends the delivery email; silently skips when no email provider is configured. */
export async function sendOrderDeliveredEmail(shop: Shop, order: OrderWithDeliverables): Promise<void> {
  if (!isEmailConfigured(shop)) {
    return;
  }
  await deliverEmail(shop, {
    to: order.email,
    subject: `Your order #${order.orderNumber} from ${shop.name}`,
    html: renderOrderEmailHtml(shop, order),
    text: renderOrderEmailText(shop, order),
  });
}
