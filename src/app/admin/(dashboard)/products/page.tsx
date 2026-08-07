import { and, count, eq, isNotNull } from "drizzle-orm";
import { Package, Plus, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { CatalogTabs } from "@/components/admin/products/catalog-tabs";
import { ProductRowActions } from "@/components/admin/products/product-row-actions";
import { Badge } from "@/components/ui/badge";
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
import { imageUrl } from "@/lib/image-url";
import { formatMoney } from "@/lib/money";
import { listProductsWithDetails, type ProductWithDetails } from "@/lib/products";
import { requireShop } from "@/lib/shop";

const THUMB_SIZE_PX = 40;

function priceRange(product: ProductWithDetails, currency: string): string {
  const prices = product.variants.map((variant) => variant.priceCents);
  if (prices.length === 0) {
    return "—";
  }
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  return minPrice === maxPrice
    ? formatMoney(minPrice, currency)
    : `${formatMoney(minPrice, currency)} – ${formatMoney(maxPrice, currency)}`;
}

function stockSummary(product: ProductWithDetails): string {
  if (product.deliveryType !== "serials") {
    return "∞";
  }
  return String(product.variants.reduce((sum, variant) => sum + variant.availableStock, 0));
}

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  const resolvedSearchParams = await searchParams;
  const search = typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : "";

  const [shop, products, salesRows] = await Promise.all([
    requireShop(),
    listProductsWithDetails({ search }),
    getDb()
      .select({ productId: schema.orderItems.productId, sales: count() })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
      .where(and(eq(schema.orders.status, "delivered"), isNotNull(schema.orderItems.productId)))
      .groupBy(schema.orderItems.productId),
  ]);

  const salesByProduct = new Map(salesRows.map((row) => [row.productId, row.sales]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Products</h1>
        <div className="flex flex-wrap items-center gap-2">
          <form action="/admin/products" className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              name="q"
              defaultValue={search}
              placeholder="Search by name…"
              className="w-56 pl-8"
            />
          </form>
          <Button asChild>
            <Link href="/admin/products/new">
              <Plus className="size-4" />
              New product
            </Link>
          </Button>
        </div>
      </div>

      <CatalogTabs active="products" />

      {products.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <Package className="size-8 text-muted-foreground" />
          <p className="text-muted-foreground">
            {search ? `No products match “${search}”.` : "No products yet. Create your first one."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead>Sales</TableHead>
                <TableHead className="w-40 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => {
                const thumbnail = product.images[0];
                return (
                  <TableRow key={product.id}>
                    <TableCell>
                      {thumbnail ? (
                        <Image
                          src={imageUrl(thumbnail)}
                          alt=""
                          width={THUMB_SIZE_PX}
                          height={THUMB_SIZE_PX}
                          className="size-10 rounded-md border object-cover"
                        />
                      ) : (
                        <div className="flex size-10 items-center justify-center rounded-md border bg-muted">
                          <Package className="size-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/products/${product.id}`} className="font-medium hover:underline">
                        {product.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">/{product.slug}</p>
                    </TableCell>
                    <TableCell>{priceRange(product, shop.currency)}</TableCell>
                    <TableCell className="font-mono">{stockSummary(product)}</TableCell>
                    <TableCell className="text-muted-foreground">{product.group?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={product.visibility === "public" ? "default" : "outline"}>
                        {product.visibility}
                      </Badge>
                    </TableCell>
                    <TableCell>{salesByProduct.get(product.id) ?? 0}</TableCell>
                    <TableCell>
                      <ProductRowActions
                        productId={product.id}
                        productName={product.name}
                        slug={product.slug}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
