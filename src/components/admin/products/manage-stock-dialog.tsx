"use client";

import { Boxes, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  appendVariantStock,
  getVariantStock,
  overwriteVariantStock,
} from "@/app/admin/(dashboard)/products/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type StockDialogMode = "add" | "view";

interface ManageStockDialogProps {
  variantId: string;
  variantName: string;
  availableStock: number;
}

function countLines(text: string): number {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

export function ManageStockDialog({ variantId, variantName, availableStock }: ManageStockDialogProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<StockDialogMode>("add");
  const [newStockText, setNewStockText] = useState("");
  const [poolText, setPoolText] = useState("");
  const [initialPoolText, setInitialPoolText] = useState("");
  const [reservedCount, setReservedCount] = useState(0);
  const [deliveredCount, setDeliveredCount] = useState(0);
  const [isLoading, startLoading] = useTransition();
  const [isSaving, startSaving] = useTransition();

  function loadPool(): void {
    startLoading(async () => {
      const snapshot = await getVariantStock(variantId);
      if (snapshot.error !== null || snapshot.available === null) {
        toast.error(snapshot.error ?? "Could not load stock");
        setIsOpen(false);
        return;
      }
      const loadedText = snapshot.available.join("\n");
      setPoolText(loadedText);
      setInitialPoolText(loadedText);
      setReservedCount(snapshot.reservedCount);
      setDeliveredCount(snapshot.deliveredCount);
    });
  }

  function openDialog(open: boolean): void {
    setIsOpen(open);
    if (open) {
      setMode("add");
      setNewStockText("");
      loadPool();
    }
  }

  function submitNewStock(): void {
    startSaving(async () => {
      const appendResult = await appendVariantStock(variantId, newStockText);
      if (appendResult.error) {
        toast.error(appendResult.error);
        return;
      }
      const skippedNote = appendResult.skipped > 0 ? ` (${appendResult.skipped} duplicate(s) skipped)` : "";
      toast.success(`${appendResult.added} item${appendResult.added === 1 ? "" : "s"} added${skippedNote}`);
      setIsOpen(false);
      router.refresh();
    });
  }

  function savePool(): void {
    startSaving(async () => {
      const saveResult = await overwriteVariantStock(variantId, poolText);
      if (saveResult.error) {
        toast.error(saveResult.error);
        return;
      }
      toast.success(
        `Stock saved — ${saveResult.available} item${saveResult.available === 1 ? "" : "s"} available`,
      );
      setIsOpen(false);
      router.refresh();
    });
  }

  const isPoolDirty = poolText !== initialPoolText;
  const newLineCount = countLines(newStockText);
  const poolLineCount = countLines(poolText);

  return (
    <Dialog open={isOpen} onOpenChange={openDialog}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Boxes className="size-4" />
          Manage stock
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Stock — {variantName}</DialogTitle>
          <DialogDescription>
            {availableStock} available · {reservedCount} reserved · {deliveredCount} delivered
          </DialogDescription>
        </DialogHeader>

        <div className="flex w-fit items-center rounded-md border bg-muted/50 p-0.5">
          {(
            [
              { value: "add", label: "Add New" },
              { value: "view", label: "View Stock" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setMode(tab.value)}
              className={cn(
                "rounded-[5px] px-3 py-1 text-xs font-medium transition-colors",
                mode === tab.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {mode === "add" ? (
          <>
            <Textarea
              value={newStockText}
              onChange={(event) => setNewStockText(event.target.value)}
              rows={12}
              placeholder={"KEY-AAAA-0001\nKEY-AAAA-0002"}
              className="font-mono text-xs"
            />
            <DialogFooter className="items-center gap-2 sm:justify-between">
              <span className="text-xs text-muted-foreground">
                {newLineCount} new item{newLineCount === 1 ? "" : "s"} — duplicates already in stock are
                skipped
              </span>
              <Button onClick={submitNewStock} disabled={isSaving || newLineCount === 0}>
                {isSaving ? "Adding…" : "Add stock"}
              </Button>
            </DialogFooter>
          </>
        ) : isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading stock…
          </div>
        ) : (
          <>
            <Textarea
              value={poolText}
              onChange={(event) => setPoolText(event.target.value)}
              rows={12}
              placeholder="No available stock"
              className="font-mono text-xs"
            />
            <DialogFooter className="items-center gap-2 sm:justify-between">
              <span className="text-xs text-muted-foreground">
                {poolLineCount} item{poolLineCount === 1 ? "" : "s"} in the pool — saving replaces the
                available stock with exactly these lines
              </span>
              <Button onClick={savePool} disabled={isSaving || isLoading || !isPoolDirty}>
                {isSaving ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
