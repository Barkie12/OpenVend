import Link from "next/link";

import { DASHBOARD_RANGES, DASHBOARD_RANGE_LABELS, type DashboardRange } from "@/lib/stats";
import { cn } from "@/lib/utils";

interface RangeSelectorProps {
  activeRange: DashboardRange;
  activeTab: "revenue" | "traffic";
}

function dashboardHref(tab: "revenue" | "traffic", range: DashboardRange): string {
  const params = new URLSearchParams();
  if (tab !== "revenue") {
    params.set("tab", tab);
  }
  if (range !== "7d") {
    params.set("range", range);
  }
  const queryString = params.toString();
  return queryString.length > 0 ? `/admin?${queryString}` : "/admin";
}

export function RangeSelector({ activeRange, activeTab }: RangeSelectorProps) {
  return (
    <div className="flex items-center rounded-md border bg-card p-0.5">
      {DASHBOARD_RANGES.map((range) => (
        <Link
          key={range}
          href={dashboardHref(activeTab, range)}
          className={cn(
            "rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors",
            range === activeRange
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {DASHBOARD_RANGE_LABELS[range]}
        </Link>
      ))}
    </div>
  );
}

export { dashboardHref };
