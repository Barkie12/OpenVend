import { readFile } from "node:fs/promises";
import path from "node:path";

import { resolveStoredPath } from "@/lib/storage";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

const PUBLIC_PREFIX = "images/";

/** Serves uploaded product images. Deliverable files are never exposed here. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: segments } = await context.params;
  const relativePath = segments.join("/");
  if (!relativePath.startsWith(PUBLIC_PREFIX)) {
    return new Response("Not found", { status: 404 });
  }

  const contentType = CONTENT_TYPES[path.extname(relativePath).toLowerCase()];
  if (!contentType) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const fileContents = await readFile(resolveStoredPath(relativePath));
    const responseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    };
    // SVG can carry scripts; a strict CSP keeps them inert when opened directly.
    if (contentType === "image/svg+xml") {
      responseHeaders["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'";
    }
    return new Response(new Uint8Array(fileContents), { headers: responseHeaders });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
