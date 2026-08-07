import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BreakdownEntry } from "@/lib/analytics";

interface BreakdownCardProps {
  title: string;
  icon: LucideIcon;
  entries: BreakdownEntry[];
  /** Optional custom renderer for the entry label (e.g. country flags). */
  renderLabel?: (label: string) => ReactNode;
  emptyState?: ReactNode;
}

export function BreakdownCard({ title, icon: Icon, entries, renderLabel, emptyState }: BreakdownCardProps) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Icon className="size-3.5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          (emptyState ?? (
            <p className="py-8 text-center text-sm text-muted-foreground">No data for this period.</p>
          ))
        ) : (
          <ul className="space-y-1">
            {entries.map((entry) => (
              <li
                key={entry.label}
                className="relative flex items-center justify-between gap-2 overflow-hidden rounded-md px-2 py-1.5"
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-md bg-primary/10"
                  style={{ width: `${Math.max(2, entry.sharePercent)}%` }}
                />
                <span className="relative min-w-0 truncate text-sm">
                  {renderLabel ? renderLabel(entry.label) : entry.label}
                </span>
                <span className="relative flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">{entry.hits}</span>
                  <Badge variant="secondary" className="min-w-14 justify-center font-mono text-[11px]">
                    {entry.sharePercent.toFixed(1)}%
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
