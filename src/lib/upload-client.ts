/** Client helper for the /api/admin/uploads endpoint. */

export interface UploadedFile {
  relativePath: string;
  fileName: string;
  sizeBytes: number;
}

export interface UploadOutcome {
  error: string | null;
  uploads: UploadedFile[];
}

function isUploadedFile(value: unknown): value is UploadedFile {
  return (
    typeof value === "object" &&
    value !== null &&
    "relativePath" in value &&
    typeof value.relativePath === "string" &&
    "fileName" in value &&
    typeof value.fileName === "string" &&
    "sizeBytes" in value &&
    typeof value.sizeBytes === "number"
  );
}

export async function uploadFilesToServer(
  kind: "images" | "files",
  files: readonly File[],
): Promise<UploadOutcome> {
  const formData = new FormData();
  formData.set("kind", kind);
  for (const file of files) {
    formData.append("file", file);
  }

  try {
    const response = await fetch("/api/admin/uploads", { method: "POST", body: formData });
    const payload: unknown = await response.json();

    if (!response.ok) {
      const message =
        typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : `Upload failed (status ${response.status})`;
      return { error: message, uploads: [] };
    }

    const uploads =
      typeof payload === "object" && payload !== null && "uploads" in payload && Array.isArray(payload.uploads)
        ? payload.uploads.filter(isUploadedFile)
        : [];
    if (uploads.length === 0) {
      return { error: "Upload failed — empty server response", uploads: [] };
    }
    return { error: null, uploads };
  } catch {
    return { error: "Upload failed — check your connection", uploads: [] };
  }
}
