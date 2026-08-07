import { and, desc } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { buildOrderConditions, isOrderStatusFilter } from "@/lib/order-filters";
import { getAdminSession } from "@/lib/session";

const EXPORT_LIMIT = 5000;

function csvField(value: string | number | null): string {
  if (value === null) {
    return "";
  }
  let stringValue = String(value);
  // Neutralize spreadsheet formula injection: buyer-controlled values (e-mail,
  // product names) must never execute when the export is opened in Excel.
  if (/^[=+\-@\t\r]/.test(stringValue)) {
    stringValue = `'${stringValue}`;
  }
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
}

/** Streams the filtered order list as CSV for spreadsheets and bookkeeping. */
export async function GET(request: Request): Promise<Response> {
  const adminSession = await getAdminSession();
  if (!adminSession) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestUrl = new URL(request.url);
  const statusParam = requestUrl.searchParams.get("status") ?? "all";
  const statusFilter = isOrderStatusFilter(statusParam) ? statusParam : "all";
  const search = requestUrl.searchParams.get("q") ?? "";

  const conditions = buildOrderConditions(statusFilter, search);
  const orderRows = await getDb().query.orders.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: { items: true },
    orderBy: [desc(schema.orders.createdAt)],
    limit: EXPORT_LIMIT,
  });

  const header = [
    "order_number",
    "status",
    "email",
    "products",
    "subtotal",
    "discount",
    "total",
    "currency",
    "coupon",
    "payment_provider",
    "country",
    "created_at",
    "paid_at",
    "delivered_at",
  ].join(",");

  const lines = orderRows.map((order) =>
    [
      csvField(order.orderNumber),
      csvField(order.status),
      csvField(order.email),
      csvField(
        order.items
          .map((item) => `${item.quantity}x ${item.productName}${item.variantName === "Default" ? "" : ` (${item.variantName})`}`)
          .join("; "),
      ),
      csvField((order.subtotalCents / 100).toFixed(2)),
      csvField((order.discountCents / 100).toFixed(2)),
      csvField((order.totalCents / 100).toFixed(2)),
      csvField(order.currency),
      csvField(order.couponCode),
      csvField(order.paymentProvider),
      csvField(order.country),
      csvField(order.createdAt.toISOString()),
      csvField(order.paidAt?.toISOString() ?? null),
      csvField(order.deliveredAt?.toISOString() ?? null),
    ].join(","),
  );

  const csvContent = [header, ...lines].join("\r\n");
  const exportDate = new Date().toISOString().slice(0, 10);

  return new Response(csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${exportDate}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
