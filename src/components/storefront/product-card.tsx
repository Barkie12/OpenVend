import { Package } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { productAvailableTotal, type ProductWithDetails } from "@/lib/products";
import { imageUrl } from "@/lib/image-url";

const CARD_IMAGE_WIDTH = 640;
const CARD_IMAGE_HEIGHT = 360;

interface ProductCardProps {
  product: ProductWithDetails;
  currency: string;
}

interface PriceLabel {
  label: string;
  compareAt: string | null;
}

function priceLabel(product: ProductWithDetails, currency: string): PriceLabel {
  const sortedVariants = [...product.variants].sort((a, b) => a.priceCents - b.priceCents);
  const cheapestVariant = sortedVariants[0];
  if (!cheapestVariant) {
    return { label: "—", compareAt: null };
  }
  const highestPrice = sortedVariants[sortedVariants.length - 1]?.priceCents ?? cheapestVariant.priceCents;
  const label =
    cheapestVariant.priceCents === highestPrice
      ? formatMoney(cheapestVariant.priceCents, currency)
      : `From ${formatMoney(cheapestVariant.priceCents, currency)}`;
  const compareAt =
    cheapestVariant.compareAtPriceCents === null
      ? null
      : formatMoney(cheapestVariant.compareAtPriceCents, currency);
  return { label, compareAt };
}

export function ProductCard({ product, currency }: ProductCardProps) {
  const availableTotal = productAvailableTotal(product);
  const isOutOfStock = availableTotal !== null && availableTotal <= 0;
  const thumbnail = product.images[0];
  const price = priceLabel(product, currency);

  return (
    <Link href={`/p/${product.slug}`} className="group">
      <Card className="overflow-hidden py-0 transition-colors hover:border-primary/50">
        <div className="relative aspect-video bg-muted">
          {thumbnail ? (
            <Image
              src={imageUrl(thumbnail)}
              alt={product.name}
              width={CARD_IMAGE_WIDTH}
              height={CARD_IMAGE_HEIGHT}
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <Package className="size-10 text-muted-foreground" />
            </div>
          )}
          <div className="absolute right-2 top-2">
            {isOutOfStock ? (
              <Badge variant="destructive">Out of stock</Badge>
            ) : (
              <Badge variant="secondary">
                {availableTotal === null ? "In stock" : `${availableTotal} in stock`}
              </Badge>
            )}
          </div>
        </div>
        <CardContent className="space-y-1 p-4">
          <h3 className="font-medium leading-tight group-hover:text-primary">{product.name}</h3>
          <p className="text-sm text-muted-foreground">
            {price.compareAt ? <span className="mr-1.5 line-through opacity-60">{price.compareAt}</span> : null}
            {price.label}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
