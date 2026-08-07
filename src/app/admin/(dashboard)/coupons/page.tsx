import { and, desc, eq, ilike, isNotNull, sql } from "drizzle-orm";
import { Pencil, Plus, Search, Ticket } from "lucide-react";
import Link from "next/link";

import { CouponRowActions } from "@/components/admin/coupons/coupon-row-actions";
import { Button } from "@/components/ui/button";
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
import { requireShop } from "@/lib/shop";
import { cn } from "@/lib/utils";

interface CouponStats {
  lastUsedAt: Date | null;
  savedCents: number;
  revenueCents: number;
}

type CouponRow = typeof schema.coupons.$inferSelect;

type CouponStatus = "active" | "scheduled" | "expired" | "used-up" | "disabled";

const STATUS_META: Record<CouponStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-500/15 text-emerald-400" },
  scheduled: { label: "Scheduled", className: "bg-amber-500/15 text-amber-400" },
  expired: { label: "Expired", className: "bg-red-500/15 text-red-400" },
  "used-up": { label: "Used up", className: "bg-red-500/15 text-red-400" },
  disabled: { label: "Disabled", className: "bg-muted text-muted-foreground" },
};

function couponStatus(coupon: CouponRow): CouponStatus {
  if (!coupon.active) {
    return "disabled";
  }
  if (coupon.expiresAt !== null && coupon.expiresAt.getTime() < Date.now()) {
    return "expired";
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return "used-up";
  }
  if (coupon.startsAt !== null && coupon.startsAt.getTime() > Date.now()) {
    return "scheduled";
  }
  return "active";
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function validityLabel(coupon: CouponRow): string {
  if (coupon.startsAt !== null && coupon.expiresAt !== null) {
    return `${formatShortDate(coupon.startsAt)} – ${formatShortDate(coupon.expiresAt)}`;
  }
  if (coupon.startsAt !== null) {
    return `From ${formatShortDate(coupon.startsAt)}`;
  }
  if (coupon.expiresAt !== null) {
    return `Until ${formatShortDate(coupon.expiresAt)}`;
  }
  return "No limit";
}

export default async function AdminCouponsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const searchQuery = q?.trim() ?? "";
  const shop = await requireShop();
  const db = getDb();

  const [coupons, statRows] = await Promise.all([
    db
      .select()
      .from(schema.coupons)
      .where(searchQuery.length > 0 ? ilike(schema.coupons.code, `%${searchQuery}%`) : undefined)
      .orderBy(desc(schema.coupons.createdAt)),
    db
      .select({
        couponId: schema.orders.couponId,
        lastUsedAt: sql<Date | null>`max(${schema.orders.paidAt})`,
        savedCents: sql<string>`coalesce(sum(${schema.orders.discountCents}), 0)`,
        revenueCents: sql<string>`coalesce(sum(${schema.orders.totalCents}), 0)`,
      })
      .from(schema.orders)
      .where(and(isNotNull(schema.orders.couponId), eq(schema.orders.status, "delivered")))
      .groupBy(schema.orders.couponId),
  ]);

  const statsByCouponId = new Map<string, CouponStats>(
    statRows
      .filter((row): row is typeof row & { couponId: string } => row.couponId !== null)
      .map((row) => [
        row.couponId,
        {
          lastUsedAt: row.lastUsedAt === null ? null : new Date(row.lastUsedAt),
          savedCents: Number(row.savedCents),
          revenueCents: Number(row.revenueCents),
        },
      ]),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Coupons</h1>
          <p className="text-sm text-muted-foreground">
            Discount codes with schedules, limits and per-product scoping.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/admin/coupons/new">
            <Plus className="size-4" />
            Create Coupon
          </Link>
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <span className="text-sm font-medium">
            {coupons.length} coupon{coupons.length === 1 ? "" : "s"}
          </span>
          <form className="relative" action="/admin/coupons">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={searchQuery}
              placeholder="Search by code…"
              className="h-8 w-56 pl-8"
            />
          </form>
        </div>

        {coupons.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Ticket className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {searchQuery.length > 0 ? `No coupons match "${searchQuery}".` : "No coupons yet."}
            </p>
            {searchQuery.length === 0 ? (
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link href="/admin/coupons/new">Create your first coupon</Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Status</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Uses</TableHead>
                <TableHead>Validity</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead className="text-right">Total saved</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons.map((coupon) => {
                const status = STATUS_META[couponStatus(coupon)];
                const stats = statsByCouponId.get(coupon.id);
                return (
                  <TableRow key={coupon.id}>
                    <TableCell className="pl-4">
                      <span
                        className={cn(
                          "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                          status.className,
                        )}
                      >
                        {status.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/coupons/${coupon.id}`}
                        className="font-mono text-sm font-semibold hover:underline"
                      >
                        {coupon.code}
                      </Link>
                      {coupon.productIds !== null ? (
                        <p className="text-xs text-muted-foreground">
                          {coupon.productIds.length} product{coupon.productIds.length === 1 ? "" : "s"}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-md bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-400">
                        {coupon.type === "percent"
                          ? `${coupon.value}%`
                          : formatMoney(coupon.value, shop.currency)}
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {coupon.usedCount}
                      <span className="text-muted-foreground"> / {coupon.maxUses ?? "∞"}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{validityLabel(coupon)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {stats?.lastUsedAt ? formatShortDate(stats.lastUsedAt) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {stats ? formatMoney(stats.savedCents, shop.currency) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {stats ? formatMoney(stats.revenueCents, shop.currency) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1 pr-2">
                        <Button asChild size="icon" variant="ghost" aria-label="Edit coupon">
                          <Link href={`/admin/coupons/${coupon.id}`}>
                            <Pencil className="size-4" />
                          </Link>
                        </Button>
                        <CouponRowActions couponId={coupon.id} active={coupon.active} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
