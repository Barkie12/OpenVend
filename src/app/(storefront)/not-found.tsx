import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function StorefrontNotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <h2 className="text-2xl font-semibold">Page not found</h2>
      <p className="text-muted-foreground">This product or page does not exist (anymore).</p>
      <Button asChild variant="outline">
        <Link href="/">Back to the shop</Link>
      </Button>
    </div>
  );
}
