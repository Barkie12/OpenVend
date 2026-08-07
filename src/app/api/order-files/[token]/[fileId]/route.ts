import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { getOrderByAccessToken } from "@/lib/orders";
import { resolveStoredPath } from "@/lib/storage";

/** Streams a deliverable file to a buyer holding a delivered order token. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string; fileId: string }> },
): Promise<Response> {
  const { token, fileId } = await context.params;

  const order = await getOrderByAccessToken(token);
  if (!order || order.status !== "delivered") {
    return new Response("Not found", { status: 404 });
  }

  const fileRows = await getDb()
    .select()
    .from(schema.productFiles)
    .where(eq(schema.productFiles.id, fileId))
    .limit(1);
  const productFile = fileRows[0];
  if (!productFile) {
    return new Response("Not found", { status: 404 });
  }

  const orderIncludesFile = order.items.some((item) => item.productId === productFile.productId);
  if (!orderIncludesFile) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const absolutePath = resolveStoredPath(productFile.filePath);
    const fileStats = await stat(absolutePath);
    const fileStream = Readable.toWeb(createReadStream(absolutePath)) as ReadableStream<Uint8Array>;
    return new Response(fileStream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(fileStats.size),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(productFile.fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
