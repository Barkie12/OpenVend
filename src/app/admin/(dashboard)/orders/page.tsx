import { and, count, desc } from "drizzle-orm";
import {
  Bitcoin,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  Eye,
  HandCoins,
  Search,
  TicketPercent,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { OrderStatusBadge } from "@/components/admin/orders/order-status-badge";
import { RefreshButton } from "@/components/admin/orders/refresh-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb, schema } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import {
  ORDER_STATUS_FILTERS,
  buildOrderConditions,
  isOrderStatusFilter,
  type OrderStatusFilter,
} from "@/lib/order-filters";
import { paymentMethodLabel } from "@/lib/stats";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

const STATUS_LABELS: Record<OrderStatusFilter, string> = {
  all: "All",
  delivered: "Delivered",
  pending: "Pending",
  requires_review: "Needs review",
  refunded: "Refunded",
  cancelled: "Cancelled",
  expired: "Expired",
};

const PAYMENT_ICONS: Record<string, LucideIcon> = {
  stripe: CreditCard,
  nowpayments: Bitcoin,
  free: TicketPercent,
  manual: HandCoins,
};

function ordersHref(status: OrderStatusFilter, search: string, page: number): string {
  const params = new URLSearchParams();
  if (status !== "all") {
    params.set("status", status);
  }
  if (search.trim().length > 0) {
    params.set("q", search.trim());
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const queryString = params.toString();
  return queryString.length > 0 ? `/admin/orders?${queryString}` : "/admin/orders";
}

function formatTimestamp(timestamp: Date | null): string {
  if (timestamp === null) {
    return "—";
  }
  return timestamp.toLocaleString("en-US", { dateStyle: "short", timeStyle: "medium" });
}

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const resolvedSearchParams = await searchParams;
  const statusParam = typeof resolvedSearchParams.status === "string" ? resolvedSearchParams.status : "all";
  const statusFilter: OrderStatusFilter = isOrderStatusFilter(statusParam) ? statusParam : "all";
  const search = typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : "";
  const pageParam = typeof resolvedSearchParams.page === "string" ? Number.parseInt(resolvedSearchParams.page, 10) : 1;
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const conditions = buildOrderConditions(statusFilter, search);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();

  const [orders, totalRows] = await Promise.all([
    db.query.orders.findMany({
      where: whereClause,
      with: { items: true },
      orderBy: [desc(schema.orders.createdAt)],
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    db.select({ total: count() }).from(schema.orders).where(whereClause),
  ]);
  const totalOrders = totalRows[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalOrders / PAGE_SIZE));
  const rangeStart = totalOrders === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalOrders);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Orders</h1>
        <p className="text-sm text-muted-foreground">Browse and manage your orders.</p>
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b !py-4">
          <div className="flex flex-wrap items-center gap-1">
            {ORDER_STATUS_FILTERS.map((filter) => (
              <Link
                key={filter}
                href={ordersHref(filter, search, 1)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  filter === statusFilter
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {STATUS_LABELS[filter]}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton />
            <Button asChild variant="outline" size="sm">
              <a href={`/api/admin/orders/export${ordersHref(statusFilter, search, 1).replace("/admin/orders", "")}`}>
                <Download className="size-4" />
                Export
              </a>
            </Button>
            <form action="/admin/orders" className="relative">
              {statusFilter !== "all" ? <input type="hidden" name="status" value={statusFilter} /> : null}
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                name="q"
                defaultValue={search}
                placeholder="Search #, email or product…"
                className="h-8 w-60 pl-8"
              />
            </form>
          </div>
        </CardHeader>

        <CardContent className="px-0">
          {orders.length === 0 ? (
            <p className="py-16 text-center text-muted-foreground">
              No orders{search ? ` matching “${search}”` : statusFilter !== "all" ? ` with status “${STATUS_LABELS[statusFilter]}”` : " yet"}
              .
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Status</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const isPaid = order.paidAt !== null;
                  const PaymentIcon = order.paymentProvider
                    ? (PAYMENT_ICONS[order.paymentProvider] ?? CreditCard)
                    : null;
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="pl-6">
                        <OrderStatusBadge status={order.status} />
                      </TableCell>
                      <TableCell>
                        <Link href={`/admin/orders/${order.id}`} className="font-medium hover:underline">
                          #{order.orderNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-48 truncate">
                        {order.items.map((item) => `${item.quantity}× ${item.productName}`).join(", ")}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatMoney(order.totalCents, order.currency)}
                      </TableCell>
                      <TableCell>
                        {isPaid ? (
                          <span className="font-medium text-green-500">
                            +{formatMoney(order.totalCents, order.currency)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {PaymentIcon && order.paymentProvider ? (
                          <span className="flex items-center gap-1.5 text-sm">
                            <PaymentIcon className="size-4 text-muted-foreground" />
                            {paymentMethodLabel(order.paymentProvider)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-52 truncate text-muted-foreground">{order.email}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatTimestamp(order.createdAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatTimestamp(order.deliveredAt)}
                      </TableCell>
                      <TableCell>
                        <Button asChild size="icon" variant="ghost" aria-label={`Open order #${order.orderNumber}`}>
                          <Link href={`/admin/orders/${order.id}`}>
                            <Eye className="size-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-6 py-3">
          <p className="text-xs text-muted-foreground">
            Showing {rangeStart}–{rangeEnd} of {totalOrders} order{totalOrders === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-1">
            <Button
              asChild={page > 1}
              variant="outline"
              size="sm"
              disabled={page <= 1}
              aria-label="Previous page"
            >
              {page > 1 ? (
                <Link href={ordersHref(statusFilter, search, page - 1)}>
                  <ChevronLeft className="size-4" />
                  Prev
                </Link>
              ) : (
                <span className="flex items-center">
                  <ChevronLeft className="size-4" />
                  Prev
                </span>
              )}
            </Button>
            <span className="px-2 text-xs text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              asChild={page < totalPages}
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              aria-label="Next page"
            >
              {page < totalPages ? (
                <Link href={ordersHref(statusFilter, search, page + 1)}>
                  Next
                  <ChevronRight className="size-4" />
                </Link>
              ) : (
                <span className="flex items-center">
                  Next
                  <ChevronRight className="size-4" />
                </span>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
