import { getAdminSession } from "@/lib/session";
import { deleteStoredFile, saveUpload, type StoredUpload, type UploadKind } from "@/lib/storage";

const MAX_IMAGES_PER_UPLOAD = 12;

/**
 * Authenticated file upload endpoint. Uploads intentionally bypass Server
 * Actions: Next's action body parsing is unreliable for large multipart
 * payloads ("Unexpected end of form", 1 MB truncation). Clients upload here,
 * then attach the returned paths via a small JSON server action.
 */
export async function POST(request: Request): Promise<Response> {
  const adminSession = await getAdminSession();
  if (!adminSession) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const kindValue = formData.get("kind");
  if (kindValue !== "images" && kindValue !== "files") {
    return Response.json({ error: "Unknown upload kind" }, { status: 400 });
  }
  const kind: UploadKind = kindValue;

  const files = formData
    .getAll("file")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) {
    return Response.json({ error: "No files received" }, { status: 400 });
  }
  if (kind === "images" && files.length > MAX_IMAGES_PER_UPLOAD) {
    return Response.json(
      { error: `At most ${MAX_IMAGES_PER_UPLOAD} images per upload` },
      { status: 400 },
    );
  }
  if (kind === "files" && files.length > 1) {
    return Response.json({ error: "Upload one deliverable file at a time" }, { status: 400 });
  }

  const uploads: StoredUpload[] = [];
  for (const file of files) {
    try {
      uploads.push(await saveUpload(file, kind));
    } catch (uploadError) {
      // Roll back files stored earlier in this batch so nothing is orphaned.
      for (const storedUpload of uploads) {
        await deleteStoredFile(storedUpload.relativePath);
      }
      const message =
        uploadError instanceof Error ? `${file.name}: ${uploadError.message}` : `${file.name}: upload failed`;
      return Response.json({ error: message }, { status: 400 });
    }
  }

  return Response.json({ uploads });
}
