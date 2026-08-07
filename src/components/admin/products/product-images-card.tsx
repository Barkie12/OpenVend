"use client";

import { Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useRef, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { imageUrl } from "@/lib/image-url";

import { attachProductImages, removeProductImage } from "@/app/admin/(dashboard)/products/actions";
import { uploadFilesToServer } from "@/lib/upload-client";

const PREVIEW_SIZE_PX = 112;

interface ProductImagesCardProps {
  productId: string;
  images: string[];
}

export function ProductImagesCard({ productId, images }: ProductImagesCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  function submitImage(): void {
    const fileInput = fileInputRef.current;
    const selectedFiles = fileInput?.files;
    if (!fileInput || !selectedFiles || selectedFiles.length === 0) {
      toast.error("Choose at least one image first");
      return;
    }
    const filesToUpload = [...selectedFiles];
    startTransition(async () => {
      const uploadOutcome = await uploadFilesToServer("images", filesToUpload);
      if (uploadOutcome.error !== null) {
        toast.error(uploadOutcome.error);
        return;
      }
      const attachResult = await attachProductImages(
        productId,
        uploadOutcome.uploads.map((upload) => upload.relativePath),
      );
      if (attachResult.error) {
        toast.error(attachResult.error);
        return;
      }
      toast.success(
        `${uploadOutcome.uploads.length} image${uploadOutcome.uploads.length === 1 ? "" : "s"} uploaded`,
      );
      fileInput.value = "";
    });
  }

  function removeImage(relativePath: string): void {
    startTransition(async () => {
      const removeResult = await removeProductImage(productId, relativePath);
      if (removeResult.error) {
        toast.error(removeResult.error);
      } else {
        toast.success("Image removed");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Images</CardTitle>
        <CardDescription>The first image is used as the product thumbnail.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {images.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {images.map((storedImage) => (
              <div key={storedImage} className="group relative">
                <Image
                  src={imageUrl(storedImage)}
                  alt=""
                  width={PREVIEW_SIZE_PX}
                  height={PREVIEW_SIZE_PX}
                  className="size-28 rounded-md border object-cover"
                />
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute -right-2 -top-2 size-6 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => removeImage(storedImage)}
                  disabled={isPending}
                  aria-label="Remove image"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No images yet.</p>
        )}
        <div className="flex items-center gap-2">
          <Input ref={fileInputRef} type="file" accept="image/*" multiple className="max-w-xs" />
          <Button variant="outline" onClick={submitImage} disabled={isPending}>
            <Upload className="size-4" />
            {isPending ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
