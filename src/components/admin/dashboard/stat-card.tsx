import { MoveRight, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  changePercent: number | null;
}

export function StatCard({ label, value, icon: Icon, changePercent }: StatCardProps) {
  const isFlat = changePercent !== null && Math.abs(changePercent) < 0.005;
  const isUp = changePercent !== null && changePercent > 0 && !isFlat;
  const isDown = changePercent !== null && changePercent < 0 && !isFlat;
  const TrendIcon = isUp ? TrendingUp : isDown ? TrendingDown : MoveRight;

  return (
    <Card className="gap-2 py-4">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {changePercent === null ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MoveRight className="size-3" />
            no previous period
          </p>
        ) : (
          <p
            className={cn(
              "flex items-center gap-1 text-xs",
              isUp && "text-green-500",
              isDown && "text-red-500",
              isFlat && "text-muted-foreground",
            )}
          >
            <TrendIcon className="size-3" />
            {Math.abs(changePercent).toFixed(2)}% change
          </p>
        )}
      </CardContent>
    </Card>
  );
}
