import type { Metadata } from "next";
import Image from "next/image";

import { ProductCard } from "@/components/storefront/product-card";
import { imageUrl } from "@/lib/image-url";
import { listProductGroups, listProductsWithDetails, type ProductWithDetails } from "@/lib/products";
import { getShop, requireShop } from "@/lib/shop";

const GROUP_IMAGE_SIZE_PX = 32;

export async function generateMetadata(): Promise<Metadata> {
  const shop = await getShop();
  return {
    title: shop ? shop.name : "Shop",
    description: shop?.description ?? undefined,
  };
}

interface StorefrontSection {
  key: string;
  title: string | null;
  imagePath: string | null;
  badgeText: string | null;
  badgeColor: string | null;
  products: ProductWithDetails[];
}

interface SectionGroup {
  id: string;
  name: string;
  imagePath: string | null;
  /** Groups only use public/hidden, but the column shares the product visibility enum. */
  visibility: "public" | "unlisted" | "hidden";
  badgeText: string | null;
  badgeColor: string | null;
}

function buildSections(products: ProductWithDetails[], groups: SectionGroup[]): StorefrontSection[] {
  const sections: StorefrontSection[] = [];
  for (const group of groups) {
    if (group.visibility !== "public") {
      continue;
    }
    const groupProducts = products.filter((product) => product.groupId === group.id);
    if (groupProducts.length > 0) {
      sections.push({
        key: group.id,
        title: group.name,
        imagePath: group.imagePath,
        badgeText: group.badgeText,
        badgeColor: group.badgeColor,
        products: groupProducts,
      });
    }
  }
  const groupedIds = new Set(sections.flatMap((section) => section.products.map((product) => product.id)));
  const ungrouped = products.filter((product) => !groupedIds.has(product.id));
  if (ungrouped.length > 0) {
    sections.push({
      key: "ungrouped",
      title: sections.length > 0 ? "More" : null,
      imagePath: null,
      badgeText: null,
      badgeColor: null,
      products: ungrouped,
    });
  }
  return sections;
}

export default async function StorefrontHomePage() {
  const shop = await requireShop();
  const [products, groups] = await Promise.all([
    listProductsWithDetails({ publicOnly: true }),
    listProductGroups(),
  ]);
  const sections = buildSections(products, groups);

  return (
    <div className="space-y-10">
      <section className="space-y-2 py-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight">{shop.name}</h1>
        {shop.description ? (
          <p className="mx-auto max-w-xl text-muted-foreground">{shop.description}</p>
        ) : null}
      </section>

      {sections.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">No products available yet — check back soon.</p>
      ) : (
        sections.map((section) => (
          <section key={section.key} className="space-y-4">
            {section.title ? (
              <div className="flex items-center gap-2.5">
                {section.imagePath ? (
                  <Image
                    src={imageUrl(section.imagePath)}
                    alt=""
                    width={GROUP_IMAGE_SIZE_PX}
                    height={GROUP_IMAGE_SIZE_PX}
                    className="size-8 rounded-md border object-cover"
                  />
                ) : null}
                <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
                {section.badgeText ? (
                  <span
                    className="inline-flex rounded-md border border-primary/40 px-2 py-0.5 text-xs font-medium text-primary"
                    style={
                      section.badgeColor
                        ? { color: section.badgeColor, borderColor: `${section.badgeColor}66` }
                        : undefined
                    }
                  >
                    {section.badgeText}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.products.map((product) => (
                <ProductCard key={product.id} product={product} currency={shop.currency} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
