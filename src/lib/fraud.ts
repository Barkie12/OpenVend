import { isIP } from "node:net";

import { headers } from "next/headers";

import { getDb, schema } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import type { Shop } from "@/lib/shop";

const MAX_USER_AGENT_LENGTH = 500;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

export interface RequestContext {
  ipAddress: string | null;
  country: string | null;
  userAgent: string | null;
}

/**
 * Extracts client context from proxy headers (Cloudflare, generic reverse
 * proxies). Values are attacker-influenced when the app is exposed without a
 * trusted proxy, so everything is validated: non-IP strings, fake country
 * codes and oversized user agents are dropped rather than stored.
 */
export async function getRequestContext(): Promise<RequestContext> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const rawIp =
    requestHeaders.get("cf-connecting-ip") ??
    (forwardedFor ? (forwardedFor.split(",")[0]?.trim() ?? null) : null) ??
    requestHeaders.get("x-real-ip");
  const ipAddress = rawIp !== null && isIP(rawIp) !== 0 ? rawIp : null;

  const rawCountry = (
    requestHeaders.get("cf-ipcountry") ??
    requestHeaders.get("x-vercel-ip-country") ??
    ""
  ).toUpperCase();
  const country = COUNTRY_CODE_PATTERN.test(rawCountry) ? rawCountry : null;

  const userAgent = requestHeaders.get("user-agent")?.slice(0, MAX_USER_AGENT_LENGTH) ?? null;

  return { ipAddress, country, userAgent };
}

export interface FraudCheckInput {
  email: string;
  context: RequestContext;
}

/** Returns a buyer-facing rejection message, or null when the checkout may proceed. */
export async function checkBlacklist({ email, context }: FraudCheckInput): Promise<string | null> {
  const rules = await getDb().select().from(schema.blacklistRules);
  const normalizedEmail = email.toLowerCase();
  const emailDomain = normalizedEmail.split("@")[1] ?? "";

  for (const rule of rules) {
    const ruleValue = rule.value.toLowerCase();
    if (rule.type === "email") {
      const matchesExact = normalizedEmail === ruleValue;
      const matchesDomain = ruleValue.startsWith("@") && `@${emailDomain}` === ruleValue;
      if (matchesExact || matchesDomain) {
        return "This email address cannot be used for purchases here.";
      }
    }
    if (rule.type === "ip" && context.ipAddress !== null && context.ipAddress === rule.value) {
      return "Purchases from your network are not allowed.";
    }
    if (rule.type === "country" && context.country !== null && context.country === ruleValue.toUpperCase()) {
      return "Purchases from your country are not available.";
    }
  }
  return null;
}

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Validates a Cloudflare Turnstile token when the shop has Turnstile configured. */
export async function verifyTurnstile(
  shop: Shop,
  token: string | null,
  ipAddress: string | null,
): Promise<string | null> {
  if (!shop.turnstileSiteKey || !shop.turnstileSecretKeyEnc) {
    return null;
  }
  if (!token) {
    return "Please complete the anti-bot verification.";
  }

  const secretKey = decryptSecret(shop.turnstileSecretKeyEnc);
  const verifyBody = new URLSearchParams({ secret: secretKey, response: token });
  if (ipAddress) {
    verifyBody.set("remoteip", ipAddress);
  }

  try {
    const verifyResponse = await fetch(TURNSTILE_VERIFY_URL, { method: "POST", body: verifyBody });
    const verifyPayload = (await verifyResponse.json()) as { success?: boolean };
    if (verifyPayload.success !== true) {
      return "Anti-bot verification failed. Reload the page and try again.";
    }
    return null;
  } catch (error) {
    console.error("[fraud] turnstile verification request failed", error);
    return "Anti-bot verification is temporarily unavailable. Try again shortly.";
  }
}
