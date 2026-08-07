"use client";

import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 5000;

/** Polls the live visitor count (distinct sessions in the last 5 minutes). */
export function LiveVisitors({ initialCount }: { initialCount: number }) {
  const [visitorCount, setVisitorCount] = useState(initialCount);

  useEffect(() => {
    const pollTimer = setInterval(() => {
      fetch("/api/admin/live-visitors")
        .then(async (response) => {
          if (!response.ok) {
            return;
          }
          const payload: unknown = await response.json();
          if (
            typeof payload === "object" &&
            payload !== null &&
            "count" in payload &&
            typeof payload.count === "number"
          ) {
            setVisitorCount(payload.count);
          }
        })
        .catch(() => {
          // Transient polling failures are fine; the next tick retries.
        });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(pollTimer);
  }, []);

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-green-500" />
        </span>
        <p className="text-sm">
          <span className="font-semibold">{visitorCount}</span> visitor
          {visitorCount === 1 ? "" : "s"} browsing your store right now
        </p>
      </div>
      <p className="text-xs text-muted-foreground">updates every 5s</p>
    </div>
  );
}
