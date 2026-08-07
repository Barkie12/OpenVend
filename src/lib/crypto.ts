import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

const ENCRYPTION_VERSION = "v1";
const AES_ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const ORDER_TOKEN_BYTES = 24;

function encryptionKey(): Buffer {
  return createHash("sha256").update(env().APP_SECRET).digest();
}

/**
 * Encrypts a secret (payment API keys, SMTP passwords) for storage at rest.
 * Format: `v1:<iv>:<ciphertext>:<authTag>`, each part base64url.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    authTag.toString("base64url"),
  ].join(":");
}

export function decryptSecret(stored: string): string {
  const [version, ivPart, ciphertextPart, authTagPart] = stored.split(":");
  if (version !== ENCRYPTION_VERSION || !ivPart || !ciphertextPart || !authTagPart) {
    throw new Error("Malformed encrypted secret");
  }
  const decipher = createDecipheriv(AES_ALGORITHM, encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagPart, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextPart, "base64url")), decipher.final()]);
  return plaintext.toString("utf8");
}

/** Unguessable token used for buyer order links (`/order/<token>`). */
export function generateOrderToken(): string {
  return randomBytes(ORDER_TOKEN_BYTES).toString("base64url");
}

/** Constant-time string comparison for webhook signatures. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}
