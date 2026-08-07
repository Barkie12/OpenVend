import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type OrderStatus =
  | "pending"
  | "paid"
  | "delivered"
  | "requires_review"
  | "cancelled"
  | "expired"
  | "refunded";

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  paid: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  delivered: "bg-green-500/15 text-green-500 border-green-500/30",
  requires_review: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  cancelled: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  refunded: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

interface OrderStatusBadgeProps {
  status: OrderStatus;
}

export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[status])}>
      {status.replace("_", " ")}
    </Badge>
  );
}
