/**
 * Zero-install development database: serves the Postgres wire protocol on
 * localhost backed by PGlite, so the app's normal `pg` driver works without a
 * real Postgres. Data persists under ./data/dev-db.
 *
 *   npx tsx scripts/dev-db.ts        # then: DATABASE_URL=postgres://dev:dev@localhost:5433/postgres
 *
 * Not for production use — single connection, no concurrency guarantees.
 */
import { createServer } from "node:net";

import { PGlite } from "@electric-sql/pglite";
import { fromNodeSocket } from "pg-gateway/node";

const DEV_DB_PORT = 5433;
const DEV_DB_DIR = "./data/dev-db";

const pglite = new PGlite(DEV_DB_DIR);

const server = createServer(async (socket) => {
  await fromNodeSocket(socket, {
    serverVersion: "16.3",
    auth: { method: "trust" },
    async onStartup() {
      await pglite.waitReady;
    },
    async onMessage(message, { isAuthenticated }) {
      if (!isAuthenticated) {
        return;
      }
      return pglite.execProtocolRaw(message);
    },
  });
});

server.listen(DEV_DB_PORT, () => {
  console.info(`dev database listening on postgres://dev:dev@localhost:${DEV_DB_PORT}/postgres`);
});
