"use client";

import { Button } from "@/components/ui/button";

interface AdminErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminError({ error, reset }: AdminErrorProps) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-lg border border-destructive/40 p-6">
      <div>
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          {error.digest ? `Error reference: ${error.digest}` : "An unexpected error occurred."}
        </p>
      </div>
      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </div>
  );
}
