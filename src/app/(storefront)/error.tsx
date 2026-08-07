"use client";

import { Button } from "@/components/ui/button";

interface StorefrontErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function StorefrontError({ error, reset }: StorefrontErrorProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground">
        {error.digest ? `Error reference: ${error.digest}` : "Please try again."}
      </p>
      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </div>
  );
}
