import { and, desc, eq, inArray } from "drizzle-orm";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileDown,
  Hourglass,
  Package,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  Wallet,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { CopyButton } from "@/components/storefront/copy-button";
import { OrderAutoRefresh } from "@/components/storefront/order-auto-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getDb, schema } from "@/lib/db";
import { imageUrl } from "@/lib/image-url";
import { formatMoney } from "@/lib/money";
import { getOrderByAccessToken, type OrderWithDeliverables } from "@/lib/orders";
import { coinInfo, coinTicker } from "@/lib/payments/crypto-coins";
import { getShop } from "@/lib/shop";
import { paymentMethodLabel } from "@/lib/stats";
import { cn } from "@/lib/utils";

const THUMB_SIZE_PX = 44;
const CHECKOUT_STEPS = ["Order Information", "Confirm & Pay", "Receive Your Items"] as const;
const MS_PER_MINUTE = 60_000;

const CRYPTO_STATUS_LABELS: Record<string, string> = {
  created: "Waiting for your payment…",
  waiting: "Waiting for your payment…",
  confirming: "Payment detected — waiting for confirmations…",
  confirmed: "Payment confirmed — finalizing…",
  sending: "Processing payment…",
  partially_paid: "Partial payment received",
};

/** Whole minutes until an ISO timestamp, or null when absent, invalid, or past. */
function minutesUntil(isoTimestamp: string | null): number | null {
  if (isoTimestamp === null) {
    return null;
  }
  const remainingMs = new Date(isoTimestamp).getTime() - Date.now();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return null;
  }
  return Math.max(1, Math.round(remainingMs / MS_PER_MINUTE));
}

export async function generateMetadata({ params }: PageProps<"/order/[token]">): Promise<Metadata> {
  const { token } = await params;
  const order = await getOrderByAccessToken(token);
  return { title: order ? `Order #${order.orderNumber}` : "Order", robots: { index: false } };
}

interface StatusHero {
  icon: LucideIcon;
  iconClass: string;
  heading: string;
  body: string;
  /** Index into CHECKOUT_STEPS; null hides the stepper (broken flows). */
  stepIndex: number | null;
}

function statusHero(order: OrderWithDeliverables): StatusHero {
  switch (order.status) {
    case "pending":
      return {
        icon: Clock,
        iconClass: "bg-amber-500/10 text-amber-500",
        heading: "Waiting for payment",
        body: "This page updates automatically once your payment is confirmed. Crypto payments can take a few minutes.",
        stepIndex: 1,
      };
    case "paid":
      return {
        icon: Clock,
        iconClass: "bg-amber-500/10 text-amber-500",
        heading: "Payment confirmed — preparing delivery",
        body: "Hold on a few seconds, your items are being assigned.",
        stepIndex: 1,
      };
    case "delivered":
      return {
        icon: CheckCircle2,
        iconClass: "bg-green-500/10 text-green-500",
        heading: "Payment confirmed — here are your items",
        body: "A copy has also been emailed to you. Keep this link private — it is your receipt and delivery page.",
        stepIndex: 2,
      };
    case "requires_review":
      return {
        icon: ShieldAlert,
        iconClass: "bg-orange-500/10 text-orange-500",
        heading: "Payment received — pending review",
        body: order.reviewReason ?? "The seller will review your payment and complete the delivery shortly.",
        stepIndex: 1,
      };
    case "refunded":
      return {
        icon: XCircle,
        iconClass: "bg-purple-500/10 text-purple-400",
        heading: "This order was refunded",
        body: "The payment has been returned. Delivered items below remain for your reference.",
        stepIndex: 2,
      };
    case "cancelled":
    case "expired":
      return {
        icon: XCircle,
        iconClass: "bg-muted text-muted-foreground",
        heading: order.status === "expired" ? "This order expired" : "This order was cancelled",
        body: "No payment was captured. You can place a new order at any time.",
        stepIndex: null,
      };
  }
}

export default async function OrderPage({ params }: PageProps<"/order/[token]">) {
  const { token } = await params;
  const order = await getOrderByAccessToken(token);
  if (!order) {
    notFound();
  }

  const productIds = order.items
    .map((item) => item.productId)
    .filter((productId): productId is string => productId !== null);
  const productRows =
    productIds.length > 0
      ? await getDb()
          .select({ id: schema.products.id, images: schema.products.images, slug: schema.products.slug })
          .from(schema.products)
          .where(inArray(schema.products.id, productIds))
      : [];
  const productById = new Map(productRows.map((product) => [product.id, product]));

  const hero = statusHero(order);
  const HeroIcon = hero.icon;
  const isAwaitingConfirmation = order.status === "pending" || order.status === "paid";
  const showDeliverables = order.status === "delivered" || order.status === "refunded";

  // On-site crypto payment: show the deposit address while the order is pending.
  const cryptoPayment =
    order.status === "pending" && order.paymentProvider === "nowpayments"
      ? await getDb().query.payments.findFirst({
          where: and(
            eq(schema.payments.orderId, order.id),
            eq(schema.payments.provider, "nowpayments"),
          ),
          orderBy: [desc(schema.payments.createdAt)],
        })
      : undefined;
  const cryptoInstructions = cryptoPayment?.providerData ?? null;
  const qrSvg = cryptoInstructions
    ? await QRCode.toString(cryptoInstructions.payAddress, {
        type: "svg",
        margin: 0,
        color: { dark: "#111111", light: "#ffffff" },
      })
    : null;
  // Manual PayPal F&F: show where to send the money while the order is pending.
  const paypalEmail =
    order.status === "pending" && order.paymentProvider === "paypalff"
      ? ((await getShop())?.paypalEmail ?? null)
      : null;

  const quoteMinutesLeft = minutesUntil(cryptoInstructions?.expiresAt ?? null);
  const cryptoNetwork =
    cryptoInstructions === null
      ? null
      : (coinInfo(cryptoInstructions.payCurrency).network ??
        (cryptoInstructions.network ? cryptoInstructions.network.toUpperCase() : null));

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      {isAwaitingConfirmation ? (
        <OrderAutoRefresh
          syncToken={order.paymentProvider === "nowpayments" ? order.accessToken : undefined}
        />
      ) : null}

      {hero.stepIndex !== null ? (
        <div className="flex items-center justify-center gap-0 border-b">
          {CHECKOUT_STEPS.map((step, index) => (
            <span
              key={step}
              className={cn(
                "-mb-px border-b-2 px-3 py-2.5 text-xs font-medium sm:text-sm",
                index === hero.stepIndex
                  ? "border-foreground text-foreground"
                  : index < (hero.stepIndex ?? 0)
                    ? "border-transparent text-foreground/70"
                    : "border-transparent text-muted-foreground",
              )}
            >
              {step}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <span className={cn("flex size-14 items-center justify-center rounded-full", hero.iconClass)}>
          <HeroIcon className={cn("size-7", isAwaitingConfirmation && "animate-pulse")} />
        </span>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{hero.heading}</h1>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">{hero.body}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono">
            Order #{order.orderNumber}
          </Badge>
          <Badge variant="outline" className="capitalize">
            {order.status.replace("_", " ")}
          </Badge>
        </div>
      </div>

      {order.status === "requires_review" && order.reviewReason ? (
        <div className="flex items-start gap-3 rounded-lg border border-orange-500/40 bg-orange-500/10 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-orange-500" />
          <p className="text-sm">{order.reviewReason}</p>
        </div>
      ) : null}

      {paypalEmail ? (
        <Card className="gap-0 overflow-hidden py-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Wallet className="size-4" />
              Complete your payment
            </p>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
              </span>
              Waiting for the seller to confirm your payment
            </span>
          </div>
          <CardContent className="space-y-4 px-4 py-5">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Send exactly
              </p>
              <p className="font-mono text-lg font-semibold">
                {formatMoney(order.totalCents, order.currency)}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Via PayPal to
              </p>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                <code className="min-w-0 flex-1 break-all font-mono text-sm">{paypalEmail}</code>
                <CopyButton value={paypalEmail} label="Copy PayPal address" iconOnly />
              </div>
            </div>

            <div className="space-y-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs">
              <p className="flex items-center gap-1.5 font-medium">
                <TriangleAlert className="size-3.5 shrink-0 text-amber-500" />
                Follow these rules or the payment can&apos;t be accepted:
              </p>
              <ul className="ml-5 list-disc space-y-0.5 text-muted-foreground">
                <li>
                  Send as <span className="font-medium text-foreground">Friends &amp; Family</span>
                </li>
                <li>
                  <span className="font-medium text-foreground">Do not</span> add a note or message
                </li>
                <li>
                  Send the exact amount in{" "}
                  <span className="font-medium text-foreground">{order.currency.toUpperCase()}</span>
                </li>
              </ul>
            </div>

            <p className="text-xs text-muted-foreground">
              After you&apos;ve sent it, keep this page open — the seller confirms transfers manually
              and your items appear here the moment that happens.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {cryptoPayment && cryptoInstructions ? (
        <Card className="gap-0 overflow-hidden py-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Wallet className="size-4" />
              Complete your payment
            </p>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
              </span>
              {CRYPTO_STATUS_LABELS[cryptoPayment.status] ?? cryptoPayment.status.replace("_", " ")}
            </span>
          </div>
          <CardContent className="grid gap-5 px-4 py-5 sm:grid-cols-[auto_1fr]">
            <div className="mx-auto self-start">
              <div
                className="rounded-xl bg-white p-2.5 [&_svg]:block [&_svg]:size-40"
                dangerouslySetInnerHTML={{ __html: qrSvg ?? "" }}
              />
            </div>
            <div className="min-w-0 space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Send exactly
                </p>
                <div className="flex items-center gap-2">
                  <p className="break-all font-mono text-lg font-semibold">
                    {cryptoInstructions.payAmount}{" "}
                    <span className="text-muted-foreground">
                      {coinTicker(cryptoInstructions.payCurrency)}
                    </span>
                  </p>
                  <CopyButton value={cryptoInstructions.payAmount} label="Copy amount" iconOnly />
                </div>
                {cryptoNetwork ? (
                  <Badge variant="outline" className="text-xs">
                    {coinInfo(cryptoInstructions.payCurrency).label} · {cryptoNetwork} network
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    {coinInfo(cryptoInstructions.payCurrency).label}
                  </Badge>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  To this address
                </p>
                <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                  <code className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed">
                    {cryptoInstructions.payAddress}
                  </code>
                  <CopyButton value={cryptoInstructions.payAddress} label="Copy address" iconOnly />
                </div>
              </div>

              {cryptoInstructions.payinExtraId ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="font-medium">
                      Include this memo / tag:{" "}
                      <code className="font-mono">{cryptoInstructions.payinExtraId}</code>
                    </p>
                    <p className="text-muted-foreground">
                      Payments without it can&apos;t be matched to your order.
                    </p>
                  </div>
                  <CopyButton value={cryptoInstructions.payinExtraId} label="Copy memo" iconOnly />
                </div>
              ) : null}

              <div className="space-y-1 text-xs text-muted-foreground">
                {quoteMinutesLeft !== null ? (
                  <p className="flex items-center gap-1.5">
                    <Hourglass className="size-3.5" />
                    Send within ~{quoteMinutesLeft} min — after that the quoted amount may change.
                  </p>
                ) : null}
                <p>
                  Send a single transaction with the exact amount. This page updates automatically
                  once your payment is detected.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showDeliverables
        ? order.items.map((item) => {
            const product = item.productId ? productById.get(item.productId) : undefined;
            const thumbnail = product?.images[0] ?? null;
            return (
              <Card key={`deliverable-${item.id}`} className="py-4">
                <CardContent className="space-y-4">
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
                      <p className="truncate font-semibold">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.variantName === "Default" ? "Standard" : item.variantName}
                        {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                      </p>
                    </div>
                    {item.serials.length > 0 ? (
                      <CopyButton value={item.serials.join("\n")} label="Copy all items" />
                    ) : null}
                  </div>

                  {item.serials.length > 0 ? (
                    <div className="divide-y divide-border/50 rounded-lg border bg-muted/40">
                      {item.serials.map((serial) => (
                        <div key={serial} className="flex items-center justify-between gap-2 px-3 py-2">
                          <code className="min-w-0 flex-1 truncate font-mono text-sm">{serial}</code>
                          <CopyButton value={serial} label={`Copy ${serial}`} iconOnly />
                        </div>
                      ))}
                    </div>
                  ) : item.deliveryType === "serials" ? (
                    <p className="text-sm text-muted-foreground">No items assigned — contact the seller.</p>
                  ) : null}

                  {item.files.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {item.files.map((deliverableFile) => (
                        <Button key={deliverableFile.id} asChild variant="outline" size="sm">
                          <Link href={`/api/order-files/${order.accessToken}/${deliverableFile.id}`}>
                            <FileDown className="size-4" />
                            {deliverableFile.fileName}
                          </Link>
                        </Button>
                      ))}
                    </div>
                  ) : item.deliveryType === "file" ? (
                    <p className="text-sm text-muted-foreground">
                      The download is not available anymore — contact the seller.
                    </p>
                  ) : null}

                  {item.deliveryType === "service" && !item.serviceInstructions ? (
                    <p className="text-sm text-muted-foreground">The seller will contact you shortly.</p>
                  ) : null}

                  {item.serviceInstructions ? (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        <Sparkles className="size-3.5" />
                        Instructions
                      </p>
                      <p className="whitespace-pre-line text-sm">{item.serviceInstructions}</p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })
        : null}

      <Card className="py-4">
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Summary</p>
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between">
              <span>
                {item.quantity}× {item.productName}
                {item.variantName === "Default" ? "" : ` (${item.variantName})`}
              </span>
              <span>{formatMoney(item.unitPriceCents * item.quantity, order.currency)}</span>
            </div>
          ))}
          {order.discountCents > 0 ? (
            <div className="flex items-center justify-between text-green-500">
              <span>Discount{order.couponCode ? ` (${order.couponCode})` : ""}</span>
              <span>-{formatMoney(order.discountCents, order.currency)}</span>
            </div>
          ) : null}
          <Separator />
          <div className="flex items-center justify-between text-base font-semibold">
            <span>Total</span>
            <span>{formatMoney(order.totalCents, order.currency)}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1 pt-1 text-xs text-muted-foreground">
            <span>{order.email}</span>
            <span>
              {order.paymentProvider ? `${paymentMethodLabel(order.paymentProvider)} · ` : ""}
              {order.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col items-center gap-3 pb-6">
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Continue shopping
          </Link>
        </Button>
        {showDeliverables ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Zap className="size-3.5" />
            Delivered instantly · Keep this link private
          </p>
        ) : null}
      </div>
    </div>
  );
}
