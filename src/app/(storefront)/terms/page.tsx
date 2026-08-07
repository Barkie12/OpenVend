import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Markdown } from "@/components/storefront/markdown";
import { getShop } from "@/lib/shop";

export async function generateMetadata(): Promise<Metadata> {
  const shop = await getShop();
  return { title: shop ? `Terms - ${shop.name}` : "Terms" };
}

export default async function TermsPage() {
  const shop = await getShop();
  if (!shop?.termsOfService) {
    notFound();
  }

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Terms of Service</h1>
      <Markdown content={shop.termsOfService} />
    </article>
  );
}
