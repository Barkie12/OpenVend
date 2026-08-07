"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RefreshButton() {
  const router = useRouter();
  const [isRefreshing, startRefreshing] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => startRefreshing(() => router.refresh())}
      disabled={isRefreshing}
    >
      <RotateCw className={cn("size-4", isRefreshing && "animate-spin")} />
      Refresh
    </Button>
  );
}
