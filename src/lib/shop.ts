import { count } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";

export type Shop = typeof schema.shops.$inferSelect;

export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Single-tenant instance: at most one shop row exists. */
export async function getShop(): Promise<Shop | null> {
  const rows = await getDb().select().from(schema.shops).limit(1);
  return rows[0] ?? null;
}

export async function requireShop(): Promise<Shop> {
  const shop = await getShop();
  if (!shop) {
    throw new Error("Shop is not set up yet; visit /setup first.");
  }
  return shop;
}

export interface SetupState {
  hasShop: boolean;
  hasOwner: boolean;
}

export async function getSetupState(): Promise<SetupState> {
  const db = getDb();
  const [shopRows, userRows] = await Promise.all([
    db.select({ total: count() }).from(schema.shops),
    db.select({ total: count() }).from(schema.user),
  ]);
  return {
    hasShop: (shopRows[0]?.total ?? 0) > 0,
    hasOwner: (userRows[0]?.total ?? 0) > 0,
  };
}

export function isSetupComplete(state: SetupState): boolean {
  return state.hasShop && state.hasOwner;
}
