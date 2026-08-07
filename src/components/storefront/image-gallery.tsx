"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { imageUrl } from "@/lib/image-url";

const MAIN_IMAGE_WIDTH = 960;
const MAIN_IMAGE_HEIGHT = 540;
const THUMB_SIZE_PX = 80;

interface ImageGalleryProps {
  images: string[];
  productName: string;
}

export function ImageGallery({ images, productName }: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedImage = images[selectedIndex] ?? images[0];

  if (!selectedImage) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border bg-muted">
        <Image
          src={imageUrl(selectedImage)}
          alt={productName}
          width={MAIN_IMAGE_WIDTH}
          height={MAIN_IMAGE_HEIGHT}
          className="aspect-video w-full object-cover"
          priority
        />
      </div>
      {images.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {images.map((storedImage, index) => (
            <button
              key={storedImage}
              type="button"
              onClick={() => setSelectedIndex(index)}
              className={cn(
                "overflow-hidden rounded-md border transition-opacity",
                index === selectedIndex ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100",
              )}
              aria-label={`Show image ${index + 1}`}
            >
              <Image
                src={imageUrl(storedImage)}
                alt=""
                width={THUMB_SIZE_PX}
                height={THUMB_SIZE_PX}
                className="size-20 object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
