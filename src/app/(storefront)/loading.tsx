import { Skeleton } from "@/components/ui/skeleton";

export default function StorefrontLoading() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton className="aspect-video w-full" />
      <Skeleton className="aspect-video w-full" />
      <Skeleton className="aspect-video w-full" />
    </div>
  );
}
