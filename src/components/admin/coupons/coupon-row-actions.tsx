"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { deleteCoupon, setCouponActive } from "@/app/admin/(dashboard)/coupons/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

interface CouponRowActionsProps {
  couponId: string;
  active: boolean;
}

export function CouponRowActions({ couponId, active }: CouponRowActionsProps) {
  const [isPending, startTransition] = useTransition();

  function toggleActive(nextActive: boolean): void {
    startTransition(async () => {
      const toggleResult = await setCouponActive(couponId, nextActive);
      if (toggleResult.error) {
        toast.error(toggleResult.error);
      }
    });
  }

  function removeCoupon(): void {
    startTransition(async () => {
      const deleteResult = await deleteCoupon(couponId);
      if (deleteResult.error) {
        toast.error(deleteResult.error);
      } else {
        toast.success("Coupon deleted");
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Switch checked={active} onCheckedChange={toggleActive} disabled={isPending} aria-label="Active" />
      <Button
        size="icon"
        variant="ghost"
        className="text-destructive"
        onClick={removeCoupon}
        disabled={isPending}
        aria-label="Delete coupon"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}
