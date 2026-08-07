import { desc, eq, inArray } from "drizzle-orm";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  FileDown,
  Mail,
  Package,
  Receipt,
  ShoppingBag,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BlacklistQuickActions } from "@/components/admin/orders/blacklist-quick-actions";
import { OrderActions } from "@/components/admin/orders/order-actions";
import { OrderStatusBadge } from "@/components/admin/orders/order-status-badge";
import { CopyButton } from "@/components/storefront/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseBrowser, parseOs } from "@/lib/analytics";
import { getDb, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { imageUrl } from "@/lib/image-url";
import { formatMoney } from "@/lib/money";
import { getOrderByAccessToken } from "@/lib/orders";
import { timeAgo } from "@/lib/relative-time";
import { paymentMethodLabel } from "@/lib/stats";

const SECTION_TITLE_CLASS =
  "flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground";
const THUMB_SIZE_PX = 44;

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

function countryWithFlag(code: string | null): string {
  if (code === null) {
    return "—";
  }
  const upperCode = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upperCode)) {
    return code;
  }
  const flag = [...upperCode]
    .map((letter) => String.fromCodePoint(0x1f1e6 - 65 + letter.charCodeAt(0)))
    .join("");
  let regionName = upperCode;
  try {
    regionName = regionNames.of(upperCode) ?? upperCode;
  } catch {
    // Unknown region codes fall back to the raw code.
  }
  return `${flag} ${regionName}`;
}

function formatTimestamp(timestamp: Date | null): string {
  if (timestamp === null) {
    return "—";
  }
  return timestamp.toLocaleString("en-US", { dateStyle: "short", timeStyle: "medium" });
}

interface SummaryRowProps {
  label: string;
  children: React.ReactNode;
}

function SummaryRow({ label, children }: SummaryRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export default async function AdminOrderDetailPage({ params }: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  const db = getDb();

  const orderRows = await db
    .select({ accessToken: schema.orders.accessToken })
    .from(schema.orders)
    .where(eq(schema.orders.id, id))
    .limit(1);
  const tokenRow = orderRows[0];
  if (!tokenRow) {
    notFound();
  }
  const order = await getOrderByAccessToken(tokenRow.accessToken);
  if (!order) {
    notFound();
  }

  const productIds = order.items
    .map((item) => item.productId)
    .filter((productId): productId is string => productId !== null);

  const [paymentRows, eventRows, productRows] = await Promise.all([
    db.select().from(schema.payments).where(eq(schema.payments.orderId, order.id)),
    db
      .select()
      .from(schema.paymentEvents)
      .where(eq(schema.paymentEvents.orderId, order.id))
      .orderBy(desc(schema.paymentEvents.createdAt)),
    productIds.length > 0
      ? db
          .select({ id: schema.products.id, images: schema.products.images })
          .from(schema.products)
          .where(inArray(schema.products.id, productIds))
      : Promise.resolve([]),
  ]);

  const thumbnailByProduct = new Map(productRows.map((product) => [product.id, product.images[0] ?? null]));
  const buyerPageUrl = `${env().APP_URL}/order/${order.accessToken}`;
  const showDeliverables = order.status === "delivered" || order.status === "refunded";

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Order Details</h1>
          <p className="text-sm text-muted-foreground">View the details of this order.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/orders">
              <ArrowLeft className="size-4" />
              Back
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/order/${order.accessToken}`} target="_blank">
              <ExternalLink className="size-4" />
              View order page
            </Link>
          </Button>
        </div>
      </div>

      <Card className="py-5">
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <p className="text-sm text-muted-foreground">
                  Order <span className="font-mono font-medium text-foreground">#{order.orderNumber}</span>
                </p>
                <CopyButton value={buyerPageUrl} label="Copy buyer order link" />
              </div>
              <p className="text-3xl font-bold tracking-tight">
                {formatMoney(order.totalCents, order.currency)}
              </p>
            </div>
            <OrderActions orderId={order.id} status={order.status} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <Badge variant="outline" className="gap-1.5 font-normal">
              <Mail className="size-3" />
              {order.email}
            </Badge>
            {order.country ? (
              <Badge variant="outline" className="font-normal">
                {countryWithFlag(order.country)}
              </Badge>
            ) : null}
            {order.paymentProvider ? (
              <Badge variant="outline" className="font-normal">
                {paymentMethodLabel(order.paymentProvider)}
              </Badge>
            ) : null}
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {timeAgo(order.createdAt)}
            </Badge>
          </div>

          {order.status === "requires_review" && order.reviewReason ? (
            <div className="flex items-start gap-3 rounded-lg border border-orange-500/40 bg-orange-500/10 p-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-orange-500" />
              <p className="text-sm">{order.reviewReason}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card className="gap-3 py-4">
            <CardHeader className="pb-0">
              <CardTitle className={SECTION_TITLE_CLASS}>
                <ShoppingBag className="size-3.5" />
                Items
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {order.items.map((item) => {
                const thumbnail = item.productId ? (thumbnailByProduct.get(item.productId) ?? null) : null;
                return (
                  <div key={item.id} className="space-y-3">
                    <div className="flex items-center gap-3">
                      {thumbnail ? (
                        <Image
                          src={imageUrl(thumbnail)}
                          alt=""
                          width={THUMB_SIZE_PX}
                          height={THUMB_SIZE_PX}
                          className="size-11 shrink-0 rounded-md border object-cover"
                        />
                      ) : (
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-md border bg-muted">
                          <Package className="size-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold">{item.productName}</p>
                          <OrderStatusBadge status={order.status} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {item.variantName === "Default" ? "Standard" : item.variantName}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold">
                          {formatMoney(item.unitPriceCents * item.quantity, order.currency)}
                        </p>
                        <p className="text-xs text-muted-foreground">× {item.quantity}</p>
                      </div>
                    </div>

                    {showDeliverables && item.serials.length > 0 ? (
                      <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
                        {item.serials.join("\n")}
                      </pre>
                    ) : null}
                    {showDeliverables && item.files.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {item.files.map((deliverableFile) => (
                          <Badge key={deliverableFile.id} variant="secondary" className="gap-1.5 font-normal">
                            <FileDown className="size-3" />
                            {deliverableFile.fileName}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {order.discountCents > 0 ? (
                <>
                  <Separator />
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Discount{order.couponCode ? ` (${order.couponCode})` : ""}</span>
                    <span>-{formatMoney(order.discountCents, order.currency)}</span>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card className="gap-3 py-4">
            <CardHeader className="pb-0">
              <CardTitle className={SECTION_TITLE_CLASS}>
                <Receipt className="size-3.5" />
                Payment history
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {paymentRows.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No payment session was created for this order.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Updated at</TableHead>
                      <TableHead>External ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentRows.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {payment.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{formatMoney(payment.amountCents, payment.currency)}</p>
                          {order.totalCents > 0 ? (
                            <p className="text-xs text-muted-foreground">
                              {((payment.amountCents / order.totalCents) * 100).toFixed(2)}% of{" "}
                              {formatMoney(order.totalCents, order.currency)}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="capitalize">{payment.provider}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatTimestamp(payment.updatedAt)}
                        </TableCell>
                        <TableCell className="max-w-44 truncate font-mono text-xs text-muted-foreground">
                          {payment.externalId}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {eventRows.length > 0 ? (
                <div className="space-y-1 rounded-md border border-dashed p-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Webhook events
                  </p>
                  {eventRows.map((paymentEvent) => (
                    <p key={paymentEvent.id} className="flex justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">
                        {paymentEvent.provider} · {paymentEvent.eventType}
                      </span>
                      <span className="shrink-0">{formatTimestamp(paymentEvent.createdAt)}</span>
                    </p>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="gap-3 py-4">
            <CardHeader className="pb-0">
              <CardTitle className={SECTION_TITLE_CLASS}>
                <Receipt className="size-3.5" />
                Order summary
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border/60">
              <SummaryRow label="Subtotal">{formatMoney(order.subtotalCents, order.currency)}</SummaryRow>
              {order.discountCents > 0 ? (
                <SummaryRow label={`Discount${order.couponCode ? ` (${order.couponCode})` : ""}`}>
                  -{formatMoney(order.discountCents, order.currency)}
                </SummaryRow>
              ) : null}
              <SummaryRow label="Total price">
                <span className="font-semibold">{formatMoney(order.totalCents, order.currency)}</span>
              </SummaryRow>
              <SummaryRow label="Total paid">
                {order.paidAt !== null ? (
                  <span className="font-semibold text-green-500">
                    +{formatMoney(order.totalCents, order.currency)}
                  </span>
                ) : (
                  "—"
                )}
              </SummaryRow>
              <SummaryRow label="Payment method">
                {order.paymentProvider ? paymentMethodLabel(order.paymentProvider) : "—"}
              </SummaryRow>
              <SummaryRow label="Created at">{formatTimestamp(order.createdAt)}</SummaryRow>
              <SummaryRow label="Paid at">{formatTimestamp(order.paidAt)}</SummaryRow>
              <SummaryRow label="Completed at">{formatTimestamp(order.deliveredAt)}</SummaryRow>
            </CardContent>
          </Card>

          <Card className="gap-3 py-4">
            <CardHeader className="pb-0">
              <CardTitle className={SECTION_TITLE_CLASS}>
                <UserRound className="size-3.5" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="divide-y divide-border/60">
                <SummaryRow label="E-mail address">
                  <span className="break-all">{order.email}</span>
                </SummaryRow>
                <SummaryRow label="IP address">
                  <span className="font-mono text-xs">{order.ipAddress ?? "—"}</span>
                </SummaryRow>
                <SummaryRow label="Country">{countryWithFlag(order.country)}</SummaryRow>
                <SummaryRow label="Browser">
                  {order.userAgent ? parseBrowser(order.userAgent) : "—"}
                </SummaryRow>
                <SummaryRow label="Operating system">
                  {order.userAgent ? parseOs(order.userAgent) : "—"}
                </SummaryRow>
              </div>
              {order.userAgent ? (
                <p className="break-all rounded-md bg-muted p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {order.userAgent}
                </p>
              ) : null}
              <BlacklistQuickActions
                email={order.email}
                ipAddress={order.ipAddress}
                orderNumber={order.orderNumber}
              />
            </CardContent>
          </Card>

          <Card className="gap-3 py-4">
            <CardHeader className="pb-0">
              <CardTitle className={SECTION_TITLE_CLASS}>
                <ArrowRight className="size-3.5" />
                Related
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <Link
                href={`/admin/orders?q=${encodeURIComponent(order.email)}`}
                className="flex items-center justify-between rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent"
              >
                <span className="flex items-center gap-2">
                  <ShoppingBag className="size-4 text-muted-foreground" />
                  View customer&apos;s orders
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </Link>
              <Link
                href={`/order/${order.accessToken}`}
                target="_blank"
                className="flex items-center justify-between rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent"
              >
                <span className="flex items-center gap-2">
                  <ExternalLink className="size-4 text-muted-foreground" />
                  View buyer order page
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
