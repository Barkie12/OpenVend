import Link from "next/link";

import { cn } from "@/lib/utils";

const CATALOG_TABS = [
  { key: "products", label: "Products", href: "/admin/products" },
  { key: "groups", label: "Groups", href: "/admin/products/groups" },
] as const;

export type CatalogTabKey = (typeof CATALOG_TABS)[number]["key"];

/** Sub-navigation shared by the catalog pages (products, groups). */
export function CatalogTabs({ active }: { active: CatalogTabKey }) {
  return (
    <div className="flex items-center border-b">
      {CATALOG_TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab.key === active
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
