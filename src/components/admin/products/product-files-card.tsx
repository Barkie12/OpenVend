"use client";

import { FileDown, Trash2, Upload } from "lucide-react";
import { useRef, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { attachProductFile, removeProductFile } from "@/app/admin/(dashboard)/products/actions";
import { uploadFilesToServer } from "@/lib/upload-client";

export interface ProductFileRow {
  id: string;
  fileName: string;
  sizeBytes: number;
}

interface ProductFilesCardProps {
  productId: string;
  deliveryType: string;
  files: ProductFileRow[];
}

const BYTES_PER_MB = 1024 * 1024;

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < BYTES_PER_MB) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / BYTES_PER_MB).toFixed(1)} MB`;
}

export function ProductFilesCard({ productId, deliveryType, files }: ProductFilesCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  function submitFile(): void {
    const fileInput = fileInputRef.current;
    const selectedFile = fileInput?.files?.[0];
    if (!fileInput || !selectedFile) {
      toast.error("Choose a file first");
      return;
    }
    startTransition(async () => {
      const uploadOutcome = await uploadFilesToServer("files", [selectedFile]);
      const uploadedFile = uploadOutcome.uploads[0];
      if (uploadOutcome.error !== null || !uploadedFile) {
        toast.error(uploadOutcome.error ?? "Upload failed");
        return;
      }
      const attachResult = await attachProductFile(productId, uploadedFile);
      if (attachResult.error) {
        toast.error(attachResult.error);
        return;
      }
      toast.success("File uploaded");
      fileInput.value = "";
    });
  }

  function removeFile(fileId: string): void {
    startTransition(async () => {
      const removeResult = await removeProductFile(fileId);
      if (removeResult.error) {
        toast.error(removeResult.error);
      } else {
        toast.success("File removed");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Downloadable files
        </CardTitle>
        <CardDescription>
          Delivered with every purchase of this product, whatever the delivery type — e.g. a loader
          alongside serial keys.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {files.length > 0 ? (
          <ul className="space-y-2">
            {files.map((productFile) => (
              <li key={productFile.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="flex items-center gap-2">
                  <FileDown className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{productFile.fileName}</span>
                  <span className="text-xs text-muted-foreground">{formatFileSize(productFile.sizeBytes)}</span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => removeFile(productFile.id)}
                  disabled={isPending}
                  aria-label={`Remove ${productFile.fileName}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {deliveryType === "file"
              ? "No files uploaded yet — buyers of this file product would receive nothing."
              : "No files attached."}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Input ref={fileInputRef} type="file" className="max-w-xs" />
          <Button variant="outline" onClick={submitFile} disabled={isPending}>
            <Upload className="size-4" />
            Upload
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
