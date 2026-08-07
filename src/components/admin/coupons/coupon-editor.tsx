"use client";

import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { createCoupon, updateCoupon } from "@/app/admin/(dashboard)/coupons/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const SECTION_TITLE_CLASS =
  "flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground";
const PERCENT_PRESETS = [5, 10, 15, 20, 25, 50, 100] as const;
const GENERATED_CODE_LENGTH = 10;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCouponCode(): string {
  const randomValues = new Uint32Array(GENERATED_CODE_LENGTH);
  crypto.getRandomValues(randomValues);
  return [...randomValues]
    .map((value) => CODE_ALPHABET[value % CODE_ALPHABET.length])
    .join("");
}

export interface CouponProductOption {
  id: string;
  name: string;
}

export interface CouponEditorInitial {
  code: string;
  type: "percent" | "fixed";
  value: string;
  maxUses: string;
  maxUsesPerCustomer: string;
  minOrderValue: string;
  startsAt: string;
  expiresAt: string;
  applyToAll: boolean;
  productIds: string[];
}

interface CouponEditorProps {
  mode: "create" | "edit";
  couponId: string | null;
  currency: string;
  products: CouponProductOption[];
  initial: CouponEditorInitial;
}

export function CouponEditor({ mode, couponId, currency, products, initial }: CouponEditorProps) {
  const router = useRouter();
  const [code, setCode] = useState(initial.code);
  const [discountType, setDiscountType] = useState<"percent" | "fixed">(initial.type);
  const [discountValue, setDiscountValue] = useState(initial.value);
  const [applyToAll, setApplyToAll] = useState(initial.applyToAll);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set(initial.productIds));
  const [isSaving, startSaving] = useTransition();

  function toggleProduct(productId: string): void {
    setSelectedProductIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(productId)) {
        nextIds.delete(productId);
      } else {
        nextIds.add(productId);
      }
      return nextIds;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startSaving(async () => {
      const saveResult =
        mode === "create"
          ? await createCoupon({ error: null }, formData)
          : await updateCoupon(couponId ?? "", { error: null }, formData);
      if (saveResult.error) {
        toast.error(saveResult.error);
        return;
      }
      toast.success(mode === "create" ? "Coupon created" : "Coupon saved");
      router.push("/admin/coupons");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{mode === "create" ? "Create Coupon" : "Edit Coupon"}</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "create" ? "Fill in the details below to create a new coupon." : `Editing ${initial.code}.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/coupons">
              <ArrowLeft className="size-4" />
              Cancel
            </Link>
          </Button>
          <Button type="submit" size="sm" disabled={isSaving}>
            {isSaving ? "Saving…" : mode === "create" ? "Create coupon" : "Save coupon"}
          </Button>
        </div>
      </div>

      <Card className="gap-4 py-4">
        <CardHeader className="pb-0">
          <CardTitle className={SECTION_TITLE_CLASS}>General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="coupon-code">Code</Label>
            <div className="flex gap-2">
              <Input
                id="coupon-code"
                name="code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="LAUNCH20"
                required
                className="font-mono uppercase"
              />
              <Button type="button" variant="outline" onClick={() => setCode(generateCouponCode())}>
                <Sparkles className="size-4" />
                Generate
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <input type="hidden" name="type" value={discountType} />
            <div className="flex w-fit items-center rounded-md border bg-muted/50 p-0.5">
              {(
                [
                  { value: "percent", label: "Percentage" },
                  { value: "fixed", label: "Fixed Amount" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDiscountType(option.value)}
                  className={cn(
                    "rounded-[5px] px-3 py-1.5 text-xs font-medium transition-colors",
                    discountType === option.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="coupon-value">
              {discountType === "percent" ? "Discount (%)" : `Discount amount (${currency})`}
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="coupon-value"
                name="value"
                inputMode="decimal"
                value={discountValue}
                onChange={(event) => setDiscountValue(event.target.value)}
                placeholder={discountType === "percent" ? "20" : "5.00"}
                required
                className="w-32"
              />
              {discountType === "percent" ? (
                <div className="flex flex-wrap gap-1">
                  {PERCENT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDiscountValue(String(preset))}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs transition-colors",
                        discountValue === String(preset)
                          ? "border-primary bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {preset}%
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-4 py-4">
        <CardHeader className="pb-0">
          <CardTitle className={SECTION_TITLE_CLASS}>Schedule &amp; limits</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="coupon-starts">
              Start date <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input id="coupon-starts" name="startsAt" type="datetime-local" defaultValue={initial.startsAt} />
            <p className="text-xs text-muted-foreground">Leave empty to activate immediately.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="coupon-expires">
              End date <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input id="coupon-expires" name="expiresAt" type="datetime-local" defaultValue={initial.expiresAt} />
            <p className="text-xs text-muted-foreground">Leave empty for no expiration.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="coupon-max-uses">
              Use limit <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="coupon-max-uses"
              name="maxUses"
              inputMode="numeric"
              defaultValue={initial.maxUses}
              placeholder="Unlimited"
            />
            <p className="text-xs text-muted-foreground">
              Counted when the order is paid — abandoned checkouts don&apos;t consume uses.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="coupon-per-customer">
              Per-customer limit <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="coupon-per-customer"
              name="maxUsesPerCustomer"
              inputMode="numeric"
              defaultValue={initial.maxUsesPerCustomer}
              placeholder="Unlimited"
            />
            <p className="text-xs text-muted-foreground">Redemptions allowed per buyer e-mail.</p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="coupon-min-order">
              Minimum order value ({currency}) <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="coupon-min-order"
              name="minOrderValue"
              inputMode="decimal"
              defaultValue={initial.minOrderValue}
              placeholder="No minimum"
              className="max-w-40"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="gap-4 py-4">
        <CardHeader className="pb-0">
          <CardTitle className={SECTION_TITLE_CLASS}>Products</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5">
            <span className="text-sm font-medium">Apply to all products</span>
            {applyToAll ? <input type="hidden" name="applyToAll" value="on" /> : null}
            <Switch checked={applyToAll} onCheckedChange={setApplyToAll} />
          </label>
          {!applyToAll ? (
            products.length === 0 ? (
              <p className="text-sm text-muted-foreground">No products yet.</p>
            ) : (
              <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border p-1.5">
                {products.map((product) => (
                  <label
                    key={product.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-accent has-data-[state=checked]:bg-primary/10"
                  >
                    <Checkbox
                      checked={selectedProductIds.has(product.id)}
                      onCheckedChange={() => toggleProduct(product.id)}
                    />
                    {product.name}
                  </label>
                ))}
              </div>
            )
          ) : null}
          {!applyToAll
            ? [...selectedProductIds].map((productId) => (
                <input key={productId} type="hidden" name="productIds" value={productId} />
              ))
            : null}
        </CardContent>
      </Card>
    </form>
  );
}
