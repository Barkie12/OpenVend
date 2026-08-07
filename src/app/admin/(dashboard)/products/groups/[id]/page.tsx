import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { GroupEditor } from "@/components/admin/products/group-editor";
import { getDb, schema } from "@/lib/db";

export default async function EditGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [group, products] = await Promise.all([
    db.query.productGroups.findFirst({ where: eq(schema.productGroups.id, id) }),
    db
      .select({ id: schema.products.id, name: schema.products.name, groupId: schema.products.groupId })
      .from(schema.products)
      .orderBy(asc(schema.products.name)),
  ]);
  if (!group) {
    notFound();
  }

  return (
    <GroupEditor
      mode="edit"
      groupId={group.id}
      products={products.map(({ id: productId, name }) => ({ id: productId, name }))}
      initial={{
        name: group.name,
        imagePath: group.imagePath,
        visibility: group.visibility === "public" ? "public" : "hidden",
        badgeText: group.badgeText ?? "",
        badgeColor: group.badgeColor ?? "",
        productIds: products
          .filter((product) => product.groupId === group.id)
          .map((product) => product.id),
      }}
    />
  );
}
