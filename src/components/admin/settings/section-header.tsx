import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  icon: LucideIcon;
  iconClass: string;
  title: string;
  description: string;
  badge?: ReactNode;
}

/** Consistent settings card header: colored icon chip, title, description, optional status badge. */
export function SectionHeader({ icon: Icon, iconClass, title, description, badge }: SectionHeaderProps) {
  return (
    <CardHeader>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg border",
              iconClass,
            )}
          >
            <Icon className="size-4" />
          </span>
          <div className="space-y-1">
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
        {badge}
      </div>
    </CardHeader>
  );
}
