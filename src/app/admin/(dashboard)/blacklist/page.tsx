import { desc } from "drizzle-orm";

import { BlacklistManager } from "@/components/admin/blacklist/blacklist-manager";
import { getDb, schema } from "@/lib/db";

export default async function AdminBlacklistPage() {
  const rules = await getDb()
    .select()
    .from(schema.blacklistRules)
    .orderBy(desc(schema.blacklistRules.createdAt));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Blacklist</h1>
        <p className="text-sm text-muted-foreground">
          Blocked buyers are rejected at checkout before any order is created.
        </p>
      </div>
      <BlacklistManager
        rules={rules.map((rule) => ({
          id: rule.id,
          type: rule.type,
          value: rule.value,
          note: rule.note,
          createdAt: rule.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" }),
        }))}
      />
    </div>
  );
}
