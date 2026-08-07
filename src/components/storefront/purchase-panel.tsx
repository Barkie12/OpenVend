"use client";

import { Loader2, Minus, Plus, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const MAX_QUANTITY = 25;

export interface PurchaseVariant {
  id: string;
  name: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  minQuantity: number;
  maxQuantity: number | null;
  availableStock: number;
}

interface QuantityLimits {
  min: number;
  max: number;
}

function quantityLimits(variant: PurchaseVariant, isFileDelivery: boolean): QuantityLimits {
  if (isFileDelivery) {
    return { min: 1, max: 1 };
  }
  const min = Math.max(1, Math.min(variant.minQuantity, MAX_QUANTITY));
  const max = Math.max(min, Math.min(variant.maxQuantity ?? MAX_QUANTITY, MAX_QUANTITY));
  return { min, max };
}

interface PurchasePanelProps {
  deliveryType: string;
  currency: string;
  variants: PurchaseVariant[];
}

export function PurchasePanel({ deliveryType, currency, variants }: PurchasePanelProps) {
  const router = useRouter();
  const isSerials = deliveryType === "serials";
  const isFileDelivery = deliveryType === "file";
  const firstInStock = variants.find(
    (variant) => deliveryType !== "serials" || variant.availableStock > 0,
  );
  const initialVariant = firstInStock ?? variants[0] ?? null;
  const [selectedVariantId, setSelectedVariantId] = useState<string>(initialVariant?.id ?? "");
  const [quantity, setQuantity] = useState(
    initialVariant ? quantityLimits(initialVariant, isFileDelivery).min : 1,
  );
  const [isNavigating, startNavigating] = useTransition();

  const selectedVariant = useMemo(
    () => variants.find((variant) => variant.id === selectedVariantId) ?? null,
    [variants, selectedVariantId],
  );

  const limits = selectedVariant ? quantityLimits(selectedVariant, isFileDelivery) : { min: 1, max: 1 };
  const maxQuantity =
    selectedVariant && isSerials ? Math.min(limits.max, selectedVariant.availableStock) : limits.max;
  const showQuantity = !isFileDelivery && (limits.min !== limits.max || maxQuantity > limits.min);
  const outOfStock = selectedVariant !== null && isSerials && selectedVariant.availableStock <= 0;
  const totalCents = selectedVariant === null ? 0 : selectedVariant.priceCents * quantity;
  const compareAtTotalCents =
    selectedVariant?.compareAtPriceCents == null ? null : selectedVariant.compareAtPriceCents * quantity;

  function clampQuantity(nextQuantity: number): number {
    return Math.max(limits.min, Math.min(maxQuantity, nextQuantity));
  }

  function selectVariant(variantId: string): void {
    setSelectedVariantId(variantId);
    const nextVariant = variants.find((variant) => variant.id === variantId);
    if (nextVariant) {
      const nextLimits = quantityLimits(nextVariant, isFileDelivery);
      const nextMax =
        isSerials && nextVariant.availableStock > 0
          ? Math.min(nextLimits.max, nextVariant.availableStock)
          : nextLimits.max;
      setQuantity((currentQuantity) => Math.max(nextLimits.min, Math.min(nextMax, currentQuantity)));
    }
  }

  function buyNow(): void {
    if (selectedVariant === null) {
      return;
    }
    const params = new URLSearchParams({ variant: selectedVariant.id });
    if (quantity > 1) {
      params.set("qty", String(quantity));
    }
    startNavigating(() => {
      router.push(`/checkout?${params.toString()}`);
    });
  }

  return (
    <Card className="py-5">
      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Purchase</p>
          <div className="text-right">
            {compareAtTotalCents !== null ? (
              <p className="text-sm text-muted-foreground line-through">
                {formatMoney(compareAtTotalCents, currency)}
              </p>
            ) : null}
            <p className="text-2xl font-bold leading-tight">
              {selectedVariant ? formatMoney(totalCents, currency) : "—"}
            </p>
            {quantity > 1 && selectedVariant ? (
              <p className="text-xs text-muted-foreground">
                {quantity} × {formatMoney(selectedVariant.priceCents, currency)}
              </p>
            ) : null}
          </div>
        </div>

        {variants.length > 1 ? (
          <div className="space-y-2">
            <Label>Option</Label>
            <div className="space-y-2">
              {variants.map((variant) => {
                const variantOutOfStock = isSerials && variant.availableStock <= 0;
                const isSelected = variant.id === selectedVariantId;
                return (
                  <button
                    key={variant.id}
                    type="button"
                    disabled={variantOutOfStock}
                    onClick={() => selectVariant(variant.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "hover:border-muted-foreground/40",
                      variantOutOfStock && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{variant.name}</span>
                      {isSerials ? (
                        <span className="block text-xs text-muted-foreground">
                          {variantOutOfStock ? "Out of stock" : `${variant.availableStock} in stock`}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-right">
                      {variant.compareAtPriceCents !== null ? (
                        <span className="mr-1.5 text-xs text-muted-foreground line-through">
                          {formatMoney(variant.compareAtPriceCents, currency)}
                        </span>
                      ) : null}
                      <span className="text-sm font-semibold">
                        {formatMoney(variant.priceCents, currency)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {showQuantity ? (
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9 shrink-0"
                onClick={() => setQuantity((current) => clampQuantity(current - 1))}
                disabled={quantity <= limits.min}
                aria-label="Decrease quantity"
              >
                <Minus className="size-4" />
              </Button>
              <Input
                id="quantity"
                inputMode="numeric"
                className="w-16 text-center"
                value={quantity}
                onChange={(event) => {
                  const nextQuantity = Number.parseInt(event.target.value, 10);
                  setQuantity(Number.isNaN(nextQuantity) ? limits.min : clampQuantity(nextQuantity));
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9 shrink-0"
                onClick={() => setQuantity((current) => clampQuantity(current + 1))}
                disabled={quantity >= maxQuantity}
                aria-label="Increase quantity"
              >
                <Plus className="size-4" />
              </Button>
              {limits.min > 1 ? (
                <span className="text-xs text-muted-foreground">min. {limits.min}</span>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          <Button
            size="lg"
            className="w-full"
            onClick={buyNow}
            disabled={isNavigating || outOfStock || selectedVariant === null}
          >
            {isNavigating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Opening checkout…
              </>
            ) : outOfStock ? (
              "Out of stock"
            ) : (
              "Buy Now"
            )}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Zap className="size-3.5" />
            Instant delivery after payment
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
