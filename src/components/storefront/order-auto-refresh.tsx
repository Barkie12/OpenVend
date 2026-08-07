"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { syncCryptoPaymentStatus } from "@/app/(storefront)/order/[token]/actions";

const REFRESH_INTERVAL_MS = 5000;
const MAX_REFRESHES = 120;

interface OrderAutoRefreshProps {
  /** When set, each tick first polls the crypto payment status for this order token. */
  syncToken?: string;
}

/** Polls the order page while payment confirmation is pending. */
export function OrderAutoRefresh({ syncToken }: OrderAutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    let refreshCount = 0;
    const refreshTimer = setInterval(() => {
      refreshCount += 1;
      if (refreshCount > MAX_REFRESHES) {
        clearInterval(refreshTimer);
        return;
      }
      if (syncToken) {
        void syncCryptoPaymentStatus(syncToken).finally(() => router.refresh());
      } else {
        router.refresh();
      }
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(refreshTimer);
  }, [router, syncToken]);

  return null;
}
