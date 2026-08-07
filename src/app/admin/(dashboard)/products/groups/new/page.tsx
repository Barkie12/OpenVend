import { asc } from "drizzle-orm";

import { GroupEditor } from "@/components/admin/products/group-editor";
import { getDb, schema } from "@/lib/db";

export default async function NewGroupPage() {
  const products = await getDb()
    .select({ id: schema.products.id, name: schema.products.name })
    .from(schema.products)
    .orderBy(asc(schema.products.name));

  return (
    <GroupEditor
      mode="create"
      groupId={null}
      products={products}
      initial={{
        name: "",
        imagePath: null,
        visibility: "public",
        badgeText: "",
        badgeColor: "",
        productIds: [],
      }}
    />
  );
}
