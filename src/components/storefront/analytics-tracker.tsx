"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const SESSION_STORAGE_KEY = "webshop-session";

function sessionId(): string {
  let storedId = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!storedId) {
    storedId = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, storedId);
  }
  return storedId;
}

/** Fires a first-party pageview beacon on every storefront navigation. */
export function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const payload = JSON.stringify({
      path: pathname,
      sessionId: sessionId(),
      referrer: document.referrer.length > 0 ? document.referrer : null,
      utmSource: searchParams.get("utm_source"),
      utmMedium: searchParams.get("utm_medium"),
      utmCampaign: searchParams.get("utm_campaign"),
    });

    const beaconSent =
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon("/api/track", new Blob([payload], { type: "application/json" }));
    if (!beaconSent) {
      void fetch("/api/track", {
        method: "POST",
        body: payload,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      });
    }
  }, [pathname]);

  return null;
}
