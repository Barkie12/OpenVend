import { count, isNotNull } from "drizzle-orm";
import { LayoutGrid, Plus, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { CatalogTabs } from "@/components/admin/products/catalog-tabs";
import { GroupRowActions } from "@/components/admin/products/group-row-actions";
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
import { listProductGroups } from "@/lib/products";

const THUMB_SIZE_PX = 40;

export default async function AdminGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const searchQuery = q?.trim().toLowerCase() ?? "";

  const [allGroups, memberCountRows] = await Promise.all([
    listProductGroups(),
    getDb()
      .select({ groupId: schema.products.groupId, memberCount: count() })
      .from(schema.products)
      .where(isNotNull(schema.products.groupId))
      .groupBy(schema.products.groupId),
  ]);
  const memberCountByGroup = new Map(memberCountRows.map((row) => [row.groupId, row.memberCount]));
  const groups =
    searchQuery.length > 0
      ? allGroups.filter((group) => group.name.toLowerCase().includes(searchQuery))
      : allGroups;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Groups</h1>
          <p className="text-sm text-muted-foreground">Manage your product groups.</p>
        </div>
        <Button asChild>
          <Link href="/admin/products/groups/new">
            <Plus className="size-4" />
            Create Group
          </Link>
        </Button>
      </div>

      <CatalogTabs active="groups" />

      <div className="rounded-xl border bg-card/60 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
          What are groups?
        </p>
        <h2 className="mt-1 text-lg font-semibold">Present products as curated sections</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Groups bundle related products under a shared storefront section — like one section per
          game or category. Give a group an image and an optional badge to make it stand out, or
          hide it to fold its products back into the general listing.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <span className="text-sm font-medium">
            {groups.length} group{groups.length === 1 ? "" : "s"}
          </span>
          <form className="relative" action="/admin/products/groups">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={searchQuery}
              placeholder="Search by name…"
              className="h-8 w-56 pl-8"
            />
          </form>
        </div>

        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <LayoutGrid className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {searchQuery.length > 0 ? `No groups match "${searchQuery}".` : "No groups yet."}
            </p>
            {searchQuery.length === 0 ? (
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link href="/admin/products/groups/new">Create your first group</Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-16 pl-4">Image</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead>Badge</TableHead>
                <TableHead>Products</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell className="pl-4">
                    {group.imagePath ? (
                      <Image
                        src={imageUrl(group.imagePath)}
                        alt=""
                        width={THUMB_SIZE_PX}
                        height={THUMB_SIZE_PX}
                        className="size-10 rounded-md border object-cover"
                      />
                    ) : (
                      <div className="flex size-10 items-center justify-center rounded-md border bg-muted">
                        <LayoutGrid className="size-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/products/groups/${group.id}`}
                      className="font-medium hover:underline"
                    >
                      {group.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        group.visibility === "public"
                          ? "inline-flex rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400"
                          : "inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                      }
                    >
                      {group.visibility === "public" ? "Public" : "Hidden"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {group.badgeText ? (
                      <Badge
                        variant="outline"
                        style={
                          group.badgeColor
                            ? { color: group.badgeColor, borderColor: `${group.badgeColor}66` }
                            : undefined
                        }
                      >
                        {group.badgeText}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {memberCountByGroup.get(group.id) ?? 0}
                  </TableCell>
                  <TableCell className="pr-2">
                    <GroupRowActions groupId={group.id} groupName={group.name} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
