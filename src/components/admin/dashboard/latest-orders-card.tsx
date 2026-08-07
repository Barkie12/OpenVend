import { Package, ShoppingBag } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { imageUrl } from "@/lib/image-url";
import { formatMoney } from "@/lib/money";
import { paymentMethodLabel, type LatestOrderEntry } from "@/lib/stats";

const THUMB_SIZE_PX = 36;

interface LatestOrdersCardProps {
  orders: LatestOrderEntry[];
}

export function LatestOrdersCard({ orders }: LatestOrdersCardProps) {
  return (
    <Card className="h-full gap-3 py-4">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <ShoppingBag className="size-3.5" />
          Latest completed orders
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2">
        {orders.length === 0 ? (
          <p className="px-2 py-12 text-center text-sm text-muted-foreground">
            No completed orders yet.
          </p>
        ) : (
          <ul>
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/admin/orders/${order.id}`}
                  className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent"
                >
                  {order.imagePath ? (
                    <Image
                      src={imageUrl(order.imagePath)}
                      alt=""
                      width={THUMB_SIZE_PX}
                      height={THUMB_SIZE_PX}
                      className="size-9 shrink-0 rounded-md border object-cover"
                    />
                  ) : (
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted">
                      <Package className="size-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{order.productName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {paymentMethodLabel(order.paymentMethod)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold">{formatMoney(order.totalCents, order.currency)}</p>
                    <p className="text-xs text-muted-foreground">{order.paidAgo}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
