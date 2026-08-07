import { migrate } from "drizzle-orm/node-postgres/migrator";

import { prunePageViews } from "@/lib/analytics";
import { getDb } from "@/lib/db";
import { releaseExpiredReservations } from "@/lib/orders";

const MIGRATIONS_FOLDER = "./drizzle";
const RESERVATION_CLEANUP_INTERVAL_MS = 60_000;
const ANALYTICS_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface GlobalWithStartup {
  webshopStartupDone?: boolean;
}

const globalWithStartup = globalThis as GlobalWithStartup;

/** Runs pending migrations and starts the maintenance loop, once per boot. */
export async function runStartupTasks(): Promise<void> {
  if (globalWithStartup.webshopStartupDone === true) {
    return;
  }
  globalWithStartup.webshopStartupDone = true;

  await migrate(getDb(), { migrationsFolder: MIGRATIONS_FOLDER });
  console.info("[startup] database migrations applied");

  let lastAnalyticsPruneMs = 0;
  const cleanupTimer = setInterval(() => {
    releaseExpiredReservations()
      .then((expiredCount) => {
        if (expiredCount > 0) {
          console.info(`[orders] expired ${expiredCount} unpaid order(s), stock released`);
        }
      })
      .catch((cleanupError: unknown) => {
        console.error("[orders] reservation cleanup failed", cleanupError);
      });

    if (Date.now() - lastAnalyticsPruneMs > ANALYTICS_PRUNE_INTERVAL_MS) {
      lastAnalyticsPruneMs = Date.now();
      prunePageViews().catch((pruneError: unknown) => {
        console.error("[analytics] pageview pruning failed", pruneError);
      });
    }
  }, RESERVATION_CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
}
