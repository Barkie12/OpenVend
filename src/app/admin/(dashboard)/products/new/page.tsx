import { requireShop } from "@/lib/shop";

import { NewProductForm } from "./new-product-form";

export default async function NewProductPage() {
  const shop = await requireShop();

  return <NewProductForm currency={shop.currency} />;
}
