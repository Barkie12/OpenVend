import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "@/lib/env";

export type UploadKind = "images" | "files";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 200 * 1024 * 1024;

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"]);

export interface StoredUpload {
  /** Path relative to the uploads root, e.g. `images/uuid.png`. */
  relativePath: string;
  fileName: string;
  sizeBytes: number;
}

function uploadsRoot(): string {
  return path.resolve(env().DATA_DIR, "uploads");
}

/** Resolves a stored relative path to an absolute one, refusing directory traversal. */
export function resolveStoredPath(relativePath: string): string {
  const root = uploadsRoot();
  const absolute = path.resolve(root, relativePath);
  if (!absolute.startsWith(root + path.sep)) {
    throw new Error("Invalid stored file path");
  }
  return absolute;
}

export async function saveUpload(file: File, kind: UploadKind): Promise<StoredUpload> {
  const maxBytes = kind === "images" ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
  if (file.size === 0) {
    throw new Error("File is empty");
  }
  if (file.size > maxBytes) {
    throw new Error(`File exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit`);
  }

  const extension = path.extname(file.name).toLowerCase();
  if (kind === "images" && !IMAGE_EXTENSIONS.has(extension)) {
    throw new Error("Unsupported image format");
  }

  const storedName = `${randomUUID()}${extension}`;
  const relativePath = path.posix.join(kind, storedName);
  const absolutePath = resolveStoredPath(relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, Buffer.from(await file.arrayBuffer()));

  return { relativePath, fileName: file.name, sizeBytes: file.size };
}

export async function deleteStoredFile(relativePath: string): Promise<void> {
  try {
    await unlink(resolveStoredPath(relativePath));
  } catch (error) {
    const isMissing = error instanceof Error && "code" in error && error.code === "ENOENT";
    if (!isMissing) {
      throw error;
    }
  }
}
