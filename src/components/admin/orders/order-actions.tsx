"use client";

import { Ban, BadgeCheck, CheckCheck, Mail, Undo2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  approveReviewedOrder,
  cancelOrder,
  markOrderPaid,
  markOrderRefunded,
  resendOrderDelivery,
} from "@/app/admin/(dashboard)/orders/actions";
import type { ActionResult } from "@/lib/action-result";
import { Button } from "@/components/ui/button";

interface OrderActionsProps {
  orderId: string;
  status: string;
}

export function OrderActions({ orderId, status }: OrderActionsProps) {
  const [isPending, startTransition] = useTransition();

  function runAction(action: () => Promise<ActionResult>, successMessage: string): void {
    startTransition(async () => {
      const actionResult = await action();
      if (actionResult.error) {
        toast.error(actionResult.error);
      } else {
        toast.success(successMessage);
      }
    });
  }

  const canCancel = status === "pending" || status === "requires_review";
  const canApprove = status === "requires_review";
  const canMarkPaid = status === "pending" || status === "expired";
  const canResend = status === "delivered" || status === "refunded";
  const canRefund = status === "delivered";

  return (
    <div className="flex flex-wrap gap-2">
      {canMarkPaid ? (
        <Button
          size="sm"
          onClick={() => runAction(() => markOrderPaid(orderId), "Payment confirmed — order delivered")}
          disabled={isPending}
        >
          <BadgeCheck className="size-4" />
          Mark paid &amp; deliver
        </Button>
      ) : null}
      {canApprove ? (
        <Button
          size="sm"
          onClick={() => runAction(() => approveReviewedOrder(orderId), "Order delivered")}
          disabled={isPending}
        >
          <CheckCheck className="size-4" />
          Approve and deliver
        </Button>
      ) : null}
      {canResend ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => runAction(() => resendOrderDelivery(orderId), "Delivery email sent")}
          disabled={isPending}
        >
          <Mail className="size-4" />
          Resend email
        </Button>
      ) : null}
      {canRefund ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => runAction(() => markOrderRefunded(orderId), "Marked as refunded")}
          disabled={isPending}
        >
          <Undo2 className="size-4" />
          Mark refunded
        </Button>
      ) : null}
      {canCancel ? (
        <Button
          size="sm"
          variant="destructive"
          onClick={() => runAction(() => cancelOrder(orderId), "Order cancelled")}
          disabled={isPending}
        >
          <Ban className="size-4" />
          Cancel order
        </Button>
      ) : null}
    </div>
  );
}
