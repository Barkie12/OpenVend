import { ArrowRight, Package, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { imageUrl } from "@/lib/image-url";
import { formatMoney } from "@/lib/money";
import type { LeaderboardEntry } from "@/lib/stats";

const THUMB_SIZE_PX = 32;

interface LeaderboardCardProps {
  title: string;
  icon: LucideIcon;
  entries: LeaderboardEntry[];
  currency: string;
  showImages: boolean;
  viewAllHref: string | null;
}

export function LeaderboardCard({
  title,
  icon: Icon,
  entries,
  currency,
  showImages,
  viewAllHref,
}: LeaderboardCardProps) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Icon className="size-3.5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {entries.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No data for this period.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry, index) => (
              <li key={`${entry.label}-${index}`} className="flex items-center gap-3">
                {showImages ? (
                  entry.imagePath ? (
                    <Image
                      src={imageUrl(entry.imagePath)}
                      alt=""
                      width={THUMB_SIZE_PX}
                      height={THUMB_SIZE_PX}
                      className="size-8 shrink-0 rounded-md border object-cover"
                    />
                  ) : (
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted">
                      <Package className="size-3.5 text-muted-foreground" />
                    </div>
                  )
                ) : (
                  <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{entry.label}</p>
                  {entry.sublabel ? (
                    <p className="truncate text-xs text-muted-foreground">{entry.sublabel}</p>
                  ) : null}
                </div>
                <span className="shrink-0 text-sm font-semibold">
                  {entry.valueCents !== null
                    ? formatMoney(entry.valueCents, currency)
                    : String(entry.valueCount ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {viewAllHref !== null ? (
        <CardFooter className="justify-center border-t pb-0 pt-3">
          <Link
            href={viewAllHref}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            View all
            <ArrowRight className="size-3" />
          </Link>
        </CardFooter>
      ) : null}
    </Card>
  );
}
