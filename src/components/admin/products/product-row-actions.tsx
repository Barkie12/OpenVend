"use client";

import { Copy, ExternalLink, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import { deleteProduct, duplicateProduct } from "@/app/admin/(dashboard)/products/actions";

interface ProductRowActionsProps {
  productId: string;
  productName: string;
  slug: string;
}

export function ProductRowActions({ productId, productName, slug }: ProductRowActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function duplicateRow(): void {
    startTransition(async () => {
      const duplicateResult = await duplicateProduct(productId);
      if (duplicateResult.error !== null || duplicateResult.productId === null) {
        toast.error(duplicateResult.error ?? "Duplicate failed");
        return;
      }
      toast.success("Product duplicated (hidden until you publish it)");
      router.push(`/admin/products/${duplicateResult.productId}`);
    });
  }

  function deleteRow(): void {
    startTransition(async () => {
      const deleteResult = await deleteProduct(productId);
      if (deleteResult.error) {
        toast.error(deleteResult.error);
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button asChild size="icon" variant="ghost" aria-label={`Edit ${productName}`}>
        <Link href={`/admin/products/${productId}`}>
          <Pencil className="size-4" />
        </Link>
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={duplicateRow}
        disabled={isPending}
        aria-label={`Duplicate ${productName}`}
      >
        <Copy className="size-4" />
      </Button>
      <Button asChild size="icon" variant="ghost" aria-label={`View ${productName} on the storefront`}>
        <Link href={`/p/${slug}`} target="_blank">
          <ExternalLink className="size-4" />
        </Link>
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="text-destructive"
            disabled={isPending}
            aria-label={`Delete ${productName}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{productName}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the product, its variants, unsold stock, images and files. Existing orders
              keep their delivered items. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteRow} className="bg-destructive text-white hover:bg-destructive/90">
              Delete product
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
