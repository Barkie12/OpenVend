import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";

import { getDb, schema } from "@/lib/db";
import { env } from "@/lib/env";

const TOTP_ISSUER = "OpenVend";

function createAuthInstance() {
  const db = getDb();
  return betterAuth({
    appName: TOTP_ISSUER,
    secret: env().APP_SECRET,
    baseURL: env().APP_URL,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        twoFactor: schema.twoFactor,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
    },
    plugins: [twoFactor({ issuer: TOTP_ISSUER })],
    databaseHooks: {
      user: {
        create: {
          // Single-admin instance: the only account is created through /setup.
          before: async (userData) => {
            const existingUsers = await db.select({ id: schema.user.id }).from(schema.user).limit(1);
            if (existingUsers.length > 0) {
              throw new APIError("FORBIDDEN", {
                message: "Sign-up is disabled: this shop already has an owner account.",
              });
            }
            return { data: userData };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuthInstance>;
export type AdminSession = Auth["$Infer"]["Session"];

interface GlobalWithAuth {
  webshopAuth?: Auth;
}

const globalWithAuth = globalThis as GlobalWithAuth;

/** Lazy singleton so importing this module never requires env vars at build time. */
export function getAuth(): Auth {
  if (!globalWithAuth.webshopAuth) {
    globalWithAuth.webshopAuth = createAuthInstance();
  }
  return globalWithAuth.webshopAuth;
}
